import { useState } from "react";
import { MUSHROOM_COLORS, PARTY_MAX, sanitizeCode, type PartyPreview } from "@/game/partyShared";
import type { PartyStateView } from "@/game/party";
import { GameButton } from "./GameButton";

function ColorGrid({
  selectedId,
  takenIds,
  onSelect,
}: {
  selectedId: string;
  takenIds: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Choose mushroom color">
      {MUSHROOM_COLORS.map((c) => {
        const taken = takenIds.includes(c.id);
        const active = selectedId === c.id;
        return (
          <button
            key={c.id}
            type="button"
            disabled={taken}
            onClick={() => onSelect(c.id)}
            aria-checked={active}
            role="radio"
            title={taken ? `${c.label} (taken)` : c.label}
            className={`pixel-btn flex flex-col items-center gap-1 px-1.5 py-2 text-center transition ${
              active ? "ring-2 ring-accent" : ""
            } ${taken ? "cursor-not-allowed opacity-35" : "hover:brightness-110"}`}
          >
            <span
              className="inline-block h-4 w-5 border-2 border-border"
              style={{ backgroundColor: c.hex }}
            />
            <span className="text-xs leading-none text-foreground">
              {taken ? "Taken" : c.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PartyPanel({
  party,
  myColorId,
  onCreate,
  onPreview,
  onJoin,
  onChangeColor,
  onLeave,
  onClose,
}: {
  party: PartyStateView | null;
  myColorId: string;
  onCreate: (name: string, colorId: string) => Promise<void>;
  onPreview: (code: string) => Promise<PartyPreview>;
  onJoin: (code: string, name: string, colorId: string) => Promise<void>;
  onChangeColor: (colorId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"pick" | "create" | "join">("pick");
  const [name, setName] = useState("Sporeling");
  const [codeInput, setCodeInput] = useState("");
  const [preview, setPreview] = useState<PartyPreview | null>(null);
  const [pickedColor, setPickedColor] = useState(myColorId || MUSHROOM_COLORS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      await onCreate(name, pickedColor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create party");
    } finally {
      setBusy(false);
    }
  };

  const handleLookup = async () => {
    const clean = sanitizeCode(codeInput);
    if (clean.length < 4) {
      setError("Enter the party code first");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const p = await onPreview(clean);
      setPreview(p);
      // Auto-select first available color so player doesn't default onto an already-taken swatch
      const free = MUSHROOM_COLORS.find((c) => !p.takenColorIds.includes(c.id));
      if (free) setPickedColor(free.id);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Party not found");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const clean = sanitizeCode(codeInput);
    if (!preview) {
      await handleLookup();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onJoin(clean, name, pickedColor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join party");
      try {
        const refreshed = await onPreview(clean);
        setPreview(refreshed);
      } catch {
        /* Ignore refresh failure. */
      }
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!party) return;
    try {
      await navigator.clipboard.writeText(party.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard optional. */
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Party"
      className="pixel-panel max-h-[90vh] w-[min(94%,520px)] overflow-y-auto px-4 py-4 sm:px-6"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-display text-base text-accent">Party · Crossplay</h2>
        <GameButton onClick={onClose} aria-label="Back from party" className="px-3 py-2 text-xs">
          ← Back
        </GameButton>
      </div>

      {party ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border border-panel-edge/30 bg-background/50 p-3">
            <div>
              <div className="text-sm text-muted-foreground">
                {party.isAdmin ? "Your Server (Admin)" : "Friend's Server"} · {party.transport.toUpperCase()}
              </div>
              <div className="font-display text-xl tracking-widest text-accent">{party.code}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base text-foreground">
                {party.members.length}/{PARTY_MAX}
              </span>
              <GameButton onClick={copyCode} className="px-3 py-2 text-[10px]">
                {copied ? "Copied!" : "Copy code"}
              </GameButton>
            </div>
          </div>

          <p className="text-base leading-snug text-muted-foreground">
            {party.isAdmin
              ? "Share the code above so up to 9 friends can join your world! Abilities stay per-player."
              : "You are playing on the Admin's server. Your abilities, fish bag & coins stay yours, while your own solo server remains saved under Continue!"}
          </p>

          <div>
            <div className="mb-1.5 font-display text-[10px] text-accent">
              Players ({party.members.length}/{PARTY_MAX})
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {party.members.map((m) => {
                const col = MUSHROOM_COLORS.find((c) => c.id === m.colorId) ?? MUSHROOM_COLORS[0]!;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 border border-panel-edge/25 bg-background/40 px-2 py-1.5 text-base"
                  >
                    <span className="inline-block h-3.5 w-4 shrink-0 border border-border" style={{ backgroundColor: col.hex }} />
                    <span className="truncate">{m.name}</span>
                    {m.isAdmin && <span className="ml-auto font-display text-[8px] text-accent">ADMIN</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1.5 font-display text-[10px] text-accent">Your Mushroom Color (10 unique colors)</div>
            <ColorGrid
              selectedId={party.myColorId}
              takenIds={party.members.filter((m) => m.id !== party.playerId).map((m) => m.colorId)}
              onSelect={async (id) => {
                setError(null);
                try {
                  await onChangeColor(id);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not change color");
                }
              }}
            />
          </div>

          {error && <div className="text-base text-health">{error}</div>}

          <GameButton
            onClick={() => void onLeave()}
            className="mt-1 w-full py-3 text-xs text-health"
          >
            {party.isAdmin ? "Close Party" : "Leave Party (return to my server)"}
          </GameButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-base">
            <span className="font-display text-[10px] text-accent">Your Mushroom Name</span>
            <input
              type="text"
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-2 border-border bg-background px-3 py-1.5 text-lg text-foreground outline-none focus:border-accent"
              placeholder="Sporeling"
            />
          </label>

          {mode === "pick" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <GameButton onClick={() => setMode("create")} className="py-4 text-xs">
                Create Party
              </GameButton>
              <GameButton onClick={() => setMode("join")} className="py-4 text-xs">
                Join Party
              </GameButton>
            </div>
          )}

          {mode === "create" && (
            <div className="flex flex-col gap-3 border-t border-panel-edge/30 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-[10px] text-accent">Pick Your Color (Admin)</span>
                <button type="button" onClick={() => setMode("pick")} className="text-sm text-muted-foreground underline">
                  Back
                </button>
              </div>
              <ColorGrid selectedId={pickedColor} takenIds={[]} onSelect={setPickedColor} />
              <p className="text-base text-muted-foreground">
                Creating a party generates a short code for your server (max {PARTY_MAX} players).
              </p>
              {error && <div className="text-base text-health">{error}</div>}
              <GameButton disabled={busy} onClick={() => void handleCreate()} className="w-full py-3 text-xs">
                {busy ? "Creating…" : "Create Party (Admin)"}
              </GameButton>
            </div>
          )}

          {mode === "join" && (
            <div className="flex flex-col gap-3 border-t border-panel-edge/30 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-[10px] text-accent">Join with Code</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setError(null);
                    setMode("pick");
                  }}
                  className="text-sm text-muted-foreground underline"
                >
                  Back
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(sanitizeCode(e.target.value));
                    setPreview(null);
                  }}
                  placeholder="K7M4P"
                  aria-label="Party code"
                  className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-1.5 font-display text-sm uppercase tracking-widest text-accent outline-none focus:border-accent"
                />
                <GameButton disabled={busy} onClick={() => void handleLookup()} className="px-4 py-2 text-[10px]">
                  {busy && !preview ? "…" : "Find"}
                </GameButton>
              </div>

              {preview && (
                <>
                  <div className="text-base text-foreground">
                    Host: <span className="text-accent">{preview.adminName}</span> · {preview.memberCount}/{preview.max} players
                  </div>
                  <div className="font-display text-[10px] text-accent">Choose an unused mushroom color:</div>
                  <ColorGrid
                    selectedId={pickedColor}
                    takenIds={preview.takenColorIds}
                    onSelect={setPickedColor}
                  />
                  <p className="text-sm leading-snug text-muted-foreground">
                    You keep your abilities, fish & inventory, while playing on {preview.adminName}&apos;s server. Your own solo world stays saved!
                  </p>
                </>
              )}

              {error && <div className="text-base text-health">{error}</div>}

              {preview && (
                <GameButton
                  disabled={busy || preview.memberCount >= preview.max || preview.takenColorIds.includes(pickedColor)}
                  onClick={() => void handleJoin()}
                  className="w-full py-3 text-xs"
                >
                  {preview.memberCount >= preview.max ? "Party is full (10/10)" : busy ? "Joining…" : "Join Server"}
                </GameButton>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
