import { createProductionReplayFrame } from "../../src/presentation/world/production-replay-frame";
import { describe, expect, it, vi } from "vitest";
import { renderWorldFrame, type WorldFramePorts } from "../../src/presentation/world/world-frame";

const SCENE_EFFECTS = {
  width: 100,
  height: 100,
  groundY: 80,
  timeMilliseconds: 0,
  lowGraphics: true,
  highContrast: false,
  darkTheme: false,
  ink: "#000",
  cracks: [],
  walls: [],
  slowZones: [],
  bossZones: [],
  zoneColor: "#000",
  sludgeColor: "#000",
  slamColor: "#000",
  bomberColor: "#000",
  chargerColor: "#000",
  defaultZoneWidth: 10,
  seamLife: 1,
  trailLife: 1,
};

describe("legacy world frame", () => {
  it("orders backdrop, entities and foreground callbacks around one camera snapshot", () => {
    const events: string[] = [];
    const rectangle = vi.fn();
    const canvas = new Proxy(
      { fillStyle: "", rect: rectangle },
      {
        get(target, key) {
          if (key in target) return target[key as keyof typeof target];
          return () => {
            events.push(String(key));
          };
        },
      },
    ) as unknown as CanvasRenderingContext2D;
    const sceneEffects = SCENE_EFFECTS;
    const ports: WorldFramePorts = {
      canvas,
      width: 100,
      height: 100,
      screen: { x: 0, y: 0, w: 100, h: 100 },
      zoom: 1,
      shake: 0,
      playing: true,
      random: () => 0.5,
      biome: true,
      debug: false,
      timeSeconds: 2,
      reducedMotion: false,
      stage: {},
      playerX: 50,
      sceneEffects,
      enemies: [],
      entityOptions: { darkTheme: false, sandbox: false, buffColors: {}, font: () => "10px sans" },
      floaters: [],
      brokenPlatforms: [],
      platforms: [],
      projectiles: [],
      setEffectView: vi.fn(),
      drawBackdrop: () => events.push("backdrop"),
      drawPlatform: vi.fn(),
      drawFinale: (layer) => events.push(layer),
      drawTutorialGhost: vi.fn(),
      tutorialActive: false,
      drawPlayer: () => events.push("player"),
      drawBlade: () => events.push("blade"),
      drawEffects: () => events.push("effects"),
      drawDebug: () => events.push("debug"),
    };
    const camera = renderWorldFrame(ports);
    expect(camera).toEqual({ cx: 50, cy: 50, ox: 0, oy: 0, scale: 1 });
    expect(events.indexOf("backdrop")).toBeLessThan(events.indexOf("player"));
    expect(events.indexOf("rear")).toBeLessThan(events.indexOf("front"));
    const visible = vi.fn();
    events.length = 0;
    const replayFrame = (zoom: number) =>
      createProductionReplayFrame({
        tick: 120,
        clockSeconds: 1,
        screen: "playing",
        clockBlocked: false,
        ports: { ...ports, zoom, playerX: 90, setEffectView: visible },
      });
    // A wider rectangle than the arena: the arena is fitted whole and the backdrop fills the sides.
    replayFrame(1).draw(canvas, { x: 10, y: 20, w: 300, h: 100 });
    expect(rectangle.mock.calls).toEqual([[10, 20, 300, 100]]);
    expect(events.filter((entry) => entry === "clip")).toHaveLength(1);
    expect(visible).toHaveBeenLastCalledWith({ left: -100, top: 0, right: 200, bottom: 100 });
  });

  it("frames a replay as play does: the whole arena, centred, at the world's zoom, wherever the player is", () => {
    // A canvas that accepts every call and property: only the frame's camera and visible bounds are read.
    const fields = new Map<PropertyKey, unknown>();
    const canvas = new Proxy(
      {},
      {
        get: (_target, key) => (fields.has(key) ? fields.get(key) : () => undefined),
        set: (_target, key, value: unknown) => {
          fields.set(key, value);
          return true;
        },
      },
    ) as CanvasRenderingContext2D;
    const visible = vi.fn();
    const frame = (zoom: number, playerX: number) =>
      createProductionReplayFrame({
        tick: 1,
        clockSeconds: 0,
        screen: "playing",
        clockBlocked: false,
        ports: {
          width: 1600,
          height: 900,
          zoom,
          shake: 0,
          playing: false,
          random: () => 0.5,
          biome: false,
          debug: false,
          timeSeconds: 0,
          reducedMotion: false,
          stage: {},
          playerX,
          sceneEffects: SCENE_EFFECTS,
          enemies: [],
          entityOptions: { darkTheme: false, sandbox: false, buffColors: {}, font: () => "10px sans" },
          floaters: [],
          brokenPlatforms: [],
          platforms: [],
          projectiles: [],
          setEffectView: visible,
          drawBackdrop: vi.fn(),
          drawPlatform: vi.fn(),
          drawFinale: vi.fn(),
          drawTutorialGhost: vi.fn(),
          tutorialActive: false,
          drawPlayer: vi.fn(),
          drawBlade: vi.fn(),
          drawEffects: vi.fn(),
          drawDebug: vi.fn(),
        },
      });
    for (const playerX of [80, 800, 1520]) {
      const shown = frame(1, playerX);
      expect(shown.camera).toEqual({ policy: "arena", x: 800, y: 450, scale: 1 });
      // The replay screen's world rectangle between its bars: the arena fits whole, never cropped.
      shown.draw(canvas, { x: 0, y: 56, w: 1600, h: 728 });
      const bounds = visible.mock.lastCall?.[0] as { left: number; top: number; right: number; bottom: number };
      expect(bounds.top).toBeCloseTo(0);
      expect(bounds.bottom).toBeCloseTo(900);
      expect(bounds.left).toBeLessThanOrEqual(0);
      expect(bounds.right).toBeGreaterThanOrEqual(1600);
    }
    // A scene that zooms the world out shows more of it, as in play.
    frame(0.8, 800).draw(canvas, { x: 0, y: 0, w: 1600, h: 900 });
    expect(visible).toHaveBeenLastCalledWith({ left: -200, top: -112.5, right: 1800, bottom: 1012.5 });
  });
});
