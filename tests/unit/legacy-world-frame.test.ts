import { describe, expect, it, vi } from "vitest";
import { renderLegacyWorldFrame } from "../../src/presentation/world/legacy-world-frame";

describe("legacy world frame", () => {
  it("orders backdrop, entities and foreground callbacks around one camera snapshot", () => {
    const events: string[] = [];
    const canvas = new Proxy({ fillStyle: "" }, { get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      return () => { events.push(String(key)); };
    } }) as unknown as CanvasRenderingContext2D;
    const sceneEffects = { width: 100, height: 100, groundY: 80, timeMilliseconds: 0,
      lowGraphics: true, highContrast: false, darkTheme: false, ink: "#000", cracks: [], walls: [], slowZones: [], bossZones: [],
      zoneColor: "#000", sludgeColor: "#000", slamColor: "#000", bomberColor: "#000", chargerColor: "#000",
      defaultZoneWidth: 10, seamLife: 1, trailLife: 1 };
    const camera = renderLegacyWorldFrame({ canvas, width: 100, height: 100, screen: { x: 0, y: 0, w: 100, h: 100 },
      zoom: 1, shake: 0, playing: true, random: () => 0.5, biome: true, debug: false, timeSeconds: 2,
      reducedMotion: false, stage: {}, playerX: 50, sceneEffects, enemies: [], entityOptions: { darkTheme: false, sandbox: false, buffColors: {}, font: () => "10px sans" },
      floaters: [], brokenPlatforms: [], platforms: [], projectiles: [], setEffectView: vi.fn(),
      drawBackdrop: () => events.push("backdrop"), drawPlatform: vi.fn(), drawFinale: (layer) => events.push(layer),
      drawTutorialGhost: vi.fn(), tutorialActive: false, drawPlayer: () => events.push("player"), drawBlade: () => events.push("blade"),
      drawEffects: () => events.push("effects"), drawDebug: () => events.push("debug") });
    expect(camera).toEqual({ cx: 50, cy: 50, ox: 0, oy: 0, scale: 1 });
    expect(events.indexOf("backdrop")).toBeLessThan(events.indexOf("player"));
    expect(events.indexOf("rear")).toBeLessThan(events.indexOf("front"));
  });
});
