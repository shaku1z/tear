/**
 * What play draws over the world, drawn once for the player and for a watcher (src/app/world/run-overlay.ts):
 * the run's layers for both, the player's own only for the player.
 */
import { describe, expect, it, vi } from "vitest";

import { createRunOverlay, type RunOverlayFrame, type RunOverlayPainters } from "../../src/app/world/run-overlay";
import type { OverlayViewer } from "../../src/app/world/overlay-audience";

const blend = (from: string, to: string, amount: number) => `${from}>${to}@${amount.toFixed(2)}`;

function drawn(viewer: OverlayViewer) {
  const fills: string[] = [],
    texts: [string, number, number][] = [];
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: (x: number, y: number, w: number, h: number) => fills.push([x, y, w, h].join(",")),
    fillText: (text: string, x: number, y: number) => texts.push([text, x, y]),
  } as unknown as CanvasRenderingContext2D;
  const paint = {
    backdropPost: vi.fn(),
    hud: vi.fn(),
    beatBanner: vi.fn(),
    scene: vi.fn(),
    touchControls: vi.fn(),
    waveBanner: vi.fn(),
    stageBanner: vi.fn(),
    reticle: vi.fn(),
    font: () => "12px sans-serif",
    trickColor: () => "#fc0",
  } satisfies RunOverlayPainters;
  const screen = { x: -100, y: 20, w: 1800, h: 860 };
  const frame: RunOverlayFrame = {
    context,
    screen,
    playing: true,
    interfaceShown: true,
    biome: true,
    cinema: { active: false, hideHud: false },
    parryFlash: 0.8,
    stageBeat: null,
    waveBannerSeconds: 0,
    stageBannerSeconds: 0,
    rankPopup: { seconds: 0.5, text: "STYLISH", multiplier: 3 },
    touchControls: true,
  };
  const overlay = createRunOverlay(viewer);
  overlay.draw(frame, paint);
  overlay.drawReticle(frame, paint);
  const background = overlay.background({
    biome: true,
    stageColor: "#123456",
    enemies: [{ whiteFlash: 0 }, { whiteFlash: 0.5 }],
    flashScale: 0.6,
    blend,
  });
  return { fills, texts, paint, background, screen };
}

describe("the run overlay", () => {
  it("draws the run's layers for a watcher and leaves the player's own out", () => {
    const player = drawn("player"),
      watcher = drawn("watcher");
    for (const { paint, screen } of [player, watcher]) {
      // The vignette covers the rectangle the frame is shown in, not the arena's box inside it.
      expect(paint.backdropPost).toHaveBeenCalledExactlyOnceWith(screen);
      expect(paint.hud).toHaveBeenCalledOnce();
      expect(paint.reticle).toHaveBeenCalledOnce();
    }
    // The parry's whole-screen flash and the touch controls are the player's.
    expect(player.fills).toEqual(["-100,20,1800,860"]);
    expect(watcher.fills).toEqual([]);
    expect(player.paint.touchControls).toHaveBeenCalledOnce();
    expect(watcher.paint.touchControls).not.toHaveBeenCalled();
    // The rank popup is the run's, centred on the rectangle the frame is shown in.
    expect(watcher.texts).toEqual([["STYLISH", 800, 310]]);
    expect(player.texts).toEqual(watcher.texts);
  });

  it("whitens the background while the Echo flashes, for the player and a watcher", () => {
    expect(drawn("player").background).toBe("#123456>#ffffff@0.30");
    expect(drawn("watcher").background).toBe("#123456>#ffffff@0.30");
  });
});
