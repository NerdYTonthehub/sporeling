// The Elder Tree dungeon: old stone-brick halls inside the hollow trunk.
// The floor and ceiling change shape room by room; three beetle sections are sealed by root gates,
// with a small parkour pit between the second gate and the Beetle King's hall.
import { BOSS_HP, makeFlyer, type Flyer } from "./combat";
import { fillCircle, rect } from "./sprites";
import { hash1, type Beetle, type Platform } from "./world";

type Ctx = CanvasRenderingContext2D;

export const DUNGEON_W = 2720;
/** Floor of the spike pit under the parkour pillars. */
export const PIT_Y = 330;
export const PARKOUR_X0 = 1362;
export const PARKOUR_X1 = 1778;
export const BOSS_ARENA_X = 1885;

export interface Gate {
  x: number;
  section: number;
  open: boolean;
  openT: number; // 0 closed -> 1 fully retracted
}

export interface Glowcap {
  x: number;
  eaten: boolean;
}

export interface Dungeon {
  w: number;
  ground: Int16Array;
  ceil: Int16Array;
  platforms: Platform[];
  beetles: Beetle[];
  flyers: Flyer[];
  gates: Gate[];
  glowcaps: Glowcap[];
  torches: number[];
  entryX: number;
  exitX: number;
  shrineX: number;
  relicTaken: boolean;
  sections: number;
  /** where you climb back out after falling into the spike pit */
  checkpointX: number;
  bossArenaX: number;
}

// [x, y] keyframes, linearly interpolated.
const FLOOR_KEYS: [number, number][] = [
  [0, 190], [170, 190], [230, 186], [300, 194], [380, 194], [420, 178], [620, 178],
  // stair corridor (stepped below), then the tall hall
  [880, 238], [1000, 234], [1100, 240], [1200, 236], [PARKOUR_X0, 238],
  [PARKOUR_X1, 222], [1860, 222], [1900, 226], [2200, 230], [2500, 226], [DUNGEON_W, 226],
];
const CEIL_KEYS: [number, number][] = [
  [0, 118], [180, 118], [230, 60], [300, 44], [400, 40], [520, 52], [570, 70], [585, 120], [620, 120],
  [880, 182], [900, 182], [915, 40], [1000, 26], [1200, 26], [1300, 40], [1330, 170], [1360, 170], [1380, 130],
  [1800, 130], [1830, 160], [1870, 160], [1900, 40], [2050, 14], [2300, 14], [2460, 40], [2490, 160], [DUNGEON_W, 160],
];
/** Stone pillars rising out of the spike pit: [x0, x1, top]. */
const PILLARS: [number, number, number][] = [
  [1388, 1402, 232], [1428, 1440, 222], [1462, 1474, 214], [1546, 1558, 214],
  [1584, 1594, 226], [1618, 1632, 216], [1702, 1714, 220], [1740, 1752, 228],
];

function lerpKeys(keys: [number, number][], x: number) {
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1, b[0] - a[0]);
  }
  return keys[keys.length - 1]![1];
}

function floorProfile(x: number) {
  if (x > 620 && x < 880) return 178 + Math.min(12, Math.floor((x - 620) / 21.7)) * 5; // stairs
  if (x > PARKOUR_X0 && x < PARKOUR_X1) {
    const p = PILLARS.find(([a, b]) => x >= a && x <= b);
    return p ? p[2] : PIT_Y;
  }
  return Math.round(lerpKeys(FLOOR_KEYS, x) + Math.sin(x / 13) * 0.6);
}

export const floorAt = (d: Dungeon, x: number) => d.ground[Math.max(0, Math.min(d.w, Math.round(x)))] ?? 190;
export const ceilAt = (d: Dungeon, x: number) => d.ceil[Math.max(0, Math.min(d.w, Math.round(x)))] ?? 40;

const stone = (x: number, y: number, w: number): Platform => ({ x, y, w, color: 0, kind: "stone" });

function beetle(ground: Int16Array, x: number, range: number, section: number, extra: Partial<Beetle> = {}): Beetle {
  return {
    x,
    y: ground[x] ?? 190,
    vx: x % 2 ? 16 : -16,
    minX: x - range,
    maxX: x + range,
    alive: true,
    respawn: Infinity,
    walkT: 0,
    section,
    hp: 1,
    maxHp: 1,
    ...extra,
  };
}

export function createDungeon(): Dungeon {
  const ground = new Int16Array(DUNGEON_W + 1);
  const ceil = new Int16Array(DUNGEON_W + 1);
  for (let x = 0; x <= DUNGEON_W; x++) {
    ground[x] = floorProfile(x);
    ceil[x] = Math.round(lerpKeys(CEIL_KEYS, x));
  }
  const platforms: Platform[] = [
    // section 0: vaulted entry hall
    stone(246, 162, 26),
    stone(326, 140, 26),
    stone(440, 150, 28),
    // section 1: the tall hall, ledges climbing up and back down
    stone(930, 208, 26),
    stone(990, 182, 26),
    stone(1050, 156, 28),
    stone(1120, 130, 30),
    stone(1190, 156, 28),
    stone(1262, 190, 26),
    // parkour: floating slabs between the pillars
    stone(1496, 204, 24),
    stone(1656, 206, 20),
    // the Beetle King's great hall
    stone(1960, 196, 30),
    stone(2090, 168, 34),
    stone(2230, 146, 34),
    stone(2370, 182, 30),
  ];
  const beetles: Beetle[] = [
    beetle(ground, 250, 45, 0),
    beetle(ground, 350, 40, 0),
    beetle(ground, 500, 55, 0),
    beetle(ground, 960, 50, 1),
    beetle(ground, 1080, 60, 1),
    beetle(ground, 1220, 60, 1),
    beetle(ground, 2180, 275, 2, { big: true, hp: BOSS_HP, maxHp: BOSS_HP, vx: -30, hitT: 0, mode: "walk", timer: 2, lift: 0, vy: 0 }),
  ];
  const flyers: Flyer[] = [
    makeFlyer(330, 108, 40, 0),
    makeFlyer(1000, 120, 40, 1),
    makeFlyer(1150, 96, 40, 1),
    makeFlyer(1250, 140, 30, 1),
    makeFlyer(2000, 96, 45, 2),
    makeFlyer(2380, 96, 45, 2),
  ];
  return {
    w: DUNGEON_W,
    ground,
    ceil,
    platforms,
    beetles,
    flyers,
    gates: [
      { x: 592, section: 0, open: false, openT: 0 },
      { x: 1335, section: 1, open: false, openT: 0 },
      { x: 2495, section: 2, open: false, openT: 0 },
    ],
    glowcaps: [
      { x: 560, eaten: false },
      { x: 1300, eaten: false },
      { x: 1830, eaten: false },
      { x: 1856, eaten: false },
    ],
    torches: [120, 290, 470, 700, 830, 960, 1120, 1280, 1460, 1700, 1950, 2110, 2270, 2430, 2600],
    entryX: 46,
    exitX: 2670,
    shrineX: 2600,
    relicTaken: false,
    sections: 3,
    checkpointX: 1346,
    bossArenaX: BOSS_ARENA_X,
  };
}

// ---------------- drawing ----------------

interface Tiles {
  rock: CanvasPattern;
  back: CanvasPattern;
}
let tiles: Tiles | null = null;

/** A 64x32 stone-brick tile, drawn once with fillRects and reused as a pattern. */
function brickTile(base: string, light: string, dark: string, mortar: string, moss: boolean, salt: number) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = mortar;
  g.fillRect(0, 0, 64, 32);
  const tones = [base, light, dark];
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 8 : 0;
    for (let b = -1; b < 4; b++) {
      const x0 = b * 16 + off;
      const y0 = row * 8;
      const h = hash1(b * 7 + row * 31, salt);
      const col = h < 0.2 ? dark : h > 0.85 ? light : base;
      g.fillStyle = col;
      g.fillRect(x0 + 1, y0 + 1, 15, 7);
      g.fillStyle = light;
      g.fillRect(x0 + 1, y0 + 1, 15, 1);
      g.fillRect(x0 + 1, y0 + 1, 1, 6);
      g.fillStyle = dark;
      g.fillRect(x0 + 2, y0 + 7, 14, 1);
      g.fillRect(x0 + 15, y0 + 2, 1, 6);
      // speckles and cracks
      for (let k = 0; k < 3; k++) {
        const sx = x0 + 3 + Math.floor(hash1(b + k * 5 + row * 13, salt + 1) * 11);
        const sy = y0 + 2 + Math.floor(hash1(b * 3 + k + row * 17, salt + 2) * 5);
        g.fillStyle = tones[(k + row) % 3] === base ? dark : base;
        g.fillRect(sx, sy, 1, 1);
      }
      if (hash1(b + row * 9, salt + 3) < 0.18) {
        g.fillStyle = mortar;
        const cx = x0 + 5 + Math.floor(hash1(b, row + salt) * 6);
        g.fillRect(cx, y0 + 2, 1, 2);
        g.fillRect(cx + 1, y0 + 4, 1, 2);
      }
      if (moss && hash1(b * 11 + row, salt + 4) < 0.22) {
        g.fillStyle = "#3f5a34";
        g.fillRect(x0 + 2, y0 + 1, 6, 1);
        g.fillStyle = "#5f7f45";
        g.fillRect(x0 + 3, y0 + 1, 3, 1);
      }
    }
  }
  return c;
}

function getTiles(ctx: Ctx): Tiles | null {
  if (tiles) return tiles;
  if (typeof document === "undefined") return null;
  const rock = ctx.createPattern(brickTile("#4d4858", "#666072", "#34303d", "#1c1a22", true, 11), "repeat");
  const back = ctx.createPattern(brickTile("#2a2732", "#35313f", "#211e28", "#131118", false, 23), "repeat");
  if (!rock || !back) return null;
  tiles = { rock, back };
  return tiles;
}

function anchor(p: CanvasPattern, ox: number, oy: number) {
  if (typeof p.setTransform === "function" && typeof DOMMatrix !== "undefined") p.setTransform(new DOMMatrix([1, 0, 0, 1, -ox, -oy]));
}

/** Back wall, pillars, glowing fungus, torches and the rock above the ceiling. */
export function drawDungeonBack(ctx: Ctx, d: Dungeon, cx: number, cy: number, W: number, H: number, t: number) {
  const tl = getTiles(ctx);
  if (tl) {
    anchor(tl.back, Math.round(cx * 0.8), Math.round(cy * 0.8));
    ctx.fillStyle = tl.back;
  } else ctx.fillStyle = "#2a2732";
  ctx.fillRect(0, 0, W, H);
  // depth haze
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(6,4,10,0.55)");
  g.addColorStop(0.6, "rgba(6,4,10,0.15)");
  g.addColorStop(1, "rgba(6,4,10,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // carved pillars on the back wall (parallax 0.8)
  const pc = cx * 0.8;
  for (let i = Math.floor(pc / 150) - 1; i < Math.floor(pc / 150) + W / 150 + 2; i++) {
    const x = Math.round(i * 150 + 40 - pc);
    rect(ctx, "#1a1820", x - 1, 0, 14, H);
    rect(ctx, "#3b3746", x, 0, 12, H);
    rect(ctx, "#4a4555", x, 0, 2, H);
    rect(ctx, "#25222d", x + 10, 0, 2, H);
    for (let y = ((-Math.round(cy * 0.8)) % 24 + 24) % 24; y < H; y += 24) rect(ctx, "#25222d", x, y, 12, 1);
    // hanging chain
    if (hash1(i, 340) < 0.5) {
      const len = 20 + Math.floor(hash1(i, 341) * 40);
      for (let k = 0; k < len; k += 3) rect(ctx, "#56525e", x + 30 + Math.round(Math.sin(t + i) * 0.5), k - Math.round(cy * 0.8) + 30, 1, 2);
    }
  }
  // glowing wall fungus clusters (parallax 0.8)
  for (let i = Math.floor(pc / 70) - 1; i < Math.floor(pc / 70) + W / 70 + 2; i++) {
    if (hash1(i, 300) < 0.55) continue;
    const x = Math.round(i * 70 + hash1(i, 301) * 40 - pc);
    const y = Math.round(120 + hash1(i, 302) * 90 - cy * 0.8);
    for (let k = 0; k < 3; k++) {
      rect(ctx, "#2f9a8e", x + k * 4, y + (k % 2) * 2, 3, 1);
      rect(ctx, "#a8fff0", x + k * 4 + 1, y + (k % 2) * 2, 1, 1);
      rect(ctx, "#a59c88", x + k * 4 + 1, y + 1 + (k % 2) * 2, 1, 2);
    }
  }
  // torches (world space, on the back wall)
  for (const tx of d.torches) {
    const sx = Math.round(tx - cx);
    if (sx < -10 || sx > W + 10) continue;
    const ty = floorAt(d, tx) - 44 - cy;
    rect(ctx, "#1b140f", sx - 3, ty + 4, 7, 2);
    rect(ctx, "#5a3c26", sx - 1, ty + 4, 3, 8);
    rect(ctx, "#2a1d14", sx - 2, ty + 2, 5, 3);
    for (let i = 0; i < 3; i++) {
      const h = 3 + Math.floor(Math.abs(Math.sin(t * 10 + i * 2.1 + tx)) * 4);
      rect(ctx, "#e8582a", sx - 1 + i, ty + 2 - h, 1, h);
      rect(ctx, "#ffc24a", sx - 1 + i, ty + 2 - Math.ceil(h / 2), 1, Math.ceil(h / 2));
    }
    rect(ctx, "#fff1a8", sx, ty - 1, 1, 2);
  }
  // rock above the ceiling, with roots hanging from it
  if (tl) {
    anchor(tl.rock, cx, cy);
    ctx.fillStyle = tl.rock;
  } else ctx.fillStyle = "#4d4858";
  const cys: number[] = new Array<number>(W);
  for (let x = 0; x < W; x++) {
    const y = ceilAt(d, x + cx) - cy;
    cys[x] = y;
    if (y > 0) ctx.fillRect(x, 0, 1, y);
  }
  for (let x = 0; x < W; x++) {
    const y = cys[x]!;
    rect(ctx, "#1c1a22", x, y - 2, 1, 2);
    if (hash1(x + cx, 312) < 0.08) rect(ctx, "#34303d", x, y, 1, 2 + Math.floor(hash1(x + cx, 313) * 4));
  }
  ctx.fillStyle = "#3a2516";
  for (let i = Math.floor(cx / 23) - 1; i < Math.floor(cx / 23) + W / 23 + 2; i++) {
    if (hash1(i, 320) < 0.55) continue;
    const wx = Math.round(i * 23 + hash1(i, 321) * 10);
    const x = wx - cx;
    if (x < 0 || x >= W) continue;
    const top = cys[x] ?? 0;
    const len = 6 + Math.floor(hash1(i, 322) * 26);
    for (let k = 0; k < len; k++) ctx.fillRect(x + Math.round(Math.sin((k + i) / 5 + t * 0.8) * 0.8), top + k, k < len - 4 ? 2 : 1, 1);
  }
}

/** Solid stone below the floor, with a capstone edge and spikes in the pit. */
export function drawDungeonFloor(ctx: Ctx, d: Dungeon, cx: number, cy: number, W: number, H: number) {
  const tl = getTiles(ctx);
  if (tl) {
    anchor(tl.rock, cx, cy);
    ctx.fillStyle = tl.rock;
  } else ctx.fillStyle = "#4d4858";
  const ys: number[] = new Array<number>(W);
  for (let x = 0; x < W; x++) {
    const y = floorAt(d, x + cx) - cy;
    ys[x] = y;
    if (y < H) ctx.fillRect(x, y, 1, H - y);
  }
  for (let x = 0; x < W; x++) {
    const wx = x + cx;
    const y = ys[x]!;
    const prev = ys[x - 1] ?? y;
    const next = ys[x + 1] ?? y;
    rect(ctx, "#8a8496", x, y, 1, 1);
    rect(ctx, "#5e5970", x, y + 1, 1, 1);
    // pillar / step sides
    if (prev < y - 2) rect(ctx, "#25222d", x, prev, 1, y - prev);
    if (next < y - 2) rect(ctx, "#1c1a22", x, next, 1, y - next);
    if (hash1(wx, 330) < 0.12) rect(ctx, "#4f6a3e", x, y - 1, 1, 1);
    // spikes in the pit
    if (floorAt(d, wx) >= PIT_Y && wx > PARKOUR_X0 && wx < PARKOUR_X1) {
      const k = ((wx % 6) + 6) % 6;
      const h = k < 3 ? k * 2 + 1 : (5 - k) * 2 + 1;
      rect(ctx, "#1c1a22", x, y - h - 1, 1, h + 1);
      rect(ctx, k === 2 ? "#e8e0d0" : "#b8b0a0", x, y - h, 1, h);
    }
  }
}

export function drawGate(ctx: Ctx, d: Dungeon, gt: Gate, cx: number, cy: number, t: number) {
  const sx = Math.round(gt.x - cx);
  const top = ceilAt(d, gt.x) - cy - 2;
  const bottom = floorAt(d, gt.x) - cy;
  const h = Math.round((bottom - top) * (1 - gt.openT));
  if (h <= 0) return;
  for (let i = -2; i <= 2; i++) {
    const rx = sx + i * 4;
    for (let y = top; y < top + h; y++) {
      const wob = Math.round(Math.sin((y + i * 9) / 7 + t * 0.5) * 1);
      rect(ctx, "#1b140f", rx + wob - 1, y, 5, 1);
      rect(ctx, i % 2 ? "#5a3c26" : "#6b4a30", rx + wob, y, 3, 1);
      if ((y + i * 3) % 9 === 0) rect(ctx, "#8a6342", rx + wob, y, 1, 1);
    }
  }
  for (let y = top + 8; y < top + h - 2; y += 12) {
    rect(ctx, "#c8b89a", sx - 11, y, 2, 1);
    rect(ctx, "#c8b89a", sx + 10, y + 5, 2, 1);
  }
}

export function drawDoorway(ctx: Ctx, d: Dungeon, x: number, cx: number, cy: number, night: boolean) {
  const sx = Math.round(x - cx);
  const gy = floorAt(d, x) - cy;
  // stone arch
  rect(ctx, "#1c1a22", sx - 15, gy - 36, 30, 36);
  for (let k = 0; k < 7; k++) {
    rect(ctx, k % 2 ? "#666072" : "#4d4858", sx - 14, gy - 34 + k * 5, 4, 4);
    rect(ctx, k % 2 ? "#4d4858" : "#666072", sx + 10, gy - 34 + k * 5, 4, 4);
  }
  rect(ctx, "#0d0805", sx - 10, gy - 30, 20, 30);
  ctx.fillStyle = night ? "#2a3a5a" : "#cfe6a8";
  for (let dy = 0; dy < 28; dy++) {
    const k = dy < 9 ? Math.round(Math.sqrt(81 - (9 - dy) ** 2)) : 9;
    ctx.fillRect(sx - k, gy - 28 + dy, k * 2, 1);
  }
  rect(ctx, night ? "#5a7aa0" : "#f6ffd8", sx - 3, gy - 22, 6, 22);
}

export function drawShrine(ctx: Ctx, d: Dungeon, cx: number, cy: number, t: number) {
  const sx = Math.round(d.shrineX - cx);
  const gy = floorAt(d, d.shrineX) - cy;
  rect(ctx, "#1b140f", sx - 9, gy - 14, 18, 14);
  rect(ctx, "#7d7a70", sx - 8, gy - 13, 16, 13);
  rect(ctx, "#a09c90", sx - 8, gy - 13, 16, 2);
  rect(ctx, "#5e5a52", sx - 6, gy - 9, 12, 1);
  rect(ctx, "#5e5a52", sx - 6, gy - 5, 12, 1);
  if (d.relicTaken) return;
  const by = gy - 24 + Math.round(Math.sin(t * 2.5) * 2);
  drawRelic(ctx, sx, by, t);
}

/** The Winged Spore: a glowing orb with little leaf wings. */
export function drawRelic(ctx: Ctx, x: number, y: number, t: number) {
  const flap = Math.floor(t * 6) % 2;
  ctx.fillStyle = "#1b140f";
  fillCircle(ctx, x, y, 4);
  ctx.fillStyle = "#e8f78a";
  fillCircle(ctx, x, y, 3);
  rect(ctx, "#ffffff", x - 1, y - 2, 2, 1);
  for (const s of [-1, 1]) {
    rect(ctx, "#1b140f", x + s * 5 - (s < 0 ? 4 : 0), y - 3 - flap, 5, 4);
    rect(ctx, "#9fe0c0", x + s * 5 - (s < 0 ? 3 : 0), y - 2 - flap, 4, 2);
    rect(ctx, "#d8fff0", x + s * 5 - (s < 0 ? 3 : 0), y - 2 - flap, 2, 1);
  }
}

export function drawGlowcap(ctx: Ctx, d: Dungeon, g: Glowcap, cx: number, cy: number) {
  if (g.eaten) return;
  const sx = Math.round(g.x - cx);
  const gy = floorAt(d, g.x) - cy;
  rect(ctx, "#1b140f", sx - 1, gy - 6, 3, 6);
  rect(ctx, "#d8d0b8", sx, gy - 5, 1, 5);
  rect(ctx, "#1b140f", sx - 4, gy - 9, 9, 4);
  rect(ctx, "#5fd6c4", sx - 3, gy - 8, 7, 2);
  rect(ctx, "#a8fff0", sx - 2, gy - 8, 2, 1);
}

/** Dark, scary lighting: everything dims except around torches, glowcaps and the player. */
export function drawDungeonLights(ctx: Ctx, d: Dungeon, cx: number, cy: number, W: number, H: number, t: number, px: number, py: number) {
  ctx.fillStyle = "rgba(4,2,10,0.32)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    if (x < -r || x > W + r) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const tx of d.torches) {
    const flick = 0.85 + Math.sin(t * 11 + tx) * 0.1 + Math.sin(t * 6.3 + tx * 0.3) * 0.05;
    glow(tx - cx, floorAt(d, tx) - 48 - cy, 52, "255,150,60", 0.2 * flick);
  }
  for (const g of d.glowcaps) if (!g.eaten) glow(g.x - cx, floorAt(d, g.x) - 8 - cy, 14, "90,230,210", 0.3);
  if (!d.relicTaken) glow(d.shrineX - cx, floorAt(d, d.shrineX) - 24 - cy, 26, "230,250,140", 0.35);
  glow(px, py - 10, 34, "255,220,170", 0.08);
  ctx.globalCompositeOperation = "source-over";
}
