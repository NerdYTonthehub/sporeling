// Mushroom-house interiors, shown in a top-down (3/4) view.
import { drawMushroomPerson, fillCircle, rect, shade } from "./sprites";
import { mulberry32, type House } from "./world";

type Ctx = CanvasRenderingContext2D;

export const ROOM_W = 204;
export const ROOM_H = 142;
export const WALL_TOP = 32; // floor starts below the back wall
export const FLOOR_BOTTOM = 132;
export const DOOR_X0 = 90;
export const DOOR_X1 = 114;
const SIDE = 7;

export type FurnKind =
  | "fireplace"
  | "bookshelf"
  | "window"
  | "bed"
  | "table"
  | "chair"
  | "plant"
  | "barrel"
  | "jars"
  | "lamp"
  | "rug";

export interface Furn {
  kind: FurnKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** collision box in room coords, or null when you can walk over it */
  box: { x: number; y: number; w: number; h: number } | null;
  flip?: boolean;
}

export interface Room {
  house: House;
  village: string;
  furn: Furn[];
  floorA: string;
  floorB: string;
  wall: string;
  blanket: string;
  rug: string;
  books: string[];
  lore: string;
}

const BLANKETS = ["#c8473a", "#3e7fb8", "#5f9a4a", "#e0a33a", "#8a5a9a", "#d9708a"];
const RUGS = ["#9a3b2e", "#2f5e7a", "#6b7a2e", "#7a4a2a"];
const BOOK_COLS = ["#c8473a", "#3e7fb8", "#e0a33a", "#5f9a4a", "#efe6d2", "#7a4a2a", "#2f3b4f"];
const LORE = [
  "\"On Spores\": Every mushroom begins as a speck of dust with big dreams.",
  "\"The Great Roots\": Beneath the forest, every village is linked by roots.",
  "\"Puddle Fishing for Beginners\": Wait for the ! — then be quick!",
  "\"Lights in the Sky\": Fish given to the light are said to become stars.",
  "\"Beetle Etiquette\": Never bump into a beetle. Bonk it from above instead.",
  "\"A Cook's Guide to Apples\": Simply eat them. That's the whole book.",
];

const furn = (kind: FurnKind, x: number, y: number, w: number, h: number, solid: "wall" | "floor" | "none", flip = false): Furn => ({
  kind,
  x,
  y,
  w,
  h,
  flip,
  box:
    solid === "wall"
      ? { x, y: WALL_TOP - 2, w, h: 8 }
      : solid === "floor"
        ? { x, y: y + Math.round(h * 0.45), w, h: h - Math.round(h * 0.45) }
        : null,
});

export function createRoom(house: House, village: string, seed: number): Room {
  const rnd = mulberry32(seed);
  const fireLeft = rnd() < 0.5;
  const bedLeft = rnd() < 0.5;
  const items: Furn[] = [];
  items.push(furn("rug", 66, 62, 72, 44, "none"));
  items.push(furn("fireplace", fireLeft ? 16 : 152, 2, 36, 30, "wall"));
  items.push(furn("bookshelf", fireLeft ? 152 : 16, 0, 36, 32, "wall"));
  items.push(furn("window", 86, 6, 32, 18, "none"));
  items.push(furn("bed", bedLeft ? 10 : 168, 44, 26, 42, "floor"));
  items.push(furn("lamp", bedLeft ? 40 : 154, 48, 10, 16, "floor"));
  items.push(furn("table", 88, 72, 28, 22, "floor"));
  items.push(furn("chair", 74, 76, 11, 14, "floor"));
  items.push(furn("chair", 119, 76, 11, 14, "floor", true));
  items.push(furn("plant", bedLeft ? 180 : 10, 106, 14, 20, "floor"));
  items.push(furn(rnd() < 0.5 ? "barrel" : "jars", bedLeft ? 12 : 176, 108, 16, 18, "floor"));
  // fix the "box" for the bed: the whole bed is solid
  const bed = items.find((f) => f.kind === "bed")!;
  bed.box = { x: bed.x, y: bed.y + 4, w: bed.w, h: bed.h - 4 };
  const books = Array.from({ length: 24 }, () => BOOK_COLS[Math.floor(rnd() * BOOK_COLS.length)] ?? "#c8473a");
  return {
    house,
    village,
    furn: items,
    floorA: "#8a6342",
    floorB: "#7a5536",
    wall: "#eadcbf",
    blanket: BLANKETS[Math.floor(rnd() * BLANKETS.length)] ?? "#c8473a",
    rug: RUGS[Math.floor(rnd() * RUGS.length)] ?? "#9a3b2e",
    books,
    lore: LORE[Math.floor(rnd() * LORE.length)] ?? LORE[0]!,
  };
}

export const ROOM_SPAWN = { x: 102, y: 126 };

/** Move feet position (x, y) by (dx, dy) inside the room, sliding along obstacles. */
export function moveInRoom(room: Room, x: number, y: number, dx: number, dy: number) {
  const hw = 4;
  const blocked = (nx: number, ny: number) => {
    if (nx - hw < SIDE || nx + hw > ROOM_W - SIDE) return true;
    if (ny - 3 < WALL_TOP + 2) return true;
    if (ny > FLOOR_BOTTOM && !(nx - hw >= DOOR_X0 && nx + hw <= DOOR_X1)) return true;
    for (const f of room.furn) {
      const b = f.box;
      if (!b) continue;
      if (nx + hw > b.x && nx - hw < b.x + b.w && ny > b.y && ny - 3 < b.y + b.h) return true;
    }
    return false;
  };
  let nx = x;
  let ny = y;
  if (!blocked(x + dx, y)) nx = x + dx;
  if (!blocked(nx, y + dy)) ny = y + dy;
  return { x: nx, y: ny };
}

/** The interactable thing the player is next to, if any. */
export function nearbyFurn(room: Room, x: number, y: number): Furn | null {
  let best: Furn | null = null;
  let bd = 12;
  for (const f of room.furn) {
    if (f.kind !== "bed" && f.kind !== "bookshelf" && f.kind !== "fireplace") continue;
    const b = f.box!;
    const ddx = Math.max(b.x - x, 0, x - (b.x + b.w));
    const ddy = Math.max(b.y - y, 0, y - 3 - (b.y + b.h));
    const d = Math.hypot(ddx, ddy);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

export const atDoor = (x: number, y: number) => y > FLOOR_BOTTOM - 6 && x > DOOR_X0 && x < DOOR_X1;

// ---------------- drawing ----------------

function drawFloor(ctx: Ctx, room: Room, ox: number, oy: number) {
  for (let y = WALL_TOP; y < FLOOR_BOTTOM + 4; y += 6) {
    const row = (y - WALL_TOP) / 6;
    rect(ctx, row % 2 ? room.floorA : room.floorB, ox, oy + y, ROOM_W, 6);
    rect(ctx, "#5a3c26", ox, oy + y + 5, ROOM_W, 1);
    const off = (row * 37) % 40;
    for (let x = off; x < ROOM_W; x += 40) rect(ctx, "#5a3c26", ox + x, oy + y, 1, 5);
    for (let x = (off + 13) % 40; x < ROOM_W; x += 40) rect(ctx, shade(room.floorA, 1.12), ox + x, oy + y + 2, 3, 1);
  }
}

function drawWalls(ctx: Ctx, room: Room, ox: number, oy: number, night: number) {
  // back wall face
  rect(ctx, room.wall, ox, oy, ROOM_W, WALL_TOP);
  rect(ctx, shade(room.wall, 0.86), ox, oy, ROOM_W, 3);
  for (let x = 10; x < ROOM_W; x += 22) rect(ctx, shade(room.wall, 0.93), ox + x, oy + 3, 1, WALL_TOP - 12);
  // wainscot
  rect(ctx, "#6b4a30", ox, oy + WALL_TOP - 9, ROOM_W, 9);
  rect(ctx, "#8a6342", ox, oy + WALL_TOP - 9, ROOM_W, 1);
  for (let x = 4; x < ROOM_W; x += 10) rect(ctx, "#5a3c26", ox + x, oy + WALL_TOP - 8, 1, 8);
  rect(ctx, "#3a281c", ox, oy + WALL_TOP - 1, ROOM_W, 1);
  // side walls (seen from above)
  rect(ctx, shade(room.wall, 0.78), ox, oy, SIDE, ROOM_H);
  rect(ctx, shade(room.wall, 0.78), ox + ROOM_W - SIDE, oy, SIDE, ROOM_H);
  rect(ctx, "#1b140f", ox + SIDE, oy + WALL_TOP, 1, ROOM_H - WALL_TOP);
  rect(ctx, "#1b140f", ox + ROOM_W - SIDE - 1, oy + WALL_TOP, 1, ROOM_H - WALL_TOP);
  // bottom wall with doorway
  const by = oy + FLOOR_BOTTOM + 2;
  rect(ctx, shade(room.wall, 0.78), ox, by, DOOR_X0, ROOM_H - FLOOR_BOTTOM - 2);
  rect(ctx, shade(room.wall, 0.78), ox + DOOR_X1, by, ROOM_W - DOOR_X1, ROOM_H - FLOOR_BOTTOM - 2);
  rect(ctx, "#1b140f", ox + SIDE, by - 1, DOOR_X0 - SIDE, 1);
  rect(ctx, "#1b140f", ox + DOOR_X1, by - 1, ROOM_W - DOOR_X1 - SIDE, 1);
  // doorway: outside light
  const out = night > 0.5 ? "#1c2a3a" : "#7fae7a";
  rect(ctx, out, ox + DOOR_X0, by, DOOR_X1 - DOOR_X0, ROOM_H - FLOOR_BOTTOM - 2);
  // door mat
  rect(ctx, "#a8784a", ox + DOOR_X0 + 3, oy + FLOOR_BOTTOM - 7, DOOR_X1 - DOOR_X0 - 6, 7);
  for (let x = DOOR_X0 + 5; x < DOOR_X1 - 4; x += 3) rect(ctx, "#8a5a32", ox + x, oy + FLOOR_BOTTOM - 6, 1, 5);
  // outline
  ctx.strokeStyle = "#1b140f";
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - 0.5, oy - 0.5, ROOM_W + 1, ROOM_H + 1);
}

function drawRug(ctx: Ctx, room: Room, f: Furn, ox: number, oy: number) {
  const cx = ox + f.x + f.w / 2;
  const cy = oy + f.y + f.h / 2;
  const rx = f.w / 2;
  const ry = f.h / 2;
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    rect(ctx, shade(room.rug, 0.7), cx - w, cy + dy, w * 2, 1);
    if (w > 3) rect(ctx, room.rug, cx - w + 2, cy + dy, w * 2 - 4, 1);
    if (w > 9 && Math.abs(dy) < ry - 4) rect(ctx, shade(room.rug, 1.3), cx - w + 6, cy + dy, 1, 1), rect(ctx, shade(room.rug, 1.3), cx + w - 7, cy + dy, 1, 1);
  }
  for (let i = -3; i <= 3; i++) rect(ctx, "#f2c84b", cx + i * 6, cy, 2, 1);
}

function drawFireplace(ctx: Ctx, f: Furn, ox: number, oy: number, t: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, f.h + 1);
  rect(ctx, "#7d7a70", x, y, f.w, f.h);
  for (let r = 0; r < f.h; r += 5) {
    for (let c = (r / 5) % 2 ? 0 : 4; c < f.w; c += 8) rect(ctx, "#5e5a52", x + c, y + r, 1, 5);
    rect(ctx, "#5e5a52", x, y + r + 4, f.w, 1);
  }
  rect(ctx, "#8a6342", x - 3, y + 4, f.w + 6, 3);
  rect(ctx, "#5a3c26", x - 3, y + 7, f.w + 6, 1);
  rect(ctx, "#f2efe0", x + 4, y + 1, 2, 3);
  rect(ctx, "#ffd84a", x + 4, y, 2, 1);
  const hx = x + 7;
  const hy = y + 11;
  const hw = f.w - 14;
  const hh = f.h - 11;
  rect(ctx, "#140d09", hx, hy, hw, hh);
  rect(ctx, "#5a3c26", hx + 3, y + f.h - 3, hw - 6, 2);
  for (let i = 0; i < hw - 4; i++) {
    const h = 3 + Math.floor(Math.abs(Math.sin(t * 9 + i * 1.3)) * (hh - 6));
    rect(ctx, "#e8582a", hx + 2 + i, y + f.h - 3 - h, 1, h);
    rect(ctx, "#ffc24a", hx + 2 + i, y + f.h - 3 - Math.floor(h / 2), 1, Math.floor(h / 2));
  }
  // hearth on the floor
  rect(ctx, "#6b6559", x - 2, oy + WALL_TOP, f.w + 4, 4);
  rect(ctx, "#8d887c", x - 2, oy + WALL_TOP, f.w + 4, 1);
}

function drawBookshelf(ctx: Ctx, room: Room, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y, f.w + 2, f.h + 1);
  rect(ctx, "#6b4a30", x, y + 1, f.w, f.h);
  rect(ctx, "#8a6342", x, y + 1, f.w, 2);
  let bi = 0;
  for (let s = 0; s < 3; s++) {
    const sy = y + 4 + s * 9;
    rect(ctx, "#3a281c", x + 2, sy, f.w - 4, 7);
    let bx = x + 3;
    while (bx < x + f.w - 4) {
      const bw = 2 + (bi % 3 === 0 ? 1 : 0);
      const bh = 5 + (bi % 4 === 1 ? -1 : 0);
      rect(ctx, room.books[bi % room.books.length] ?? "#c8473a", bx, sy + 7 - bh, bw, bh);
      bx += bw + 1;
      bi++;
      if (s === 1 && bi % 9 === 4) {
        rect(ctx, "#b86a3a", bx, sy + 4, 4, 3);
        rect(ctx, "#5fa04a", bx, sy + 2, 4, 2);
        bx += 5;
      }
    }
    rect(ctx, "#8a6342", x + 1, sy + 7, f.w - 2, 1);
  }
}

function drawWindow(ctx: Ctx, room: Room, f: Furn, ox: number, oy: number, night: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, f.h + 2);
  rect(ctx, "#6b4a30", x, y, f.w, f.h);
  const glass = night > 0.5 ? "#1d2a4a" : night > 0.2 ? "#5a7a8a" : "#bfe3d0";
  rect(ctx, glass, x + 2, y + 2, f.w - 4, f.h - 4);
  if (night > 0.5) {
    rect(ctx, "#f2efe0", x + 6, y + 4, 1, 1);
    rect(ctx, "#f2efe0", x + 22, y + 7, 1, 1);
    rect(ctx, "#f2efe0", x + 14, y + 10, 1, 1);
  } else {
    rect(ctx, "#4f8a5a", x + 2, y + f.h - 6, f.w - 4, 4);
    rect(ctx, "#e8f6ee", x + 5, y + 4, 3, 1);
  }
  rect(ctx, "#6b4a30", x + f.w / 2 - 1, y, 2, f.h);
  rect(ctx, "#6b4a30", x, y + f.h / 2 - 1, f.w, 2);
  // curtains
  rect(ctx, room.blanket, x - 4, y - 2, 5, f.h + 4);
  rect(ctx, room.blanket, x + f.w - 1, y - 2, 5, f.h + 4);
  rect(ctx, shade(room.blanket, 0.75), x - 2, y - 2, 1, f.h + 4);
  rect(ctx, shade(room.blanket, 0.75), x + f.w + 1, y - 2, 1, f.h + 4);
  rect(ctx, "#8a6342", x - 6, y - 3, f.w + 12, 1);
  // sill plant
  rect(ctx, "#b86a3a", x + f.w / 2 - 3, y + f.h, 6, 3);
}

function drawBed(ctx: Ctx, room: Room, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, f.h + 3);
  rect(ctx, "#6b4a30", x, y, f.w, 7);
  rect(ctx, "#8a6342", x, y, f.w, 2);
  rect(ctx, "#f2efe0", x + 3, y + 7, f.w - 6, 7);
  rect(ctx, "#d8cfb8", x + 3, y + 12, f.w - 6, 2);
  rect(ctx, room.blanket, x + 1, y + 15, f.w - 2, f.h - 15);
  rect(ctx, shade(room.blanket, 1.25), x + 1, y + 15, f.w - 2, 2);
  rect(ctx, shade(room.blanket, 0.75), x + f.w - 4, y + 17, 3, f.h - 17);
  for (let yy = y + 20; yy < y + f.h - 2; yy += 5) {
    for (let xx = x + 4 + ((yy - y) % 10 ? 2 : 0); xx < x + f.w - 4; xx += 5) rect(ctx, shade(room.blanket, 1.3), xx, yy, 1, 1);
  }
  rect(ctx, "#6b4a30", x, y + f.h, f.w, 2);
}

function drawTable(ctx: Ctx, f: Furn, ox: number, oy: number) {
  const cx = ox + f.x + f.w / 2;
  const top = oy + f.y;
  rect(ctx, "#3a281c", cx - 9, top + 12, 2, 9);
  rect(ctx, "#3a281c", cx + 7, top + 12, 2, 9);
  ctx.fillStyle = "#1b140f";
  for (let dy = 0; dy < 14; dy++) {
    const k = (dy - 6.5) / 7;
    const w = Math.round((f.w / 2 + 1) * Math.sqrt(Math.max(0, 1 - k * k)));
    ctx.fillRect(cx - w, top + dy, w * 2, 1);
  }
  for (let dy = 1; dy < 13; dy++) {
    const k = (dy - 6.5) / 6.5;
    const w = Math.round((f.w / 2) * Math.sqrt(Math.max(0, 1 - k * k)));
    rect(ctx, dy < 4 ? "#a87a4c" : "#8a6342", cx - w, top + dy, w * 2, 1);
  }
  rect(ctx, "#6b4a30", cx - f.w / 2 + 2, top + 12, f.w - 4, 2);
  // mug + plate with an apple
  rect(ctx, "#f2efe0", cx - 8, top + 4, 8, 4);
  rect(ctx, "#d7362a", cx - 6, top + 3, 3, 3);
  rect(ctx, "#3e7fb8", cx + 4, top + 3, 3, 4);
  rect(ctx, "#2f5e7a", cx + 7, top + 4, 1, 2);
}

function drawChair(ctx: Ctx, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, f.h + 2);
  rect(ctx, "#6b4a30", x, y, f.w, 5);
  rect(ctx, "#8a6342", x, y + 5, f.w, 5);
  rect(ctx, "#a87a4c", x, y + 5, f.w, 1);
  rect(ctx, "#3a281c", x, y + 10, 2, 4);
  rect(ctx, "#3a281c", x + f.w - 2, y + 10, 2, 4);
}

function drawPlant(ctx: Ctx, f: Furn, ox: number, oy: number, t: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x + 1, y + 11, f.w - 2, 10);
  rect(ctx, "#b86a3a", x + 2, y + 12, f.w - 4, 8);
  rect(ctx, "#d08a5a", x + 2, y + 12, f.w - 4, 2);
  ctx.fillStyle = "#2f6430";
  fillCircle(ctx, x + f.w / 2, y + 7, 6);
  ctx.fillStyle = "#4a8f3c";
  fillCircle(ctx, x + f.w / 2 - 1 + Math.round(Math.sin(t) * 0.5), y + 5, 4);
  rect(ctx, "#6fb24c", x + f.w / 2 - 2, y + 2, 2, 1);
}

function drawBarrel(ctx: Ctx, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, f.h + 2);
  rect(ctx, "#8a6342", x, y, f.w, f.h);
  rect(ctx, "#a87a4c", x, y, f.w, 4);
  rect(ctx, "#6b4a30", x + 2, y + 1, f.w - 4, 2);
  rect(ctx, "#5e5a52", x, y + 7, f.w, 1);
  rect(ctx, "#5e5a52", x, y + 13, f.w, 1);
  rect(ctx, "#6b4a30", x + f.w - 4, y + 4, 3, f.h - 4);
}

function drawJars(ctx: Ctx, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  const jar = (jx: number, jy: number, c: string, h: number) => {
    rect(ctx, "#1b140f", jx - 1, jy - 1, 7, h + 2);
    rect(ctx, "#cfe9f0", jx, jy, 5, h);
    rect(ctx, c, jx, jy + 2, 5, h - 2);
    rect(ctx, "#8a6342", jx, jy - 1, 5, 2);
  };
  jar(x, y + 6, "#d7362a", 10);
  jar(x + 7, y + 4, "#f2c84b", 12);
  jar(x + 3, y + 10, "#5fa04a", 8);
}

function drawLamp(ctx: Ctx, f: Furn, ox: number, oy: number) {
  const x = ox + f.x;
  const y = oy + f.y;
  rect(ctx, "#1b140f", x + 3, y + 5, 4, 11);
  rect(ctx, "#eadcbf", x + 4, y + 5, 2, 10);
  rect(ctx, "#5e5a52", x + 2, y + 14, 6, 2);
  rect(ctx, "#1b140f", x - 1, y - 1, f.w + 2, 7);
  rect(ctx, "#ffd56a", x, y, f.w, 5);
  rect(ctx, "#fff1a8", x + 1, y + 1, 3, 1);
}

export interface RoomPlayer {
  x: number;
  y: number;
  facing: "up" | "down" | "left" | "right";
  walkT: number;
  moving: boolean;
}

export function drawRoom(ctx: Ctx, room: Room, W: number, H: number, pl: RoomPlayer, t: number, night: number) {
  const ox = Math.round((W - ROOM_W) / 2);
  const oy = Math.round((H - ROOM_H) / 2) + 4;
  // surroundings: the inside of a big mushroom stem
  ctx.fillStyle = "#120c08";
  ctx.fillRect(0, 0, W, H);
  rect(ctx, "#1d140e", ox - 8, oy - 8, ROOM_W + 16, ROOM_H + 16);
  drawFloor(ctx, room, ox, oy);
  drawWalls(ctx, room, ox, oy, night);
  for (const f of room.furn) if (f.kind === "rug") drawRug(ctx, room, f, ox, oy);
  for (const f of room.furn) {
    if (f.kind === "fireplace") drawFireplace(ctx, f, ox, oy, t);
    if (f.kind === "bookshelf") drawBookshelf(ctx, room, f, ox, oy);
    if (f.kind === "window") drawWindow(ctx, room, f, ox, oy, night);
  }
  // y-sorted furniture + player
  const sortables: { y: number; draw: () => void }[] = [];
  for (const f of room.furn) {
    const d = (() => {
      switch (f.kind) {
        case "bed":
          return () => drawBed(ctx, room, f, ox, oy);
        case "table":
          return () => drawTable(ctx, f, ox, oy);
        case "chair":
          return () => drawChair(ctx, f, ox, oy);
        case "plant":
          return () => drawPlant(ctx, f, ox, oy, t);
        case "barrel":
          return () => drawBarrel(ctx, f, ox, oy);
        case "jars":
          return () => drawJars(ctx, f, ox, oy);
        case "lamp":
          return () => drawLamp(ctx, f, ox, oy);
        default:
          return null;
      }
    })();
    if (d) sortables.push({ y: f.y + f.h, draw: d });
  }
  sortables.push({
    y: pl.y,
    draw: () => {
      const px = Math.round(ox + pl.x);
      const py = Math.round(oy + pl.y);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(px - 5, py - 1, 10, 2);
      drawMushroomPerson(ctx, px, py, {
        facing: pl.facing === "left" ? -1 : 1,
        walk: pl.walkT,
        moving: pl.moving,
        air: false,
        cap: "#d9443a",
        spots: true,
        view: pl.facing === "up" ? "back" : pl.facing === "down" ? "front" : "side",
        blink: (t % 4) < 0.12,
      });
    },
  });
  sortables.sort((a, b) => a.y - b.y);
  for (const s of sortables) s.draw();

  // lighting
  if (night > 0.01) {
    ctx.fillStyle = `rgba(10,8,24,${(night * 0.45).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.globalCompositeOperation = "lighter";
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.1) * 0.07;
  for (const f of room.furn) {
    if (f.kind === "fireplace") glow(ox + f.x + f.w / 2, oy + f.y + f.h, 60, "255,140,50", 0.3 * flick);
    if (f.kind === "lamp") glow(ox + f.x + f.w / 2, oy + f.y + 3, 30, "255,210,110", 0.15 + night * 0.25);
    if (f.kind === "window" && night < 0.5) {
      ctx.fillStyle = `rgba(255,240,190,${(0.08 * (1 - night * 2)).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ox + f.x + 2, oy + WALL_TOP);
      ctx.lineTo(ox + f.x + f.w - 2, oy + WALL_TOP);
      ctx.lineTo(ox + f.x + f.w + 16, oy + WALL_TOP + 50);
      ctx.lineTo(ox + f.x + 10, oy + WALL_TOP + 50);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
}
