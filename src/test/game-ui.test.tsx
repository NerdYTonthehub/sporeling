import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameScreen } from "@/components/game/GameScreen";
import { AUTOSAVE_SECONDS, SAVE_KEY, SAVE_VERSION, type SaveData } from "@/game/save";
import * as music from "@/game/music";

const mockCtx = {
  fillStyle: "",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  imageSmoothingEnabled: false,
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  createPattern: vi.fn(() => null),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
};

const sampleSave: SaveData = {
  v: SAVE_VERSION,
  savedAt: 1000,
  x: 1350,
  y: 190,
  health: 80,
  hunger: 75,
  coins: 42,
  inventory: { minnow: 1 },
  fishCaught: 2,
  fishReleased: 1,
  applesEaten: 3,
  time: 60,
  doubleJump: false,
  dungeonCleared: false,
  discovered: ["Mossbottom"],
};

describe("GameScreen HUD, save, and music", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows Play without a save, removes top-right HUD, and starts forest music", () => {
    const playSpy = vi.spyOn(music, "playMusic");
    render(<GameScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(screen.queryByText(/villages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/apples eaten/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("0 coins")).toBeInTheDocument();
    expect(playSpy).toHaveBeenCalledWith("forest");
  });

  it("loads a saved game from Continue and supports manual + auto save", () => {
    vi.useFakeTimers();
    localStorage.setItem(SAVE_KEY, JSON.stringify(sampleSave));
    render(<GameScreen />);

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText("42 coins")).toBeInTheDocument();

    localStorage.removeItem(SAVE_KEY);
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_SECONDS * 1000);
    });
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Pause game" }));
    fireEvent.click(screen.getByRole("button", { name: "Save game" }));
    expect(screen.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
  });
});
