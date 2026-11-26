// In-memory Party room store & safe API handler for crossplay signaling + relay fallback.
import {
  MUSHROOM_COLORS,
  PARTY_MAX,
  isValidColorId,
  sanitizeCode,
  sanitizeName,
  sanitizePlayerId,
  type PartyMemberSummary,
  type PartyPreview,
  type PartySignal,
  type PartySnapshot,
  type PartyWorldState,
  type PlayerPose,
} from "./partyShared";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MEMBER_TIMEOUT_MS = 20_000;
const ROOM_IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_ROOMS = 400;

interface MemberRecord {
  id: string;
  name: string;
  colorId: string;
  isAdmin: boolean;
  lastSeen: number;
  pose?: PlayerPose | undefined;
}

interface RoomRecord {
  code: string;
  adminId: string;
  worldState: PartyWorldState;
  members: Map<string, MemberRecord>;
  signals: PartySignal[];
  updatedAt: number;
}

export interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const VALID_SCENES = new Set(["forest", "dungeon", "room", "heaven", "antshore"]);
const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;

function sanitizeWorldState(raw: unknown, fallback?: PartyWorldState): PartyWorldState {
  const base = fallback ?? { worldSeed: 1337, doorTreeIdx: 0, discovered: [], dungeonCleared: false, godDefeated: false };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<PartyWorldState>;
  return {
    worldSeed: typeof o.worldSeed === "number" && Number.isFinite(o.worldSeed) ? Math.floor(o.worldSeed) >>> 0 : base.worldSeed,
    doorTreeIdx: typeof o.doorTreeIdx === "number" && Number.isFinite(o.doorTreeIdx) ? Math.max(0, Math.floor(o.doorTreeIdx)) : base.doorTreeIdx,
    discovered: Array.isArray(o.discovered)
      ? Array.from(new Set(o.discovered.filter((d): d is string => typeof d === "string" && d.length <= 40))).slice(0, 30)
      : base.discovered,
    dungeonCleared: typeof o.dungeonCleared === "boolean" ? o.dungeonCleared : base.dungeonCleared,
    godDefeated: typeof o.godDefeated === "boolean" ? o.godDefeated : base.godDefeated,
  };
}

function sanitizePose(raw: unknown, member: MemberRecord, now: number): PlayerPose | undefined {
  if (!raw || typeof raw !== "object") return member.pose;
  const o = raw as Partial<PlayerPose>;
  const scene = typeof o.scene === "string" && VALID_SCENES.has(o.scene) ? o.scene : "forest";
  return {
    id: member.id,
    name: member.name,
    colorId: member.colorId,
    scene,
    x: Math.round(num(o.x, -500, 30000, 0) * 10) / 10,
    y: Math.round(num(o.y, -2000, 1000, 0) * 10) / 10,
    vx: Math.round(num(o.vx, -600, 600, 0)),
    facing: o.facing === -1 ? -1 : 1,
    walkT: Math.round(num(o.walkT, 0, 1e6, 0) * 100) / 100,
    onGround: Boolean(o.onGround),
    attack: typeof o.attack === "number" && Number.isFinite(o.attack) ? num(o.attack, 0, 1, 0) : undefined,
    dead: o.dead ? true : undefined,
    sitting: o.sitting ? true : undefined,
    fishingPhase: o.fishingPhase === "wait" || o.fishingPhase === "bite" ? o.fishingPhase : undefined,
    updatedAt: now,
  };
}

export class PartyStore {
  private rooms = new Map<string, RoomRecord>();

  private generateCode(): string {
    for (let attempt = 0; attempt < 24; attempt++) {
      let code = "";
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `P${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  private pruneRoom(room: RoomRecord, now: number): boolean {
    for (const [id, m] of room.members) {
      if (now - m.lastSeen > MEMBER_TIMEOUT_MS) room.members.delete(id);
    }
    if (room.members.size === 0 || now - room.updatedAt > ROOM_IDLE_MS) {
      this.rooms.delete(room.code);
      return false;
    }
    if (!room.members.has(room.adminId)) {
      const nextAdmin = room.members.values().next().value;
      if (nextAdmin) {
        room.adminId = nextAdmin.id;
        nextAdmin.isAdmin = true;
      }
    }
    room.signals = room.signals.filter((s) => now - s.ts < 15_000);
    return true;
  }

  private pruneAll(now: number) {
    for (const room of this.rooms.values()) {
      this.pruneRoom(room, now);
    }
    if (this.rooms.size > MAX_ROOMS) {
      const sorted = Array.from(this.rooms.values()).sort((a, b) => a.updatedAt - b.updatedAt);
      for (let i = 0; i < sorted.length - MAX_ROOMS; i++) {
        const old = sorted[i];
        if (old) this.rooms.delete(old.code);
      }
    }
  }

  private snapshot(room: RoomRecord, recipientId?: string): PartySnapshot {
    const members: PartyMemberSummary[] = Array.from(room.members.values()).map((m) => ({
      id: m.id,
      name: m.name,
      colorId: m.colorId,
      isAdmin: m.isAdmin,
      pose: m.pose,
    }));
    let signals: PartySignal[] | undefined;
    if (recipientId) {
      const mine: PartySignal[] = [];
      const keep: PartySignal[] = [];
      for (const s of room.signals) {
        if (s.to === recipientId) mine.push(s);
        else keep.push(s);
      }
      room.signals = keep;
      if (mine.length > 0) signals = mine;
    }
    return {
      code: room.code,
      adminId: room.adminId,
      worldState: room.worldState,
      members,
      signals,
    };
  }

  preview(rawCode: string, now = Date.now()): PartyPreview | null {
    const code = sanitizeCode(rawCode);
    const room = this.rooms.get(code);
    if (!room || !this.pruneRoom(room, now)) return null;
    const admin = room.members.get(room.adminId);
    return {
      code: room.code,
      max: PARTY_MAX,
      memberCount: room.members.size,
      takenColorIds: Array.from(room.members.values()).map((m) => m.colorId),
      adminName: admin?.name ?? "Admin",
    };
  }

  create(
    input: { playerId: string; name?: string | undefined; colorId?: string | undefined; worldState?: unknown },
    now = Date.now(),
  ): ApiResult {
    this.pruneAll(now);
    const playerId = sanitizePlayerId(input.playerId) || `U${Math.random().toString(36).slice(2, 10)}`;
    // Leave any room the creator was previously hosting/in
    for (const r of this.rooms.values()) {
      if (r.members.has(playerId)) {
        r.members.delete(playerId);
        this.pruneRoom(r, now);
      }
    }
    const colorId = isValidColorId(input.colorId) ? input.colorId : MUSHROOM_COLORS[0]!.id;
    const code = this.generateCode();
    const member: MemberRecord = {
      id: playerId,
      name: sanitizeName(input.name ?? "Admin"),
      colorId,
      isAdmin: true,
      lastSeen: now,
    };
    const room: RoomRecord = {
      code,
      adminId: playerId,
      worldState: sanitizeWorldState(input.worldState),
      members: new Map([[playerId, member]]),
      signals: [],
      updatedAt: now,
    };
    this.rooms.set(code, room);
    return { status: 200, body: { ok: true, party: this.snapshot(room, playerId) } };
  }

  join(
    input: { code: string; playerId: string; name?: string | undefined; colorId?: string | undefined },
    now = Date.now(),
  ): ApiResult {
    const code = sanitizeCode(input.code);
    const room = this.rooms.get(code);
    if (!room || !this.pruneRoom(room, now)) {
      return { status: 404, body: { ok: false, error: "Party not found" } };
    }
    const playerId = sanitizePlayerId(input.playerId) || `U${Math.random().toString(36).slice(2, 10)}`;
    const existing = room.members.get(playerId);
    if (!existing && room.members.size >= PARTY_MAX) {
      return { status: 409, body: { ok: false, error: "Party is full (max 10 players)" } };
    }
    const requestedColor = input.colorId;
    if (!isValidColorId(requestedColor)) {
      return { status: 400, body: { ok: false, error: "Choose one of the 10 mushroom colors" } };
    }
    const colorTaken = Array.from(room.members.values()).some((m) => m.id !== playerId && m.colorId === requestedColor);
    if (colorTaken) {
      return {
        status: 409,
        body: {
          ok: false,
          error: "That color is already taken by another mushroom",
          takenColorIds: Array.from(room.members.values()).map((m) => m.colorId),
        },
      };
    }
    room.members.set(playerId, {
      id: playerId,
      name: sanitizeName(input.name ?? existing?.name ?? "Sporeling"),
      colorId: requestedColor,
      isAdmin: existing?.isAdmin ?? false,
      lastSeen: now,
      pose: existing?.pose,
    });
    room.updatedAt = now;
    return { status: 200, body: { ok: true, party: this.snapshot(room, playerId) } };
  }

  changeColor(input: { code: string; playerId: string; colorId: string }, now = Date.now()): ApiResult {
    const code = sanitizeCode(input.code);
    const room = this.rooms.get(code);
    if (!room || !this.pruneRoom(room, now)) return { status: 404, body: { ok: false, error: "Party not found" } };
    const playerId = sanitizePlayerId(input.playerId);
    const member = room.members.get(playerId);
    if (!member) return { status: 404, body: { ok: false, error: "Not in party" } };
    if (!isValidColorId(input.colorId)) return { status: 400, body: { ok: false, error: "Invalid color" } };
    const taken = Array.from(room.members.values()).some((m) => m.id !== playerId && m.colorId === input.colorId);
    if (taken) return { status: 409, body: { ok: false, error: "Color already taken" } };
    member.colorId = input.colorId;
    if (member.pose) member.pose.colorId = input.colorId;
    member.lastSeen = now;
    room.updatedAt = now;
    return { status: 200, body: { ok: true, party: this.snapshot(room, playerId) } };
  }

  sync(
    input: { code: string; playerId: string; pose?: unknown; worldState?: unknown; discoverVillage?: unknown },
    now = Date.now(),
  ): ApiResult {
    const code = sanitizeCode(input.code);
    const room = this.rooms.get(code);
    if (!room || !this.pruneRoom(room, now)) return { status: 404, body: { ok: false, error: "Party closed" } };
    const playerId = sanitizePlayerId(input.playerId);
    const member = room.members.get(playerId);
    if (!member) return { status: 404, body: { ok: false, error: "Removed from party" } };
    member.lastSeen = now;
    member.pose = sanitizePose(input.pose, member, now);
    if (member.isAdmin && input.worldState) {
      room.worldState = sanitizeWorldState(input.worldState, room.worldState);
    }
    if (typeof input.discoverVillage === "string" && input.discoverVillage.length <= 40) {
      if (!room.worldState.discovered.includes(input.discoverVillage)) {
        room.worldState = {
          ...room.worldState,
          discovered: [...room.worldState.discovered, input.discoverVillage].slice(0, 30),
        };
      }
    }
    room.updatedAt = now;
    return { status: 200, body: { ok: true, party: this.snapshot(room, playerId) } };
  }

  signal(
    input: { code: string; playerId: string; to: string; kind: unknown; payload: unknown },
    now = Date.now(),
  ): ApiResult {
    const code = sanitizeCode(input.code);
    const room = this.rooms.get(code);
    if (!room || !this.pruneRoom(room, now)) return { status: 404, body: { ok: false, error: "Party not found" } };
    const from = sanitizePlayerId(input.playerId);
    const to = sanitizePlayerId(input.to);
    if (!room.members.has(from) || !room.members.has(to)) {
      return { status: 404, body: { ok: false, error: "Peer not in party" } };
    }
    if (input.kind !== "offer" && input.kind !== "answer" && input.kind !== "ice") {
      return { status: 400, body: { ok: false, error: "Invalid signal kind" } };
    }
    if (room.signals.length < 160) {
      room.signals.push({ from, to, kind: input.kind, payload: input.payload, ts: now });
    }
    room.updatedAt = now;
    return { status: 200, body: { ok: true } };
  }

  leave(input: { code: string; playerId: string }, now = Date.now()): ApiResult {
    const code = sanitizeCode(input.code);
    const room = this.rooms.get(code);
    if (!room) return { status: 200, body: { ok: true } };
    const playerId = sanitizePlayerId(input.playerId);
    room.members.delete(playerId);
    this.pruneRoom(room, now);
    return { status: 200, body: { ok: true } };
  }
}

export const partyStore = new PartyStore();

export async function handlePartyApi(request: Request, store = partyStore): Promise<Response> {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });

  if (request.method === "GET") {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const preview = store.preview(code);
    if (!preview) return json(404, { ok: false, error: "No active party with that code" });
    return json(200, { ok: true, preview });
  }

  if (request.method === "POST") {
    let payload: {
      action?: unknown;
      playerId?: unknown;
      name?: unknown;
      colorId?: unknown;
      worldState?: unknown;
      code?: unknown;
      pose?: unknown;
      discoverVillage?: unknown;
      to?: unknown;
      kind?: unknown;
      payload?: unknown;
    };
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object") return json(400, { ok: false, error: "Invalid request" });
      payload = parsed as typeof payload;
    } catch {
      return json(400, { ok: false, error: "Invalid JSON" });
    }
    const action = payload.action;
    if (action === "create") {
      const r = store.create({
        playerId: String(payload.playerId ?? ""),
        name: typeof payload.name === "string" ? payload.name : undefined,
        colorId: typeof payload.colorId === "string" ? payload.colorId : undefined,
        worldState: payload.worldState,
      });
      return json(r.status, r.body);
    }
    if (action === "join") {
      const r = store.join({
        code: String(payload.code ?? ""),
        playerId: String(payload.playerId ?? ""),
        name: typeof payload.name === "string" ? payload.name : undefined,
        colorId: typeof payload.colorId === "string" ? payload.colorId : undefined,
      });
      return json(r.status, r.body);
    }
    if (action === "color") {
      const r = store.changeColor({
        code: String(payload.code ?? ""),
        playerId: String(payload.playerId ?? ""),
        colorId: String(payload.colorId ?? ""),
      });
      return json(r.status, r.body);
    }
    if (action === "sync") {
      const r = store.sync({
        code: String(payload.code ?? ""),
        playerId: String(payload.playerId ?? ""),
        pose: payload.pose,
        worldState: payload.worldState,
        discoverVillage: payload.discoverVillage,
      });
      return json(r.status, r.body);
    }
    if (action === "signal") {
      const r = store.signal({
        code: String(payload.code ?? ""),
        playerId: String(payload.playerId ?? ""),
        to: String(payload.to ?? ""),
        kind: payload.kind,
        payload: payload.payload,
      });
      return json(r.status, r.body);
    }
    if (action === "leave") {
      const r = store.leave({
        code: String(payload.code ?? ""),
        playerId: String(payload.playerId ?? ""),
      });
      return json(r.status, r.body);
    }
    return json(400, { ok: false, error: "Unknown action" });
  }

  return json(405, { ok: false, error: "Method not allowed" });
}
