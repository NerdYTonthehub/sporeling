// Player settings: sound + key bindings. Pure helpers; persisted to localStorage by the UI.

export type Action = "left" | "right" | "up" | "down" | "jump" | "act" | "attack" | "bag" | "dash";

export const ACTIONS: { id: Action; label: string }[] = [
  { id: "left", label: "Walk left" },
  { id: "right", label: "Walk right" },
  { id: "up", label: "Up · jump / walk up indoors" },
  { id: "down", label: "Down · drop / walk down indoors" },
  { id: "jump", label: "Jump · reel in a fish" },
  { id: "act", label: "Use · eat, talk, fish, enter" },
  { id: "attack", label: "Attack · swing wooden sword" },
  { id: "dash", label: "Dash · Spore Spring" },
  { id: "bag", label: "Open fish bag" },
];

export type KeyBinds = Record<Action, [string | null, string | null]>;

export const DEFAULT_KEYS: KeyBinds = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  jump: ["Space", null],
  act: ["KeyE", "Enter"],
  attack: ["KeyF", "KeyJ"],
  dash: ["ShiftLeft", "KeyC"],
  bag: ["KeyI", "Tab"],
};

/** Escape and P always open/close menus and can't be bound. */
export const RESERVED_KEYS = ["Escape", "KeyP"];
export const RESERVED_PAD_KEYS = ["gp:b9"];

export type ControllerModel = "ps5" | "ps4" | "xbox" | "nintendo" | "other";

export const CONTROLLER_MODELS: { id: ControllerModel; label: string }[] = [
  { id: "ps5", label: "PS5" },
  { id: "ps4", label: "PS4" },
  { id: "xbox", label: "Xbox" },
  { id: "nintendo", label: "Nintendo" },
  { id: "other", label: "Övrigt" },
];

export const DEFAULT_PAD_KEYS: KeyBinds = {
  left: ["gp:ls-left", "gp:b14"],
  right: ["gp:ls-right", "gp:b15"],
  up: ["gp:ls-up", "gp:b12"],
  down: ["gp:ls-down", "gp:b13"],
  jump: ["gp:b0", null],
  act: ["gp:b2", "gp:b1"],
  attack: ["gp:b3", "gp:b5"],
  dash: ["gp:b7", "gp:b4"],
  bag: ["gp:b8", null],
};

export interface Settings {
  sound: boolean;
  /** background music (cozy forest / scary dungeon) */
  music: boolean;
  volume: number; // 0..1
  keys: KeyBinds;
  controllerModel: ControllerModel;
  padKeys: KeyBinds;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  volume: 0.8,
  keys: DEFAULT_KEYS,
  controllerModel: "ps5",
  padKeys: DEFAULT_PAD_KEYS,
};

export const SETTINGS_STORAGE_KEY = "sporeling-settings";

/** Bind `code` to action/slot. The same key is removed from any other action so keys never clash. */
export function rebind(keys: KeyBinds, action: Action, slot: 0 | 1, code: string | null, reserved: readonly string[] = RESERVED_KEYS): KeyBinds {
  if (code && reserved.includes(code)) return keys;
  const next = {} as KeyBinds;
  for (const a of Object.keys(keys) as Action[]) {
    const pair = [...keys[a]] as [string | null, string | null];
    if (code) {
      if (pair[0] === code) pair[0] = null;
      if (pair[1] === code) pair[1] = null;
    }
    next[a] = pair;
  }
  next[action][slot] = code;
  return next;
}

export function rebindPad(keys: KeyBinds, action: Action, slot: 0 | 1, code: string | null): KeyBinds {
  return rebind(keys, action, slot, code, RESERVED_PAD_KEYS);
}

export function actionForCode(keys: KeyBinds, code: string): Action | null {
  for (const a of Object.keys(keys) as Action[]) {
    if (keys[a][0] === code || keys[a][1] === code) return a;
  }
  return null;
}

export function actionsForPadCodes(padKeys: KeyBinds, activeCodes: ReadonlySet<string>): Set<Action> {
  const active = new Set<Action>();
  if (activeCodes.size === 0) return active;
  for (const a of Object.keys(padKeys) as Action[]) {
    const [k0, k1] = padKeys[a];
    if ((k0 && activeCodes.has(k0)) || (k1 && activeCodes.has(k1))) active.add(a);
  }
  return active;
}

const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

export function keyLabel(code: string | null): string {
  if (!code) return "—";
  const arrow = ARROWS[code];
  if (arrow) return arrow;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  return code;
}

const PAD_AXIS_LABELS: Record<string, string> = {
  "gp:ls-left": "LS ←",
  "gp:ls-right": "LS →",
  "gp:ls-up": "LS ↑",
  "gp:ls-down": "LS ↓",
  "gp:rs-left": "RS ←",
  "gp:rs-right": "RS →",
  "gp:rs-up": "RS ↑",
  "gp:rs-down": "RS ↓",
  "gp:b12": "D ↑",
  "gp:b13": "D ↓",
  "gp:b14": "D ←",
  "gp:b15": "D →",
};

const PAD_MODEL_BUTTONS: Record<ControllerModel, Record<string, string>> = {
  ps5: {
    "gp:b0": "✕",
    "gp:b1": "○",
    "gp:b2": "□",
    "gp:b3": "△",
    "gp:b4": "L1",
    "gp:b5": "R1",
    "gp:b6": "L2",
    "gp:b7": "R2",
    "gp:b8": "Create",
    "gp:b9": "Options",
    "gp:b10": "L3",
    "gp:b11": "R3",
    "gp:b16": "PS",
    "gp:b17": "Touch",
  },
  ps4: {
    "gp:b0": "✕",
    "gp:b1": "○",
    "gp:b2": "□",
    "gp:b3": "△",
    "gp:b4": "L1",
    "gp:b5": "R1",
    "gp:b6": "L2",
    "gp:b7": "R2",
    "gp:b8": "Share",
    "gp:b9": "Options",
    "gp:b10": "L3",
    "gp:b11": "R3",
    "gp:b16": "PS",
    "gp:b17": "Touch",
  },
  xbox: {
    "gp:b0": "A",
    "gp:b1": "B",
    "gp:b2": "X",
    "gp:b3": "Y",
    "gp:b4": "LB",
    "gp:b5": "RB",
    "gp:b6": "LT",
    "gp:b7": "RT",
    "gp:b8": "View",
    "gp:b9": "Menu",
    "gp:b10": "LS",
    "gp:b11": "RS",
    "gp:b16": "Xbox",
  },
  nintendo: {
    "gp:b0": "B",
    "gp:b1": "A",
    "gp:b2": "Y",
    "gp:b3": "X",
    "gp:b4": "L",
    "gp:b5": "R",
    "gp:b6": "ZL",
    "gp:b7": "ZR",
    "gp:b8": "−",
    "gp:b9": "+",
    "gp:b10": "L3",
    "gp:b11": "R3",
    "gp:b16": "Home",
    "gp:b17": "Cap",
  },
  other: {
    "gp:b0": "B0",
    "gp:b1": "B1",
    "gp:b2": "B2",
    "gp:b3": "B3",
    "gp:b4": "L1/B4",
    "gp:b5": "R1/B5",
    "gp:b6": "L2/B6",
    "gp:b7": "R2/B7",
    "gp:b8": "Sel",
    "gp:b9": "Start",
    "gp:b10": "B10",
    "gp:b11": "B11",
    "gp:b16": "B16",
    "gp:b17": "B17",
  },
};

export function padButtonLabel(code: string | null, model: ControllerModel): string {
  if (!code) return "—";
  const axis = PAD_AXIS_LABELS[code];
  if (axis) return axis;
  const byModel = PAD_MODEL_BUTTONS[model]?.[code];
  if (byModel) return byModel;
  if (code.startsWith("gp:b")) return "B" + code.slice(4);
  return code;
}

/** First bound key of an action, for on-screen hints. */
export function primaryLabel(keys: KeyBinds, a: Action): string {
  return keyLabel(keys[a][0] ?? keys[a][1]);
}

function parseKeyMap(raw: unknown, fallback: KeyBinds): KeyBinds {
  const out = { ...fallback };
  if (raw && typeof raw === "object") {
    for (const a of Object.keys(fallback) as Action[]) {
      const v = (raw as Partial<KeyBinds>)[a];
      if (Array.isArray(v) && v.length === 2) out[a] = [typeof v[0] === "string" ? v[0] : null, typeof v[1] === "string" ? v[1] : null];
    }
  }
  return out;
}

export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    const validModels = new Set<ControllerModel>(["ps5", "ps4", "xbox", "nintendo", "other"]);
    const controllerModel: ControllerModel =
      typeof o.controllerModel === "string" && validModels.has(o.controllerModel as ControllerModel)
        ? (o.controllerModel as ControllerModel)
        : DEFAULT_SETTINGS.controllerModel;
    return {
      sound: typeof o.sound === "boolean" ? o.sound : DEFAULT_SETTINGS.sound,
      music: typeof o.music === "boolean" ? o.music : DEFAULT_SETTINGS.music,
      volume: typeof o.volume === "number" ? Math.max(0, Math.min(1, o.volume)) : DEFAULT_SETTINGS.volume,
      keys: parseKeyMap(o.keys, DEFAULT_KEYS),
      controllerModel,
      padKeys: parseKeyMap(o.padKeys, DEFAULT_PAD_KEYS),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
