// World generation: terrain, giant trees, villages, apple trees, beetles, decor.
import type { Flyer } from "./combat";

export const WORLD_W = 18000;
export const GROUND_BASE = 190;
/** The Great Lake fills everything left of LAKE_EDGE; it is far too deep to cross. */
export const LAKE_EDGE = 820;
export const LAKE_Y = GROUND_BASE + 12;
/** A little pier sticks out over the water; this is as far left as you can go. */
export const PIER_X0 = LAKE_EDGE - 70;
export const LAKE_MIN_X = PIER_X0 + 6;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash -> [0,1) for an integer, used for parallax layers. */
export function hash1(n: number, salt = 0) {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface Platform {
  x: number;
  y: number;
  w: number;
  color: number; // index into fungus palette
  /** shelf = fungus ledge, deck = wooden tree-top deck, bridge = sagging rope bridge from (x,y) to (x+w,y2) */
  kind?: "shelf" | "deck" | "bridge" | "pier" | "stone";
  y2?: number;
  sag?: number;
}

/** Height of a platform's walkable surface at world x (bridges sag in the middle). */
export function surfaceY(pl: Platform, x: number) {
  if (pl.kind !== "bridge") return pl.y;
  const t = Math.max(0, Math.min(1, (x - pl.x) / pl.w));
  return pl.y + ((pl.y2 ?? pl.y) - pl.y) * t + (pl.sag ?? 0) * Math.sin(Math.PI * t);
}

export interface GiantTree {
  x: number; // left edge
  w: number;
  seed: number;
  /** y of the wooden deck at the top of the climb */
  deckY: number;
  deckX0: number;
  deckX1: number;
  elder?: boolean;
}

export interface AppleTree {
  x: number;
  size: number;
  apples: { ox: number; oy: number; grown: boolean; timer: number }[];
}

export interface House {
  x: number;
  stemW: number;
  stemH: number;
  capW: number;
  capH: number;
  cap: string;
  spots: boolean;
  /** Treetop homes are giant snail shells instead of mushroom houses. */
  shell?: boolean;
}

export interface Npc {
  name: string;
  x: number;
  y: number;
  vx: number;
  facing: number;
  cap: string;
  spots: boolean;
  scale: number;
  lines: string[];
  lineIdx: number;
  wanderT: number;
  walkT: number;
  minX: number;
  maxX: number;
  /** treetop folk are snails living in snail shells */
  snail?: boolean;
}

export interface Village {
  name: string;
  x: number; // center
  half: number; // half width
  houses: House[];
  fireX: number;
  lanterns: number[];
  npcs: Npc[];
  discovered: boolean;
  /** Tree-top villages stand on a deck instead of the ground. */
  floorY?: number;
}

export interface Beetle {
  x: number;
  y: number;
  vx: number;
  minX: number;
  maxX: number;
  alive: boolean;
  respawn: number;
  walkT: number;
  /** dungeon only */
  section?: number;
  hp?: number;
  maxHp?: number;
  big?: boolean;
  hitT?: number;
  chargeT?: number;
  /** Beetle King AI state */
  mode?: "walk" | "windup" | "charge" | "stun" | "leap";
  timer?: number;
  /** height above the floor while leaping, and vertical speed */
  lift?: number;
  vy?: number;
}

export interface Puddle {
  x: number;
  half: number;
}

export interface Decor {
  x: number;
  kind: "grass" | "flower" | "fern" | "pebble" | "clover" | "leaf";
  v: number;
  c: number;
}

export interface World {
  /** the pier at the lake shore */
  pier: Platform;
  trees: GiantTree[];
  elder: GiantTree;
  flyers: Flyer[];
  platforms: Platform[];
  appleTrees: AppleTree[];
  puddles: Puddle[];
  villages: Village[];
  beetles: Beetle[];
  decor: Decor[];
  fgGrass: Decor[];
}

const VILLAGE_DEFS: { name: string; x: number; npcs: [string, string, boolean, number, string[]][] }[] = [
  {
    name: "Mossbottom",
    x: 1350,
    npcs: [
      ["Elder Morel", "#8a5a3a", false, 1.15, [
        "Welcome, little sprout. The forest is very big and you are very small.",
        "Behind you lies the Great Lake. You can fish right off its wooden pier!",
        "Sit on the logs around any campfire with E to travel between our villages.",
        "Snail folk also live way up in the treetops, and Truffle Deep lies far to the east!",
      ]],
      ["Pip", "#e07aa0", true, 0.85, [
        "Apples! The little trees grow apples. Press E next to one to munch it.",
        "If your belly runs empty you'll start to feel very poorly.",
      ]],
      ["Chanterelle", "#e8a33a", false, 1, [
        "Watch out for the beetles. Jump on their shells, or swing your wooden sword with F!",
        "The shelf fungus on the giant trunks is nice and bouncy to stand on.",
      ]],
    ],
  },
  {
    name: "Truffle Deep",
    x: 16200,
    npcs: [
      ["Grand Truffle", "#4a3426", false, 1.25, [
        "So. You made it all the way to Truffle Deep. Not bad for such a small sprout.",
        "Every village is connected by roots underground — sit on a campfire log to jump back anytime!",
        "You are always welcome here. Now rest, wanderer.",
      ]],
      ["Bluefoot", "#3e7fb8", false, 1, [
        "Did you know some mushrooms glow at night? I'm working on it.",
      ]],
      ["Morsel", "#c9b38a", true, 0.85, [
        "One of the giant trees in the forest is hollow with a glowing door at its base. Old stone halls inside, crawling with beetles!",
        "They say whoever clears it out gets the Winged Spore. Then you could jump twice!",
      ]],
    ],
  },
];

const TREE_VILLAGE_DEFS: { name: string; near: number; npcs: [string, string, boolean, number, string[]][] }[] = [
  {
    name: "Bramblebough",
    near: 3700,
    npcs: [
      ["Twirl", "#c98a4a", true, 0.9, [
        "Ooh, a mushroom! You jumped all the way up here? We snails took a whole summer.",
        "Mind the rope bridges. They wobble, but they've never dropped anyone. Yet.",
      ]],
      ["Granny Whorl", "#b86a8a", false, 1.1, [
        "Every snail carries a house on its back. Up here we just park them on the deck.",
        "Follow the bridges east and you'll reach Highcap Hollow, our sister village.",
      ]],
    ],
  },
  {
    name: "Highcap Hollow",
    near: 11400,
    npcs: [
      ["Captain Slowpoke", "#e8a33a", false, 1.15, [
        "Ahoy, sprout! Welcome to the highest snail village in the whole forest.",
        "Every trunk is tied to the next one. You could cross the whole forest without touching the ground.",
      ]],
      ["Pearl", "#9fd6e8", true, 0.8, [
        "I've never been to the ground. Is it nice? Is it slimy?",
      ]],
    ],
  },
];

export const TOTAL_VILLAGES = VILLAGE_DEFS.length + TREE_VILLAGE_DEFS.length;

const SHELLS = ["#c98a4a", "#b86a8a", "#d9b46a", "#8a6a9a", "#c76a4a"];
const CAPS = ["#d9443a", "#c8302a", "#e8a33a", "#8a5a3a", "#efe6d2", "#3e7fb8", "#b8572e", "#6b4a35"];

export function generateWorld(seed = 1337, doorIndex?: number): { world: World; groundY: (x: number) => number } {
  const rnd = mulberry32(seed);
  const rr = (a: number, b: number) => a + rnd() * (b - a);

  const villageSpans = VILLAGE_DEFS.map((v) => ({ x: v.x, half: 150 }));
  const nearLake = (x: number, pad = 0) => x < LAKE_EDGE + 120 + pad;
  const ELDER_W = 170;
  const ELDER_X = WORLD_W - 480;
  const inElder = (x: number, pad = 0) => x > ELDER_X - 60 - pad && x < ELDER_X + ELDER_W + 60 + pad;
  const inVillage = (x: number, pad = 0) => villageSpans.some((v) => Math.abs(x - v.x) < v.half + pad);

  // Fishing puddles (decided first so the ground can be flattened around them)
  const puddles: Puddle[] = [];
  for (let px = LAKE_EDGE + 400; px < WORLD_W - 200; ) {
    if (!inVillage(px, 90) && !inElder(px, 40) && !nearLake(px, 60)) {
      puddles.push({ x: Math.round(px), half: Math.round(rr(13, 20)) });
      px += rr(550, 950);
    } else px += 50;
  }
  const nearPuddle = (x: number, pad: number) => puddles.some((pd) => Math.abs(x - pd.x) < pd.half + pad);

  const rawGround = (x: number) =>
    GROUND_BASE + Math.sin(x / 190) * 9 + Math.sin(x / 71 + 1.3) * 4 + Math.sin(x / 523 + 4) * 12;

  const groundY = (x: number) => {
    // the Great Lake: flat water surface, then a sandy shore rising out of it
    if (x < LAKE_EDGE) return LAKE_Y;
    let g = rawGround(x);
    if (x < LAKE_EDGE + 70) {
      const t = (x - LAKE_EDGE) / 70;
      const sm = t * t * (3 - 2 * t);
      g = LAKE_Y * (1 - sm) + g * sm;
    }
    for (const v of villageSpans) {
      const d = Math.abs(x - v.x);
      const flatY = rawGround(v.x);
      if (d < v.half) return Math.round(flatY);
      if (d < v.half + 80) {
        const t = (d - v.half) / 80;
        const s = t * t * (3 - 2 * t);
        g = flatY * (1 - s) + g * s;
      }
    }
    for (const pd of puddles) {
      const d = Math.abs(x - pd.x);
      if (d > pd.half + 30) continue;
      const flatY = rawGround(pd.x);
      if (d < pd.half + 6) return Math.round(flatY);
      const t = (d - pd.half - 6) / 24;
      const sm = t * t * (3 - 2 * t);
      g = flatY * (1 - sm) + g * sm;
    }
    return Math.round(g);
  };

  // Giant trees (positions first; climbing shelves + decks come after the tree villages are chosen)
  const trees: GiantTree[] = [];
  const platforms: Platform[] = [];
  let x = LAKE_EDGE + 260;
  while (x < ELDER_X - 300) {
    const w = Math.round(rr(70, 130));
    if (!inVillage(x + w / 2, w / 2 + 20) && !puddles.some((pd) => x + w + 45 > pd.x - pd.half && x - 45 < pd.x + pd.half)) {
      trees.push({ x, w, seed: Math.floor(rnd() * 1e9), deckY: 0, deckX0: 0, deckX1: 0 });
    }
    x += w + rr(260, 520);
  }
  trees.push({ x: ELDER_X, w: ELDER_W, seed: 4242, deckY: 0, deckX0: 0, deckX1: 0 });

  // Which two trees carry a village at the top
  const villageTrees = new Map<GiantTree, (typeof TREE_VILLAGE_DEFS)[number]>();
  for (const def of TREE_VILLAGE_DEFS) {
    const t = trees
      .filter((tr) => tr !== trees[0] && !villageTrees.has(tr))
      .reduce((a, b) => (Math.abs(a.x - def.near) < Math.abs(b.x - def.near) ? a : b));
    villageTrees.set(t, def);
  }

  // Randomize which ground-level tree houses the glowing dungeon door (and Winged Spore).
  const chosenIdx =
    doorIndex !== undefined && Number.isFinite(doorIndex)
      ? Math.max(0, Math.min(trees.length - 1, Math.floor(doorIndex)))
      : Math.floor(Math.random() * trees.length);
  const elder = trees[chosenIdx]!;
  elder.elder = true;

  // Climbing route: two easy shelves, then shelves too far apart for a single jump (needs the double jump).
  for (const t of trees) {
    const cx = t.x + t.w / 2;
    const g = groundY(cx);
    const deckY = Math.round(g - rr(424, 472));
    const pad = villageTrees.has(t) ? 75 : t.elder ? 30 : 22;
    t.deckY = deckY;
    t.deckX0 = Math.round(t.x - pad);
    t.deckX1 = Math.round(t.x + t.w + pad);
    let side = rnd() < 0.5 ? -1 : 1;
    const shelf = (y: number) => {
      const pw = Math.round(rr(22, 28));
      platforms.push({ x: Math.round(cx + side * 19 - pw / 2), y: Math.round(y), w: pw, color: Math.floor(rnd() * 3), kind: "shelf" });
      side = -side;
    };
    shelf(g - 31);
    shelf(g - 61);
    const span = g - 61 - deckY;
    const n = Math.ceil(span / 56) - 1;
    const step = span / (n + 1);
    for (let i = 1; i <= n; i++) shelf(g - 61 - step * i);
    platforms.push({ x: t.deckX0, y: deckY, w: t.deckX1 - t.deckX0, color: 0, kind: "deck" });
  }
  // Rope bridges tie every trunk to the next one
  for (let i = 0; i < trees.length - 1; i++) {
    const a = trees[i]!;
    const b = trees[i + 1]!;
    const w = b.deckX0 - a.deckX1;
    if (w < 10) continue;
    platforms.push({ x: a.deckX1, y: a.deckY, w, y2: b.deckY, sag: Math.min(40, Math.round(w * 0.07)), color: 0, kind: "bridge" });
  }

  // Apple trees
  const appleTrees: AppleTree[] = [];
  x = LAKE_EDGE + 140;
  while (x < WORLD_W - 100) {
    if (!inVillage(x, 30) && !inElder(x, 10) && !nearPuddle(x, 22) && !trees.some((t) => x > t.x - 30 && x < t.x + t.w + 30)) {
      const size = rr(0.85, 1.2);
      const apples = [];
      const n = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        apples.push({ ox: Math.round(rr(-10, 10) * size), oy: Math.round(rr(-6, 6) * size), grown: true, timer: 0 });
      }
      appleTrees.push({ x: Math.round(x), size, apples });
      x += rr(220, 420);
    } else {
      x += 40;
    }
  }

  // Villages
  const villages: Village[] = VILLAGE_DEFS.map((def) => {
    const half = 150;
    const houses: House[] = [];
    const slots = [-115, -60, 50, 105];
    for (const s of slots) {
      const stemW = Math.round(rr(14, 20));
      const capW = Math.round(stemW + rr(18, 30));
      houses.push({
        x: Math.round(def.x + s + rr(-6, 6)),
        stemW,
        stemH: Math.round(rr(20, 34)),
        capW,
        capH: Math.round(rr(11, 16)),
        cap: CAPS[Math.floor(rnd() * CAPS.length)] ?? "#d9443a",
        spots: rnd() < 0.5,
      });
    }
    const g = groundY(def.x);
    const npcs: Npc[] = def.npcs.map(([name, cap, spots, scale, lines], i) => ({
      name,
      cap,
      spots,
      scale,
      lines,
      lineIdx: 0,
      x: def.x - 80 + i * 70 + rr(-10, 10),
      y: g,
      vx: 0,
      facing: rnd() < 0.5 ? -1 : 1,
      wanderT: rr(0, 3),
      walkT: 0,
      minX: def.x - half + 20,
      maxX: def.x + half - 20,
    }));
    return {
      name: def.name,
      x: def.x,
      half,
      houses,
      fireX: def.x - 5,
      lanterns: [def.x - 140, def.x - 30, def.x + 25, def.x + 140],
      npcs,
      discovered: false,
    };
  });

  for (const [t, def] of villageTrees) {
    const cxT = Math.round(t.x + t.w / 2);
    const half = Math.round((t.deckX1 - t.deckX0) / 2);
    const houses: House[] = [-64, 64].map((s) => {
      const stemW = Math.round(rr(14, 18));
      return {
        x: cxT + s,
        stemW,
        stemH: Math.round(rr(22, 30)),
        capW: Math.round(stemW + rr(16, 22)),
        capH: Math.round(rr(11, 14)),
        cap: SHELLS[Math.floor(rnd() * SHELLS.length)] ?? "#c98a4a",
        spots: rnd() < 0.5,
        shell: true,
      };
    });
    villages.push({
      name: def.name,
      x: cxT,
      half,
      houses,
      fireX: cxT,
      lanterns: [cxT - half + 6, cxT - 34, cxT + 34, cxT + half - 6],
      npcs: def.npcs.map(([name, cap, spots, scale, lines], i) => ({
        name,
        cap,
        spots,
        scale,
        lines,
        lineIdx: 0,
        x: cxT - 30 + i * 60,
        y: t.deckY,
        vx: 0,
        facing: i ? -1 : 1,
        wanderT: rr(0, 3),
        walkT: 0,
        minX: cxT - half + 12,
        maxX: cxT + half - 12,
        snail: true,
      })),
      discovered: false,
      floorY: t.deckY,
    });
  }

  // Beetles: patrol between villages
  const beetles: Beetle[] = [];
  x = LAKE_EDGE + 1100;
  while (x < ELDER_X - 120) {
    if (!inVillage(x, 120) && !nearPuddle(x, 190) && Math.abs(x - (elder.x + elder.w / 2)) > elder.w / 2 + 40) {
      const range = rr(50, 110);
      beetles.push({
        x,
        y: groundY(x),
        vx: rnd() < 0.5 ? -14 : 14,
        minX: x - range,
        maxX: x + range,
        alive: true,
        respawn: 0,
        walkT: 0,
      });
      x += rr(380, 700);
    } else x += 60;
  }

  // Flying beetles only live inside the Elder Tree dungeon.
  const flyers: Flyer[] = [];

  // Ground decor
  const decor: Decor[] = [];
  for (let dx = 0; dx < WORLD_W; dx += 3 + Math.floor(rnd() * 6)) {
    const r = rnd();
    const kind: Decor["kind"] =
      r < 0.6 ? "grass" : r < 0.7 ? "flower" : r < 0.78 ? "clover" : r < 0.86 ? "pebble" : r < 0.92 ? "leaf" : "fern";
    const v = rnd();
    const c = Math.floor(rnd() * 4);
    if (!nearPuddle(dx, 2) && dx > LAKE_EDGE + 4) decor.push({ x: dx, kind, v, c });
  }
  const fgGrass: Decor[] = [];
  for (let dx = 0; dx < WORLD_W; dx += 30 + Math.floor(rnd() * 90)) {
    const v = rnd();
    const c = Math.floor(rnd() * 3);
    if (!nearPuddle(dx, 4) && dx > LAKE_EDGE + 20) fgGrass.push({ x: dx, kind: "grass", v, c });
  }

  const pier: Platform = { x: PIER_X0, y: LAKE_Y - 8, w: LAKE_EDGE + 40 - PIER_X0, color: 0, kind: "pier" };
  platforms.push(pier);

  return { world: { pier, trees, elder, flyers, platforms, appleTrees, puddles, villages, beetles, decor, fgGrass }, groundY };
}
