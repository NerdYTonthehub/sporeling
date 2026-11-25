// Heaven Arena: accessed by sacrificing a Godly Goldfish.
// Sacrificed fishes fly through the clouds while the Goldfish of Destruction (God)
// cycles through 4 attacks: fish bombs, enlarged hand smash, sweeping light beam, and dash.
import { fishById, removeFish, MAX_HOLY_TRIES, type FishSpecies, type Inventory } from "./fishing";
import { drawBigHand, drawFish, drawFishBomb, drawGodBoss, fillCircle, rect } from "./sprites";

type Ctx = CanvasRenderingContext2D;

export const HEAVEN_FLOOR_Y = 178;
/** Safe standing margin at both screen edges where the light beam stops short. */
export const BEAM_EDGE_SAFE = 26;
export const BEAM_HALF_W = 9;
export const GOD_HP = 10;
export const GOD_BOMB_DAMAGE = 16;
export const GOD_SMASH_DAMAGE = 22;
export const GOD_BEAM_DAMAGE = 18;
export const GOD_DASH_DAMAGE = 16;

export type GodAttack = "fish_bombs" | "hand_smash" | "light_beam" | "dash";
export type GodPhase = "arrive" | "hover" | GodAttack | "defeated";

export interface FishBomb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  exploded: boolean;
}

export interface FlyingSacrifice {
  sp: FishSpecies;
  baseX: number;
  baseY: number;
  speed: number;
  ampY: number;
  phase: number;
  dir: -1 | 1;
}

export interface GodBoss {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: GodPhase;
  sub: "windup" | "strike" | "recover";
  timer: number;
  hitT: number;
  attackIdx: number;
  bombsLeft: number;
  bombCd: number;
  handSide: -1 | 1;
  handX: number;
  handY: number;
  smashHit: boolean;
  beamActive: boolean;
  beamX: number;
  beamDir: -1 | 1;
  dashDir: -1 | 1;
  dashTargetX: number;
}

export interface HeavenState {
  w: number;
  floorY: number;
  t: number;
  god: GodBoss;
  bombs: FishBomb[];
  flyingFish: FlyingSacrifice[];
  defeatTimer: number;
}

const ATTACK_ORDER: GodAttack[] = ["fish_bombs", "hand_smash", "light_beam", "dash"];

export function createHeaven(arenaW: number, sacrificedIds: string[]): HeavenState {
  const w = Math.max(280, arenaW);
  const flyingFish: FlyingSacrifice[] = [];
  const capped = sacrificedIds.slice(-36);
  capped.forEach((id, i) => {
    const sp = fishById(id);
    if (!sp) return;
    flyingFish.push({
      sp,
      baseX: ((i * 67 + 30) % Math.max(120, w - 40)) + 20,
      baseY: 32 + ((i * 29) % 105),
      speed: 14 + (i % 5) * 5,
      ampY: 6 + (i % 4) * 3,
      phase: i * 1.17,
      dir: i % 2 === 0 ? 1 : -1,
    });
  });

  return {
    w,
    floorY: HEAVEN_FLOOR_Y,
    t: 0,
    bombs: [],
    flyingFish,
    defeatTimer: 0,
    god: {
      x: Math.round(w / 2),
      y: -30,
      vx: 0,
      vy: 0,
      hp: GOD_HP,
      maxHp: GOD_HP,
      phase: "arrive",
      sub: "windup",
      timer: 1.5,
      hitT: 0,
      attackIdx: 0,
      bombsLeft: 0,
      bombCd: 0,
      handSide: 1,
      handX: Math.round(w / 2),
      handY: 60,
      smashHit: false,
      beamActive: false,
      beamX: BEAM_EDGE_SAFE,
      beamDir: 1,
      dashDir: 1,
      dashTargetX: w - 34,
    },
  };
}

/** Light beam sweep bounds: stops at BEAM_EDGE_SAFE from both screen edges. */
export function beamBounds(arenaW: number) {
  return { minX: BEAM_EDGE_SAFE, maxX: Math.max(BEAM_EDGE_SAFE + 20, arenaW - BEAM_EDGE_SAFE) };
}

/** True when a player at `px` is hit by the vertical light beam centered at `beamX`. */
export function beamHitsPlayer(beamX: number, px: number): boolean {
  return Math.abs(px - beamX) < BEAM_HALF_W + 3;
}

/** True when a player standing near either edge of the screen avoids the entire beam sweep. */
export function isInBeamSafeEdge(arenaW: number, px: number): boolean {
  const { minX, maxX } = beamBounds(arenaW);
  return px <= minX - BEAM_HALF_W - 3 || px >= maxX + BEAM_HALF_W + 3;
}

/** True when a falling player stomps on God while he is dashing underneath. */
export function stompHitsDashGod(god: GodBoss, px: number, py: number, pvy: number): boolean {
  if (god.phase !== "dash" || god.sub !== "strike" || god.hp <= 0 || god.hitT > 0) return false;
  return pvy > 15 && Math.abs(px - god.x) < 20 && py >= god.y - 46 && py <= god.y - 12;
}

/** Next attack in rotation. */
export function nextGodAttack(idx: number): GodAttack {
  return ATTACK_ORDER[idx % ATTACK_ORDER.length]!;
}

/** Resolves inventory & try count after a Heaven fight ends (either winning or losing). */
export function applyHolyTryOutcome(
  inv: Inventory,
  holyTries: number,
  won: boolean,
): { inventory: Inventory; holyTries: number; fishConsumed: boolean } {
  if (won) {
    return { inventory: removeFish(inv, "godly"), holyTries: 0, fishConsumed: true };
  }
  const nextTries = holyTries + 1;
  if (nextTries >= MAX_HOLY_TRIES) {
    return { inventory: removeFish(inv, "godly"), holyTries: 0, fishConsumed: true };
  }
  return { inventory: { ...inv }, holyTries: nextTries, fishConsumed: false };
}

// ---------------- rendering ----------------

export function drawHeavenBack(ctx: Ctx, h: HeavenState, W: number, H: number) {
  // Radiant heavenly sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#5ea8dc");
  grad.addColorStop(0.55, "#bce8ff");
  grad.addColorStop(1, "#fff6d6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft golden sun halo at top-center
  const sx = Math.round(W / 2);
  const sy = 36;
  ctx.globalCompositeOperation = "lighter";
  const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, 95);
  sun.addColorStop(0, "rgba(255,248,200,0.65)");
  sun.addColorStop(0.5, "rgba(255,225,130,0.22)");
  sun.addColorStop(1, "rgba(255,225,130,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(sx - 95, 0, 190, 140);
  ctx.globalCompositeOperation = "source-over";

  // Distant floating golden temple pillars (behind clouds)
  for (const px of [44, Math.round(W * 0.28), Math.round(W * 0.72), W - 44]) {
    rect(ctx, "#d8c89c", px - 5, 42, 10, h.floorY - 42);
    rect(ctx, "#f5ead0", px - 4, 42, 4, h.floorY - 42);
    rect(ctx, "#c6ab70", px - 7, 38, 14, 5);
    rect(ctx, "#ffe896", px - 6, 39, 12, 2);
  }

  // Drifting heavenly clouds
  for (let i = 0; i < 6; i++) {
    const cx = Math.round(((i * 95 + h.t * (5 + (i % 3) * 2)) % (W + 80)) - 40);
    const cy = 28 + (i % 3) * 32;
    ctx.fillStyle = "#ffffff";
    fillCircle(ctx, cx, cy, 10);
    fillCircle(ctx, cx - 9, cy + 3, 7);
    fillCircle(ctx, cx + 10, cy + 3, 7);
    rect(ctx, "#d9ecff", cx - 12, cy + 7, 24, 3);
  }

  // Sacrificed fishes flying peacefully through Heaven!
  for (const f of h.flyingFish) {
    const span = W + 24;
    const raw = (f.baseX + h.t * f.speed * f.dir) % span;
    const fx = raw < 0 ? raw + span - 12 : raw - 12;
    const fy = f.baseY + Math.sin(h.t * 2 + f.phase) * f.ampY;
    // Tiny golden halo shimmer behind each flying fish
    ctx.globalAlpha = 0.45;
    rect(ctx, "#ffe86b", Math.round(fx - 1), Math.round(fy - 7), 3, 1);
    ctx.globalAlpha = 1;
    drawFish(ctx, fx, fy, f.sp, f.dir);
  }
}

export function drawHeavenFloor(ctx: Ctx, h: HeavenState, W: number, H: number) {
  const y = h.floorY;
  // Cloud bank beneath the marble floor
  ctx.fillStyle = "#e8f4ff";
  for (let x = 0; x <= W; x += 18) {
    fillCircle(ctx, x, y + 18 + ((x * 7) % 5), 14);
  }
  ctx.fillStyle = "#ffffff";
  for (let x = 8; x <= W; x += 22) {
    fillCircle(ctx, x, y + 13, 11);
  }
  rect(ctx, "#d2e6f7", 0, y + 20, W, H - (y + 20));

  // Marble & gold arena floor
  rect(ctx, "#1b140f", 0, y - 1, W, 1);
  rect(ctx, "#fffaf0", 0, y, W, 3);
  rect(ctx, "#eadfb8", 0, y + 3, W, 6);
  rect(ctx, "#d4b464", 0, y + 9, W, 2);
  rect(ctx, "#b88e3a", 0, y + 11, W, 2);
  for (let x = 16; x < W; x += 24) {
    rect(ctx, "#d8cfa8", x, y + 1, 1, 8);
  }

  // Subtle golden edge markers showing the safe edge pockets for the light beam
  const { minX, maxX } = beamBounds(W);
  for (const edgeX of [minX - BEAM_HALF_W - 2, maxX + BEAM_HALF_W + 2]) {
    rect(ctx, "#f2c84b", edgeX, y, 1, 3);
  }
}

export function drawHeavenEffects(ctx: Ctx, h: HeavenState) {
  const g = h.god;

  // Ground shadow under enlarged hand during hand_smash windup/strike
  if (g.phase === "hand_smash") {
    const dist = Math.max(0, h.floorY - g.handY);
    const sw = Math.max(8, Math.round(24 - dist * 0.1));
    ctx.globalAlpha = 0.28;
    rect(ctx, "#1b140f", Math.round(g.handX - sw / 2), h.floorY - 2, sw, 3);
    ctx.globalAlpha = 1;
  }

  // Sweeping light beam (Attack 3)
  if (g.phase === "light_beam" && g.beamActive) {
    const bx = Math.round(g.beamX);
    if (g.sub === "windup") {
      // Warning telegraph line + subtle orb before the beam fires
      ctx.globalAlpha = 0.45 + Math.sin(h.t * 24) * 0.25;
      rect(ctx, "#fff3a0", bx - 1, 0, 2, h.floorY);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffe46b";
      fillCircle(ctx, bx, 26, 6);
      ctx.fillStyle = "#ffffff";
      fillCircle(ctx, bx, 26, 3);
    } else if (g.sub === "strike") {
      ctx.globalCompositeOperation = "lighter";
      rect(ctx, "rgba(255,215,90,0.28)", bx - BEAM_HALF_W - 6, 0, (BEAM_HALF_W + 6) * 2, h.floorY);
      rect(ctx, "rgba(255,240,160,0.55)", bx - BEAM_HALF_W, 0, BEAM_HALF_W * 2, h.floorY);
      ctx.globalCompositeOperation = "source-over";
      rect(ctx, "#ffffff", bx - 4, 0, 8, h.floorY);
      // Impact flare on the marble floor
      rect(ctx, "#ffe86b", bx - BEAM_HALF_W - 2, h.floorY - 3, (BEAM_HALF_W + 2) * 2, 3);
    }
  }

  // God boss itself
  if (g.phase !== "defeated" || Math.floor(h.t * 16) % 2 === 0) {
    const flash = g.hitT > 0 && Math.floor(h.t * 24) % 2 === 0;
    drawGodBoss(ctx, Math.round(g.x), Math.round(g.y), {
      t: h.t,
      flash,
      hideHandSide: g.phase === "hand_smash" ? g.handSide : undefined,
      dashDir: g.phase === "dash" ? g.dashDir : undefined,
    });
    if (g.phase === "hand_smash") {
      drawBigHand(ctx, Math.round(g.handX), Math.round(g.handY), flash);
    }
  }

  // Fish bombs (Sprite #3)
  for (const b of h.bombs) {
    if (!b.exploded) drawFishBomb(ctx, b.x, b.y, b.vx, b.vy, h.t);
  }
}
