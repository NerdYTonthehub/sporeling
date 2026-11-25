import { describe, expect, it } from "vitest";
import {
  BITE_WINDOW,
  FISH,
  addFish,
  removeFish,
  resolveBite,
  rollFish,
  rollWait,
} from "./fishing";

describe("fishing", () => {
  it("pressing space before the ! appears scares the fish", () => {
    expect(resolveBite("wait", 0, true)).toBe("early");
    expect(resolveBite("wait", 0, false)).toBe("pending");
  });

  it("pressing space quickly after the ! catches the fish", () => {
    expect(resolveBite("bite", 0.3, true)).toBe("caught");
  });

  it("waiting longer than the bite window lets it get away", () => {
    expect(resolveBite("bite", BITE_WINDOW + 0.01, false)).toBe("missed");
    expect(resolveBite("bite", BITE_WINDOW + 0.01, true)).toBe("missed");
  });

  it("bites come after 2.5 to 6 seconds", () => {
    expect(rollWait(0)).toBe(2.5);
    expect(rollWait(1)).toBe(6);
  });

  it("rolls common fish most of the time and the golden guppy rarely", () => {
    expect(rollFish(0).id).toBe("minnow");
    expect(rollFish(0.999).id).toBe("golden");
    expect(FISH.find((f) => f.id === "golden")!.weight).toBeLessThan(FISH[0]!.weight);
  });

  it("has a 2% chance to catch the godly goldfish only after double jump is unlocked", () => {
    expect(rollFish(0.01, false).id).toBe("minnow");
    expect(rollFish(0.0, true).id).toBe("godly");
    expect(rollFish(0.019, true).id).toBe("godly");
    expect(rollFish(0.02, true).id).toBe("minnow");
    expect(rollFish(0.999, true).id).toBe("golden");
  });

  it("inventory stacks caught fish and releasing removes one", () => {
    let inv = addFish({}, "carp");
    inv = addFish(inv, "carp");
    expect(inv).toEqual({ carp: 2 });
    inv = removeFish(inv, "carp");
    expect(inv).toEqual({ carp: 1 });
    inv = removeFish(inv, "carp");
    expect(inv).toEqual({});
    expect(removeFish(inv, "carp")).toEqual({});
  });
});

describe("money", () => {
  it("giving a fish to the light pays coins, rarer fish pay more, and doubles after defeating god", async () => {
    const { releaseReward } = await import("./fishing");
    expect(releaseReward("minnow")).toBe(2);
    expect(releaseReward("perch")).toBe(4);
    expect(releaseReward("carp")).toBe(8);
    expect(releaseReward("glowfin")).toBe(15);
    expect(releaseReward("golden")).toBe(40);
    expect(releaseReward("minnow", true)).toBe(4);
    expect(releaseReward("golden", true)).toBe(80);
    expect(releaseReward("godly", true)).toBe(200);
  });
});
