import { createProductionReplayFrame } from "../../src/presentation/world/production-replay-frame";
import { describe, expect, it, vi } from "vitest";
import { renderWorldFrame, type WorldFramePorts } from "../../src/presentation/world/world-frame";

describe("legacy world frame", () => {
  it("orders backdrop, entities and foreground callbacks around one camera snapshot", () => {
    const events: string[] = [];
    const rectangle = vi.fn();
    const canvas = new Proxy({ fillStyle: "", rect: rectangle }, { get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return () => { events.push(String(key)); };
    } }) as unknown as CanvasRenderingContext2D;
    const sceneEffects = { width: 100, height: 100, groundY: 80, timeMilliseconds: 0,
      lowGraphics: true, highContrast: false, darkTheme: false, ink: "#000", cracks: [], walls: [], slowZones: [], bossZones: [],
      zoneColor: "#000", sludgeColor: "#000", slamColor: "#000", bomberColor: "#000", chargerColor: "#000",
      defaultZoneWidth: 10, seamLife: 1, trailLife: 1 };
    const ports: WorldFramePorts = { canvas, width: 100, height: 100, screen: { x: 0, y: 0, w: 100, h: 100 },
      zoom: 1, shake: 0, playing: true, random: () => 0.5, biome: true, debug: false, timeSeconds: 2,
      reducedMotion: false, stage: {}, playerX: 50, sceneEffects, enemies: [], entityOptions: { darkTheme: false, sandbox: false, buffColors: {}, font: () => "10px sans" },
      floaters: [], brokenPlatforms: [], platforms: [], projectiles: [], setEffectView: vi.fn(),
      drawBackdrop: () => events.push("backdrop"), drawPlatform: vi.fn(), drawFinale: (layer) => events.push(layer),
      drawTutorialGhost: vi.fn(), tutorialActive: false, drawPlayer: () => events.push("player"), drawBlade: () => events.push("blade"),
      drawEffects: () => events.push("effects"), drawDebug: () => events.push("debug") };
    const camera = renderWorldFrame(ports);
    expect(camera).toEqual({ cx: 50, cy: 50, ox: 0, oy: 0, scale: 1 });
    expect(events.indexOf("backdrop")).toBeLessThan(events.indexOf("player"));
    expect(events.indexOf("rear")).toBeLessThan(events.indexOf("front"));
    const visible = vi.fn(); events.length = 0;
    createProductionReplayFrame({ tick: 120, clockSeconds: 1, screen: "playing", clockBlocked: false,
      cameraX: 75, cameraY: 50, ports: { ...ports, zoom: 2, setEffectView: visible } }).draw(canvas, { x: 10, y: 20, w: 300, h: 100 });
    expect(rectangle.mock.calls).toEqual([[10, 20, 300, 100], [0, 0, 100, 100]]);
    expect(events.filter((entry) => entry === "clip")).toHaveLength(2);
    expect(visible).toHaveBeenCalledWith({ left: 50, top: 25, right: 100, bottom: 75 });
  });
});
