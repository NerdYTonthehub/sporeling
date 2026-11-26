// Browser Gamepad API polling helpers (zero dependencies, cross-browser standard mapping).
import type { ControllerModel } from "./settings";

const STICK_DEADZONE = 0.38;
const TRIGGER_THRESHOLD = 0.35;

export interface GamepadLike {
  id: string;
  connected?: boolean;
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

/** Read all currently pressed button/stick codes from a single gamepad. */
export function readGamepadInputs(pad: GamepadLike | null | undefined, out = new Set<string>()): Set<string> {
  if (!pad || pad.connected === false) return out;
  for (let i = 0; i < pad.buttons.length && i <= 17; i++) {
    const b = pad.buttons[i];
    if (b && (b.pressed || b.value >= TRIGGER_THRESHOLD)) {
      out.add(`gp:b${i}`);
    }
  }
  const lx = pad.axes[0] ?? 0;
  const ly = pad.axes[1] ?? 0;
  const rx = pad.axes[2] ?? 0;
  const ry = pad.axes[3] ?? 0;
  if (lx <= -STICK_DEADZONE) out.add("gp:ls-left");
  if (lx >= STICK_DEADZONE) out.add("gp:ls-right");
  if (ly <= -STICK_DEADZONE) out.add("gp:ls-up");
  if (ly >= STICK_DEADZONE) out.add("gp:ls-down");
  if (rx <= -STICK_DEADZONE) out.add("gp:rs-left");
  if (rx >= STICK_DEADZONE) out.add("gp:rs-right");
  if (ry <= -STICK_DEADZONE) out.add("gp:rs-up");
  if (ry >= STICK_DEADZONE) out.add("gp:rs-down");
  return out;
}

/** Poll every connected browser gamepad and return active input codes + count. */
export function pollConnectedGamepads(): { codes: Set<string>; count: number; firstId: string | null } {
  const codes = new Set<string>();
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return { codes, count: 0, firstId: null };
  }
  const pads = navigator.getGamepads();
  let count = 0;
  let firstId: string | null = null;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    count++;
    if (!firstId) firstId = pad.id;
    readGamepadInputs(pad, codes);
  }
  return { codes, count, firstId };
}

/** Best-effort detection of controller model from USB/Bluetooth device name. */
export function detectControllerModel(id: string): ControllerModel {
  const s = id.toLowerCase();
  if (s.includes("dualsense") || s.includes("ps5") || s.includes("0ce6")) return "ps5";
  if (s.includes("dualshock") || s.includes("ps4") || s.includes("05c4") || s.includes("09cc")) return "ps4";
  if (s.includes("xbox") || s.includes("xinput") || s.includes("045e")) return "xbox";
  if (s.includes("nintendo") || s.includes("switch") || s.includes("joy-con") || s.includes("pro controller") || s.includes("057e")) {
    return "nintendo";
  }
  return "other";
}
