import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createLiveWorldPresentationAdapters, type WorldPresentationServices,
  type WorldPresentationState } from "../../src/app/world/world-presentation-adapters";
import { renderWorldFrame } from "../../src/presentation/world/world-frame";
import { createLiveHudFeedbackState } from "../../src/app/interface/hud-feedback-state";

vi.mock("../../src/presentation/world/world-frame", () => ({ renderWorldFrame: vi.fn() }));

describe("live world capture layers", () => {
  it("does not advance lag, pop, boss flash or pulse on repeated fixed-frame HUD draws", () => {
    const feedback = createLiveHudFeedbackState();
    feedback.set({ lagHp: 0.9, multiplier: 2, multiplierPop: 0.5 });
    const boss = { isBoss: true, hp: 100, maxHp: 100, _phaseFlashT: 0.5 };
    const worldHud = vi.fn(), chaseHud = vi.fn(); let screen = "playing";
    const state = {
      run: () => ({ mode: "endless", wave: 2, score: 0, runTime: 1, mult: 2, comboTimer: 1, spawnQueue: [], mods: { owned: {} } }),
      player: () => ({ hp: 79, maxHp: 100, dashCd: 0, shield: 0, maxShield: 0 }),
      enemies: () => [boss], bossIntro: () => null, hud: feedback.snapshot, advanceHud: feedback.advance,
      screen: () => screen, hudClockSeconds: feedback.clockSeconds, lastUiDelta: () => 1 / 60,
    } as unknown as WorldPresentationState;
    const services = {
      dependencies: { CONFIG, A11Y: { flashScale: 1 }, UPGRADES: [], UI: { t: { color: { accent: "#abc" } } } },
      chase: { hud: chaseHud }, world: { hud: worldHud }, stage: { current: { accent: "#abc" } }, formatTime: String,
      trickColor: () => "#fff", ease: (value: number) => value,
    } as unknown as WorldPresentationServices;
    const adapter = createLiveWorldPresentationAdapters(state, services);
    const before = feedback.snapshot();
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(600);
    try { adapter.drawHud(); adapter.drawHud(); expect(clock).not.toHaveBeenCalled(); } finally { clock.mockRestore(); }
    expect(feedback.snapshot()).toEqual(before);
    expect(boss._phaseFlashT).toBe(0.5);
    expect(worldHud.mock.calls[1]?.[0]).toEqual(worldHud.mock.calls[0]?.[0]);
    adapter.advanceHudFrame(1 / 60);
    expect(feedback.snapshot()).toEqual({ lagHp: 0.8923, multiplier: 2, multiplierPop: 0.44 });
    expect(feedback.clockSeconds()).toBe(1 / 60);
    expect(boss._phaseFlashT).toBe(0.5);
    adapter.drawHud();
    expect(worldHud.mock.calls[2]?.[0]).toMatchObject({ boss: { phaseFlash: 0.5 } });
    expect(chaseHud).toHaveBeenCalledTimes(3);
    for (const menu of ["draft", "reserve", "tierup", "paused"]) { screen = menu; adapter.drawHud(); }
    expect(chaseHud).toHaveBeenCalledTimes(3);
    screen = "playing"; adapter.drawHud(); expect(chaseHud).toHaveBeenCalledTimes(4);
    adapter.completeHudFrame(1 / 60);
    expect(boss._phaseFlashT).toBe(0.5 - 1 / 60);
  });
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
        GFX: { low: false }, THEME: { dark: false, ink: "#000" }, UI: { font: () => "12px monospace", density: { textScale: 1 } },
        FX: { draw: drawEffects, setViewRect: vi.fn() }, Backdrop: { draw: drawBackdrop }, cosmeticRandom: () => 0.5 },
      canvas: {}, width: 1600, height: 900, screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
      stage: { current: { id: "verdant-sanctum" }, platforms: [] },
      capturePolicy: () => ({ actors, debug: "exclude" }), tutorial: { active: true, drawGhost },
    } as unknown as WorldPresentationServices;
    vi.mocked(renderWorldFrame).mockImplementation((ports) => {
      expect(ports.playerX).toBe(137);
      expect(ports.player).toEqual(actors === "include" ? { x: 137, y: 500, halfWidth: 10, halfHeight: 20 } : undefined);
      ports.drawBackdrop(ports.stage, ports.timeSeconds, ports.playerX, { left: 0, top: 0, right: 1600, bottom: 900 });
      if (ports.tutorialActive) ports.drawTutorialGhost();
      ports.drawPlayer(); ports.drawBlade(); ports.drawEffects();
      return {} as ReturnType<typeof renderWorldFrame>;
    });

    createLiveWorldPresentationAdapters(state, services).renderWorld();

    expect(drawBackdrop.mock.calls[0]?.[3]).toBe(137);
    for (const draw of [drawPlayer, drawBlade, drawGhost, drawEffects]) {
      expect(draw).toHaveBeenCalledTimes(actors === "include" ? 1 : 0);
    }
  });
});
