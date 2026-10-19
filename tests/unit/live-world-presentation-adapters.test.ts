import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createLiveWorldPresentationAdapters, type WorldPresentationServices,
  type WorldPresentationState } from "../../src/app/live-world-presentation-adapters";
import { renderLegacyWorldFrame } from "../../src/presentation/world/legacy-world-frame";

vi.mock("../../src/presentation/world/legacy-world-frame", () => ({ renderLegacyWorldFrame: vi.fn() }));

describe("live world capture layers", () => {
  it.each(["include", "exclude"] as const)("preserves physical backdrop input with actors %s", (actors) => {
    const drawPlayer = vi.fn(), drawBlade = vi.fn(), drawGhost = vi.fn(), drawBackdrop = vi.fn(), drawEffects = vi.fn();
    const player = { x: 137, y: 500, hw: 10, hh: 20, draw: drawPlayer };
    const state = {
      run: () => ({ mode: "tutorial" }), player: () => player, blade: () => ({ draw: drawBlade }),
      enemies: () => [], projectiles: () => [], floaters: () => [], slowZones: () => [], temporaryWalls: () => [],
      screen: () => "playing", zoom: () => 1, shake: () => 0,
    } as unknown as WorldPresentationState;
    const services = {
      dependencies: { CONFIG, CLOCK: { sim: 1 }, A11Y: { reducedMotion: false, highContrast: false, flashScale: 1 },
        GFX: { low: false }, THEME: { dark: false, ink: "#000" }, UI: { font: () => "12px monospace" },
        FX: { draw: drawEffects, setViewRect: vi.fn() }, Backdrop: { draw: drawBackdrop }, cosmeticRandom: () => 0.5 },
      canvas: {}, width: 1600, height: 900, screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
      stage: { current: { id: "verdant-sanctum" }, platforms: [] },
      capturePolicy: () => ({ actors, debug: "exclude" }), tutorial: { active: true, drawGhost },
    } as unknown as WorldPresentationServices;
    vi.mocked(renderLegacyWorldFrame).mockImplementation((ports) => {
      expect(ports.playerX).toBe(137);
      expect(ports.player).toEqual(actors === "include" ? { x: 137, y: 500, halfWidth: 10, halfHeight: 20 } : undefined);
      ports.drawBackdrop(ports.stage, ports.timeSeconds, ports.playerX, { left: 0, top: 0, right: 1600, bottom: 900 });
      if (ports.tutorialActive) ports.drawTutorialGhost();
      ports.drawPlayer(); ports.drawBlade(); ports.drawEffects();
      return {} as ReturnType<typeof renderLegacyWorldFrame>;
    });

    createLiveWorldPresentationAdapters(state, services).renderWorld();

    expect(drawBackdrop.mock.calls[0]?.[3]).toBe(137);
    for (const draw of [drawPlayer, drawBlade, drawGhost, drawEffects]) {
      expect(draw).toHaveBeenCalledTimes(actors === "include" ? 1 : 0);
    }
  });
});
