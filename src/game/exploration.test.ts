import { describe, expect, it } from "vitest";
import { BOAT_FARE, LIGHTHOUSE_X, TOTAL_VILLAGES, generateAntShore, generateWorld, puddleSinkDepth, surfaceY } from "./world";
import { createDungeon } from "./dungeon";
import { FLOOR_BOTTOM, ROOM_SPAWN, atDoor, createRoom, moveInRoom } from "./interior";
import { sectionCleared } from "./combat";

describe("forest exploration", () => {
  it("has exactly two ground-level and two treetop villages, each with a campfire for teleporting", () => {
    const { world } = generateWorld(1337);
    expect(world.villages.filter((v) => v.floorY === undefined)).toHaveLength(2);
    expect(world.villages.filter((v) => v.floorY !== undefined)).toHaveLength(2);
    expect(world.villages).toHaveLength(TOTAL_VILLAGES);
    for (const v of world.villages) {
      expect(v.fireX).toBeGreaterThanOrEqual(v.x - v.half + 16);
      expect(v.fireX).toBeLessThanOrEqual(v.x + v.half - 16);
      if (v.floorY !== undefined) {
        const deck = world.platforms.find((pl) => pl.kind === "deck" && Math.abs(pl.y - v.floorY!) <= 1 && v.fireX - 16 >= pl.x && v.fireX + 16 <= pl.x + pl.w);
        expect(deck).toBeDefined();
      }
    }
  });
  it("places the dungeon entrance randomly on any ground-level tree", () => {
    const { world: wDefault } = generateWorld(1337);
    expect(wDefault.trees).toContain(wDefault.elder);
    expect(wDefault.elder.elder).toBe(true);
    expect(wDefault.trees.filter((t) => t.elder)).toHaveLength(1);

    const xs = [0, 3, Math.floor(wDefault.trees.length / 2), wDefault.trees.length - 1].map((idx) => {
      const { world } = generateWorld(1337, idx);
      expect(world.elder).toBe(world.trees[idx]);
      return world.elder.x;
    });
    expect(new Set(xs).size).toBe(4);
  });
  it("generates distinct terrain heights for different world seeds", () => {
    const a = generateWorld(101, 0);
    const b = generateWorld(202, 0);
    const sampleXs = [1500, 3000, 6000, 9000, 12000, 15000];
    const diffs = sampleXs.filter((x) => a.groundY(x) !== b.groundY(x));
    expect(diffs.length).toBeGreaterThan(2);
  });
  it("sinks the player slightly when standing in a puddle", () => {
    const puddles = [{ x: 2000, half: 16 }];
    expect(puddleSinkDepth(puddles, 2000)).toBe(3);
    expect(puddleSinkDepth(puddles, 2010)).toBeGreaterThan(0);
    expect(puddleSinkDepth(puddles, 2030)).toBe(0);
  });
  it("builds a lighthouse by the shore and an ant-infested dead-grass shore across the 100-coin boat crossing", () => {
    expect(BOAT_FARE).toBe(100);
    expect(LIGHTHOUSE_X).toBeGreaterThan(820);
    const shore = generateAntShore(1337);
    expect(shore.anthills.length).toBeGreaterThanOrEqual(7);
    expect(shore.ants.length).toBeGreaterThanOrEqual(20);
    expect(shore.decor.some((d) => d.kind === "deadgrass")).toBe(true);
  });
  it("rope bridges join every neighboring tree's decks", () => {
    const { world } = generateWorld(1337);
    const bridges = world.platforms.filter((p) => p.kind === "bridge");
    expect(bridges).toHaveLength(world.trees.length - 1);
    bridges.forEach((bridge, i) => {
      const a = world.trees[i];
      const b = world.trees[i + 1];
      if (!a || !b) throw new Error("Missing bridge endpoint");
      expect(bridge.x).toBe(a.deckX1);
      expect(bridge.x + bridge.w).toBe(b.deckX0);
      expect(surfaceY(bridge, bridge.x)).toBe(a.deckY);
      expect(surfaceY(bridge, bridge.x + bridge.w)).toBeCloseTo(b.deckY);
    });
  });
  it("houses allow walking out through the bottom doorway but not the wall", () => {
    const { world } = generateWorld(1337);
    const village = world.villages[0];
    const house = village?.houses[0];
    if (!village || !house) throw new Error("Missing village house");
    const room = createRoom(house, village.name, 1337);
    expect(moveInRoom(room, ROOM_SPAWN.x, FLOOR_BOTTOM - 1, 0, 10).y).toBe(FLOOR_BOTTOM + 9);
    expect(moveInRoom(room, 60, FLOOR_BOTTOM - 1, 0, 10).y).toBe(FLOOR_BOTTOM - 1);
    expect(atDoor(ROOM_SPAWN.x, FLOOR_BOTTOM + 9)).toBe(true);
  });
  it("dungeon gates require ground and flying beetles to be defeated", () => {
    const d = createDungeon();
    d.beetles.filter((b) => b.section === 0).forEach((b) => { b.alive = false; });
    expect(sectionCleared([...d.beetles, ...d.flyers], 0)).toBe(false);
    d.flyers.filter((b) => b.section === 0).forEach((b) => { b.alive = false; });
    expect(sectionCleared([...d.beetles, ...d.flyers], 0)).toBe(true);
    expect(d.shrineX).toBeGreaterThan(Math.max(...d.gates.map((g) => g.x)));
  });
});