import { describe, expect, it } from "vitest";
import {
  GOD_HP,
  applyHolyTryOutcome,
  beamBounds,
  beamHitsPlayer,
  createHeaven,
  isInBeamSafeEdge,
  nextGodAttack,
  stompHitsDashGod,
} from "./heaven";

describe("Heaven arena and Goldfish of Destruction", () => {
  it("populates Heaven with the fishes you sacrificed and initializes God", () => {
    const h = createHeaven(400, ["minnow", "carp", "golden"]);
    expect(h.flyingFish.map((f) => f.sp.id)).toEqual(["minnow", "carp", "golden"]);
    expect(h.god.hp).toBe(GOD_HP);
    expect(h.god.maxHp).toBe(GOD_HP);
  });

  it("picks boss attacks in random order without repeating the same attack twice in a row", () => {
    const firstChoices = new Set([0, 0.25, 0.5, 0.75].map((r) => nextGodAttack(null, r)));
    expect(firstChoices).toEqual(new Set(["fish_bombs", "hand_smash", "light_beam", "dash"]));
    for (const prev of firstChoices) {
      for (const r of [0, 0.34, 0.67, 0.99]) {
        expect(nextGodAttack(prev, r)).not.toBe(prev);
      }
    }
  });

  it("sweeping light beam stops before the screen edges so standing at the edge avoids it", () => {
    const arenaW = 400;
    const { minX, maxX } = beamBounds(arenaW);
    expect(minX).toBeGreaterThan(10);
    expect(maxX).toBeLessThan(arenaW - 10);

    // Player standing at either screen edge (x = 10 or x = arenaW - 10) is never hit anywhere in the beam sweep
    expect(isInBeamSafeEdge(arenaW, 10)).toBe(true);
    expect(isInBeamSafeEdge(arenaW, arenaW - 10)).toBe(true);
    for (let bx = minX; bx <= maxX; bx += 2) {
      expect(beamHitsPlayer(bx, 10)).toBe(false);
      expect(beamHitsPlayer(bx, arenaW - 10)).toBe(false);
    }
    expect(beamHitsPlayer(200, 202)).toBe(true);
  });

  it("jumping onto God during his dash attack damages him", () => {
    const h = createHeaven(400, []);
    const g = h.god;
    g.x = 200;
    g.y = h.floorY;
    g.phase = "dash";
    g.sub = "strike";

    // Falling onto God from above hits
    expect(stompHitsDashGod(g, 202, h.floorY - 24, 120)).toBe(true);
    // Moving upward or outside dash phase does not stomp
    expect(stompHitsDashGod(g, 202, h.floorY - 24, -80)).toBe(false);
    g.phase = "hover";
    expect(stompHitsDashGod(g, 202, h.floorY - 24, 120)).toBe(false);
  });

  it("lets you keep the Godly Goldfish for 3 tries and removes it after the 3rd loss or a win", () => {
    const inv = { godly: 1, minnow: 2 };
    const t1 = applyHolyTryOutcome(inv, 0, false);
    expect(t1).toEqual({ inventory: { godly: 1, minnow: 2 }, holyTries: 1, fishConsumed: false });

    const t2 = applyHolyTryOutcome(t1.inventory, t1.holyTries, false);
    expect(t2).toEqual({ inventory: { godly: 1, minnow: 2 }, holyTries: 2, fishConsumed: false });

    const t3 = applyHolyTryOutcome(t2.inventory, t2.holyTries, false);
    expect(t3).toEqual({ inventory: { minnow: 2 }, holyTries: 0, fishConsumed: true });

    const win = applyHolyTryOutcome(inv, 1, true);
    expect(win).toEqual({ inventory: { minnow: 2 }, holyTries: 0, fishConsumed: true });
  });
});
