import { useCallback, useEffect, useRef, useState } from "react";
import { Game, VIEW_H, type HudState, type Key } from "@/game/engine";
import { playMusic, setMusicMuted, setMusicVolume } from "@/game/music";
import { AUTOSAVE_SECONDS, SAVE_KEY, parseSave, type SaveData } from "@/game/save";
import { initAudio, setMuted, setVolume, sfx } from "@/game/sfx";
import { TOTAL_VILLAGES } from "@/game/world";
import { PixelIcon } from "./PixelIcon";
import { InventoryPanel } from "./Inventory";
import { GameButton } from "./GameButton";
import { SettingsPanel } from "./SettingsPanel";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, actionForCode, parseSettings, primaryLabel, type Settings } from "@/game/settings";

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
          <div key={i} className={`h-2 w-2 sm:h-4 sm:w-4 ${i < filled ? fill : dim}`} />
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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [menu, setMenu] = useState<"main" | "pause" | "settings" | null>("main");
  const [ready, setReady] = useState(false);
  const [savedGame, setSavedGame] = useState<SaveData | null>(null);
  const [saveNotice, setSaveNotice] = useState(false);
  const menuRef = useRef(menu);
  const settingsRef = useRef(settings);
  menuRef.current = menu;
  settingsRef.current = settings;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [touch, setTouch] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const invOpenRef = useRef(false);
  const startedRef = useRef(false);
  const deadRef = useRef(false);
  const sittingRef = useRef<HudState["sitting"]>(null);
  invOpenRef.current = invOpen;
  startedRef.current = started;
  deadRef.current = !!hud?.dead;
  sittingRef.current = hud?.sitting ?? null;

  useEffect(() => {
    try { setSettings(parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY))); } catch { /* Browser storage may be unavailable. */ }
    try { setSavedGame(parseSave(localStorage.getItem(SAVE_KEY))); } catch { /* Browser storage may be unavailable. */ }
    setReady(true);
  }, []);

  useEffect(() => {
    setMuted(!settings.sound);
    setVolume(settings.volume);
    setMusicMuted(!settings.music);
    setMusicVolume(settings.volume);
    gameRef.current?.setLabels({ act: primaryLabel(settings.keys, "act"), jump: primaryLabel(settings.keys, "jump"), down: primaryLabel(settings.keys, "down"), attack: primaryLabel(settings.keys, "attack") });
    if (ready) { try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Settings still work for this session. */ } }
  }, [settings, ready]);

  useEffect(() => {
    if (!started || hud?.dead) {
      playMusic(null);
      return;
    }
    playMusic(hud?.scene === "dungeon" ? "dungeon" : hud?.scene === "heaven" ? "heaven" : "forest");
  }, [started, hud?.dead, hud?.scene]);

  useEffect(() => {
    gameRef.current?.setPaused(menu !== null || invOpen);
    gameRef.current?.clearKeys();
  }, [menu, invOpen]);

  const saveGame = useCallback(() => {
    const g = gameRef.current;
    if (!g || !startedRef.current || deadRef.current) return false;
    const snap = g.snapshot();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snap));
      setSavedGame(snap);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!started || menu !== null || hud?.dead) return;
    const id = window.setInterval(() => {
      saveGame();
    }, AUTOSAVE_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [started, menu, hud?.dead, saveGame]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") saveGame();
    };
    const onUnload = () => saveGame();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [saveGame]);

  useEffect(() => {
    if (!saveNotice) return;
    const id = window.setTimeout(() => setSaveNotice(false), 2000);
    return () => window.clearTimeout(id);
  }, [saveNotice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const game = new Game(canvas, setHud);
    gameRef.current = game;
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
    const fit = () => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (!cw || !ch) return;
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
      if (e.code === "Escape") {
        e.preventDefault();
        game.clearKeys();
        if (invOpenRef.current) setInvOpen(false);
        else if (sittingRef.current) game.standUp();
        else if (menuRef.current === "settings") setMenu(startedRef.current ? "pause" : "main");
        else if (startedRef.current) setMenu(menuRef.current === "pause" ? null : "pause");
        return;
      }
      if (menuRef.current !== null || deadRef.current) return;
      if (sittingRef.current && e.key >= "1" && e.key <= "9") {
        const dest = sittingRef.current.destinations[Number(e.key) - 1];
        if (dest) {
          e.preventDefault();
          initAudio();
          game.teleportToVillage(dest.name);
          return;
        }
      }
      const action = actionForCode(settingsRef.current.keys, e.code);
      if (!action) return;
      e.preventDefault();
      initAudio();
      if (action === "bag") {
        if (e.repeat) return;
        game.clearKeys();
        setInvOpen((open) => !open);
      } else if (!invOpenRef.current) game.setKey(action, true);
    };
    const up = (e: KeyboardEvent) => {
      const action = actionForCode(settingsRef.current.keys, e.code);
      if (action && action !== "bag") game.setKey(action, false);
    };
    const blur = () => game.clearKeys();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      ro.disconnect();
      playMusic(null);
      game.destroy();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const start = useCallback(() => {
    initAudio();
    if (startedRef.current) gameRef.current?.start();
    else gameRef.current?.restart();
    setStarted(true);
    setMenu(null);
  }, []);

  const newGame = useCallback(() => {
    initAudio();
    setInvOpen(false);
    gameRef.current?.restart();
    setStarted(true);
    setMenu(null);
  }, []);

  const continueGame = useCallback(() => {
    if (!savedGame) return;
    initAudio();
    setInvOpen(false);
    gameRef.current?.loadSave(savedGame);
    setStarted(true);
    setMenu(null);
  }, [savedGame]);

  const restart = useCallback(() => {
    initAudio();
    setInvOpen(false);
    gameRef.current?.restart();
  }, []);

  const releaseFish = useCallback((id: string) => {
    initAudio();
    if (gameRef.current?.releaseFish(id)) setInvOpen(false);
  }, []);

  useEffect(() => {
    if (!hud?.dead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") restart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hud?.dead, restart]);

  const manualSave = () => {
    initAudio();
    sfx.menu();
    if (saveGame()) setSaveNotice(true);
  };

  const toggleMute = () => setSettings((current) => ({ ...current, sound: !current.sound }));
  const exitToMenu = () => {
    saveGame();
    gameRef.current?.stop();
    gameRef.current?.clearKeys();
    setStarted(false);
    setInvOpen(false);
    setSaveNotice(false);
    setMenu("main");
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

  const bagCount = hud ? hud.inventory.reduce((n, f) => n + f.count, 0) : 0;

  return (
    <main className="fixed inset-0 flex select-none items-center justify-center overflow-hidden bg-background">
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: box.w, height: box.h }}>
          <canvas ref={canvasRef} className="pixelated block h-full w-full" aria-label="Sporeling game world" data-ready={ready} />
          <div className="vignette pointer-events-none absolute inset-0" />

          {hud && started && (
            <>
              {/* Top-left vitals */}
              <div className="pixel-panel absolute left-2 top-2 flex flex-col gap-2 px-2 py-2 sm:left-3 sm:top-3 sm:px-3">
                <Bar value={hud.health} icon="heart" label="Health" fill="bg-health" dim="bg-health-dim" warn={hud.health < 25} />
                <Bar value={hud.hunger} icon="apple" label="Hunger" fill="bg-hunger" dim="bg-hunger-dim" warn={hud.hunger < 20} />
              </div>

              {/* Compact coin + utility bar */}
              <div className="pixel-panel absolute left-2 top-[76px] flex items-center gap-2.5 px-2.5 py-1.5 sm:left-3 sm:top-[100px] sm:gap-3 sm:px-3">
                <div aria-label={`${hud.coins} coins`} className="flex items-center gap-1.5 pr-0.5">
                  <PixelIcon name="coin" size={18} />
                  <span className="font-display text-xs tabular-nums text-accent drop-shadow-[2px_2px_0_var(--color-border)] sm:text-sm">
                    {hud.coins}
                  </span>
                </div>
                {hud.doubleJump && (
                  <span title="Double jump unlocked" aria-label="Double jump unlocked" className="text-lg leading-none text-secondary-foreground">
                    ↑↑
                  </span>
                )}
                <GameButton
                  variant="plain"
                  aria-label={`Open fish bag (${bagCount})`}
                  title="Fish bag (I / Tab)"
                  onClick={() => {
                    gameRef.current?.clearKeys();
                    setInvOpen((o) => !o);
                  }}
                  className="flex items-center gap-1 px-1 text-base leading-none text-foreground hover:text-accent"
                >
                  <PixelIcon name="bag" size={16} />
                  <span className="tabular-nums">{bagCount}</span>
                </GameButton>
                <GameButton
                  variant="plain"
                  onClick={toggleMute}
                  aria-label={settings.sound ? "Mute sound" : "Enable sound"}
                  className="px-1 text-base leading-none text-foreground hover:text-accent"
                >
                  {settings.sound ? "♪" : "♫×"}
                </GameButton>
                <GameButton aria-label="Pause game" onClick={() => setMenu("pause")} className="px-2 py-1 text-xs leading-none">
                  Ⅱ
                </GameButton>
              </div>
              {hud.coinPop && (
                <div key={hud.coinPop.id} className="animate-banner pointer-events-none absolute left-4 top-[138px] flex items-center gap-1.5 font-display text-sm text-accent drop-shadow-[2px_2px_0_var(--color-border)] sm:top-[152px]">
                  <PixelIcon name="coin" size={16} />
                  <span>+{hud.coinPop.amount}</span>
                </div>
              )}
              {hud.boss && <div className="pixel-panel absolute bottom-14 left-1/2 w-[min(80%,320px)] -translate-x-1/2 px-4 py-2 text-center"><div className="mb-2 font-display text-xs text-accent">{hud.boss.name}</div><div className="flex gap-1">{Array.from({ length: hud.boss.max }, (_, i) => <div key={i} className={`h-3 flex-1 ${i < (hud.boss?.hp ?? 0) ? "bg-health" : "bg-health-dim"}`} />)}</div></div>}

              {/* Village banner */}
              {hud.banner && !hud.dialog && !hud.dead && (
                <div key={hud.banner.title} className="animate-banner pointer-events-none absolute left-1/2 top-[24%] w-[92%] -translate-x-1/2 text-center">
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

              {/* Toast (fishing results etc.) */}
              {hud.toast && !hud.dialog && (
                <div key={hud.toast} className="pixel-panel pointer-events-none absolute left-1/2 top-[39%] w-max max-w-[92%] -translate-x-1/2 px-4 py-2 text-center text-xl text-foreground">
                  {hud.toast}
                </div>
              )}

              {/* Bite! */}
              {hud.fishing === "bite" && (
                <div className="animate-blink pointer-events-none absolute left-1/2 top-[40%] -translate-x-1/2 font-display text-2xl text-accent drop-shadow-[3px_3px_0_var(--color-border)]">
                  {primaryLabel(settings.keys, "jump").toUpperCase()}!
                </div>
              )}

              {/* Dialog */}
              {hud.dialog ? (
                <div className="pixel-panel absolute left-1/2 top-[20%] w-[min(92%,640px)] -translate-x-1/2 px-4 py-3">
                  <div className="font-display text-[11px] text-accent">{hud.dialog.name}</div>
                  <p className="mt-2 text-2xl leading-tight text-foreground">{hud.dialog.text}</p>
                  <div className="mt-1 text-right text-base text-muted-foreground">
                    {hud.dialog.page}/{hud.dialog.pages} · press {primaryLabel(settings.keys, "act")}
                  </div>
                </div>
              ) : (
                hud.prompt && (
                  <div className="pixel-panel absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-xl text-foreground">
                    {hud.prompt}
                  </div>
                )
              )}

              {hud.sitting && !hud.dead && !invOpen && menu === null && (
                <div className="pixel-panel absolute left-1/2 top-1/2 w-[min(92%,380px)] -translate-x-1/2 -translate-y-1/2 px-5 py-4 text-center">
                  <div className="font-display text-xs text-accent">Campfire travel · {hud.sitting.from}</div>
                  <p className="mt-1 text-base text-muted-foreground">Choose a village log to teleport to:</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {hud.sitting.destinations.map((dest, idx) => (
                      <GameButton
                        key={dest.name}
                        onClick={() => {
                          initAudio();
                          gameRef.current?.teleportToVillage(dest.name);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs"
                      >
                        <span>
                          {idx + 1}. {dest.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {dest.treetop ? "Treetop" : "Ground"}
                        </span>
                      </GameButton>
                    ))}
                  </div>
                  <GameButton
                    onClick={() => gameRef.current?.standUp()}
                    className="mt-3 w-full px-3 py-2 text-xs"
                  >
                    Stand up (ESC)
                  </GameButton>
                </div>
              )}

              {invOpen && !hud.dead && (
                <InventoryPanel hud={hud} onRelease={releaseFish} onClose={() => setInvOpen(false)} />
              )}

              {/* Game over */}
              {hud.dead && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="pixel-panel flex flex-col items-center gap-4 px-8 py-6 text-center">
                    <div className="font-display text-xl text-health sm:text-2xl">You wilted…</div>
                    <p className="max-w-xs text-xl text-foreground">
                      You found {hud.found} of {hud.total} villages and ate {hud.applesEaten} apples.
                    </p>
                    <GameButton onClick={restart} className="pixel-btn px-5 py-3 text-xs">
                      Sprout again
                    </GameButton>
                    <span className="text-base text-muted-foreground">or press R</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Menus */}
          {menu !== null && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60">
              {menu === "settings" ? <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setMenu(started ? "pause" : "main")} /> : (
                <div className="flex max-h-full flex-col items-center gap-3 overflow-y-auto px-6 py-4 text-center">
                  <div className="animate-bob"><PixelIcon name="shroom" size={48} /></div>
                  <h1 className="font-display text-2xl text-accent drop-shadow-[4px_4px_0_var(--color-border)] sm:text-4xl">{menu === "main" ? "SPORELING" : "Paused"}</h1>
                  {menu === "main" && savedGame ? (
                    <>
                      <GameButton disabled={!ready} onClick={continueGame} className="w-56 px-6 py-4 text-sm">
                        Continue
                      </GameButton>
                      <div className="text-base leading-none text-muted-foreground">
                        {savedGame.discovered.length}/{TOTAL_VILLAGES} villages · {savedGame.coins} coins
                      </div>
                      <GameButton disabled={!ready} onClick={newGame} className="w-56 px-6 py-3 text-xs">
                        New game
                      </GameButton>
                    </>
                  ) : (
                    <GameButton disabled={!ready} onClick={start} className="w-56 px-6 py-4 text-sm">{menu === "main" ? "Play" : "Resume"}</GameButton>
                  )}
                  {menu === "pause" && (
                    <GameButton onClick={manualSave} className="w-56 px-6 py-3 text-xs">
                      {saveNotice ? "Saved!" : "Save game"}
                    </GameButton>
                  )}
                  <GameButton onClick={() => setMenu("settings")} className="w-56 px-6 py-4 text-sm">Settings</GameButton>
                  {menu === "pause" && <GameButton onClick={exitToMenu} className="w-56 px-4 py-4 text-xs">Exit to main menu</GameButton>}
                </div>
              )}
            </div>
          )}

          {/* Touch controls */}
          {touch && started && !hud?.dead && menu === null && !invOpen && (
            <>
              <div className="absolute bottom-4 left-4 flex gap-2">
                <GameButton aria-label="Walk left" className="pixel-btn h-10 w-10 sm:h-14 sm:w-14 touch-none text-lg" {...hold("left")}>
                  ◀
                </GameButton>
                <GameButton aria-label="Walk right" className="pixel-btn h-10 w-10 sm:h-14 sm:w-14 touch-none text-lg" {...hold("right")}>
                  ▶
                </GameButton>
              </div>
              <div className="absolute bottom-4 right-4 flex gap-2">
                <GameButton
                  aria-label="Open fish bag"
                  className="pixel-btn h-10 w-10 sm:h-14 sm:w-14 touch-none text-xs"
                  onClick={() => setInvOpen((o) => !o)}
                >
                  ▤
                </GameButton>
                {hud?.scene === "room" && <><GameButton aria-label="Walk up" className="pixel-btn h-10 w-10 touch-none text-lg" {...hold("up")}>↑</GameButton><GameButton aria-label="Walk down" className="pixel-btn h-10 w-10 touch-none text-lg" {...hold("down")}>↓</GameButton></>}
                {hud?.scene !== "room" && <GameButton aria-label="Attack" className="pixel-btn h-10 w-10 touch-none text-lg" {...hold("attack")}>✦</GameButton>}
                <GameButton aria-label="Eat or talk" className="pixel-btn h-10 w-10 sm:h-14 sm:w-14 touch-none text-xs" {...hold("act")}>
                  E
                </GameButton>
                <GameButton aria-label="Jump" className="pixel-btn h-10 w-10 sm:h-14 sm:w-14 touch-none text-lg" {...hold("jump")}>
                  ▲
                </GameButton>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
