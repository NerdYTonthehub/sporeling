// Pixel-art drawing helpers. Everything is drawn with integer fillRects on a low-res canvas.
import type { House } from "./world";
import { FISH_H, FISH_W, fishPixels, type FishSpecies } from "./fishing";

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
  /** Both arms raised high above the cap (holding something up). */
  armsUp?: boolean;
  /** side (default), front = facing the camera, back = facing away (top-down rooms). */
  view?: "side" | "front" | "back";
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
    const a = o.view && o.view !== "side" ? 0 : Math.round(sw * 1.4);
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
  const capTopY = bodyTop + 1 - Math.max(4, Math.round(6 * s));
  if (o.armsUp) {
    const half = capW / 2;
    for (const side of [-1, 1]) {
      const sx = side < 0 ? bl - 1 : bl + bodyW;
      // out from the shoulder past the cap brim, then up, then in towards the head
      for (let i = 0; i < 4; i++) parts.push([sx + side * i, ay - i, 1, 1, BODY]);
      const outX = side < 0 ? x - half - 1 : x + half;
      parts.push([outX, capTopY - 1, 1, ay - 3 - capTopY + 2, BODY]);
      parts.push([outX - side, capTopY - 2, 1, 1, BODY], [outX - side * 2, capTopY - 3, 1, 1, BODY]);
    }
  } else if (o.air) {
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
  rect(ctx, light, x - (rows[1] ?? capW) / 2 + 1, capTop + 1, 2, 1);
  rect(ctx, light, x - (rows[2] ?? capW) / 2 + 1, capTop + 2, 1, 1);
  if (o.spots) {
    rect(ctx, SPOT, x - Math.round(capW * 0.22), capTop + 2, 2, 1);
    rect(ctx, SPOT, x + Math.round(capW * 0.12), capTop + 1, 1, 1);
    rect(ctx, SPOT, x + Math.round(capW * 0.3), capTop + 3, 1, 1);
    if (capH > 4) rect(ctx, SPOT, x - 1, capTop + capH - 2, 2, 1);
  }
  // face
  if (o.view === "back") {
    rect(ctx, BODY_SH, bl + 1, bodyTop + 2, bodyW - 2, 1);
    return;
  }
  const ey = bodyTop + 2;
  const ex = o.view === "front" ? x : x + f;
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
  rect(ctx, light, Math.round(sx - (rows[1] ?? h.capW) / 2) + 2, capTop + 1, 4, 1);
  rect(ctx, light, Math.round(sx - (rows[2] ?? h.capW) / 2) + 1, capTop + 2, 2, 1);
  rect(ctx, GILL, Math.round(sx - h.capW / 2) + 2, capTop + h.capH, h.capW - 4, 1);
  if (h.spots) {
    const sp = SPOT;
    rect(ctx, sp, Math.round(sx - h.capW * 0.3), capTop + 3, 3, 2);
    rect(ctx, sp, Math.round(sx + h.capW * 0.05), capTop + 1, 2, 2);
    rect(ctx, sp, Math.round(sx + h.capW * 0.28), capTop + 4, 2, 1);
    rect(ctx, sp, Math.round(sx - h.capW * 0.08), capTop + h.capH - 3, 2, 1);
  }
}

/** Draws a small fish centered on (x, y). */
export function drawFish(ctx: Ctx, x: number, y: number, sp: FishSpecies, facing = 1) {
  const ox = Math.round(x - FISH_W / 2);
  const oy = Math.round(y - FISH_H / 2);
  for (const [px, py, c] of fishPixels(sp, facing)) {
    ctx.fillStyle = c;
    ctx.fillRect(ox + px, oy + py, 1, 1);
  }
}

export function drawLine(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1);
  }
}

/** A flying beetle centred on (x, y). Eyes glow red while it dives at you. */
export function drawFlyer(ctx: Ctx, x: number, y: number, facing: number, flap: number, diving: boolean) {
  const f = facing >= 0 ? 1 : -1;
  const up = Math.floor(flap * 16) % 2 === 0;
  const wy = up ? y - 7 : y - 3;
  const wh = up ? 4 : 2;
  rect(ctx, OUTLINE, x - 8, wy - 1, 7, wh + 2);
  rect(ctx, OUTLINE, x + 1, wy - 1, 7, wh + 2);
  rect(ctx, "#bfdbe4", x - 7, wy, 5, wh);
  rect(ctx, "#bfdbe4", x + 2, wy, 5, wh);
  rect(ctx, "#ffffff", x - 6, wy, 2, 1);
  rect(ctx, "#ffffff", x + 3, wy, 2, 1);
  rect(ctx, "#0d1110", x - 3, y + 3, 1, 2);
  rect(ctx, "#0d1110", x, y + 3, 1, 2);
  rect(ctx, "#0d1110", x + 2, y + 3, 1, 1);
  rect(ctx, "#0d1110", x - 5, y - 3, 10, 7);
  rect(ctx, "#4a2f5e", x - 4, y - 2, 8, 5);
  rect(ctx, "#8a6ab8", f > 0 ? x - 3 : x + 1, y - 2, 2, 1);
  rect(ctx, "#0d1110", x, y - 2, 1, 5);
  rect(ctx, "#0d1110", f > 0 ? x + 5 : x - 7, y - 2, 3, 4);
  rect(ctx, diving ? "#ff5a3a" : "#e9dcc4", x + f * 6, y - 1, 1, 1);
  rect(ctx, "#0d1110", x + f * 7, y - 4, 1, 2);
}

/** A treetop snail villager. (x, y) = bottom of its foot. */
export function drawSnail(ctx: Ctx, x: number, y: number, o: { facing: number; shell: string; scale?: number; t: number; moving: boolean; blink?: boolean }) {
  const f = o.facing >= 0 ? 1 : -1;
  const s = o.scale ?? 1;
  const r = Math.max(5, Math.round(7 * s));
  const stretch = o.moving ? Math.round((Math.sin(o.t * 6) + 1) * 0.8) : 0;
  const bodyL = Math.round(9 * s);
  const bodyR = Math.round(9 * s) + stretch;
  const X = (dx: number, w = 1) => (f > 0 ? x + dx : x - dx - w + 1);
  const R = (dx: number, dy: number, w: number, h: number, c: string) => rect(ctx, c, X(dx, w), y + dy, w, h);
  const SKIN = "#d9c9a0";
  const SKIN_SH = "#b8a47a";
  // foot
  R(-bodyL - 1, -5, bodyL + bodyR + 2, 5, OUTLINE);
  R(-bodyL, -4, bodyL + bodyR, 4, SKIN);
  R(-bodyL, -1, bodyL + bodyR, 1, SKIN_SH);
  R(-bodyL - 2, -2, 2, 2, OUTLINE);
  R(-bodyL - 1, -2, 1, 1, SKIN);
  // head + neck
  const hx = bodyR - 4;
  R(hx - 1, -12, 6, 9, OUTLINE);
  R(hx, -11, 4, 8, SKIN);
  R(hx + 3, -11, 1, 8, SKIN_SH);
  // eye stalks
  const wob = Math.round(Math.sin(o.t * 2.3 + x) * 0.8);
  for (const [sx, len] of [[hx, 6], [hx + 3, 5]] as const) {
    R(sx, -11 - len, 1, len, SKIN_SH);
    R(sx - 1 + wob, -13 - len, 3, 3, OUTLINE);
    if (!o.blink) R(sx + wob, -12 - len, 1, 1, "#ffffff");
  }
  R(hx + 2, -6, 1, 1, "#ec9a8c");
  R(hx + 1, -5, 2, 1, OUTLINE);
  // shell (spiral) on its back
  const cx = X(-2);
  const cy = y - 4 - r;
  ctx.fillStyle = OUTLINE;
  fillCircle(ctx, cx, cy, r + 1);
  ctx.fillStyle = o.shell;
  fillCircle(ctx, cx, cy, r);
  ctx.fillStyle = shade(o.shell, 0.72);
  for (let dy = 0; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
  ctx.fillStyle = o.shell;
  fillCircle(ctx, cx, cy - 1, r - 2);
  ctx.fillStyle = shade(o.shell, 0.55);
  for (let a = 0; a < Math.PI * 4.2; a += 0.22) {
    const rr = 0.6 + a * (r - 1.5) / (Math.PI * 4.2);
    ctx.fillRect(Math.round(cx + Math.cos(a) * rr * f), Math.round(cy + Math.sin(a) * rr), 1, 1);
  }
  rect(ctx, shade(o.shell, 1.45), cx - Math.round(r * 0.5), cy - r + 2, 2, 1);
  rect(ctx, shade(o.shell, 1.3), cx - Math.round(r * 0.7), cy - r + 3, 1, 2);
}

/** A giant snail shell turned into a house; (sx, gy) = door bottom-centre. */
export function drawShellHouse(ctx: Ctx, h: House, sx: number, gy: number, night: number) {
  const r = Math.round(h.capW / 2) + 4;
  const cx = sx + Math.round(r * 0.15);
  const cy = gy - r + 2;
  ctx.fillStyle = OUTLINE;
  fillCircle(ctx, cx, cy, r + 1);
  ctx.fillStyle = shade(h.cap, 0.75);
  fillCircle(ctx, cx, cy, r);
  ctx.fillStyle = h.cap;
  fillCircle(ctx, cx - 1, cy - 1, r - 2);
  // spiral bands
  for (let a = 0; a < Math.PI * 5; a += 0.08) {
    const rr = 1 + (a * (r - 2)) / (Math.PI * 5);
    const px = Math.round(cx + Math.cos(a) * rr);
    const py = Math.round(cy + Math.sin(a) * rr);
    rect(ctx, shade(h.cap, 0.55), px, py, 1, 1);
    if (a % 0.5 < 0.09) rect(ctx, shade(h.cap, 1.25), px + 1, py - 1, 1, 1);
  }
  rect(ctx, shade(h.cap, 1.5), cx - Math.round(r * 0.55), cy - r + 3, 3, 1);
  rect(ctx, shade(h.cap, 1.35), cx - Math.round(r * 0.75), cy - r + 5, 1, 3);
  // flat base where it rests on the deck
  rect(ctx, OUTLINE, cx - r, gy - 1, r * 2, 1);
  // round window
  const wx = cx + Math.round(r * 0.45);
  const wy = cy - Math.round(r * 0.3);
  ctx.fillStyle = OUTLINE;
  fillCircle(ctx, wx, wy, 3);
  ctx.fillStyle = night > 0.3 ? "#ffd56a" : "#d9b45a";
  fillCircle(ctx, wx, wy, 2);
  rect(ctx, "#6a4429", wx, wy - 2, 1, 5);
  // arched door
  const dx = Math.round(sx - 3);
  rect(ctx, OUTLINE, dx - 1, gy - 12, 8, 12);
  rect(ctx, "#6a4429", dx, gy - 10, 6, 10);
  rect(ctx, "#6a4429", dx + 1, gy - 11, 4, 1);
  rect(ctx, "#4a2e1b", dx + 3, gy - 10, 1, 10);
  rect(ctx, "#e6b84c", dx + 4, gy - 5, 1, 1);
  rect(ctx, "#8a7a62", dx - 2, gy - 1, 10, 1);
  // tiny chimney
  rect(ctx, OUTLINE, cx - Math.round(r * 0.3) - 1, cy - r - 4, 5, 5);
  rect(ctx, "#7d7a70", cx - Math.round(r * 0.3), cy - r - 3, 3, 4);
}

export interface KingOpts {
  facing: number;
  walk: number;
  t: number;
  angry: boolean;
  mode: string;
  flash: boolean;
}

/** The Beetle King: a crowned rhinoceros beetle with an armoured, gold-trimmed shell. (x, y) = feet. */
export function drawBeetleKing(ctx: Ctx, x: number, y: number, o: KingOpts) {
  const f = o.facing >= 0 ? 1 : -1;
  const shake = o.mode === "windup" ? (Math.floor(o.t * 30) % 2 ? 1 : -1) : 0;
  x += shake;
  const X = (dx: number, w: number) => (f > 0 ? x + dx : x - dx - w);
  const R = (dx: number, dy: number, w: number, h: number, c: string) => rect(ctx, o.flash ? "#ffffff" : c, X(dx, w), y + dy, w, h);
  const DARK = "#0d1110";
  const SHELL = o.angry ? "#3a1f3b" : "#1f2e3b";
  const SHELL_L = o.angry ? "#6a3a5e" : "#3c5a72";
  const SHELL_H = o.angry ? "#c87aa8" : "#8fc4dc";
  const GOLD = "#f2c84b";
  const GOLD_D = "#b8862a";
  const stepA = o.mode === "stun" ? 0 : Math.round(Math.sin(o.walk * 9) * 2);
  // legs (far side, darker)
  for (const lx of [-14, -3, 8]) {
    const k = lx === -3 ? -stepA : stepA;
    R(lx + k + 1, -10, 2, 5, "#1a1f22");
    R(lx + k + 2, -6, 2, 6, "#1a1f22");
  }
  // shell dome
  const top = -34;
  const bottom = -9;
  const cxo = -6;
  const half = 16;
  for (let r = top; r <= bottom; r++) {
    const k = (r - bottom) / (bottom - top);
    const w = Math.round(half * Math.sqrt(Math.max(0, 1 - k * k)));
    R(cxo - w - 1, r - 1, w * 2 + 2, 3, DARK);
  }
  for (let r = top; r <= bottom; r++) {
    const k = (r - bottom) / (bottom - top);
    const w = Math.round(half * Math.sqrt(Math.max(0, 1 - k * k)));
    if (w <= 0) continue;
    R(cxo - w, r, w * 2, 1, SHELL);
    R(cxo - w, r, Math.max(1, Math.round(w * 0.45)), 1, SHELL_L);
    if ((r - top) % 7 === 6) R(cxo - w + 1, r, w * 2 - 2, 1, DARK);
  }
  // gold trim along the shell edge and the centre seam
  R(cxo - half, bottom - 1, half * 2, 2, GOLD);
  R(cxo - half, bottom, half * 2, 1, GOLD_D);
  R(cxo, top + 1, 1, bottom - top - 2, GOLD_D);
  R(cxo - 1, top + 1, 1, bottom - top - 2, GOLD);
  // iridescent highlights and rivets
  R(cxo - 10, top + 6, 4, 1, SHELL_H);
  R(cxo - 12, top + 8, 2, 2, SHELL_H);
  R(cxo - 6, top + 4, 2, 1, "#ffffff");
  for (const [rx, ry] of [[-17, -14], [-12, -20], [-1, -24], [5, -18]] as const) R(rx, ry, 1, 1, GOLD);
  // thorax
  R(7, -25, 11, 17, DARK);
  R(8, -24, 9, 15, SHELL);
  R(8, -24, 9, 2, SHELL_L);
  R(8, -11, 9, 1, GOLD);
  R(12, -30, 3, 7, DARK); // small thorax horn
  R(13, -29, 1, 5, SHELL_L);
  // head
  R(16, -19, 9, 11, DARK);
  R(17, -18, 7, 9, SHELL);
  R(17, -18, 7, 1, SHELL_L);
  // great horn curving up from the snout
  const horn: [number, number, number, number][] = [[22, -16, 5, 4], [25, -20, 4, 5], [27, -25, 3, 6], [28, -31, 3, 7], [27, -34, 2, 4]];
  for (const [hx, hy, w, h] of horn) R(hx - 1, hy - 1, w + 2, h + 2, DARK);
  for (const [hx, hy, w, h] of horn) R(hx, hy, w, h, SHELL);
  R(28, -30, 1, 6, SHELL_L);
  R(27, -34, 2, 2, "#dfe8ec");
  // eyes
  const eye = o.angry || o.mode === "windup" ? (Math.floor(o.t * 8) % 2 ? "#ff5a3a" : "#ffb36a") : "#e9dcc4";
  R(21, -16, 2, 2, eye);
  R(21, -16, 1, 1, "#ffffff");
  // mandibles
  const chomp = Math.floor(o.t * 4) % 2;
  R(23, -9 - chomp, 4, 1, "#c8b89a");
  R(26, -10 - chomp, 1, 2, "#c8b89a");
  R(23, -7 + chomp, 3, 1, "#a89878");
  // legs (near side)
  for (const lx of [-12, -1, 10]) {
    const k = lx === -1 ? stepA : -stepA;
    R(lx - 1, -12, 4, 5, DARK);
    R(lx, -11, 2, 4, "#2a3a36");
    R(lx + k - 1, -7, 3, 7, DARK);
    R(lx + k, -7, 1, 6, "#2a3a36");
    R(lx + k - 2, -1, 4, 1, DARK);
  }
  // crown
  R(-4, -40, 14, 7, DARK);
  R(-3, -37, 12, 3, GOLD);
  R(-3, -35, 12, 1, GOLD_D);
  for (const cx of [-3, 2, 7]) {
    R(cx - 1, -44, 4, 5, DARK);
    R(cx, -43, 2, 4, GOLD);
  }
  R(2, -44, 2, 1, "#fff3a0");
  R(2, -36, 2, 1, "#e0362c");
  R(-2, -36, 1, 1, "#5fd6c4");
  R(7, -36, 1, 1, "#5fd6c4");
  // stunned stars
  if (o.mode === "stun") {
    for (let i = 0; i < 3; i++) {
      const a = o.t * 5 + (i * Math.PI * 2) / 3;
      rect(ctx, "#fff3a0", Math.round(x + Math.cos(a) * 12), Math.round(y - 50 + Math.sin(a) * 3), 2, 2);
    }
  }
}

/** A wooden sword held at (hx, hy), pointing along angle `a` (radians). */
export function drawSword(ctx: Ctx, hx: number, hy: number, a: number) {
  const L = 13;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const px = -sa;
  const py = ca;
  const pts: [number, number, string][] = [];
  for (let i = -2; i <= L; i++) {
    const x = hx + ca * i;
    const y = hy + sa * i;
    if (i < 1) pts.push([x, y, "#5a3c26"]);
    else if (i === 1) for (let k = -3; k <= 3; k++) pts.push([x + px * k, y + py * k, "#7a5536"]);
    else {
      pts.push([x, y, i === L ? "#f3dfae" : "#c9a56a"]);
      if (i < L) pts.push([x + px, y + py, "#e8cf9a"]);
    }
  }
  ctx.fillStyle = OUTLINE;
  for (const [x, y] of pts) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  for (const [x, y, c] of pts) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}
