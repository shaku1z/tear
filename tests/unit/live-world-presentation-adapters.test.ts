import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import {
  createLiveWorldPresentationAdapters,
  type WorldPresentationServices,
  type WorldPresentationState,
} from "../../src/app/world/world-presentation-adapters";
import { renderWorldFrame } from "../../src/presentation/world/world-frame";
import { createLiveHudFeedbackState } from "../../src/app/interface/hud-feedback-state";

vi.mock("../../src/presentation/world/world-frame", () => ({ renderWorldFrame: vi.fn() }));

describe("live world capture layers", () => {
  it("does not advance lag, pop, boss flash or pulse on repeated fixed-frame HUD draws", () => {
    const feedback = createLiveHudFeedbackState();
    feedback.set({ lagHp: 0.9, multiplier: 2, multiplierPop: 0.5 });
    const boss = { isBoss: true, hp: 100, maxHp: 100, _phaseFlashT: 0.5 };
    const worldHud = vi.fn(),
      lowHealthScreen = vi.fn(),
      chaseHud = vi.fn();
    let screen = "playing";
    const state = {
      run: () => ({
        mode: "endless",
        wave: 2,
        score: 0,
        runTime: 1,
        mult: 2,
        comboTimer: 1,
        spawnQueue: [],
        mods: { owned: {} },
      }),
      player: () => ({ hp: 79, maxHp: 100, dashCd: 0, shield: 0, maxShield: 0 }),
      enemies: () => [boss],
      bossIntro: () => null,
      hud: feedback.snapshot,
      advanceHud: feedback.advance,
      screen: () => screen,
      hudClockSeconds: feedback.clockSeconds,
      lastUiDelta: () => 1 / 60,
    } as unknown as WorldPresentationState;
    const services = {
      player: { chase: { hud: chaseHud } },
      dependencies: { CONFIG, A11Y: { flashScale: 1 }, UPGRADES: [], UI: { t: { color: { accent: "#abc" } } } },
      world: { hud: worldHud, lowHealthScreen },
      stage: { current: { accent: "#abc" } },
      formatTime: String,
      trickColor: () => "#fff",
      ease: (value: number) => value,
    } as unknown as WorldPresentationServices;
    const adapter = createLiveWorldPresentationAdapters(state, services);
    const before = feedback.snapshot();
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(600);
    try {
      adapter.drawHud();
      adapter.drawHud();
      expect(clock).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
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
    // Live play is the player's view: it draws the low-health layer (which draws nothing above a quarter).
    expect(lowHealthScreen).toHaveBeenCalledTimes(3);
    for (const menu of ["draft", "reserve", "tierup", "paused"]) {
      screen = menu;
      adapter.drawHud();
    }
    expect(chaseHud).toHaveBeenCalledTimes(3);
    screen = "playing";
    adapter.drawHud();
    expect(chaseHud).toHaveBeenCalledTimes(4);
    adapter.completeHudFrame(1 / 60);
    expect(boss._phaseFlashT).toBe(0.5 - 1 / 60);
  });
  it.each(["include", "exclude"] as const)("preserves physical backdrop input with actors %s", (actors) => {
    const drawPlayer = vi.fn(),
      drawBlade = vi.fn(),
      drawGhost = vi.fn(),
      drawBackdrop = vi.fn(),
      drawEffects = vi.fn(),
      show = vi.fn();
    const player = { x: 137, y: 500, hw: 10, hh: 20, draw: drawPlayer };
    const state = {
      run: () => ({ mode: "tutorial" }),
      player: () => player,
      blade: () => ({ draw: drawBlade }),
      enemies: () => [],
      projectiles: () => [],
      floaters: () => [],
      slowZones: () => [],
      temporaryWalls: () => [],
      screen: () => "playing",
      zoom: () => 1,
      shake: () => 0,
    } as unknown as WorldPresentationState;
    const services = {
      player: { tutorial: { active: true, drawGhost } },
      dependencies: {
        CONFIG,
        CLOCK: { sim: 1 },
        A11Y: { reducedMotion: false, highContrast: false, flashScale: 1 },
        GFX: { low: false },
        THEME: { dark: false, ink: "#000" },
        UI: { font: () => "12px monospace", density: { textScale: 1 } },
        FX: { draw: drawEffects, setViewRect: vi.fn() },
        Backdrop: { draw: drawBackdrop },
        Scenes: { show, opaque: () => false, drawBack: () => undefined },
        cosmeticRandom: () => 0.5,
      },
      canvas: {},
      width: 1600,
      height: 900,
      screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
      stage: { current: { id: "verdant-sanctum" }, platforms: [] },
      capturePolicy: () => ({ actors, debug: "exclude" }),
    } as unknown as WorldPresentationServices;
    vi.mocked(renderWorldFrame).mockImplementation((ports) => {
      expect(ports.playerX).toBe(137);
      expect(ports.player).toEqual(
        actors === "include" ? { x: 137, y: 500, halfWidth: 10, halfHeight: 20 } : undefined,
      );
      ports.drawBackdrop(
        ports.stage,
        ports.timeSeconds,
        ports.playerX,
        { left: 0, top: 0, right: 1600, bottom: 900 },
        { cx: 800, cy: 450, ox: 0, oy: 0, scale: 1 },
      );
      if (ports.tutorialActive) ports.drawTutorialGhost();
      ports.drawPlayer();
      ports.drawBlade();
      ports.drawEffects();
      return {} as ReturnType<typeof renderWorldFrame>;
    });

    createLiveWorldPresentationAdapters(state, services).renderWorld();

    expect(drawBackdrop.mock.calls[0]?.[3]).toBe(137);
    // The world showing a stage is what loads that stage's painted background.
    expect(show).toHaveBeenCalledWith("verdant-sanctum");
    for (const draw of [drawPlayer, drawBlade, drawGhost, drawEffects]) {
      expect(draw).toHaveBeenCalledTimes(actors === "include" ? 1 : 0);
    }
  });
  it("draws the player's own layers for the player and leaves them out for a watcher", () => {
    const frame = (forPlayer: boolean) => {
      const lowHealthScreen = vi.fn(),
        hud = vi.fn(),
        chaseHud = vi.fn(),
        achievementToast = vi.fn(),
        touchControls = vi.fn();
      const state = {
        run: () => ({ mode: "endless", wave: 1, score: 0, runTime: 1, mult: 1, spawnQueue: [], mods: { owned: {} } }),
        player: () => ({ x: 800, y: 500, hw: 10, hh: 20, hp: 10, maxHp: 100, dashCd: 0, shield: 0, maxShield: 0 }),
        blade: () => undefined,
        enemies: () => [],
        projectiles: () => [],
        floaters: () => [],
        slowZones: () => [],
        temporaryWalls: () => [],
        bossIntro: () => null,
        hud: () => ({ lagHp: 0.1, multiplier: 1, multiplierPop: 0 }),
        hudClockSeconds: () => 0,
        lastUiDelta: () => 1 / 60,
        screen: () => "playing",
        zoom: () => 1,
        shake: () => 12,
      } as unknown as WorldPresentationState;
      const services = {
        ...(forPlayer ? { player: { chase: { hud: chaseHud }, debug: false } } : {}),
        dependencies: {
          CONFIG,
          CLOCK: { sim: 1 },
          A11Y: { reducedMotion: false, highContrast: false, flashScale: 1 },
          GFX: { low: false },
          THEME: { dark: false, ink: "#000" },
          UI: { font: () => "12px monospace", density: { textScale: 1 }, t: { color: { accent: "#abc" } } },
          FX: { draw: vi.fn(), setViewRect: vi.fn() },
          Backdrop: { draw: vi.fn() },
          Scenes: { show: vi.fn(), opaque: () => false, drawBack: vi.fn() },
          UPGRADES: [],
          cosmeticRandom: () => 0.5,
        },
        canvas: {},
        width: 1600,
        height: 900,
        screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
        world: { hud, lowHealthScreen, achievementToast, touchControls },
        stage: { current: { id: "verdant-sanctum", accent: "#abc" }, platforms: [] },
        capturePolicy: () => ({ actors: "include", debug: "exclude" }),
        formatTime: String,
        trickColor: () => "#fff",
        ease: (value: number) => value,
      } as unknown as WorldPresentationServices;
      let shake: number | undefined;
      vi.mocked(renderWorldFrame).mockImplementation((ports) => {
        shake = ports.shake;
        return {} as ReturnType<typeof renderWorldFrame>;
      });
      const adapters = createLiveWorldPresentationAdapters(state, services);
      adapters.renderWorld();
      adapters.drawHud();
      if (!forPlayer) {
        // A watcher has no devices, profile or toasts: these layers are left out before anything reads them.
        adapters.drawAchievementToast(1 / 60);
        adapters.drawTouchControls();
      }
      return {
        hud: hud.mock.calls.length,
        lowHealth: lowHealthScreen.mock.calls.length,
        chase: chaseHud.mock.calls.length,
        toast: achievementToast.mock.calls.length,
        touch: touchControls.mock.calls.length,
        shake,
      };
    };
    expect(frame(true)).toEqual({ hud: 1, lowHealth: 1, chase: 1, toast: 0, touch: 0, shake: 12 });
    // The run's HUD stays; the red screen, the chase panel and the camera's shake are the player's.
    expect(frame(false)).toEqual({ hud: 1, lowHealth: 0, chase: 0, toast: 0, touch: 0, shake: 0 });
  });
  it("builds the boss debug snapshot only when it will be drawn", () => {
    const frame = (debug: boolean, policy: "include" | "exclude") => {
      const pantheonDebug = vi.fn(),
        platforms = vi.fn(() => []);
      const state = {
        run: () => ({ mode: "endless" }),
        player: () => ({ x: 1, y: 1, hw: 10, hh: 20, draw: vi.fn() }),
        blade: () => ({ draw: vi.fn() }),
        enemies: () => [],
        projectiles: () => [],
        floaters: () => [],
        slowZones: () => [],
        temporaryWalls: () => [],
        screen: () => "playing",
        zoom: () => 1,
        shake: () => 0,
      } as unknown as WorldPresentationState;
      const services = {
        player: { debug },
        dependencies: {
          CONFIG,
          CLOCK: { sim: 1 },
          A11Y: { reducedMotion: false, highContrast: false, flashScale: 1 },
          GFX: { low: false },
          THEME: { dark: false, ink: "#000" },
          UI: { font: () => "12px monospace", density: { textScale: 1 } },
          FX: { draw: vi.fn(), setViewRect: vi.fn() },
          Backdrop: { draw: vi.fn() },
          cosmeticRandom: () => 0.5,
        },
        canvas: {},
        width: 1600,
        height: 900,
        screenRectangle: () => ({ x: 0, y: 0, w: 1600, h: 900 }),
        world: { pantheonDebug },
        stage: {
          current: { id: "verdant-sanctum" },
          get platforms() {
            return platforms();
          },
        },
        capturePolicy: () => ({ actors: "include", debug: policy }),
      } as unknown as WorldPresentationServices;
      vi.mocked(renderWorldFrame).mockImplementation((ports) => {
        ports.drawDebug({ left: 0, top: 0, right: 1600, bottom: 900 }, { left: 0, top: 0, right: 1600, bottom: 900 });
        return {} as ReturnType<typeof renderWorldFrame>;
      });
      createLiveWorldPresentationAdapters(state, services).renderWorld();
      return { drawn: pantheonDebug.mock.calls.length, platformReads: platforms.mock.calls.length };
    };

    const release = frame(false, "include");
    const excluded = frame(true, "exclude");
    const debugBuild = frame(true, "include");

    expect(release.drawn).toBe(0);
    expect(excluded.drawn).toBe(0);
    expect(debugBuild.drawn).toBe(1);
    // The snapshot copies the stage platforms; a frame that will not draw it must not read them for it.
    expect(release.platformReads).toBeLessThan(debugBuild.platformReads);
    expect(excluded.platformReads).toBe(release.platformReads);
  });
});
