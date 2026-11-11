// The Elder Tree dungeon: a hand-built side-scrolling level inside the hollow trunk.
// Three sections of beetles, each sealed by a root gate that opens when the section is cleared.
import { BOSS_HP, makeFlyer, type Flyer } from "./combat";
import { fillCircle, rect } from "./sprites";
import { hash1, type Beetle, type Platform } from "./world";

type Ctx = CanvasRenderingContext2D;

export const DUNGEON_W = 1620;
export const DUNGEON_FLOOR = 190;
export const DUNGEON_CEIL = 46;

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
  platforms: Platform[];
  beetles: Beetle[];
  flyers: Flyer[];
  gates: Gate[];
  glowcaps: Glowcap[];
  entryX: number;
  exitX: number;
  shrineX: number;
  relicTaken: boolean;
  sections: number;
}

export const dungeonFloorY = (x: number) => Math.round(DUNGEON_FLOOR + Math.sin(x / 47) * 1.5 + Math.sin(x / 13) * 0.6);

const shelf = (x: number, y: number, w: number, color = 0): Platform => ({ x, y, w, color, kind: "shelf" });

function beetle(x: number, range: number, section: number, extra: Partial<Beetle> = {}): Beetle {
  return {
    x,
    y: dungeonFloorY(x),
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
  for (let x = 0; x <= DUNGEON_W; x++) ground[x] = dungeonFloorY(x);
  const platforms: Platform[] = [
    // section 0
    shelf(150, 162, 28, 0),
    shelf(236, 140, 26, 1),
    shelf(330, 156, 30, 2),
    shelf(432, 136, 24, 0),
    // section 1
    shelf(640, 160, 26, 1),
    shelf(716, 132, 26, 2),
    shelf(800, 106, 30, 0),
    shelf(900, 140, 30, 1),
    shelf(990, 162, 24, 2),
    // boss arena
    shelf(1160, 152, 28, 0),
    shelf(1260, 124, 30, 1),
    shelf(1370, 152, 28, 2),
  ];
  const beetles: Beetle[] = [
    beetle(210, 55, 0),
    beetle(370, 60, 0),
    beetle(490, 40, 0),
    beetle(700, 60, 1),
    beetle(950, 60, 1),
    beetle(1300, 150, 2, { big: true, hp: BOSS_HP, maxHp: BOSS_HP, vx: -30, hitT: 0, chargeT: 2 }),
  ];
  const flyers: Flyer[] = [
    makeFlyer(300, 118, 40, 0),
    makeFlyer(760, 112, 40, 1),
    makeFlyer(880, 96, 35, 1),
    makeFlyer(1010, 120, 30, 1),
    makeFlyer(1200, 104, 40, 2),
    makeFlyer(1390, 104, 40, 2),
  ];
  return {
    w: DUNGEON_W,
    ground,
    platforms,
    beetles,
    flyers,
    gates: [
      { x: 560, section: 0, open: false, openT: 0 },
      { x: 1090, section: 1, open: false, openT: 0 },
      { x: 1470, section: 2, open: false, openT: 0 },
    ],
    glowcaps: [
      { x: 540, eaten: false },
      { x: 1068, eaten: false },
      { x: 1120, eaten: false },
    ],
    entryX: 46,
    exitX: 1585,
    shrineX: 1530,
    relicTaken: false,
    sections: 3,
  };
}

// ---------------- drawing ----------------

/** Hollow-trunk background: wood grain walls with parallax, hanging roots, glowing fungus. */
export function drawDungeonBack(ctx: Ctx, d: Dungeon, cx: number, cy: number, W: number, H: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#120a06");
  g.addColorStop(0.5, "#2a1a10");
  g.addColorStop(1, "#1a100a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // far wall grain
  for (const [f, col, step] of [
    [0.35, "#22150d", 9],
    [0.6, "#331f13", 13],
  ] as const) {
    const cam = cx * f;
    const i0 = Math.floor(cam / step) - 1;
    for (let i = i0; i < i0 + W / step + 3; i++) {
      const x = Math.round(i * step - cam);
      ctx.fillStyle = col;
      const w = hash1(i, step) < 0.3 ? 2 : 1;
      for (let y = 0; y < H; y += 4) ctx.fillRect(x + Math.round(Math.sin((y + i * 31) / 19) * 1.5), y, w, 4);
    }
  }
  // glowing wall fungus clusters (parallax 0.6)
  const cam = cx * 0.6;
  for (let i = Math.floor(cam / 70) - 1; i < Math.floor(cam / 70) + W / 70 + 2; i++) {
    if (hash1(i, 300) < 0.45) continue;
    const x = Math.round(i * 70 + hash1(i, 301) * 40 - cam);
    const y = Math.round(80 + hash1(i, 302) * 70 - cy * 0.6);
    for (let k = 0; k < 3; k++) {
      rect(ctx, "#2f9a8e", x + k * 4, y + (k % 2) * 2, 3, 1);
      rect(ctx, "#a8fff0", x + k * 4 + 1, y + (k % 2) * 2, 1, 1);
      rect(ctx, "#d8d0b8", x + k * 4 + 1, y + 1 + (k % 2) * 2, 1, 2);
    }
  }
  // ceiling + hanging roots
  const ceil = DUNGEON_CEIL - cy;
  ctx.fillStyle = "#0d0805";
  ctx.fillRect(0, 0, W, ceil);
  for (let x = 0; x < W; x++) {
    const wx = x + cx;
    const h = Math.round(3 + hash1(wx >> 2, 310) * 5);
    ctx.fillRect(x, ceil, 1, h);
  }
  ctx.fillStyle = "#3a2516";
  for (let i = Math.floor(cx / 23) - 1; i < Math.floor(cx / 23) + W / 23 + 2; i++) {
    if (hash1(i, 320) < 0.4) continue;
    const x = Math.round(i * 23 + hash1(i, 321) * 10 - cx);
    const len = 8 + Math.floor(hash1(i, 322) * 34);
    for (let k = 0; k < len; k++) ctx.fillRect(x + Math.round(Math.sin((k + i) / 5 + t * 0.8) * 0.8), ceil + k, k < len - 4 ? 2 : 1, 1);
  }
}

export function drawDungeonFloor(ctx: Ctx, d: Dungeon, cx: number, cy: number, W: number, H: number) {
  for (let x = 0; x < W; x++) {
    const wx = Math.max(0, Math.min(d.w, x + cx));
    const y = (d.ground[wx] ?? DUNGEON_FLOOR) - cy;
    rect(ctx, "#2a1a10", x, y, 1, H - y);
    rect(ctx, "#5a3c26", x, y, 1, 2);
    if (hash1(wx, 330) < 0.4) rect(ctx, "#7a5536", x, y, 1, 1);
    if (hash1(wx, 331) < 0.06) rect(ctx, "#1a100a", x, y + 5 + Math.floor(hash1(wx, 332) * 20), 2, 1);
  }
}

export function drawGate(ctx: Ctx, gt: Gate, cx: number, cy: number, t: number) {
  const sx = Math.round(gt.x - cx);
  const top = DUNGEON_CEIL - cy;
  const bottom = DUNGEON_FLOOR - cy;
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
  // thorns
  for (let y = top + 8; y < top + h - 2; y += 12) {
    rect(ctx, "#c8b89a", sx - 11, y, 2, 1);
    rect(ctx, "#c8b89a", sx + 10, y + 5, 2, 1);
  }
}

export function drawDoorway(ctx: Ctx, x: number, cx: number, cy: number, night: boolean) {
  const sx = Math.round(x - cx);
  const gy = DUNGEON_FLOOR - cy;
  rect(ctx, "#0d0805", sx - 11, gy - 30, 22, 30);
  ctx.fillStyle = night ? "#2a3a5a" : "#cfe6a8";
  for (let dy = 0; dy < 28; dy++) {
    const k = dy < 9 ? Math.round(Math.sqrt(81 - (9 - dy) ** 2)) : 9;
    ctx.fillRect(sx - k, gy - 28 + dy, k * 2, 1);
  }
  rect(ctx, night ? "#5a7aa0" : "#f6ffd8", sx - 3, gy - 22, 6, 22);
}

export function drawShrine(ctx: Ctx, d: Dungeon, cx: number, cy: number, t: number) {
  const sx = Math.round(d.shrineX - cx);
  const gy = DUNGEON_FLOOR - cy;
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

export function drawGlowcap(ctx: Ctx, g: Glowcap, cx: number, cy: number) {
  if (g.eaten) return;
  const sx = Math.round(g.x - cx);
  const gy = dungeonFloorY(g.x) - cy;
  rect(ctx, "#1b140f", sx - 1, gy - 6, 3, 6);
  rect(ctx, "#d8d0b8", sx, gy - 5, 1, 5);
  rect(ctx, "#1b140f", sx - 4, gy - 9, 9, 4);
  rect(ctx, "#5fd6c4", sx - 3, gy - 8, 7, 2);
  rect(ctx, "#a8fff0", sx - 2, gy - 8, 2, 1);
}
