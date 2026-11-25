// Fishing rules + fish species. Pure (no DOM) so it can be tested and shared with the HUD.

export interface FishSpecies {
  id: string;
  name: string;
  body: string;
  belly: string;
  fin: string;
  weight: number; // relative chance of being caught
  value: number; // coins earned when you give it to the light
  winged?: boolean;
}

export const GODLY_CHANCE = 0.02;
export const GODLY_PITY_LIMIT = 50;
/** 5 meters from the pool edge (1 meter/step = 8px). */
export const PUDDLE_STAY_RADIUS = 40;
export const MAX_HOLY_TRIES = 3;

export interface FishingStreak {
  puddleX: number;
  puddleHalf: number;
  poolY: number;
  catches: number;
}

export function isWithinPoolRadius(
  streak: Pick<FishingStreak, "puddleX" | "puddleHalf" | "poolY">,
  px: number,
  py: number,
  radius = PUDDLE_STAY_RADIUS,
): boolean {
  const edgeDist = Math.max(0, Math.abs(px - streak.puddleX) - streak.puddleHalf);
  return edgeDist <= radius && Math.abs(py - streak.poolY) <= radius;
}

export function advanceFishingStreak(
  streak: FishingStreak | null,
  puddle: { x: number; half: number; y: number },
  caughtId: string,
  hasDoubleJump: boolean,
): FishingStreak | null {
  if (!hasDoubleJump) return null;
  const base = streak && streak.puddleX === puddle.x ? streak.catches : 0;
  return {
    puddleX: puddle.x,
    puddleHalf: puddle.half,
    poolY: puddle.y,
    catches: caughtId === "godly" ? 0 : base + 1,
  };
}

export const FISH: FishSpecies[] = [
  { id: "minnow", name: "Puddle Minnow", body: "#9fb7c4", belly: "#e6eef0", fin: "#6f8a99", weight: 40, value: 2 },
  { id: "perch", name: "Mud Perch", body: "#9aa44e", belly: "#e8dda4", fin: "#6a7430", weight: 28, value: 4 },
  { id: "carp", name: "Mossy Carp", body: "#4f8a5a", belly: "#b9d8a0", fin: "#2f5e3a", weight: 18, value: 8 },
  { id: "glowfin", name: "Glowfin", body: "#5fd6c4", belly: "#d8fff6", fin: "#2f9a8e", weight: 10, value: 15 },
  { id: "golden", name: "Golden Guppy", body: "#f2c84b", belly: "#fff1b0", fin: "#d08a2a", weight: 4, value: 40 },
  { id: "godly", name: "Godly Goldfish", body: "#f5b82e", belly: "#fff3a0", fin: "#d97c18", weight: 0, value: 100, winged: true },
];

/** Seconds you have to press SPACE after the "!" appears. */
export const BITE_WINDOW = 0.75;
/** A bite comes after a random wait between these (seconds). */
export const WAIT_MIN = 2.5;
export const WAIT_MAX = 6;

export const rollWait = (r: number) => WAIT_MIN + r * (WAIT_MAX - WAIT_MIN);

export function rollFish(r: number, hasDoubleJump = false, catchesAtPool = 0): FishSpecies {
  const godly = FISH.find((f) => f.id === "godly")!;
  if (hasDoubleJump && (catchesAtPool + 1 >= GODLY_PITY_LIMIT || r < GODLY_CHANCE)) return godly;
  const norm = hasDoubleJump ? (r - GODLY_CHANCE) / (1 - GODLY_CHANCE) : r;
  const pool = FISH.filter((f) => f.weight > 0);
  const total = pool.reduce((s, f) => s + f.weight, 0);
  let acc = norm * total;
  for (const f of pool) {
    acc -= f.weight;
    if (acc < 0) return f;
  }
  return pool[pool.length - 1]!;
}

/** Coins you get for releasing a fish into the light (2x after defeating God). */
export const releaseReward = (id: string, doubleMoney = false) =>
  (FISH.find((f) => f.id === id)?.value ?? 0) * (doubleMoney ? 2 : 1);

export const fishById = (id: string) => FISH.find((f) => f.id === id);

export type BiteResult = "pending" | "early" | "caught" | "missed";

/** phase "wait" = no "!" yet, "bite" = "!" showing for `sinceBite` seconds. */
export function resolveBite(phase: "wait" | "bite", sinceBite: number, pressed: boolean): BiteResult {
  if (phase === "wait") return pressed ? "early" : "pending";
  if (sinceBite > BITE_WINDOW) return "missed";
  return pressed ? "caught" : "pending";
}

export type Inventory = Record<string, number>;

export function addFish(inv: Inventory, id: string): Inventory {
  return { ...inv, [id]: (inv[id] ?? 0) + 1 };
}

export function removeFish(inv: Inventory, id: string): Inventory {
  const n = inv[id] ?? 0;
  if (n <= 0) return inv;
  const next = { ...inv, [id]: n - 1 };
  if (next[id] === 0) delete next[id];
  return next;
}

// Shared pixel art (facing right). F = fin, B = body, L = belly, E = eye, W/S = angel wing.
const FISH_GRID = [
  "....FF...",
  "F..BBBBB.",
  "FFBBBBBEB",
  "FFBLLLLBB",
  "F..LLLL..",
];
const WINGED_FISH_GRID = [
  "...WW....",
  "..WWWS...",
  ".F..BB...",
  "FFBBBBBE.",
  "FFBLLLLB.",
  ".F.LLLL..",
];
export const FISH_W = FISH_GRID[0]!.length;
export const FISH_H = FISH_GRID.length;

export function fishDims(sp: FishSpecies) {
  const grid = sp.winged ? WINGED_FISH_GRID : FISH_GRID;
  return { w: grid[0]!.length, h: grid.length };
}

/** Pixels for a fish incl. a dark outline, relative to the grid's top-left (outline may go to -1). */
export function fishPixels(sp: FishSpecies, facing = 1): [number, number, string][] {
  const grid = sp.winged ? WINGED_FISH_GRID : FISH_GRID;
  const w = grid[0]!.length;
  const filled = new Map<string, string>();
  grid.forEach((row, y) =>
    row.split("").forEach((c, x0) => {
      if (c === ".") return;
      const x = facing >= 0 ? x0 : w - 1 - x0;
      const col =
        c === "F"
          ? sp.fin
          : c === "B"
            ? sp.body
            : c === "L"
              ? sp.belly
              : c === "W"
                ? "#f4f2fb"
                : c === "S"
                  ? "#c8c4dc"
                  : "#1b140f";
      filled.set(`${x},${y}`, col);
    }),
  );
  const out: [number, number, string][] = [];
  const outline = new Set<string>();
  for (const k of filled.keys()) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nk = `${x + dx},${y + dy}`;
      if (!filled.has(nk)) outline.add(nk);
    }
  }
  for (const k of outline) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    out.push([x, y, "#1b140f"]);
  }
  for (const [k, c] of filled) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    out.push([x, y, c]);
  }
  return out;
}
