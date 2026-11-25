// Save games: a small JSON snapshot of progress kept in the browser. Pure helpers, tested in save.test.ts.
import { FISH, type Inventory } from "./fishing";
import { LAKE_MIN_X, WORLD_W } from "./world";

export const SAVE_KEY = "sporeling-save";
export const SAVE_VERSION = 1;
/** Seconds between automatic saves while playing. */
export const AUTOSAVE_SECONDS = 30;

export interface SaveData {
  v: typeof SAVE_VERSION;
  savedAt: number;
  /** position in the forest (indoors / in the dungeon you resume at its door) */
  x: number;
  y: number;
  health: number;
  hunger: number;
  coins: number;
  inventory: Inventory;
  fishCaught: number;
  fishReleased: number;
  applesEaten: number;
  time: number;
  doubleJump: boolean;
  dungeonCleared: boolean;
  discovered: string[];
  godDefeated?: boolean;
  holyTries?: number;
  sacrificedFish?: string[];
  doorTreeIdx?: number | undefined;
  worldSeed?: number | undefined;
}

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback;
const count = (v: unknown) => Math.floor(num(v, 0, 1e9, 0));

export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  let o: { [K in keyof SaveData]?: unknown };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    o = parsed as { [K in keyof SaveData]?: unknown };
  } catch {
    return null;
  }
  if (o.v !== SAVE_VERSION || typeof o.x !== "number" || !Number.isFinite(o.x)) return null;
  const inventory: Inventory = {};
  if (o.inventory && typeof o.inventory === "object") {
    for (const f of FISH) {
      const n = count((o.inventory as Record<string, unknown>)[f.id]);
      if (n > 0) inventory[f.id] = n;
    }
  }
  const fishIds = new Set(FISH.map((f) => f.id));
  const sacrificedFish = Array.isArray(o.sacrificedFish)
    ? o.sacrificedFish.filter((id): id is string => typeof id === "string" && fishIds.has(id)).slice(-60)
    : [];
  return {
    v: SAVE_VERSION,
    savedAt: num(o.savedAt, 0, 1e15, 0),
    x: num(o.x, LAKE_MIN_X, WORLD_W - 12, LAKE_MIN_X),
    y: num(o.y, -2000, 400, 0),
    // a save never starts you dead
    health: num(o.health, 1, 100, 100),
    hunger: num(o.hunger, 0, 100, 100),
    coins: count(o.coins),
    inventory,
    fishCaught: count(o.fishCaught),
    fishReleased: count(o.fishReleased),
    applesEaten: count(o.applesEaten),
    time: num(o.time, 0, 1e9, 0),
    doubleJump: o.doubleJump === true,
    dungeonCleared: o.dungeonCleared === true,
    discovered: Array.isArray(o.discovered) ? o.discovered.filter((n): n is string => typeof n === "string") : [],
    godDefeated: o.godDefeated === true,
    holyTries: Math.floor(num(o.holyTries, 0, 3, 0)),
    sacrificedFish,
    doorTreeIdx: typeof o.doorTreeIdx === "number" && Number.isFinite(o.doorTreeIdx) ? Math.max(0, Math.floor(o.doorTreeIdx)) : undefined,
    worldSeed: typeof o.worldSeed === "number" && Number.isFinite(o.worldSeed) ? Math.floor(o.worldSeed) >>> 0 : undefined,
  };
}
