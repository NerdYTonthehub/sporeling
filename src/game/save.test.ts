import { describe, expect, it } from "vitest";
import { AUTOSAVE_SECONDS, SAVE_VERSION, parseSave, type SaveData } from "./save";
import { LAKE_MIN_X } from "./world";

const sample: SaveData = {
  v: SAVE_VERSION,
  savedAt: 1,
  x: 2400,
  y: 180,
  health: 64,
  hunger: 40,
  coins: 27,
  inventory: { minnow: 2, carp: 1 },
  fishCaught: 5,
  fishReleased: 2,
  applesEaten: 9,
  time: 300,
  doubleJump: true,
  dungeonCleared: true,
  discovered: ["Mossbottom", "Gillhollow"],
  godDefeated: false,
  holyTries: 1,
  sacrificedFish: ["minnow", "carp"],
};

describe("save games", () => {
  it("round-trips a save unchanged", () => {
    expect(parseSave(JSON.stringify(sample))).toEqual(sample);
  });
  it("ignores missing or broken saves", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave("not json")).toBeNull();
    expect(parseSave(JSON.stringify({ v: 99, x: 10 }))).toBeNull();
  });
  it("never loads you dead or inside the lake", () => {
    const s = parseSave(JSON.stringify({ ...sample, health: 0, x: 10 }));
    expect(s?.health).toBe(1);
    expect(s?.x).toBe(LAKE_MIN_X);
  });
  it("drops unknown fish and negative counts", () => {
    const s = parseSave(JSON.stringify({ ...sample, coins: -5, inventory: { minnow: 3, dragon: 4, carp: -1 } }));
    expect(s?.coins).toBe(0);
    expect(s?.inventory).toEqual({ minnow: 3 });
  });
  it("defaults heaven progress fields on older saves", () => {
    const { godDefeated: _g, holyTries: _h, sacrificedFish: _s, ...legacy } = sample;
    const parsed = parseSave(JSON.stringify(legacy));
    expect(parsed?.godDefeated).toBe(false);
    expect(parsed?.holyTries).toBe(0);
    expect(parsed?.sacrificedFish).toEqual([]);
  });
  it("autosaves every 30 seconds", () => {
    expect(AUTOSAVE_SECONDS).toBe(30);
  });
});
