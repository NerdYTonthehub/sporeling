import { useEffect, useState } from "react";
import { detectControllerModel, pollConnectedGamepads } from "@/game/gamepad";
import {
  ACTIONS,
  CONTROLLER_MODELS,
  DEFAULT_SETTINGS,
  keyLabel,
  padButtonLabel,
  rebind,
  rebindPad,
  type Action,
  type Settings,
} from "@/game/settings";
import { initAudio, sfx } from "@/game/sfx";
import { GameButton } from "./GameButton";

export function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"keyboard" | "controller">("keyboard");
  const [binding, setBinding] = useState<{ mode: "keyboard" | "controller"; action: Action; slot: 0 | 1 } | null>(null);
  const [connectedPad, setConnectedPad] = useState<string | null>(null);

  useEffect(() => {
    const check = () => {
      const { firstId } = pollConnectedGamepads();
      setConnectedPad(firstId);
    };
    check();
    window.addEventListener("gamepadconnected", check);
    window.addEventListener("gamepaddisconnected", check);
    return () => {
      window.removeEventListener("gamepadconnected", check);
      window.removeEventListener("gamepaddisconnected", check);
    };
  }, []);

  useEffect(() => {
    if (!binding) return;
    if (binding.mode === "keyboard") {
      const capture = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code !== "Escape" && e.code !== "KeyP") {
          onChange({
            ...settings,
            keys: rebind(settings.keys, binding.action, binding.slot, e.code === "Backspace" || e.code === "Delete" ? null : e.code),
          });
        }
        setBinding(null);
      };
      window.addEventListener("keydown", capture, true);
      return () => window.removeEventListener("keydown", capture, true);
    }

    // Controller capture mode: poll gamepad + allow ESC cancel / Backspace clear
    const keyCancel = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setBinding(null);
      } else if (e.code === "Backspace" || e.code === "Delete") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onChange({ ...settings, padKeys: rebindPad(settings.padKeys, binding.action, binding.slot, null) });
        setBinding(null);
      }
    };
    window.addEventListener("keydown", keyCancel, true);

    // Require fresh press after opening capture so holding click/button doesn't auto-bind
    const initial = pollConnectedGamepads().codes;
    let armed = initial.size === 0;
    let raf = 0;
    const poll = () => {
      const { codes, firstId } = pollConnectedGamepads();
      setConnectedPad(firstId);
      if (!armed) {
        if (codes.size === 0) armed = true;
      } else {
        for (const code of codes) {
          if (code === "gp:b9") {
            setBinding(null);
            return;
          }
          onChange({ ...settings, padKeys: rebindPad(settings.padKeys, binding.action, binding.slot, code) });
          setBinding(null);
          return;
        }
      }
      raf = window.requestAnimationFrame(poll);
    };
    raf = window.requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("keydown", keyCancel, true);
      window.cancelAnimationFrame(raf);
    };
  }, [binding, settings, onChange]);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="pixel-panel game-settings max-h-[90vh] w-[min(94%,600px)] overflow-y-auto px-4 py-4 sm:px-6"
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-display text-base text-accent">Settings</h2>
        <GameButton onClick={onClose} aria-label="Back from settings" className="px-3 py-2 text-xs">
          ← Back
        </GameButton>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 border-b border-panel-edge/30 pb-3 text-xl">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(e) => onChange({ ...settings, sound: e.target.checked })}
            className="accent-accent"
          />
          Sound
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.music}
            onChange={(e) => onChange({ ...settings, music: e.target.checked })}
            className="accent-accent"
          />
          Music
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2">
          Volume
          <input
            aria-label="Sound volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.volume * 100)}
            onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) / 100 })}
            onPointerUp={() => {
              initAudio();
              sfx.menu();
            }}
            className="w-full min-w-0 accent-accent"
          />
          <span className="w-10 text-right">{Math.round(settings.volume * 100)}%</span>
        </label>
      </div>

      {/* Input device tabs: Dator (Keyboard) vs Kontroll (Controller) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <GameButton
            onClick={() => {
              setBinding(null);
              setTab("keyboard");
            }}
            aria-pressed={tab === "keyboard"}
            className={`px-3 py-2 text-[11px] ${tab === "keyboard" ? "ring-2 ring-accent text-accent" : "opacity-80"}`}
          >
            Dator · Keyboard
          </GameButton>
          <GameButton
            onClick={() => {
              setBinding(null);
              setTab("controller");
            }}
            aria-pressed={tab === "controller"}
            className={`px-3 py-2 text-[11px] ${tab === "controller" ? "ring-2 ring-accent text-accent" : "opacity-80"}`}
          >
            Kontroll · Controller {connectedPad ? "●" : ""}
          </GameButton>
        </div>
        {connectedPad && (
          <span className="text-sm text-accent">
            Connected: {connectedPad.slice(0, 22)}
            {connectedPad.length > 22 ? "…" : ""}
          </span>
        )}
      </div>

      {tab === "controller" && (
        <div className="mb-3 border border-panel-edge/30 bg-background/40 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-display text-[10px] text-accent">Kontrollmodell · Controller Model</span>
            {connectedPad && (
              <button
                type="button"
                onClick={() => onChange({ ...settings, controllerModel: detectControllerModel(connectedPad) })}
                className="text-sm text-accent underline hover:opacity-80"
              >
                Auto-detect
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Controller model">
            {CONTROLLER_MODELS.map((m) => (
              <GameButton
                key={m.id}
                onClick={() => onChange({ ...settings, controllerModel: m.id })}
                aria-checked={settings.controllerModel === m.id}
                role="radio"
                className={`px-2.5 py-1.5 text-[10px] ${
                  settings.controllerModel === m.id ? "ring-2 ring-accent text-accent" : "opacity-80"
                }`}
              >
                {m.label}
              </GameButton>
            ))}
          </div>
        </div>
      )}

      {tab === "keyboard" ? (
        <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 text-lg sm:grid-cols-[minmax(0,1fr)_80px_80px]">
          {ACTIONS.map(({ id, label }) => (
            <div key={id} className="contents">
              <span className="leading-tight">{label}</span>
              {([0, 1] as const).map((slot) => (
                <GameButton
                  key={slot}
                  aria-label={`Change ${label}, key ${slot + 1}`}
                  onClick={() => setBinding({ mode: "keyboard", action: id, slot })}
                  className="min-h-9 overflow-hidden px-1 py-2 font-body text-lg"
                >
                  {binding?.mode === "keyboard" && binding.action === id && binding.slot === slot
                    ? "…"
                    : keyLabel(settings.keys[id][slot])}
                </GameButton>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_68px_68px] items-center gap-2 text-lg sm:grid-cols-[minmax(0,1fr)_86px_86px]">
          {ACTIONS.map(({ id, label }) => (
            <div key={id} className="contents">
              <span className="leading-tight">{label}</span>
              {([0, 1] as const).map((slot) => (
                <GameButton
                  key={slot}
                  aria-label={`Change controller ${label}, slot ${slot + 1}`}
                  onClick={() => setBinding({ mode: "controller", action: id, slot })}
                  className="min-h-9 overflow-hidden px-1 py-2 font-body text-base"
                >
                  {binding?.mode === "controller" && binding.action === id && binding.slot === slot
                    ? "…"
                    : padButtonLabel(settings.padKeys[id][slot], settings.controllerModel)}
                </GameButton>
              ))}
            </div>
          ))}
        </div>
      )}

      <div aria-live="polite" className="my-3 min-h-6 text-center text-lg text-accent">
        {binding
          ? binding.mode === "keyboard"
            ? "Press a key · ESC/P cancels · Backspace clears"
            : "Press controller button or move stick · ESC cancels · Backspace clears"
          : tab === "controller"
            ? "Start / Options pauses game · ESC pause menu"
            : "P or ESC · pause menu"}
      </div>
      <GameButton
        onClick={() => {
          setBinding(null);
          onChange(DEFAULT_SETTINGS);
        }}
        className="w-full py-3 text-[10px]"
      >
        Reset controls & sound
      </GameButton>
    </section>
  );
}