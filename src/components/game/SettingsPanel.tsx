import { useEffect, useState } from "react";
import { ACTIONS, DEFAULT_SETTINGS, keyLabel, rebind, type Action, type Settings } from "@/game/settings";
import { initAudio, sfx } from "@/game/sfx";
import { GameButton } from "./GameButton";

export function SettingsPanel({ settings, onChange, onClose }: { settings: Settings; onChange: (settings: Settings) => void; onClose: () => void }) {
  const [binding, setBinding] = useState<{ action: Action; slot: 0 | 1 } | null>(null);
  useEffect(() => {
    if (!binding) return;
    const capture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== "Escape") onChange({ ...settings, keys: rebind(settings.keys, binding.action, binding.slot, e.code === "Backspace" || e.code === "Delete" ? null : e.code) });
      setBinding(null);
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [binding, settings, onChange]);

  return (
    <section role="dialog" aria-modal="true" aria-label="Settings" className="pixel-panel game-settings w-[min(94%,580px)] overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-base text-accent">Settings</h2>
        <GameButton onClick={onClose} aria-label="Back from settings" className="px-3 py-2 text-xs">← Back</GameButton>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-panel-edge/30 pb-4 text-xl">
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.sound} onChange={(e) => onChange({ ...settings, sound: e.target.checked })} className="accent-accent" />Sound</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.music} onChange={(e) => onChange({ ...settings, music: e.target.checked })} className="accent-accent" />Music</label>
        <label className="flex min-w-0 flex-1 items-center gap-2">Volume<input aria-label="Sound volume" type="range" min="0" max="100" value={Math.round(settings.volume * 100)} onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) / 100 })} onPointerUp={() => { initAudio(); sfx.menu(); }} className="w-full min-w-0 accent-accent" /><span className="w-10 text-right">{Math.round(settings.volume * 100)}%</span></label>
      </div>
      <h3 className="mb-2 font-display text-xs text-accent">Controls</h3>
      <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-2 text-lg sm:grid-cols-[minmax(0,1fr)_80px_80px]">
        {ACTIONS.map(({ id, label }) => <div key={id} className="contents"><span className="leading-tight">{label}</span>{([0, 1] as const).map((slot) => <GameButton key={slot} aria-label={`Change ${label}, key ${slot + 1}`} onClick={() => setBinding({ action: id, slot })} className="min-h-9 overflow-hidden px-1 py-2 font-body text-lg">{binding?.action === id && binding.slot === slot ? "…" : keyLabel(settings.keys[id][slot])}</GameButton>)}</div>)}
      </div>
      <div aria-live="polite" className="my-3 min-h-6 text-center text-lg text-accent">{binding ? "Press a key · ESC cancels · Backspace clears" : "ESC · pause menu"}</div>
      <GameButton onClick={() => { setBinding(null); onChange(DEFAULT_SETTINGS); }} className="w-full py-3 text-[10px]">Reset controls & sound</GameButton>
    </section>
  );
}