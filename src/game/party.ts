// Client-side crossplay Party manager: combines WebRTC P2P DataChannels (low latency),
// BroadcastChannel (same-browser tabs), and /api/party HTTPS relay fallback.
import {
  sanitizeCode,
  sanitizePlayerId,
  type PartyMemberSummary,
  type PartyPreview,
  type PartySignal,
  type PartySnapshot,
  type PartyWorldState,
  type PlayerPose,
} from "./partyShared";

const PLAYER_ID_KEY = "sporeling-party-player-id";

export function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "SSR001";
  try {
    const existing = window.sessionStorage.getItem(PLAYER_ID_KEY);
    if (existing && sanitizePlayerId(existing)) return sanitizePlayerId(existing);
    const generated = `P${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    window.sessionStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `P${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  }
}

export interface PartyStateView {
  code: string;
  playerId: string;
  isAdmin: boolean;
  adminId: string;
  myColorId: string;
  members: PartyMemberSummary[];
  worldState: PartyWorldState;
  transport: "p2p" | "local" | "relay";
}

interface PeerLink {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
}

export class PartyClient {
  readonly playerId: string;
  private snapshot: PartySnapshot | null = null;
  private remotePoses = new Map<string, PlayerPose>();
  private peers = new Map<string, PeerLink>();
  private bc: BroadcastChannel | null = null;
  private pollTimer: number | null = null;
  private syncInFlight = false;
  private pendingDiscover: string | null = null;
  private latestWorldState: PartyWorldState | null = null;
  private getLocalPose: () => Omit<PlayerPose, "id" | "name" | "colorId" | "updatedAt"> | null = () => null;
  private onState: (view: PartyStateView | null) => void;
  private onWorldSync: (ws: PartyWorldState) => void;
  private lastBroadcastAt = 0;

  constructor(opts: {
    onState: (view: PartyStateView | null) => void;
    onWorldSync: (ws: PartyWorldState) => void;
    getLocalPose: () => Omit<PlayerPose, "id" | "name" | "colorId" | "updatedAt"> | null;
  }) {
    this.playerId = getOrCreatePlayerId();
    this.onState = opts.onState;
    this.onWorldSync = opts.onWorldSync;
    this.getLocalPose = opts.getLocalPose;
  }

  get active(): PartyStateView | null {
    if (!this.snapshot) return null;
    const me = this.snapshot.members.find((m) => m.id === this.playerId);
    const hasOpenDc = Array.from(this.peers.values()).some((p) => p.dc?.readyState === "open");
    return {
      code: this.snapshot.code,
      playerId: this.playerId,
      isAdmin: this.snapshot.adminId === this.playerId,
      adminId: this.snapshot.adminId,
      myColorId: me?.colorId ?? "red",
      members: this.snapshot.members,
      worldState: this.snapshot.worldState,
      transport: hasOpenDc ? "p2p" : this.bc ? "local" : "relay",
    };
  }

  getRemotePoses(): PlayerPose[] {
    if (!this.snapshot) return [];
    const now = Date.now();
    const out: PlayerPose[] = [];
    for (const m of this.snapshot.members) {
      if (m.id === this.playerId) continue;
      const p = this.remotePoses.get(m.id) ?? m.pose;
      if (p && now - p.updatedAt < 15_000) out.push({ ...p, colorId: m.colorId, name: m.name });
    }
    return out;
  }

  async preview(rawCode: string): Promise<PartyPreview> {
    const code = sanitizeCode(rawCode);
    const res = await fetch(`/api/party?code=${encodeURIComponent(code)}`);
    const data = (await res.json()) as { ok: boolean; preview?: PartyPreview; error?: string };
    if (!res.ok || !data.ok || !data.preview) throw new Error(data.error ?? "Party not found");
    return data.preview;
  }

  async create(name: string, colorId: string, worldState: PartyWorldState): Promise<PartyStateView> {
    this.teardownChannels();
    this.latestWorldState = worldState;
    const res = await fetch("/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", playerId: this.playerId, name, colorId, worldState }),
    });
    const data = (await res.json()) as { ok: boolean; party?: PartySnapshot; error?: string };
    if (!res.ok || !data.ok || !data.party) throw new Error(data.error ?? "Could not create party");
    this.applySnapshot(data.party);
    this.startLoop();
    return this.active!;
  }

  async join(rawCode: string, name: string, colorId: string): Promise<PartyStateView> {
    this.teardownChannels();
    const code = sanitizeCode(rawCode);
    const res = await fetch("/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "join", code, playerId: this.playerId, name, colorId }),
    });
    const data = (await res.json()) as { ok: boolean; party?: PartySnapshot; error?: string };
    if (!res.ok || !data.ok || !data.party) throw new Error(data.error ?? "Could not join party");
    this.applySnapshot(data.party);
    this.onWorldSync(data.party.worldState);
    this.startLoop();
    return this.active!;
  }

  async changeColor(colorId: string): Promise<void> {
    if (!this.snapshot) return;
    const res = await fetch("/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "color", code: this.snapshot.code, playerId: this.playerId, colorId }),
    });
    const data = (await res.json()) as { ok: boolean; party?: PartySnapshot; error?: string };
    if (!res.ok || !data.ok || !data.party) throw new Error(data.error ?? "Could not change color");
    this.applySnapshot(data.party);
  }

  updateAdminWorldState(ws: PartyWorldState) {
    this.latestWorldState = ws;
    if (this.snapshot && this.snapshot.adminId === this.playerId) {
      this.broadcastFast({ kind: "world", worldState: ws });
    }
  }

  notifyDiscoveredVillage(name: string) {
    if (this.snapshot && this.snapshot.adminId !== this.playerId) {
      this.pendingDiscover = name;
    }
  }

  /** Called every frame or tick from GameScreen/Game; sends lightweight P2P packets throttled at ~12Hz. */
  tickPose() {
    if (!this.snapshot) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastBroadcastAt < 80) return;
    const pose = this.buildLocalPose();
    if (!pose) return;
    this.lastBroadcastAt = now;
    this.broadcastFast({ kind: "pose", pose });
  }

  async leave() {
    const code = this.snapshot?.code;
    this.teardownChannels();
    this.snapshot = null;
    this.remotePoses.clear();
    this.latestWorldState = null;
    this.onState(null);
    if (code) {
      try {
        await fetch("/api/party", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "leave", code, playerId: this.playerId }),
        });
      } catch {
        /* Ignore network failure when leaving. */
      }
    }
  }

  destroy() {
    void this.leave();
  }

  private buildLocalPose(): PlayerPose | null {
    const raw = this.getLocalPose();
    if (!raw || !this.snapshot) return null;
    const me = this.snapshot.members.find((m) => m.id === this.playerId);
    return {
      ...raw,
      id: this.playerId,
      name: me?.name ?? "Sporeling",
      colorId: me?.colorId ?? "red",
      updatedAt: Date.now(),
    };
  }

  private applySnapshot(snap: PartySnapshot) {
    const prevWorld = this.snapshot?.worldState;
    this.snapshot = snap;
    if (!this.bc && typeof BroadcastChannel !== "undefined") {
      this.bc = new BroadcastChannel(`sporeling-party-${snap.code}`);
      this.bc.onmessage = (ev) => this.handleFastMessage(ev.data);
    }
    const isAdmin = snap.adminId === this.playerId;
    if (!isAdmin && prevWorld) {
      const worldChanged =
        prevWorld.worldSeed !== snap.worldState.worldSeed ||
        prevWorld.doorTreeIdx !== snap.worldState.doorTreeIdx ||
        prevWorld.dungeonCleared !== snap.worldState.dungeonCleared ||
        prevWorld.godDefeated !== snap.worldState.godDefeated ||
        prevWorld.discovered.length !== snap.worldState.discovered.length;
      if (worldChanged) this.onWorldSync(snap.worldState);
    }
    // Prune vanished peers
    const activeIds = new Set(snap.members.map((m) => m.id));
    for (const pid of this.peers.keys()) {
      if (!activeIds.has(pid)) {
        this.peers.get(pid)?.pc.close();
        this.peers.delete(pid);
      }
    }
    // Establish WebRTC P2P connections with other members when available
    if (typeof RTCPeerConnection !== "undefined") {
      if (isAdmin) {
        for (const m of snap.members) {
          if (m.id !== this.playerId && !this.peers.has(m.id)) {
            void this.initiatePeer(m.id);
          }
        }
      }
      if (snap.signals?.length) {
        for (const sig of snap.signals) {
          void this.handleSignal(sig);
        }
      }
    }
    this.onState(this.active);
  }

  private async initiatePeer(remoteId: string) {
    if (!this.snapshot) return;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const dc = pc.createDataChannel("pose", { ordered: false, maxRetransmits: 0 });
    this.wireDataChannel(remoteId, pc, dc);
    this.peers.set(remoteId, { pc, dc });
    pc.onicecandidate = (e) => {
      if (e.candidate && this.snapshot) void this.sendSignal(remoteId, "ice", e.candidate);
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.sendSignal(remoteId, "offer", offer);
    } catch {
      pc.close();
      this.peers.delete(remoteId);
    }
  }

  private async handleSignal(sig: PartySignal) {
    if (!this.snapshot || sig.from === this.playerId) return;
    try {
      if (sig.kind === "offer") {
        this.peers.get(sig.from)?.pc.close();
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        const link: PeerLink = { pc, dc: null };
        this.peers.set(sig.from, link);
        pc.ondatachannel = (ev) => {
          link.dc = ev.channel;
          this.wireDataChannel(sig.from, pc, ev.channel);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) void this.sendSignal(sig.from, "ice", e.candidate);
        };
        await pc.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.sendSignal(sig.from, "answer", answer);
      } else if (sig.kind === "answer") {
        const link = this.peers.get(sig.from);
        if (link && link.pc.signalingState === "have-local-offer") {
          await link.pc.setRemoteDescription(sig.payload as RTCSessionDescriptionInit);
        }
      } else if (sig.kind === "ice") {
        const link = this.peers.get(sig.from);
        if (link && sig.payload) {
          await link.pc.addIceCandidate(sig.payload as RTCIceCandidateInit);
        }
      }
    } catch {
      /* Relay fallback handles NAT failures automatically. */
    }
  }

  private wireDataChannel(remoteId: string, pc: RTCPeerConnection, dc: RTCDataChannel) {
    dc.onmessage = (ev) => {
      try {
        this.handleFastMessage(JSON.parse(String(ev.data)));
      } catch {
        /* Ignore invalid packets. */
      }
    };
    dc.onopen = () => this.onState(this.active);
    dc.onclose = () => {
      if (this.peers.get(remoteId)?.pc === pc) this.onState(this.active);
    };
  }

  private handleFastMessage(msg: unknown) {
    if (!msg || typeof msg !== "object") return;
    const o = msg as { kind?: string; pose?: PlayerPose; worldState?: PartyWorldState };
    if (o.kind === "pose" && o.pose && o.pose.id !== this.playerId) {
      this.remotePoses.set(o.pose.id, { ...o.pose, updatedAt: Date.now() });
    } else if (o.kind === "world" && o.worldState && this.snapshot && this.snapshot.adminId !== this.playerId) {
      this.snapshot = { ...this.snapshot, worldState: o.worldState };
      this.onWorldSync(o.worldState);
    }
  }

  private broadcastFast(msg: Record<string, unknown>) {
    const raw = JSON.stringify(msg);
    for (const p of this.peers.values()) {
      if (p.dc?.readyState === "open") {
        try { p.dc.send(raw); } catch { /* Ignore closed channel. */ }
      }
    }
    try { this.bc?.postMessage(msg); } catch { /* Ignore BroadcastChannel error. */ }
  }

  private async sendSignal(to: string, kind: PartySignal["kind"], payload: unknown) {
    if (!this.snapshot) return;
    await fetch("/api/party", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "signal", code: this.snapshot.code, playerId: this.playerId, to, kind, payload }),
    });
  }

  private startLoop() {
    if (this.pollTimer !== null || typeof window === "undefined") return;
    const schedule = () => {
      if (!this.snapshot) return;
      const members = this.snapshot.members.filter((m) => m.id !== this.playerId);
      const allP2P = members.length > 0 && members.every((m) => this.peers.get(m.id)?.dc?.readyState === "open");
      const delay = members.length === 0 ? 1200 : allP2P ? 900 : 120;
      this.pollTimer = window.setTimeout(() => void this.syncStep().finally(schedule), delay);
    };
    schedule();
  }

  private async syncStep() {
    if (!this.snapshot || this.syncInFlight) return;
    this.syncInFlight = true;
    try {
      const pose = this.buildLocalPose();
      const body: {
        action: string;
        code: string;
        playerId: string;
        pose: PlayerPose | null;
        worldState?: PartyWorldState;
        discoverVillage?: string;
      } = {
        action: "sync",
        code: this.snapshot.code,
        playerId: this.playerId,
        pose,
      };
      if (this.snapshot.adminId === this.playerId && this.latestWorldState) {
        body.worldState = this.latestWorldState;
      }
      if (this.pendingDiscover) {
        body.discoverVillage = this.pendingDiscover;
        this.pendingDiscover = null;
      }
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 404) {
          this.teardownChannels();
          this.snapshot = null;
          this.onState(null);
        }
        return;
      }
      const data = (await res.json()) as { ok: boolean; party?: PartySnapshot };
      if (data.ok && data.party) this.applySnapshot(data.party);
    } catch {
      /* Transient offline glitch; retry on next tick. */
    } finally {
      this.syncInFlight = false;
    }
  }

  private teardownChannels() {
    if (this.pollTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.bc?.close();
    this.bc = null;
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
  }
}
