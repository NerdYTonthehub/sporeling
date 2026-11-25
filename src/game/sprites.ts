// Pixel-art drawing helpers. Everything is drawn with integer fillRects on a low-res canvas.
import type { House } from "./world";
import { fishDims, fishPixels, type FishSpecies } from "./fishing";

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
  /** Seated on a campfire log. */
  sitting?: boolean | undefined;
  /** Normalized sword swing progress 0..1 when attacking. */
  attack?: number | undefined;
  /** Fishing animation state when holding rod. */
  fishing?: { phase: "wait" | "bite"; t: number } | undefined;
  /** side (default), front = facing the camera, back = facing away (top-down rooms). */
  view?: "side" | "front" | "back";
}

/** A tiny mushroom person. (x, y) = feet position (y is the ground row). */
export function drawMushroomPerson(ctx: Ctx, baseX: number, y: number, o: PersonOpts) {
  const s = o.scale ?? 1;
  const f = o.facing >= 0 ? 1 : -1;
  const bodyW = s >= 1.1 ? 10 : s < 0.85 ? 6 : 8;
  const bodyH = Math.max(5, Math.round(7 * s));
  const atk = o.attack;
  const fish = o.fishing;
  const atkSquash = atk !== undefined && atk >= 0.18 && atk <= 0.72 ? 1 : 0;
  const fishDip =
    fish && fish.phase === "wait" && fish.t < 0.35
      ? 1
      : fish && fish.phase === "bite"
        ? Math.floor(fish.t * 14) % 2
        : 0;
  const leanX =
    atk !== undefined
      ? atk < 0.2
        ? -f
        : atk < 0.75
          ? f * 2
          : f
      : fish
        ? fish.phase === "bite"
          ? -f
          : fish.t < 0.35
            ? f
            : 0
        : 0;
  const x = baseX + leanX;
  const legH = o.sitting ? 2 : Math.max(2, 3 - atkSquash - fishDip);
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
  if (o.sitting) {
    parts.push([x - 1, bodyBottom, 2, 1, LEG], [x + f * 2, bodyBottom, 2, 1, LEG]);
    parts.push([x + f * 2, bodyBottom + 1, 2, 1, SHOE]);
  } else if (o.air) {
    parts.push([x - 2, bodyBottom, 1, 2, LEG], [x + 1, bodyBottom, 1, 2, LEG]);
    parts.push([x - 3, bodyBottom + 2, 2, 1, SHOE], [x + 1, bodyBottom + 2, 2, 1, SHOE]);
  } else if (atk !== undefined) {
    const stride = atk < 0.2 ? 0 : 1;
    parts.push([x - 2 - stride, bodyBottom, 1, legH, LEG], [x + 1 + stride, bodyBottom, 1, legH, LEG]);
    parts.push([x - 3 - stride, y - 1, 2, 1, SHOE], [x + 1 + stride, y - 1, 2, 1, SHOE]);
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
  } else if (atk !== undefined) {
    const backSide = -f;
    const bx = backSide < 0 ? bl - 1 : bl + bodyW;
    parts.push([bx, ay, 1, 2, BODY], [bx + backSide, ay + 1, 1, 2, BODY]);
    const fx = f > 0 ? bl + bodyW : bl - 1;
    if (atk < 0.22) {
      parts.push([fx - f, ay - 2, 2, 2, BODY], [fx - f * 2, ay - 4, 2, 2, BODY]);
    } else if (atk < 0.65) {
      parts.push([fx, ay, 2, 2, BODY], [fx + f * 2, ay, 2, 2, BODY]);
    } else {
      parts.push([fx, ay + 1, 2, 2, BODY], [fx + f * 2, ay + 2, 2, 2, BODY]);
    }
  } else if (fish) {
    const backX = f > 0 ? bl - 1 : bl + bodyW;
    const frontX = f > 0 ? bl + bodyW : bl - 1;
    const bob = fish.phase === "bite" ? (Math.floor(fish.t * 14) % 2 ? -1 : 1) : Math.round(Math.sin(fish.t * 2.6));
    if (fish.phase === "wait" && fish.t < 0.35) {
      // Casting motion
      parts.push([backX, ay, 1, 2, BODY]);
      parts.push([frontX, ay - 2, 1, 2, BODY], [frontX + f, ay - 4, 2, 2, BODY]);
    } else {
      // Holding rod with both hands angled toward the water
      parts.push([backX, ay + 1, 1, 2, BODY]);
      parts.push([frontX, ay + 1 + bob, 2, 2, BODY], [frontX + f * 2, ay + bob, 2, 2, BODY]);
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
  } else if (atk !== undefined) {
    // Determined fighting eyes
    rect(ctx, OUTLINE, ex - 2, ey + 1, 2, 1);
    rect(ctx, OUTLINE, ex + 1, ey, 1, 2);
  } else if (fish && fish.phase === "bite") {
    // Wide alert eyes when pulling a biting fish
    rect(ctx, OUTLINE, ex - 2, ey - 1, 1, 3);
    rect(ctx, OUTLINE, ex + 1, ey - 1, 1, 3);
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
  const { w, h } = fishDims(sp);
  const ox = Math.round(x - w / 2);
  const oy = Math.round(y - h / 2);
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

export interface GodBossOpts {
  t: number;
  flash: boolean;
  phase?: string | undefined;
  sub?: "windup" | "strike" | "recover" | undefined;
  hideHandSide?: -1 | 1 | undefined;
  dashDir?: number | undefined;
}

/**
 * The Goldfish of Destruction (also known as God):
 * orange-gold fish head with crest & glowing eyes, white angel wings,
 * draped white toga with gold clasp, and forked fish-tail base.
 * (x, y) = bottom-centre (tail base).
 */
export function drawGodBoss(ctx: Ctx, x: number, y: number, o: GodBossOpts) {
  const C = (hex: string) => (o.flash ? "#ffffff" : hex);
  const SKIN = C("#e2841c");
  const SKIN_L = C("#f8b93a");
  const SKIN_D = C("#b45b12");
  const WING = C("#f4f2fb");
  const WING_SH = C("#c4bfd9");
  const TOGA = C("#f5f3fa");
  const TOGA_SH = C("#cbc6de");
  const GOLD = C("#ffe46b");
  const dark = OUTLINE;

  const isDash = o.phase === "dash";
  const isBeam = o.phase === "light_beam";
  const isBombs = o.phase === "fish_bombs";
  const isDefeated = o.phase === "defeated";
  const isWindup = o.sub === "windup";
  const isStrike = o.sub === "strike";

  const flapFreq = isDash || isWindup ? 10.5 : isBeam ? 7 : 4.5;
  const flapAmp = isDash ? 3 : isWindup ? 2.5 : 2;
  const flap = Math.round(Math.sin(o.t * flapFreq) * flapAmp) + (isDefeated ? 3 : 0);
  const crouch = isDash ? (isWindup ? 5 : 4) : isBombs && isWindup ? -1 : 0;
  const breathe = isDash ? 0 : Math.round(Math.sin(o.t * 3.2) * 0.6);
  const by = y + crouch + breathe;
  const headY = by - 36;
  const tailSway = Math.round(Math.sin(o.t * (isDash ? 14 : 5.5)) * (isDash ? 2.5 : 1.5));

  // 0. Radiant halo ring & speed streaks behind boss
  if (!isDefeated) {
    const haloR = 13 + (isWindup ? Math.round(Math.sin(o.t * 14)) : 0);
    ctx.globalAlpha = isWindup || isBeam ? 0.5 : 0.28;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, headY, haloR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (isDash && isStrike && o.dashDir) {
    const d = -o.dashDir;
    for (let i = 0; i < 4; i++) {
      const len = 10 + ((Math.floor(o.t * 24) + i * 3) % 8);
      rect(ctx, i % 2 ? "#ffffff" : GOLD, x + d * (14 + i * 4), by - 34 + i * 8, len, 1);
    }
  }

  // 1. Outstretched angel wings (behind body)
  const sweepBack = isDash && isStrike ? -2 : 0;
  for (const side of [-1, 1] as const) {
    const sFlap = side * 0.25;
    const fLift = Math.round(flap + Math.sin(o.t * flapFreq + sFlap));
    const featherSpecs: [number, number, number, number][] = [
      [8, -28 + fLift, 7, 10],
      [14 + sweepBack, -31 + fLift, 8, 11],
      [21 + sweepBack, -33 + fLift, 8, 10],
      [27 + sweepBack, -33 + fLift, 7, 8],
      [11, -20 + fLift, 7, 6],
      [18 + sweepBack, -22 + fLift, 7, 6],
    ];
    for (const [dx, dy, w, h] of featherSpecs) {
      const wx = side > 0 ? x + dx : x - dx - w;
      rect(ctx, dark, wx - 1, by + dy - 1, w + 2, h + 2);
    }
    for (const [dx, dy, w, h] of featherSpecs) {
      const wx = side > 0 ? x + dx : x - dx - w;
      rect(ctx, WING, wx, by + dy, w, h);
      rect(ctx, WING_SH, wx, by + dy + h - 2, w, 2);
    }
  }

  // 2. Forked fish-tail base + lower body (swishing smoothly)
  const tailParts: R[] = [
    [x - 4, by - 14, 8, 10, SKIN],
    [x - 7 + tailSway, by - 5, 6, 3, SKIN],
    [x + 1 + tailSway, by - 5, 6, 3, SKIN],
    [x - 10 + tailSway, by - 3, 7, 3, SKIN],
    [x + 3 + tailSway, by - 3, 7, 3, SKIN],
  ];
  // 3. Animated arms depending on attack phase (omitting enlarged smash hand)
  const armRaise =
    isBeam || (isBombs && isWindup) ? -5 : isBombs && isStrike ? 2 : isDash && isWindup ? 3 : Math.round(Math.sin(o.t * 4) * 1);
  for (const side of [-1, 1] as const) {
    if (o.hideHandSide === side) continue;
    const ax = side > 0 ? x + 5 : x - 14;
    tailParts.push([ax, by - 25 + Math.round(armRaise * 0.5), 9, 4, SKIN]);
    const hx = side > 0 ? x + 13 : x - 17;
    tailParts.push([hx, by - 26 + armRaise, 4, 5, SKIN]);
    tailParts.push([hx + (side > 0 ? 1 : 0), by - 27 + armRaise, 2, 2, SKIN_L]);
  }
  // 4. Torso under the toga
  tailParts.push([x - 5, by - 27, 10, 14, SKIN]);

  ctx.fillStyle = dark;
  for (const p of tailParts) ctx.fillRect(p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2);
  for (const p of tailParts) rect(ctx, p[4], p[0], p[1], p[2], p[3]);

  // Tail highlight / shading
  rect(ctx, SKIN_L, x - 3, by - 13, 2, 8);
  rect(ctx, SKIN_D, x + 2, by - 13, 2, 8);
  rect(ctx, SKIN_D, x - 9 + tailSway, by - 1, 5, 1);
  rect(ctx, SKIN_D, x + 4 + tailSway, by - 1, 5, 1);

  // 5. White toga draped diagonally from left shoulder across waist (subtle hem flutter)
  const flutter = Math.floor(o.t * 5) % 2;
  const togaParts: R[] = [
    [x - 5, by - 27, 5, 4, TOGA],
    [x - 6, by - 23, 8, 5, TOGA],
    [x - 6, by - 18, 12, 5, TOGA],
    [x - 7, by - 13, 13, 3 + flutter, TOGA],
  ];
  ctx.fillStyle = dark;
  for (const p of togaParts) ctx.fillRect(p[0] - 1, p[1] - 1, p[2] + 2, p[3] + 2);
  for (const p of togaParts) rect(ctx, p[4], p[0], p[1], p[2], p[3]);
  rect(ctx, TOGA_SH, x - 6, by - 12, 12, 2);
  rect(ctx, TOGA_SH, x + 3, by - 18, 3, 6);
  // Gold shoulder brooch
  rect(ctx, dark, x - 6, by - 28, 4, 3);
  rect(ctx, GOLD, x - 5, by - 27, 2, 2);

  // 6. Round goldfish head + top fin crest
  ctx.fillStyle = dark;
  fillCircle(ctx, x, headY, 10);
  // Top dorsal spike (glows brighter when winding up attacks)
  rect(ctx, dark, x - 2, headY - 14, 4, 6);
  rect(ctx, isWindup || isBeam ? GOLD : SKIN, x - 1, headY - 13, 2, 5);
  ctx.fillStyle = SKIN;
  fillCircle(ctx, x, headY, 9);
  ctx.fillStyle = SKIN_L;
  fillCircle(ctx, x - 2, headY - 3, 5);
  rect(ctx, SKIN_D, x + 4, headY - 4, 4, 7);

  // Expressive eyes & mouth per boss phase
  if (isDefeated) {
    // X-eyes when defeated
    rect(ctx, "#fff6b8", x - 6, headY - 2, 4, 3);
    rect(ctx, "#fff6b8", x + 2, headY - 2, 4, 3);
    rect(ctx, dark, x - 5, headY - 1, 2, 1);
    rect(ctx, dark, x + 3, headY - 1, 2, 1);
    rect(ctx, "#7a2c08", x - 2, headY + 4, 4, 2);
  } else if (isDash) {
    // Fierce squinted eyes pointing in dashDir
    rect(ctx, "#ffe46b", x - 6, headY - 1, 4, 2);
    rect(ctx, "#ffe46b", x + 2, headY - 1, 4, 2);
    rect(ctx, "#ffffff", x - 5, headY - 1, 2, 1);
    rect(ctx, "#ffffff", x + 3, headY - 1, 2, 1);
    rect(ctx, dark, x - 6, headY - 2, 4, 1);
    rect(ctx, dark, x + 2, headY - 2, 4, 1);
    rect(ctx, "#7a2c08", x - 1, headY + 4, 3, 2);
  } else if (isBeam) {
    // Intense blazing eyes during beam attack
    const eyeCol = Math.floor(o.t * 16) % 2 ? "#ffffff" : "#9ff6ff";
    rect(ctx, "#ffe46b", x - 6, headY - 3, 4, 5);
    rect(ctx, "#ffe46b", x + 2, headY - 3, 4, 5);
    rect(ctx, eyeCol, x - 5, headY - 2, 2, 3);
    rect(ctx, eyeCol, x + 3, headY - 2, 2, 3);
    rect(ctx, "#7a2c08", x - 2, headY + 3, 4, 3);
  } else {
    rect(ctx, "#fff6b8", x - 6, headY - 2, 4, 4);
    rect(ctx, "#fff6b8", x + 2, headY - 2, 4, 4);
    rect(ctx, "#ffffff", x - 5, headY - 1, 2, 2);
    rect(ctx, "#ffffff", x + 3, headY - 1, 2, 2);
    if (isBombs && isWindup) {
      // Wide open mouth charging bombs
      rect(ctx, "#7a2c08", x - 2, headY + 3, 4, 3);
      rect(ctx, "#ff8b5c", x - 1, headY + 4, 2, 1);
    } else {
      rect(ctx, "#7a2c08", x - 1, headY + 4, 2, 2);
    }
  }

  // Golden sparkles orbiting God's head
  const spPhase = Math.floor(o.t * 6) % 2;
  for (const [sx, sy] of [
    [-12, -42],
    [11, -43],
    [-14, -32],
    [13, -33],
    [0, -51],
  ] as const) {
    const off = (sx + spPhase) % 2;
    rect(ctx, GOLD, x + sx, by + sy + off, 1, 1);
    if (off === 0) rect(ctx, "#ffffff", x + sx, by + sy - 1, 1, 1);
  }
}

/** Enlarged orange-gold fist for God's Ground Smash attack. (x, y) = centre of fist. */
export function drawBigHand(
  ctx: Ctx,
  x: number,
  y: number,
  flash = false,
  sub: "windup" | "strike" | "recover" = "windup",
  t = 0,
) {
  const jitter = sub === "windup" ? (Math.floor(t * 28) % 2 ? -1 : 1) : 0;
  const hx = x + jitter;
  const f = flash ? "#ffffff" : "#e2841c";
  const l = flash ? "#ffffff" : "#f8b93a";
  const d = flash ? "#ffffff" : "#b45b12";

  if (sub === "windup") {
    ctx.globalAlpha = 0.45 + Math.sin(t * 16) * 0.2;
    rect(ctx, "#ffe46b", hx - 14, y - 10, 28, 20);
    ctx.globalAlpha = 1;
  } else if (sub === "strike") {
    for (let i = 0; i < 4; i++) {
      rect(ctx, i % 2 ? "#ffffff" : "#ffe46b", hx - 9 + i * 6, y - 22 - ((Math.floor(t * 30) + i * 3) % 6), 1, 12);
    }
  }

  rect(ctx, OUTLINE, hx - 11, y - 9, 22, 18);
  rect(ctx, OUTLINE, hx - 13, y - 6, 26, 12);
  rect(ctx, f, hx - 10, y - 8, 20, 16);
  rect(ctx, f, hx - 12, y - 5, 24, 10);
  rect(ctx, l, hx - 8, y - 7, 14, 4);
  rect(ctx, d, hx - 10, y + 4, 20, 4);
  // knuckle ridges
  for (const kx of [-6, -1, 4]) rect(ctx, OUTLINE, hx + kx, y + 3, 2, 5);
}

/**
 * Sprite #3: Golden fish bomb pointing along (vx, vy), with glowing red tip and golden sparkles.
 */
export function drawFishBomb(ctx: Ctx, x: number, y: number, vx: number, vy: number, t: number) {
  const ang = Math.atan2(vy, vx);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(ang);
  // Facing +X in local space: nose at +8, forked tail at -8
  rect(ctx, OUTLINE, -8, -4, 15, 8);
  rect(ctx, OUTLINE, -10, -5, 4, 10);
  rect(ctx, OUTLINE, 6, -3, 3, 6);
  // Tail fin
  rect(ctx, "#d97c18", -9, -4, 3, 3);
  rect(ctx, "#d97c18", -9, 1, 3, 3);
  // Golden body
  rect(ctx, "#f5b82e", -6, -3, 12, 6);
  rect(ctx, "#fff3a0", -4, -2, 8, 2);
  rect(ctx, "#d97c18", -5, 2, 10, 1);
  // Pointed nose + glowing red bomb eye/tip
  rect(ctx, "#f5b82e", 6, -2, 2, 4);
  rect(ctx, "#e0362c", 4, -1, 3, 2);
  rect(ctx, "#ff9a80", 5, -1, 1, 1);
  ctx.restore();
  // Twinkling sparkles around the fish bomb
  const bob = Math.floor(t * 8) % 2;
  rect(ctx, "#ffe46b", Math.round(x - 7 + bob), Math.round(y - 7), 1, 1);
  rect(ctx, "#fff8c4", Math.round(x + 7), Math.round(y - 5 - bob), 1, 1);
  rect(ctx, "#ffe46b", Math.round(x - 5), Math.round(y + 6 + bob), 1, 1);
}

/** Red-and-white striped coastal lighthouse standing on the lake shore. (x, gy) = base center. */
export function drawLighthouse(ctx: Ctx, x: number, gy: number, t: number, night: number) {
  // Stone foundation
  rect(ctx, OUTLINE, x - 17, gy - 8, 34, 8);
  rect(ctx, "#6b6559", x - 16, gy - 7, 32, 7);
  rect(ctx, "#8d887c", x - 16, gy - 7, 32, 2);

  // Tapered taller striped tower (8 bands alternating white & red)
  const bands: [number, number, number, string, string][] = [
    [-16, 24, 8, "#f0eadc", "#cfc5b2"],
    [-24, 22, 8, "#c8382c", "#96241b"],
    [-32, 20, 8, "#f0eadc", "#cfc5b2"],
    [-40, 20, 8, "#c8382c", "#96241b"],
    [-48, 18, 8, "#f0eadc", "#cfc5b2"],
    [-56, 16, 8, "#c8382c", "#96241b"],
    [-64, 16, 8, "#f0eadc", "#cfc5b2"],
    [-72, 14, 8, "#c8382c", "#96241b"],
  ];
  for (const [dy, w, h, col, sh] of bands) {
    const lx = x - Math.round(w / 2);
    rect(ctx, OUTLINE, lx - 1, gy + dy - 1, w + 2, h + 1);
    rect(ctx, col, lx, gy + dy, w, h);
    rect(ctx, sh, lx + w - Math.max(3, Math.round(w * 0.28)), gy + dy, Math.max(3, Math.round(w * 0.28)), h);
  }

  // Wooden door at ground base
  rect(ctx, OUTLINE, x - 4, gy - 16, 8, 9);
  rect(ctx, "#5a3c26", x - 3, gy - 15, 6, 8);
  rect(ctx, "#8a6342", x - 2, gy - 14, 2, 6);
  rect(ctx, "#f2c84b", x + 1, gy - 11, 1, 1);

  // Tower windows (lit warmly at dusk/night)
  const winCol = night > 0.1 ? "#ffd56a" : "#3a5060";
  for (const wy of [-29, -45, -61]) {
    rect(ctx, OUTLINE, x - 2, gy + wy, 4, 5);
    rect(ctx, winCol, x - 1, gy + wy + 1, 2, 3);
  }

  // Balcony gallery & railing
  rect(ctx, OUTLINE, x - 11, gy - 76, 22, 4);
  rect(ctx, "#3a281c", x - 10, gy - 75, 20, 3);
  rect(ctx, "#8d887c", x - 10, gy - 75, 20, 1);
  for (let rx = -9; rx <= 9; rx += 4) rect(ctx, "#1b140f", x + rx, gy - 78, 1, 3);

  // Glass lantern room + rotating golden lamp
  rect(ctx, OUTLINE, x - 6, gy - 87, 12, 11);
  rect(ctx, "#a8e6f0", x - 5, gy - 86, 10, 9);
  const pulse = Math.sin(t * 2.2);
  const lampX = x + Math.round(pulse * 2);
  rect(ctx, "#fff6b8", lampX - 2, gy - 84, 5, 5);
  rect(ctx, "#ffffff", lampX - 1, gy - 83, 3, 3);

  // Red dome roof + tall spire
  rect(ctx, OUTLINE, x - 7, gy - 91, 14, 4);
  rect(ctx, "#c8382c", x - 6, gy - 90, 12, 3);
  rect(ctx, "#96241b", x - 4, gy - 93, 8, 2);
  rect(ctx, "#1b140f", x, gy - 97, 1, 5);
}

/** Larger motorized boat docked on the lake water. (x, wy) = waterline center. */
export function drawBoat(ctx: Ctx, x: number, wy: number, t: number, dir = -1) {
  const f = dir >= 0 ? 1 : -1;
  const bob = Math.round(Math.sin(t * 2.4));
  const y = wy + bob;

  // Main sleek hull (~42px wide with angled bow prow)
  rect(ctx, OUTLINE, x - 20, y - 7, 40, 8);
  rect(ctx, OUTLINE, x - 17, y + 1, 34, 3);
  // Pointed bow extension
  const prowX = f < 0 ? x - 24 : x + 19;
  rect(ctx, OUTLINE, prowX, y - 8, 5, 4);
  rect(ctx, OUTLINE, prowX + (f < 0 ? 2 : 0), y - 4, 3, 4);

  // Painted fiberglass topsides + red/navy racing trim + shaded keel
  rect(ctx, "#f0eadc", x - 19, y - 6, 38, 4);
  rect(ctx, "#ffffff", x - 18, y - 6, 36, 1);
  rect(ctx, "#c8382c", x - 19, y - 3, 38, 1);
  rect(ctx, "#234a66", x - 18, y - 2, 36, 3);
  rect(ctx, "#163044", x - 16, y + 1, 32, 2);
  rect(ctx, "#f0eadc", prowX + 1, y - 7, 3, 3);

  // Interior console, angled windshield & bench seat
  const cabX = x + f * 2 - 7;
  rect(ctx, OUTLINE, cabX - 1, y - 15, 14, 9);
  rect(ctx, "#d8d0c0", cabX, y - 14, 12, 8);
  rect(ctx, "#8fd0e8", cabX + (f < 0 ? 1 : 3), y - 13, 8, 5);
  rect(ctx, "#d8f4ff", cabX + (f < 0 ? 2 : 4), y - 12, 4, 2);
  // Dark slanted windshield frame
  const wsX = f < 0 ? cabX - 2 : cabX + 11;
  rect(ctx, OUTLINE, wsX, y - 13, 3, 7);
  rect(ctx, "#a8e6f0", wsX + 1, y - 12, 1, 5);
  // Cushioned pilot seat & wheel behind console
  const seatX = x - f * 7 - 2;
  rect(ctx, OUTLINE, seatX - 1, y - 11, 6, 5);
  rect(ctx, "#7a442a", seatX, y - 10, 4, 4);

  // Outboard motor mounted on the stern
  const sternX = x - f * 18 - (f > 0 ? 5 : 0);
  rect(ctx, OUTLINE, sternX - 1, y - 13, 7, 9);
  rect(ctx, "#3e4652", sternX, y - 12, 5, 7);
  rect(ctx, "#6b7687", sternX + 1, y - 11, 3, 3);
  rect(ctx, "#c8382c", sternX, y - 10, 5, 1);
  // Engine shaft & prop foam into water
  rect(ctx, OUTLINE, sternX + 2, y - 4, 2, 6);
  rect(ctx, "#2b323b", sternX + 2, y - 3, 1, 4);
  const foam = Math.floor(t * 7) % 2;
  rect(ctx, "#ffffff", sternX + (f > 0 ? -3 - foam : 5 + foam), wy + 1, 4, 1);
  rect(ctx, "#cfe9f0", sternX + (f > 0 ? -5 : 4), wy + 2, 6, 1);

  // Bow spotlight / navigation lantern
  const lx = f < 0 ? x - 21 : x + 18;
  rect(ctx, OUTLINE, lx, y - 12, 3, 5);
  rect(ctx, "#ffd56a", lx + 1, y - 11, 1, 3);
  rect(ctx, "#ffffff", lx + 1, y - 10, 1, 1);

  // Shimmering lake ripples beneath the motor boat
  const rip = Math.floor(t * 4) % 4;
  rect(ctx, "#cfe9f0", x - 16 + rip, wy + 3, 7, 1);
  rect(ctx, "#6fa3b8", x + 2 - rip, wy + 3, 9, 1);
}

/** Detailed earthy anthill mound on the far shore with flared base, craters, and arched tunnels. (x, gy) = ground center. */
export function drawAnthill(ctx: Ctx, x: number, gy: number, w: number, h: number) {
  const half = Math.round(w / 2);
  for (let row = 0; row < h; row++) {
    const k = row / h;
    // Gently flared bottom & organic curved mound silhouette
    const curve = Math.pow(1 - k, 0.72);
    const flare = k < 0.22 ? Math.round((0.22 - k) * 14) : 0;
    const rw = Math.max(6, Math.round(w * curve) + flare);
    const rx = x - Math.round(rw / 2);
    const ry = gy - row - 1;
    rect(ctx, "#1b140f", rx - 1, ry, rw + 2, 1);
    const col = k > 0.7 ? "#966d46" : k > 0.42 ? "#7a5534" : k > 0.18 ? "#614225" : "#4a311a";
    rect(ctx, col, rx, ry, rw, 1);
    // Sunlit warm left ridge + deep right flank shading
    rect(ctx, "#ad8256", rx, ry, Math.max(2, Math.round(rw * 0.18)), 1);
    const shW = Math.max(2, Math.round(rw * 0.26));
    rect(ctx, "#342112", rx + rw - shW, ry, shW, 1);
  }
  // Rim pebbles & settled roots at the base
  rect(ctx, "#3d2917", x - half - 3, gy - 2, 4, 2);
  rect(ctx, "#8b6440", x + half - 1, gy - 2, 3, 2);

  // Crater top opening
  rect(ctx, "#1b140f", x - 4, gy - h - 1, 8, 3);
  rect(ctx, "#6b4b2e", x - 3, gy - h - 1, 6, 1);
  rect(ctx, "#0e0a07", x - 2, gy - h, 4, 2);

  // Arched lower tunnel entrance + secondary side tunnel
  const tx = x - Math.round(half * 0.22);
  rect(ctx, "#1b140f", tx - 4, gy - 7, 8, 7);
  rect(ctx, "#0e0a07", tx - 3, gy - 6, 6, 6);
  rect(ctx, "#080604", tx - 2, gy - 7, 4, 2);
  rect(ctx, "#3a2515", tx - 5, gy - 2, 2, 2);

  const sx = x + Math.round(half * 0.34);
  if (w >= 34) {
    rect(ctx, "#1b140f", sx - 2, gy - Math.round(h * 0.48), 5, 4);
    rect(ctx, "#0e0a07", sx - 1, gy - Math.round(h * 0.48) + 1, 3, 3);
  }

  // Pine-needle thatch and soil speckles
  rect(ctx, "#b8905d", x - Math.round(half * 0.45), gy - Math.round(h * 0.36), 3, 1);
  rect(ctx, "#b8905d", x + Math.round(half * 0.12), gy - Math.round(h * 0.68), 3, 1);
  rect(ctx, "#c9a36f", x - 2, gy - Math.round(h * 0.56), 2, 1);
  rect(ctx, "#2e1d10", x + 3, gy - Math.round(h * 0.26), 3, 1);
}

/** Background half of a fallen dead tree trunk so you can walk over OR through its hollowed arch. */
export function drawFallenTreeBack(ctx: Ctx, x: number, gy: number, w: number, h: number, flip = false) {
  const lx = x - Math.round(w / 2);
  const ty = gy - h;
  // Main fallen trunk silhouette & bark grain
  rect(ctx, OUTLINE, lx - 1, ty - 1, w + 2, h + 1);
  rect(ctx, "#523a26", lx, ty, w, h);
  rect(ctx, "#735438", lx, ty, w, 3);
  rect(ctx, "#8c6947", lx + 2, ty + 1, w - 4, 1);
  rect(ctx, "#3a2717", lx, gy - 4, w, 4);
  for (let bx = 4; bx < w - 4; bx += 7) {
    rect(ctx, "#3f2b19", lx + bx, ty + 4 + ((bx * 3) % 4), 4, 1);
    rect(ctx, "#664a30", lx + bx + 2, ty + 6 + ((bx * 5) % Math.max(2, h - 8)), 3, 1);
  }
  // Uprooted side roots & snapped upper stub
  const rx = flip ? lx + w - 8 : lx;
  rect(ctx, OUTLINE, rx - 3, ty - 6, 9, h + 6);
  rect(ctx, "#4a3320", rx - 2, ty - 5, 7, h + 5);
  rect(ctx, "#6e4e32", rx - 1, ty - 4, 2, h + 2);
  // Hollow tunnel interior backdrop so player visibly passes inside when walking through
  const archW = Math.min(28, Math.round(w * 0.36));
  const ax = x - Math.round(archW / 2);
  rect(ctx, "#140d08", ax, gy - h + 4, archW, h - 4);
  rect(ctx, "#24180f", ax + 2, gy - h + 5, archW - 4, 2);
}

/** Foreground arch lip & root framing on a fallen dead tree when walking through it. */
export function drawFallenTreeFront(ctx: Ctx, x: number, gy: number, w: number, h: number) {
  const archW = Math.min(28, Math.round(w * 0.36));
  const ax = x - Math.round(archW / 2);
  // Top arch bark bridge over the hollow passage (player walks behind this top beam at ground level)
  rect(ctx, OUTLINE, ax - 2, gy - h - 1, archW + 4, 5);
  rect(ctx, "#735438", ax - 1, gy - h, archW + 2, 3);
  rect(ctx, "#8c6947", ax, gy - h + 1, archW, 1);
  rect(ctx, "#3a2717", ax - 1, gy - h + 3, archW + 2, 1);
}

/** Scuttling worker or soldier ant. (x, y) = feet center. */
export function drawAnt(ctx: Ctx, x: number, y: number, facing: number, t: number, soldier = false) {
  const f = facing >= 0 ? 1 : -1;
  const s = soldier ? 1.25 : 1;
  const body = soldier ? "#7c1d18" : "#4a2018";
  const hi = soldier ? "#b8382c" : "#783c2c";
  const leg = Math.floor(t * 14) % 2;

  // 6 scurrying legs
  ctx.fillStyle = OUTLINE;
  for (const lx of [-3, 0, 3]) {
    const step = (lx === 0 ? leg : leg ^ 1) ? 1 : 0;
    ctx.fillRect(Math.round(x + lx * s), y - 2 - step, 1, 2);
  }

  // Abdomen (back), Thorax (middle), Head (front)
  const abX = Math.round(x - f * 4 * s) - 2;
  const thX = Math.round(x) - 1;
  const hdX = Math.round(x + f * 3 * s) - 1;
  const abW = Math.round(4 * s);
  const abH = Math.round(3 * s);

  rect(ctx, OUTLINE, abX - 1, y - 5 - (soldier ? 1 : 0), abW + 2, abH + 2);
  rect(ctx, OUTLINE, thX - 1, y - 4, 4, 3);
  rect(ctx, OUTLINE, hdX - 1, y - 5, 4, 4);

  rect(ctx, body, abX, y - 4 - (soldier ? 1 : 0), abW, abH);
  rect(ctx, hi, abX, y - 4 - (soldier ? 1 : 0), Math.max(1, abW - 1), 1);
  rect(ctx, body, thX, y - 3, 2, 2);
  rect(ctx, hi, hdX, y - 4, 2, 2);

  // Eye & mandibles & antennae
  rect(ctx, soldier ? "#ffe46b" : "#f2efe0", hdX + (f > 0 ? 1 : 0), y - 4, 1, 1);
  rect(ctx, OUTLINE, Math.round(x + f * (5 * s)), y - 6, 1, 2);
  rect(ctx, OUTLINE, Math.round(x + f * (6 * s)), y - 7, 1, 1);
  if (soldier) rect(ctx, "#e9dcc4", Math.round(x + f * 6), y - 3, 2, 1);
}

/** Big plump queen/honey-pot ant at the far left of the ant lands who grants Spore Spring. */
export function drawBigAnt(ctx: Ctx, x: number, y: number, facing: number, t: number, blink = false) {
  const f = facing >= 0 ? 1 : -1;
  const breathe = Math.round(Math.sin(t * 2.5));

  // Stout legs gripping the dry earth
  for (const lx of [-10, -3, 4, 9]) {
    rect(ctx, OUTLINE, x + lx - 1, y - 5, 3, 5);
    rect(ctx, "#4a2018", x + lx, y - 4, 1, 4);
  }

  // Giant plump golden-banded abdomen (honey-pot belly)
  const bellyX = x - f * 8;
  const bellyY = y - 12 + breathe;
  ctx.fillStyle = OUTLINE;
  fillCircle(ctx, bellyX, bellyY, 10);
  rect(ctx, OUTLINE, bellyX - 11, bellyY - 6, 22, 12);
  ctx.fillStyle = "#8a2a1b";
  fillCircle(ctx, bellyX, bellyY, 9);
  rect(ctx, "#b84528", bellyX - 9, bellyY - 5, 18, 9);
  // Warm golden honey stripes on swollen abdomen
  rect(ctx, "#f2b84b", bellyX - 7, bellyY - 4, 14, 2);
  rect(ctx, "#ffd97d", bellyX - 5, bellyY - 4, 8, 1);
  rect(ctx, "#f2b84b", bellyX - 8, bellyY + 1, 16, 2);
  rect(ctx, "#5c1a12", bellyX - 6, bellyY + 5, 12, 3);

  // Chubby thorax & collar
  const thX = x + f * 3 - 3;
  rect(ctx, OUTLINE, thX - 1, y - 11, 8, 7);
  rect(ctx, "#6b2218", thX, y - 10, 6, 5);
  rect(ctx, "#a33c2a", thX + 1, y - 10, 4, 2);

  // Friendly round head + crown-like spore antennae
  const hx = x + f * 9 - 4;
  const hy = y - 15;
  rect(ctx, OUTLINE, hx - 1, hy - 1, 10, 9);
  rect(ctx, "#7c2518", hx, hy, 8, 7);
  rect(ctx, "#b84528", hx + 1, hy, 6, 3);
  // Friendly eyes
  const ex = hx + (f > 0 ? 5 : 1);
  if (blink) {
    rect(ctx, OUTLINE, ex, hy + 3, 2, 1);
  } else {
    rect(ctx, "#fff3a0", ex, hy + 2, 2, 2);
    rect(ctx, OUTLINE, ex + (f > 0 ? 1 : 0), hy + 3, 1, 1);
  }
  // Golden spore-tipped antennae
  rect(ctx, OUTLINE, x + f * 11, hy - 4, 1, 4);
  rect(ctx, OUTLINE, x + f * 12, hy - 5, 2, 2);
  rect(ctx, "#ffe46b", x + f * 12, hy - 5, 1, 1);
}
