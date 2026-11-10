import { describe, expect, it } from "vitest";
import { eatApple, isDead, takeDamage, tickVitals } from "./vitals";

describe("vitals", () => {
  it("hunger drains over time", () => {
    const v = tickVitals({ health: 50, hunger: 50 }, 10);
    expect(v.hunger).toBeCloseTo(43.4);
  });

  it("starving (hunger at 0) hurts health", () => {
    const v = tickVitals({ health: 50, hunger: 0 }, 5);
    expect(v.health).toBeCloseTo(30);
    expect(v.hunger).toBe(0);
  });

  it("being well fed slowly heals", () => {
    const v = tickVitals({ health: 50, hunger: 90 }, 10);
    expect(v.health).toBeCloseTo(60);
  });

  it("an apple restores 25 hunger and 5 health, capped at 100", () => {
    expect(eatApple({ health: 50, hunger: 40 })).toEqual({ health: 55, hunger: 65 });
    expect(eatApple({ health: 98, hunger: 90 })).toEqual({ health: 100, hunger: 100 });
  });

  it("you die when health reaches 0", () => {
    const v = takeDamage({ health: 10, hunger: 50 }, 15);
    expect(v.health).toBe(0);
    expect(isDead(v)).toBe(true);
  });
});
