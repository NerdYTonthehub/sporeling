import { describe, expect, it } from "vitest";
import { detectControllerModel, readGamepadInputs } from "./gamepad";
import {
  DEFAULT_KEYS,
  DEFAULT_PAD_KEYS,
  actionForCode,
  actionsForPadCodes,
  keyLabel,
  padButtonLabel,
  parseSettings,
  rebind,
  rebindPad,
} from "./settings";

describe("settings", () => {
  it("default controls: arrows/WASD to move, Space to jump, E to use, I for the bag", () => {
    expect(actionForCode(DEFAULT_KEYS, "KeyA")).toBe("left");
    expect(actionForCode(DEFAULT_KEYS, "ArrowRight")).toBe("right");
    expect(actionForCode(DEFAULT_KEYS, "Space")).toBe("jump");
    expect(actionForCode(DEFAULT_KEYS, "KeyE")).toBe("act");
    expect(actionForCode(DEFAULT_KEYS, "KeyI")).toBe("bag");
    expect(actionForCode(DEFAULT_KEYS, "KeyF")).toBe("attack");
    expect(actionForCode(DEFAULT_KEYS, "ShiftLeft")).toBe("dash");
    expect(actionForCode(DEFAULT_KEYS, "KeyC")).toBe("dash");
  });

  it("rebinding a key moves it so two actions never share a key", () => {
    const k = rebind(DEFAULT_KEYS, "jump", 1, "KeyE");
    expect(k.jump).toEqual(["Space", "KeyE"]);
    expect(k.act).toEqual([null, "Enter"]);
    expect(actionForCode(k, "KeyE")).toBe("jump");
  });

  it("escape and P can't be bound", () => {
    expect(rebind(DEFAULT_KEYS, "act", 0, "Escape")).toBe(DEFAULT_KEYS);
    expect(rebind(DEFAULT_KEYS, "act", 0, "KeyP")).toBe(DEFAULT_KEYS);
  });

  it("broken saved settings fall back to defaults", () => {
    expect(parseSettings("not json").sound).toBe(true);
    const s = parseSettings(JSON.stringify({ sound: false, volume: 3 }));
    expect(s.sound).toBe(false);
    expect(s.volume).toBe(1);
    expect(s.keys.left).toEqual(DEFAULT_KEYS.left);
    expect(s.controllerModel).toBe("ps5");
    expect(s.padKeys.jump).toEqual(DEFAULT_PAD_KEYS.jump);
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

  it("supports PS5, PS4, Xbox, Nintendo and Övrigt controller labels and rebinding", () => {
    expect(padButtonLabel("gp:b0", "ps5")).toBe("✕");
    expect(padButtonLabel("gp:b8", "ps4")).toBe("Share");
    expect(padButtonLabel("gp:b0", "xbox")).toBe("A");
    expect(padButtonLabel("gp:b0", "nintendo")).toBe("B");
    expect(padButtonLabel("gp:b1", "nintendo")).toBe("A");
    expect(padButtonLabel("gp:b0", "other")).toBe("B0");

    const updated = rebindPad(DEFAULT_PAD_KEYS, "jump", 0, "gp:b3");
    expect(updated.jump).toEqual(["gp:b3", null]);
    expect(updated.attack[0]).toBeNull();
    expect(rebindPad(DEFAULT_PAD_KEYS, "jump", 0, "gp:b9")).toBe(DEFAULT_PAD_KEYS);
  });

  it("polls controller buttons and analog sticks into active actions", () => {
    const codes = readGamepadInputs({
      id: "DualSense Wireless Controller",
      connected: true,
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
        { pressed: true, value: 0.9 },
      ],
      axes: [-0.8, 0, 0, 0],
    });
    expect(codes.has("gp:b0")).toBe(true);
    expect(codes.has("gp:b7")).toBe(true);
    expect(codes.has("gp:ls-left")).toBe(true);
    const actions = actionsForPadCodes(DEFAULT_PAD_KEYS, codes);
    expect(actions.has("jump")).toBe(true);
    expect(actions.has("dash")).toBe(true);
    expect(actions.has("left")).toBe(true);
    expect(detectControllerModel("DualSense Wireless Controller")).toBe("ps5");
    expect(detectControllerModel("Xbox Wireless Controller")).toBe("xbox");
    expect(detectControllerModel("Nintendo Switch Pro Controller")).toBe("nintendo");
  });
});
