// Player settings: sound + key bindings. Pure helpers; persisted to localStorage by the UI.

export type Action = "left" | "right" | "up" | "down" | "jump" | "act" | "attack" | "bag";

export const ACTIONS: { id: Action; label: string }[] = [
  { id: "left", label: "Walk left" },
  { id: "right", label: "Walk right" },
  { id: "up", label: "Up · jump / walk up indoors" },
  { id: "down", label: "Down · drop / walk down indoors" },
  { id: "jump", label: "Jump · reel in a fish" },
  { id: "act", label: "Use · eat, talk, fish, enter" },
  { id: "attack", label: "Attack · spore puff" },
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
  bag: ["KeyI", "Tab"],
};

/** Escape always opens/closes menus and can't be bound. */
export const RESERVED_KEYS = ["Escape"];

export interface Settings {
  sound: boolean;
  volume: number; // 0..1
  keys: KeyBinds;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, volume: 0.8, keys: DEFAULT_KEYS };

export const SETTINGS_STORAGE_KEY = "sporeling-settings";

/** Bind `code` to action/slot. The same key is removed from any other action so keys never clash. */
export function rebind(keys: KeyBinds, action: Action, slot: 0 | 1, code: string | null): KeyBinds {
  if (code && RESERVED_KEYS.includes(code)) return keys;
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

export function actionForCode(keys: KeyBinds, code: string): Action | null {
  for (const a of Object.keys(keys) as Action[]) {
    if (keys[a][0] === code || keys[a][1] === code) return a;
  }
  return null;
}

const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

export function keyLabel(code: string | null): string {
  if (!code) return "—";
  if (ARROWS[code]) return ARROWS[code]!;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  return code;
}

/** First bound key of an action, for on-screen hints. */
export function primaryLabel(keys: KeyBinds, a: Action): string {
  return keyLabel(keys[a][0] ?? keys[a][1]);
}

export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const o = JSON.parse(raw) as Partial<Settings>;
    const keys = { ...DEFAULT_KEYS };
    if (o.keys && typeof o.keys === "object") {
      for (const a of Object.keys(DEFAULT_KEYS) as Action[]) {
        const v = (o.keys as Partial<KeyBinds>)[a];
        if (Array.isArray(v) && v.length === 2) keys[a] = [v[0] ?? null, v[1] ?? null];
      }
    }
    return {
      sound: typeof o.sound === "boolean" ? o.sound : DEFAULT_SETTINGS.sound,
      volume: typeof o.volume === "number" ? Math.max(0, Math.min(1, o.volume)) : DEFAULT_SETTINGS.volume,
      keys,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
