// Combat + movement rules: attacks, enemy damage, flying beetle AI and the double jump.
// Pure (no DOM) so they can be tested in isolation.

/** Seconds the spore puff attack stays active, and the wait before the next one. */
export const ATTACK_TIME = 0.22;
export const ATTACK_COOLDOWN = 0.38;
/** How far in front of the mushroom the puff reaches (px). */
export const ATTACK_REACH = 20;

export const BEETLE_DAMAGE = 15;
export const FLYER_DAMAGE = 12;
export const BOSS_DAMAGE = 20;
export const BOSS_HP = 6;

/** Ground jump + one extra jump in the air once the double jump is unlocked. */
export const jumpsAllowed = (hasDoubleJump: boolean) => (hasDoubleJump ? 2 : 1);

/** Does an attack from a player at feet (px, py) facing `facing` hit a target box centred at (tx, ty)? */
export function attackHits(px: number, py: number, facing: number, tx: number, ty: number, halfW = 5, halfH = 5) {
  const f = facing >= 0 ? 1 : -1;
  const x0 = f > 0 ? px - 3 : px - ATTACK_REACH;
  const x1 = f > 0 ? px + ATTACK_REACH : px + 3;
  const y0 = py - 24;
  const y1 = py + 2;
  return tx + halfW > x0 && tx - halfW < x1 && ty + halfH > y0 && ty - halfH < y1;
}

/** A section of the dungeon is cleared when every enemy tagged with it is defeated. */
export function sectionCleared(enemies: { section?: number | undefined; alive: boolean }[], section: number) {
  return enemies.every((e) => e.section !== section || !e.alive);
}

export interface Flyer {
  x: number;
  y: number;
  baseY: number;
  homeX: number;
  range: number;
  vx: number;
  vy: number;
  state: "hover" | "dive" | "rise";
  t: number;
  cd: number;
  flap: number;
  alive: boolean;
  respawn: number;
  section?: number | undefined;
}

/** How close (horizontally) the player must be before a flying beetle swoops. */
export const FLYER_SIGHT = 80;
export const DIVE_SPEED = 105;

export function makeFlyer(x: number, baseY: number, range: number, section?: number): Flyer {
  return { x, y: baseY, baseY, homeX: x, range, vx: 18, vy: 0, state: "hover", t: 0, cd: 1 + (x % 7) * 0.2, flap: x % 5, alive: true, respawn: 0, section };
}

/** Advance one flying beetle. (tx, ty) = player's feet, floorY = ground below the beetle. */
export function stepFlyer(f: Flyer, dt: number, tx: number, ty: number, floorY: number) {
  f.flap += dt;
  f.cd -= dt;
  if (f.state === "hover") {
    f.x += f.vx * dt;
    if (f.x < f.homeX - f.range) f.vx = Math.abs(f.vx);
    if (f.x > f.homeX + f.range) f.vx = -Math.abs(f.vx);
    const target = f.baseY + Math.sin(f.flap * 3) * 4;
    f.y += (target - f.y) * Math.min(1, dt * 4);
    if (f.cd <= 0 && Math.abs(tx - f.x) < FLYER_SIGHT && ty > f.y && ty - f.y < 140) {
      const dx = tx - f.x;
      const dy = ty - 8 - f.y;
      const len = Math.hypot(dx, dy) || 1;
      f.state = "dive";
      f.t = 0;
      f.vx = (dx / len) * DIVE_SPEED;
      f.vy = (dy / len) * DIVE_SPEED;
    }
  } else if (f.state === "dive") {
    f.t += dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.t > 0.9 || f.y > floorY - 6) {
      f.y = Math.min(f.y, floorY - 6);
      f.state = "rise";
    }
  } else {
    f.y -= 45 * dt;
    f.x += Math.sign(f.homeX - f.x) * Math.min(Math.abs(f.homeX - f.x), 22 * dt);
    if (f.y <= f.baseY) {
      f.y = f.baseY;
      f.state = "hover";
      f.cd = 1.6 + Math.random();
      f.vx = f.homeX > f.x ? 18 : -18;
    }
  }
}
