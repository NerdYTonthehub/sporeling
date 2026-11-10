import { useCallback, useEffect, useRef, useState } from "react";
import { Game, VIEW_H, type HudState, type Key } from "@/game/engine";
import { initAudio, setMuted } from "@/game/sfx";
import { PixelIcon } from "./PixelIcon";

const KEYMAP: Record<string, Key> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "jump",
  w: "jump",
  W: "jump",
  " ": "jump",
  ArrowDown: "down",
  s: "down",
  S: "down",
  e: "act",
  E: "act",
  f: "act",
  F: "act",
  Enter: "act",
};

function Bar({ value, icon, label, fill, dim, warn }: { value: number; icon: "heart" | "apple"; label: string; fill: string; dim: string; warn?: boolean }) {
  const segments = 10;
  const filled = Math.ceil((value / 100) * segments);
  return (
    <div className="flex items-center gap-2" aria-label={`${label} ${Math.round(value)} of 100`}>
      <span className={warn ? "animate-blink" : undefined}>
        <PixelIcon name={icon} size={20} />
      </span>
      <div className="flex gap-[2px] border-[3px] border-border bg-border p-[2px]">
        {Array.from({ length: segments }, (_, i) => (
          <div key={i} className={`h-3 w-3 sm:h-4 sm:w-4 ${i < filled ? fill : dim}`} />
        ))}
      </div>
    </div>
  );
}

export function GameScreen() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const game = new Game(canvas, setHud);
    gameRef.current = game;
    const fit = () => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      const internalW = Math.max(280, Math.min(560, Math.round((VIEW_H * cw) / ch)));
      game.resize(internalW);
      const scale = Math.min(cw / internalW, ch / VIEW_H);
      setBox({ w: Math.floor(internalW * scale), h: Math.floor(VIEW_H * scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    game.mount();
    setTouch(window.matchMedia("(pointer: coarse)").matches);

    const down = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      game.setKey(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      game.setKey(k, false);
    };
    const blur = () => game.clearKeys();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      ro.disconnect();
      game.destroy();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const start = useCallback(() => {
    initAudio();
    gameRef.current?.start();
    setStarted(true);
  }, []);

  const restart = useCallback(() => {
    initAudio();
    gameRef.current?.restart();
  }, []);

  useEffect(() => {
    if (started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, start]);

  useEffect(() => {
    if (!hud?.dead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hud?.dead, restart]);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const hold = (k: Key) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      initAudio();
      gameRef.current?.setKey(k, true);
    },
    onPointerUp: () => gameRef.current?.setKey(k, false),
    onPointerLeave: () => gameRef.current?.setKey(k, false),
    onPointerCancel: () => gameRef.current?.setKey(k, false),
  });

  return (
    <main className="fixed inset-0 flex select-none items-center justify-center overflow-hidden bg-background">
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className="pixelated block h-full w-full" aria-label="Sporeling game world" />
          <div className="vignette pointer-events-none absolute inset-0" />

          {hud && started && (
            <>
              {/* Top-left vitals */}
              <div className="pixel-panel absolute left-3 top-3 flex flex-col gap-2 px-3 py-2">
                <Bar value={hud.health} icon="heart" label="Health" fill="bg-health" dim="bg-health-dim" warn={hud.health < 25} />
                <Bar value={hud.hunger} icon="apple" label="Hunger" fill="bg-hunger" dim="bg-hunger-dim" warn={hud.hunger < 20} />
              </div>

              {/* Top-right exploration */}
              <div className="pixel-panel absolute right-3 top-3 flex flex-col items-end gap-1 px-3 py-2 text-right">
                <div className="flex items-center gap-2 font-display text-[10px] text-foreground">
                  <PixelIcon name="shroom" size={16} />
                  <span>
                    {hud.found}/{hud.total} villages
                  </span>
                </div>
                {hud.compass ? (
                  <div className="text-lg leading-none text-accent">
                    {hud.compass.dir < 0 ? "◀ " : ""}
                    {hud.compass.name} · {hud.compass.steps} steps
                    {hud.compass.dir > 0 ? " ▶" : ""}
                  </div>
                ) : (
                  <div className="text-lg leading-none text-accent">Every village found!</div>
                )}
                <div className="flex items-center gap-3 text-base leading-none text-muted-foreground">
                  <span>{hud.timeOfDay}</span>
                  <span>·</span>
                  <span>{hud.applesEaten} apples eaten</span>
                  <button onClick={toggleMute} className="text-foreground underline-offset-2 hover:underline">
                    {muted ? "sound off" : "sound on"}
                  </button>
                </div>
              </div>

              {/* Village banner */}
              {hud.banner && (
                <div key={hud.banner.title} className="animate-banner pointer-events-none absolute left-1/2 top-[18%] -translate-x-1/2 text-center">
                  <div className="font-display text-xl text-accent drop-shadow-[3px_3px_0_var(--color-border)] sm:text-3xl">
                    {hud.banner.title}
                  </div>
                  <div className="mt-2 text-xl text-foreground drop-shadow-[2px_2px_0_var(--color-border)]">{hud.banner.sub}</div>
                </div>
              )}

              {/* Starving warning */}
              {hud.starving && !hud.dead && (
                <div className="animate-blink pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 font-display text-xs text-health drop-shadow-[2px_2px_0_var(--color-border)]">
                  You're starving! Find an apple tree.
                </div>
              )}

              {/* Dialog */}
              {hud.dialog ? (
                <div className="pixel-panel absolute bottom-4 left-1/2 w-[min(92%,640px)] -translate-x-1/2 px-4 py-3">
                  <div className="font-display text-[11px] text-accent">{hud.dialog.name}</div>
                  <p className="mt-2 text-2xl leading-tight text-foreground">{hud.dialog.text}</p>
                  <div className="mt-1 text-right text-base text-muted-foreground">
                    {hud.dialog.page}/{hud.dialog.pages} · press E
                  </div>
                </div>
              ) : (
                hud.prompt && (
                  <div className="pixel-panel absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-xl text-foreground">
                    {hud.prompt}
                  </div>
                )
              )}

              {/* Game over */}
              {hud.dead && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="pixel-panel flex flex-col items-center gap-4 px-8 py-6 text-center">
                    <div className="font-display text-xl text-health sm:text-2xl">You wilted…</div>
                    <p className="max-w-xs text-xl text-foreground">
                      You found {hud.found} of {hud.total} villages and ate {hud.applesEaten} apples.
                    </p>
                    <button onClick={restart} className="pixel-btn px-5 py-3 text-xs">
                      Sprout again
                    </button>
                    <span className="text-base text-muted-foreground">or press R</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Title screen */}
          {!started && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40">
              <div className="flex flex-col items-center gap-5 px-6 text-center">
                <div className="animate-bob">
                  <PixelIcon name="shroom" size={56} />
                </div>
                <h1 className="font-display text-3xl text-accent drop-shadow-[4px_4px_0_var(--color-border)] sm:text-5xl">
                  SPORELING
                </h1>
                <p className="max-w-md text-2xl leading-tight text-foreground drop-shadow-[2px_2px_0_var(--color-border)]">
                  You are very small. The forest is very big. Find the hidden mushroom villages, and don't forget to eat.
                </p>
                <button onClick={start} className="pixel-btn px-6 py-4 text-sm">
                  Start
                </button>
                <div className="pixel-panel grid grid-cols-2 gap-x-6 gap-y-1 px-4 py-3 text-left text-xl text-foreground">
                  <span className="text-accent">← → / A D</span>
                  <span>walk</span>
                  <span className="text-accent">Space / W</span>
                  <span>jump</span>
                  <span className="text-accent">S / ↓</span>
                  <span>drop down</span>
                  <span className="text-accent">E</span>
                  <span>eat · talk</span>
                </div>
              </div>
            </div>
          )}

          {/* Touch controls */}
          {touch && started && !hud?.dead && (
            <>
              <div className="absolute bottom-4 left-4 flex gap-3">
                <button aria-label="Walk left" className="pixel-btn h-14 w-14 touch-none text-lg" {...hold("left")}>
                  ◀
                </button>
                <button aria-label="Walk right" className="pixel-btn h-14 w-14 touch-none text-lg" {...hold("right")}>
                  ▶
                </button>
              </div>
              <div className="absolute bottom-4 right-4 flex gap-3">
                <button aria-label="Eat or talk" className="pixel-btn h-14 w-14 touch-none text-xs" {...hold("act")}>
                  E
                </button>
                <button aria-label="Jump" className="pixel-btn h-14 w-14 touch-none text-lg" {...hold("jump")}>
                  ▲
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
