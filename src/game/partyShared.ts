// Shared types, constants, and 10 unique mushroom colors for Party crossplay.

export const PARTY_MAX = 10;

export interface MushroomColor {
  id: string;
  label: string;
  hex: string;
}

export const MUSHROOM_COLORS: readonly MushroomColor[] = [
  { id: "red", label: "Röd", hex: "#d9443a" },
  { id: "blue", label: "Blå", hex: "#3f7ee6" },
  { id: "green", label: "Grön", hex: "#45b864" },
  { id: "gold", label: "Guld", hex: "#d4a62a" },
  { id: "purple", label: "Lila", hex: "#9b5be6" },
  { id: "pink", label: "Rosa", hex: "#e0629d" },
  { id: "cyan", label: "Turkos", hex: "#2bb5b5" },
  { id: "orange", label: "Orange", hex: "#e37424" },
  { id: "lime", label: "Lime", hex: "#84cc29" },
  { id: "indigo", label: "Indigo", hex: "#4a5378" },
] as const;

export function colorById(id: string): MushroomColor {
  return MUSHROOM_COLORS.find((c) => c.id === id) ?? MUSHROOM_COLORS[0]!;
}

export function isValidColorId(id: unknown): id is string {
  return typeof id === "string" && MUSHROOM_COLORS.some((c) => c.id === id);
}

export interface PartyWorldState {
  worldSeed: number;
  doorTreeIdx: number;
  discovered: string[];
  dungeonCleared: boolean;
  godDefeated: boolean;
}

export interface PlayerPose {
  id: string;
  name: string;
  colorId: string;
  scene: string;
  x: number;
  y: number;
  vx: number;
  facing: number;
  walkT: number;
  onGround: boolean;
  attack?: number | undefined;
  dead?: boolean | undefined;
  sitting?: boolean | undefined;
  fishingPhase?: "wait" | "bite" | undefined;
  updatedAt: number;
}

export interface PartyMemberSummary {
  id: string;
  name: string;
  colorId: string;
  isAdmin: boolean;
  pose?: PlayerPose | undefined;
}

export interface PartySignal {
  from: string;
  to: string;
  kind: "offer" | "answer" | "ice";
  payload: unknown;
  ts: number;
}

export interface PartySnapshot {
  code: string;
  adminId: string;
  worldState: PartyWorldState;
  members: PartyMemberSummary[];
  signals?: PartySignal[] | undefined;
}

export interface PartyPreview {
  code: string;
  max: number;
  memberCount: number;
  takenColorIds: string[];
  adminName: string;
}

export function sanitizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function sanitizePlayerId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

export function sanitizeName(raw: string): string {
  const clean = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && ch !== "<" && ch !== ">";
    })
    .join("")
    .trim()
    .slice(0, 16);
  return clean || "Sporeling";
}
