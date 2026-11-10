// World generation: terrain, giant trees, villages, apple trees, beetles, decor.

export const WORLD_W = 9000;
export const GROUND_BASE = 190;

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
}

export interface GiantTree {
  x: number; // left edge
  w: number;
  seed: number;
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
  trees: GiantTree[];
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
    x: 700,
    npcs: [
      ["Elder Morel", "#8a5a3a", false, 1.15, [
        "Welcome, little sprout. The forest is very big and you are very small.",
        "Our cousins live in villages far to the east. Go and find them!",
        "Rest by our campfire whenever you feel bruised.",
      ]],
      ["Pip", "#e07aa0", true, 0.85, [
        "Apples! The little trees grow apples. Press E next to one to munch it.",
        "If your belly runs empty you'll start to feel very poorly.",
      ]],
      ["Chanterelle", "#e8a33a", false, 1, [
        "Watch out for the beetles. Jump on their shells to bonk them!",
        "The shelf fungus on the giant trunks is nice and bouncy to stand on.",
      ]],
    ],
  },
  {
    name: "Gillhollow",
    x: 2900,
    npcs: [
      ["Inky", "#3b3f52", false, 1, [
        "You walked all the way from Mossbottom? On those tiny legs?",
        "My grandmother says the oldest tree reaches up past the sky.",
      ]],
      ["Lady Amanita", "#c8302a", true, 1.1, [
        "Charmed, I'm sure. Do mind the moss, it's freshly combed.",
        "There's a village of puffballs further east. Terribly round folk.",
      ]],
      ["Button", "#e9dcc4", false, 0.75, [
        "I'm the smallest mushroom in Gillhollow. Well, until you showed up.",
      ]],
    ],
  },
  {
    name: "Puffington",
    x: 5300,
    npcs: [
      ["Old Puff", "#efe6d2", false, 1.2, [
        "Hrrm. A traveler. We don't get many of those. Have a sit by the fire.",
        "Keep going east and you'll find Truffle Deep, the last village before the great roots.",
      ]],
      ["Shiitake Sam", "#7a4a2a", false, 1, [
        "I collect pebbles. This one is my favourite. It's round.",
        "Eat an apple before you go. The next stretch is long.",
      ]],
      ["Enoki", "#f3eedc", false, 0.8, [
        "Hi! Hi! Are you a mushroom too? You look like a mushroom!",
      ]],
    ],
  },
  {
    name: "Truffle Deep",
    x: 7900,
    npcs: [
      ["Grand Truffle", "#4a3426", false, 1.25, [
        "So. You found all of us. Not bad for such a small sprout.",
        "Every mushroom village is connected by roots underground. We're all one family.",
        "You are always welcome here. Now rest, wanderer.",
      ]],
      ["Bluefoot", "#3e7fb8", false, 1, [
        "Did you know some mushrooms glow at night? I'm working on it.",
      ]],
      ["Morsel", "#c9b38a", true, 0.85, [
        "Beyond the great roots there's nothing but more forest. Forever!",
      ]],
    ],
  },
];

const CAPS = ["#d9443a", "#c8302a", "#e8a33a", "#8a5a3a", "#efe6d2", "#3e7fb8", "#b8572e", "#6b4a35"];

export function generateWorld(seed = 1337): { world: World; groundY: (x: number) => number } {
  const rnd = mulberry32(seed);
  const rr = (a: number, b: number) => a + rnd() * (b - a);

  const villageSpans = VILLAGE_DEFS.map((v) => ({ x: v.x, half: 150 }));
  const inVillage = (x: number, pad = 0) => villageSpans.some((v) => Math.abs(x - v.x) < v.half + pad);

  // Fishing puddles (decided first so the ground can be flattened around them)
  const puddles: Puddle[] = [];
  for (let px = 450; px < WORLD_W - 200; ) {
    if (!inVillage(px, 90)) {
      puddles.push({ x: Math.round(px), half: Math.round(rr(13, 20)) });
      px += rr(550, 950);
    } else px += 50;
  }
  const nearPuddle = (x: number, pad: number) => puddles.some((pd) => Math.abs(x - pd.x) < pd.half + pad);

  const rawGround = (x: number) =>
    GROUND_BASE + Math.sin(x / 190) * 9 + Math.sin(x / 71 + 1.3) * 4 + Math.sin(x / 523 + 4) * 12;

  const groundY = (x: number) => {
    let g = rawGround(x);
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

  // Giant trees
  const trees: GiantTree[] = [];
  const platforms: Platform[] = [];
  let x = 260;
  while (x < WORLD_W - 200) {
    const w = Math.round(rr(70, 130));
    if (!inVillage(x + w / 2, w / 2 + 20) && !puddles.some((pd) => x + w + 45 > pd.x - pd.half && x - 45 < pd.x + pd.half)) {
      const t: GiantTree = { x, w, seed: Math.floor(rnd() * 1e9) };
      trees.push(t);
      // Shelf fungus platforms spiralling up the trunk
      const g = groundY(x + w / 2);
      let py = g - rr(28, 36);
      let side = rnd() < 0.5 ? 0 : 1;
      const count = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < count; i++) {
        const pw = Math.round(rr(18, 30));
        const px = side === 0 ? x - pw * 0.55 : x + w - pw * 0.45;
        platforms.push({ x: Math.round(px), y: Math.round(py), w: pw, color: Math.floor(rnd() * 3) });
        py -= rr(26, 34);
        side = 1 - side;
        if (rnd() < 0.3) {
          // a middle one across the trunk face
          const mw = Math.round(rr(16, 24));
          platforms.push({ x: Math.round(x + w / 2 - mw / 2 + rr(-10, 10)), y: Math.round(py + 13), w: mw, color: Math.floor(rnd() * 3) });
        }
      }
    }
    x += w + rr(260, 520);
  }

  // Apple trees
  const appleTrees: AppleTree[] = [];
  x = 380;
  while (x < WORLD_W - 100) {
    if (!inVillage(x, 30) && !nearPuddle(x, 22) && !trees.some((t) => x > t.x - 30 && x < t.x + t.w + 30)) {
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

  // Beetles: patrol between villages
  const beetles: Beetle[] = [];
  x = 1100;
  while (x < WORLD_W - 150) {
    if (!inVillage(x, 120) && !nearPuddle(x, 190)) {
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

  // Ground decor
  const decor: Decor[] = [];
  for (let dx = 0; dx < WORLD_W; dx += 3 + Math.floor(rnd() * 6)) {
    const r = rnd();
    const kind: Decor["kind"] =
      r < 0.6 ? "grass" : r < 0.7 ? "flower" : r < 0.78 ? "clover" : r < 0.86 ? "pebble" : r < 0.92 ? "leaf" : "fern";
    const v = rnd();
    const c = Math.floor(rnd() * 4);
    if (!nearPuddle(dx, 2)) decor.push({ x: dx, kind, v, c });
  }
  const fgGrass: Decor[] = [];
  for (let dx = 0; dx < WORLD_W; dx += 30 + Math.floor(rnd() * 90)) {
    const v = rnd();
    const c = Math.floor(rnd() * 3);
    if (!nearPuddle(dx, 4)) fgGrass.push({ x: dx, kind: "grass", v, c });
  }

  return { world: { trees, platforms, appleTrees, puddles, villages, beetles, decor, fgGrass }, groundY };
}
