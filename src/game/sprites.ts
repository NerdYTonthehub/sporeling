// Pixel-art drawing helpers. Everything is drawn with integer fillRects on a low-res canvas.
import type { House } from "./world";

type Ctx = CanvasRenderingContext2D;
type R = [number, number, number, number, string];

const shadeCache = new Map<string, string>();
/** f < 1 darkens, f > 1 lightens towards white. */
export function shade(hex: string, f: number): string {
  const key = hex + f;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (f < 1) {
    r *= f;
    g *= f;
    b *= f;
  } else {
    const t = f - 1;
    r += (255 - r) * t;
    g += (255 - g) * t;
    b += (255 - b) * t;
  }
  const c = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, c);
  return c;
}

export function rect(ctx: Ctx, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function fillCircle(ctx: Ctx, cx: number, cy: number, r: number) {
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

function capRows(capW: number, capH: number) {
  const rows: number[] = [];
  for (let i = 0; i < capH; i++) {
    const k = (capH - 1 - i) / capH;
    let w = Math.round(capW * Math.sqrt(1 - k * k));
    if (w % 2) w++;
    rows.push(Math.max(4, Math.min(capW, w)));
  }
  return rows;
}

const OUTLINE = "#1b140f";
const BODY = "#f1e4c8";
const BODY_SH = "#d2bc94";
const LEG = "#5a3f2c";
const SHOE = "#3a281c";
const GILL = "#c4a878";
const SPOT = "#f8f2e4";

export interface PersonOpts {
  facing: number;
  walk: number;
  moving: boolean;
  air: boolean;
  cap: string;
  spots: boolean;
  scale?: number;
  blink?: boolean;
}

/** A tiny mushroom person. (x, y) = feet position (y is the ground row). */
export function drawMushroomPerson(ctx: Ctx, x: number, y: number, o: PersonOpts) {
  const s = o.scale ?? 1;
  const f = o.facing >= 0 ? 1 : -1;
  const bodyW = s >= 1.1 ? 10 : s < 0.85 ? 6 : 8;
  const bodyH = Math.max(5, Math.round(7 * s));
  const legH = 3;
  let capW = Math.round(14 * s);
  if (capW % 2) capW++;
  const capH = Math.max(4, Math.round(6 * s));

  const ph = o.walk * 12;
  const sw = o.moving && !o.air ? Math.sin(ph) : 0;
  const bodyBottom = y - legH;
  const bodyTop = bodyBottom - bodyH;
  const bl = x - bodyW / 2;

  const parts: R[] = [];
  // legs + shoes
  if (o.air) {
    parts.push([x - 2, bodyBottom, 1, 2, LEG], [x + 1, bodyBottom, 1, 2, LEG]);
    parts.push([x - 3, bodyBottom + 2, 2, 1, SHOE], [x + 1, bodyBottom + 2, 2, 1, SHOE]);
  } else {
    const a = Math.round(sw * 1.4);
    const liftA = sw > 0.5 ? 1 : 0;
    const liftB = sw < -0.5 ? 1 : 0;
    const lx = x - 2 + a;
    const rx = x + 1 - a;
    parts.push([lx, bodyBottom, 1, legH - liftA, LEG], [rx, bodyBottom, 1, legH - liftB, LEG]);
    parts.push([f > 0 ? lx : lx - 1, y - 1 - liftA, 2, 1, SHOE], [f > 0 ? rx : rx - 1, y - 1 - liftB, 2, 1, SHOE]);
  }
  // body
  parts.push([bl, bodyTop, bodyW, bodyH, BODY]);
  // arms
  const ay = bodyTop + 2;
  if (o.air) {
    parts.push([bl - 1, ay - 1, 1, 2, BODY], [bl - 2, ay - 3, 1, 2, BODY]);
    parts.push([bl + bodyW, ay - 1, 1, 2, BODY], [bl + bodyW + 1, ay - 3, 1, 2, BODY]);
  } else {
    const swing = Math.round(sw);
    parts.push([bl - 1, ay, 1, 2, BODY], [bl - 2 - Math.max(0, -swing), ay + 2, 1, 2, BODY]);
    parts.push([bl + bodyW, ay, 1, 2, BODY], [bl + bodyW + 1 + Math.max(0, swing), ay + 2, 1, 2, BODY]);
  }
  // cap
  const rows = capRows(capW, capH);
  const capBottom = bodyTop + 1;
  const capTop = capBottom - capH;
  rows.forEach((w, i) => parts.push([x - w / 2, capTop + i, w, 1, o.cap]));
  parts.push([x - capW / 2 + 1, capBottom, capW - 2, 1, GILL]);

  // outline pass then fill pass
  ctx.fillStyle = OUTLINE;
  for (const p of parts) ctx.fillRect(p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2);
  for (const p of parts) {
    ctx.fillStyle = p[4];
    ctx.fillRect(p[0], p[1], p[2], p[3]);
  }

  // details
  rect(ctx, BODY_SH, bl + bodyW - 1, bodyTop + 1, 1, bodyH - 1);
  rect(ctx, BODY_SH, bl, bodyBottom - 1, bodyW, 1);
  const dark = shade(o.cap, 0.72);
  const light = shade(o.cap, 1.4);
  rows.forEach((w, i) => {
    const sh = Math.ceil(w * 0.28);
    rect(ctx, dark, x + w / 2 - sh, capTop + i, sh, 1);
  });
  rect(ctx, light, x - rows[1] / 2 + 1, capTop + 1, 2, 1);
  rect(ctx, light, x - rows[2] / 2 + 1, capTop + 2, 1, 1);
  if (o.spots) {
    rect(ctx, SPOT, x - Math.round(capW * 0.22), capTop + 2, 2, 1);
    rect(ctx, SPOT, x + Math.round(capW * 0.12), capTop + 1, 1, 1);
    rect(ctx, SPOT, x + Math.round(capW * 0.3), capTop + 3, 1, 1);
    if (capH > 4) rect(ctx, SPOT, x - 1, capTop + capH - 2, 2, 1);
  }
  // face
  const ey = bodyTop + 2;
  const ex = x + f;
  if (o.blink) {
    rect(ctx, OUTLINE, ex - 2, ey + 1, 1, 1);
    rect(ctx, OUTLINE, ex + 1, ey + 1, 1, 1);
  } else {
    rect(ctx, OUTLINE, ex - 2, ey, 1, 2);
    rect(ctx, OUTLINE, ex + 1, ey, 1, 2);
  }
  if (bodyW >= 8) {
    rect(ctx, "#ec9a8c", ex - 3, ey + 2, 1, 1);
    rect(ctx, "#ec9a8c", ex + 2, ey + 2, 1, 1);
  }
}

export function drawBeetle(ctx: Ctx, x: number, y: number, facing: number, t: number) {
  const f = facing >= 0 ? 1 : -1;
  const cx = x - f;
  const leg = Math.floor(t * 10) % 2;
  ctx.fillStyle = "#0d1110";
  for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * 3 + (leg ^ (i & 1) ? 1 : 0), y - 2, 1, 2);
  rect(ctx, "#0d1110", cx - 4, y - 3, 9, 1);
  rect(ctx, "#1f2e2b", cx - 5, y - 5, 11, 2);
  rect(ctx, "#1f2e2b", cx - 4, y - 6, 9, 1);
  rect(ctx, "#1f2e2b", cx - 3, y - 7, 7, 1);
  rect(ctx, "#4d8a7c", cx - 2 - f, y - 6, 2, 1);
  rect(ctx, "#7fc0ac", cx - 2 - f, y - 6, 1, 1);
  rect(ctx, "#0d1110", cx, y - 7, 1, 4);
  rect(ctx, "#0d1110", x + f * 5 - (f < 0 ? 2 : 0), y - 5, 3, 3);
  rect(ctx, "#e9dcc4", x + f * 6 - (f < 0 ? 0 : 0), y - 4, 1, 1);
  rect(ctx, "#0d1110", x + f * 7, y - 7, 1, 2);
  rect(ctx, "#0d1110", x + f * 8, y - 8, 1, 1);
}

export function appleTreeGeom(size: number) {
  const trunkH = Math.round(15 * size);
  const r = Math.round(11 * size);
  return { trunkH, r, cyOff: trunkH + Math.round(r * 0.55) };
}

export function drawAppleTree(
  ctx: Ctx,
  x: number,
  y: number,
  size: number,
  apples: { ox: number; oy: number; grown: boolean; timer: number }[],
  sway: number,
) {
  const { trunkH, r, cyOff } = appleTreeGeom(size);
  rect(ctx, "#2a1d14", x - 2, y - trunkH, 5, trunkH);
  rect(ctx, "#6e4b30", x - 1, y - trunkH, 3, trunkH);
  rect(ctx, "#8a6342", x - 1, y - trunkH, 1, trunkH);
  rect(ctx, "#6e4b30", x - 3, y - 2, 2, 2);
  rect(ctx, "#6e4b30", x + 2, y - 1, 2, 1);
  rect(ctx, "#6e4b30", x + 1, y - trunkH + 4, 4, 1);
  const cx = x + Math.round(sway);
  const cy = y - cyOff;
  ctx.fillStyle = "#1b3a1d";
  fillCircle(ctx, cx, cy + 1, r + 1);
  fillCircle(ctx, cx - Math.round(r * 0.75), cy + 4, Math.round(r * 0.65) + 1);
  fillCircle(ctx, cx + Math.round(r * 0.75), cy + 3, Math.round(r * 0.65) + 1);
  ctx.fillStyle = "#2f6430";
  fillCircle(ctx, cx, cy, r);
  fillCircle(ctx, cx - Math.round(r * 0.75), cy + 3, Math.round(r * 0.65));
  fillCircle(ctx, cx + Math.round(r * 0.75), cy + 2, Math.round(r * 0.65));
  ctx.fillStyle = "#4a8f3c";
  fillCircle(ctx, cx - 1, cy - 2, r - 3);
  ctx.fillStyle = "#6fb24c";
  fillCircle(ctx, cx - Math.round(r * 0.35), cy - Math.round(r * 0.45), Math.max(2, Math.round(r * 0.35)));
  for (const a of apples) {
    const ax = cx + a.ox;
    const ay = cy + a.oy;
    if (a.grown) {
      rect(ctx, "#5a1410", ax - 1, ay - 1, 4, 4);
      rect(ctx, "#d7362a", ax, ay, 2, 2);
      rect(ctx, "#d7362a", ax - 1 + 1, ay - 1 + 1, 2, 2);
      rect(ctx, "#ff8f6e", ax, ay, 1, 1);
      rect(ctx, "#3a2414", ax + 1, ay - 1, 1, 1);
    } else if (a.timer < 10) {
      rect(ctx, "#9ccf5a", ax, ay, 1, 1);
    }
  }
}

export function drawHouse(ctx: Ctx, h: House, sx: number, gy: number, night: number) {
  const left = Math.round(sx - h.stemW / 2);
  const top = gy - h.stemH;
  // stem
  rect(ctx, OUTLINE, left - 1, top, h.stemW + 2, h.stemH);
  rect(ctx, "#eadcbf", left, top, h.stemW, h.stemH);
  rect(ctx, "#cdb894", left + h.stemW - 3, top, 3, h.stemH);
  rect(ctx, "#f7eedb", left + 1, top + 2, 1, h.stemH - 4);
  rect(ctx, "#bfa883", left, top, h.stemW, 2);
  // door
  const dx = Math.round(sx - 2);
  rect(ctx, OUTLINE, dx - 1, gy - 10, 7, 10);
  rect(ctx, "#6a4429", dx, gy - 9, 5, 9);
  rect(ctx, "#6a4429", dx + 1, gy - 10, 3, 1);
  rect(ctx, "#4a2e1b", dx + 2, gy - 9, 1, 9);
  rect(ctx, "#e6b84c", dx + 3, gy - 5, 1, 1);
  rect(ctx, "#8a7a62", dx - 2, gy - 1, 9, 1);
  // window
  if (h.stemH > 22) {
    const wx = left + 3;
    const wy = top + 5;
    rect(ctx, OUTLINE, wx - 1, wy - 1, 5, 5);
    rect(ctx, night > 0.3 ? "#ffd56a" : "#d9b45a", wx, wy, 3, 3);
    rect(ctx, "#6a4429", wx + 1, wy, 1, 3);
  }
  // cap
  const rows = capRows(h.capW, h.capH);
  const capTop = top - h.capH + 2;
  ctx.fillStyle = OUTLINE;
  rows.forEach((w, i) => ctx.fillRect(Math.round(sx - w / 2) - 1, capTop + i - 1, w + 2, 3));
  const dark = shade(h.cap, 0.72);
  const light = shade(h.cap, 1.35);
  rows.forEach((w, i) => {
    const x0 = Math.round(sx - w / 2);
    rect(ctx, h.cap, x0, capTop + i, w, 1);
    const sh = Math.ceil(w * 0.28);
    rect(ctx, dark, x0 + w - sh, capTop + i, sh, 1);
  });
  rect(ctx, light, Math.round(sx - rows[1] / 2) + 2, capTop + 1, 4, 1);
  rect(ctx, light, Math.round(sx - rows[2] / 2) + 1, capTop + 2, 2, 1);
  rect(ctx, GILL, Math.round(sx - h.capW / 2) + 2, capTop + h.capH, h.capW - 4, 1);
  if (h.spots) {
    const sp = SPOT;
    rect(ctx, sp, Math.round(sx - h.capW * 0.3), capTop + 3, 3, 2);
    rect(ctx, sp, Math.round(sx + h.capW * 0.05), capTop + 1, 2, 2);
    rect(ctx, sp, Math.round(sx + h.capW * 0.28), capTop + 4, 2, 1);
    rect(ctx, sp, Math.round(sx - h.capW * 0.08), capTop + h.capH - 3, 2, 1);
  }
}
