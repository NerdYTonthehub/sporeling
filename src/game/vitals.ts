// Health & hunger rules. Pure functions so they can be tested in isolation.

export const MAX_HEALTH = 100;
export const MAX_HUNGER = 100;

/** Hunger lost per second while exploring (full belly lasts ~2.5 minutes). */
export const HUNGER_DRAIN_PER_SEC = 0.66;
/** Health lost per second while starving (hunger at 0). */
export const STARVE_DAMAGE_PER_SEC = 4;
/** Health regained per second when well fed (hunger above WELL_FED). */
export const WELL_FED = 60;
export const FED_REGEN_PER_SEC = 1;
/** Extra health regained per second while resting by a village campfire. */
export const FIRE_REGEN_PER_SEC = 8;

/** What one apple gives you. */
export const APPLE_HUNGER = 25;
export const APPLE_HEALTH = 5;

export interface Vitals {
  health: number;
  hunger: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function tickVitals(v: Vitals, dt: number, opts: { nearFire?: boolean } = {}): Vitals {
  const hunger = clamp(v.hunger - HUNGER_DRAIN_PER_SEC * dt, 0, MAX_HUNGER);
  let health = v.health;
  if (hunger <= 0) health -= STARVE_DAMAGE_PER_SEC * dt;
  else if (hunger > WELL_FED) health += FED_REGEN_PER_SEC * dt;
  if (opts.nearFire && hunger > 0) health += FIRE_REGEN_PER_SEC * dt;
  return { health: clamp(health, 0, MAX_HEALTH), hunger };
}

export function eatApple(v: Vitals): Vitals {
  return {
    health: clamp(v.health + APPLE_HEALTH, 0, MAX_HEALTH),
    hunger: clamp(v.hunger + APPLE_HUNGER, 0, MAX_HUNGER),
  };
}

export function takeDamage(v: Vitals, amount: number): Vitals {
  return { ...v, health: clamp(v.health - amount, 0, MAX_HEALTH) };
}

export const isDead = (v: Vitals) => v.health <= 0;
