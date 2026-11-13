import { FISH_H, FISH_W, fishById, fishPixels, releaseReward } from "@/game/fishing";
import type { HudState } from "@/game/engine";
import { GameButton } from "./GameButton";

export function FishIcon({ id, size = 40 }: { id: string; size?: number }) {
  const sp = fishById(id);
  if (!sp) return null;
  const w = FISH_W + 2;
  const h = FISH_H + 2;
  return (
    <svg width={(size * w) / h} height={size} viewBox={`-1 -1 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      {fishPixels(sp).map(([x, y, c], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={c} />
      ))}
    </svg>
  );
}

export function InventoryPanel({
  hud,
  onRelease,
  onClose,
}: {
  hud: HudState;
  onRelease: (id: string) => void;
  onClose: () => void;
}) {
  const slots = 8;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Fish bag"
        className="pixel-panel w-[min(92%,560px)] px-5 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm text-accent">Fish bag</h2>
          <GameButton onClick={onClose} className="text-xl text-muted-foreground hover:text-foreground">
            close · I
          </GameButton>
        </div>
        <p className="mt-1 text-xl text-muted-foreground">{hud.scene !== "forest" ? "The sky is outside." : hud.inventory.length ? `${hud.coins} coins` : "Your bag is empty."}</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {Array.from({ length: Math.max(slots, hud.inventory.length) }, (_, i) => {
            const item = hud.inventory[i];
            if (!item) return <div key={i} className="aspect-square border-[3px] border-border bg-muted/60" />;
            return (
              <GameButton
                key={item.id}
                onClick={() => onRelease(item.id)}
                disabled={hud.scene !== "forest" || hud.releasing}
                className="group relative flex aspect-square flex-col items-center justify-center gap-1 border-[3px] border-border bg-muted p-1 transition-transform hover:-translate-y-1 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Release ${item.name}`}
                title={`Release ${item.name} · +${releaseReward(item.id)} coins`}
              >
                <span className="group-hover:animate-bob">
                  <FishIcon id={item.id} size={30} />
                </span>
                <span className="text-center text-base leading-none text-foreground">{item.name}</span>
                <span className="text-sm text-accent">+{releaseReward(item.id)} ◉</span>
                {item.count > 1 && (
                  <span className="absolute right-1 top-0 font-display text-[9px] text-accent">×{item.count}</span>
                )}
              </GameButton>
            );
          })}
        </div>
        <div className="mt-3 flex justify-between text-lg text-muted-foreground">
          <span>Caught: {hud.fishCaught}</span>
          <span>Set free: {hud.fishReleased}</span>
        </div>
      </div>
    </div>
  );
}
