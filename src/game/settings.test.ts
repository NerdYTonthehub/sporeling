import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS, actionForCode, keyLabel, parseSettings, rebind } from "./settings";

describe("settings", () => {
  it("default controls: arrows/WASD to move, Space to jump, E to use, I for the bag", () => {
    expect(actionForCode(DEFAULT_KEYS, "KeyA")).toBe("left");
    expect(actionForCode(DEFAULT_KEYS, "ArrowRight")).toBe("right");
    expect(actionForCode(DEFAULT_KEYS, "Space")).toBe("jump");
    expect(actionForCode(DEFAULT_KEYS, "KeyE")).toBe("act");
    expect(actionForCode(DEFAULT_KEYS, "KeyI")).toBe("bag");
    expect(actionForCode(DEFAULT_KEYS, "KeyF")).toBe("attack");
  });

  it("rebinding a key moves it so two actions never share a key", () => {
    const k = rebind(DEFAULT_KEYS, "jump", 1, "KeyE");
    expect(k.jump).toEqual(["Space", "KeyE"]);
    expect(k.act).toEqual([null, "Enter"]);
    expect(actionForCode(k, "KeyE")).toBe("jump");
  });

  it("escape can't be bound", () => {
    expect(rebind(DEFAULT_KEYS, "act", 0, "Escape")).toBe(DEFAULT_KEYS);
  });

  it("broken saved settings fall back to defaults", () => {
    expect(parseSettings("not json").sound).toBe(true);
    const s = parseSettings(JSON.stringify({ sound: false, volume: 3 }));
    expect(s.sound).toBe(false);
    expect(s.volume).toBe(1);
    expect(s.keys.left).toEqual(DEFAULT_KEYS.left);
  });

  it("music is on by default, also for settings saved before music existed", () => {
    expect(parseSettings(null).music).toBe(true);
    expect(parseSettings(JSON.stringify({ sound: true, volume: 0.5 })).music).toBe(true);
    expect(parseSettings(JSON.stringify({ music: false })).music).toBe(false);
  });

  it("shows friendly key names", () => {
    expect(keyLabel("KeyQ")).toBe("Q");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel(null)).toBe("—");
  });
});
