import { describe, expect, it } from "vitest";
import { BOSS_HP, attackHits, jumpsAllowed, makeFlyer, sectionCleared, stepFlyer } from "./combat";

describe("double jump", () => {
  it("only one jump until the dungeon is cleared, two after", () => {
    expect(jumpsAllowed(false)).toBe(1);
    expect(jumpsAllowed(true)).toBe(2);
  });
});

describe("attacks", () => {
  it("hits a beetle right in front of you but not one behind", () => {
    expect(attackHits(100, 190, 1, 112, 186)).toBe(true);
    expect(attackHits(100, 190, 1, 80, 186)).toBe(false);
    expect(attackHits(100, 190, -1, 88, 186)).toBe(true);
  });

  it("can't reach a beetle flying high above you", () => {
    expect(attackHits(100, 190, 1, 108, 120)).toBe(false);
  });

  it("the beetle king takes 6 hits", () => {
    expect(BOSS_HP).toBe(6);
  });
});

describe("dungeon sections", () => {
  it("a gate opens only when every beetle in its section is beaten", () => {
    const enemies = [
      { section: 0, alive: false },
      { section: 0, alive: true },
      { section: 1, alive: true },
    ];
    expect(sectionCleared(enemies, 0)).toBe(false);
    enemies[1]!.alive = false;
    expect(sectionCleared(enemies, 0)).toBe(true);
    expect(sectionCleared(enemies, 1)).toBe(false);
  });
});

describe("flying beetles", () => {
  it("swoop at a player walking underneath", () => {
    const f = makeFlyer(100, 120, 40);
    f.cd = 0;
    stepFlyer(f, 0.016, 120, 190, 190);
    expect(f.state).toBe("dive");
    expect(f.vy).toBeGreaterThan(0);
  });

  it("ignore a player far away", () => {
    const f = makeFlyer(100, 120, 40);
    f.cd = 0;
    stepFlyer(f, 0.016, 400, 190, 190);
    expect(f.state).toBe("hover");
  });
});
