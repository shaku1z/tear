import { describe, expect, it } from "vitest";
import {
  frontLayerIntrusion,
  layerTransform,
  requiredLayerRect,
  viewportWorldRect,
} from "../../src/presentation/scenes/scene-contract";

const scene = {
  world: { width: 1600, height: 900, groundY: 800 },
  camera: { playerShift: 40, zoomMin: 1, zoomMax: 1.2, shake: 24 },
};

describe("parallax camera", () => {
  const camera = { cx: 800, cy: 450, scale: 1.1, ox: 6, oy: -4, playerX: 0.5 };
  const apply = ([k, tx, ty]: readonly [number, number, number], x: number, y: number) => [tx + k * x, ty + k * y];
  const world = (x: number, y: number) => [800 + 6 + 1.1 * (x - 800), 450 - 4 + 1.1 * (y - 450)];

  it("locks depth-1 layers to the gameplay plane", () => {
    const [k, tx, ty] = layerTransform(camera, 1, 40);
    expect(k).toBeCloseTo(1, 9);
    expect(tx).toBeCloseTo(0, 9);
    expect(ty).toBeCloseTo(0, 9);
  });

  it("keeps depth-0 layers on the screen and slides them against the player", () => {
    const transform = layerTransform(camera, 0, 40);
    const [lx, ly] = apply(transform, 800, 450);
    const [sx, sy] = world(lx ?? 0, ly ?? 0);
    expect(sx).toBeCloseTo(800 - 0.5 * 40, 6); // slides away from the player
    expect(sy).toBeCloseTo(450, 6);
  });

  it("computes overscan for ultrawide and tall viewports", () => {
    expect(viewportWorldRect(scene.world, 2560, 1080)).toEqual([-(2560 / 1.2 - 1600) / 2, 0, 2560 / 1.2, 900]);
    const tall = viewportWorldRect(scene.world, 1200, 900);
    expect(tall[1]).toBeCloseTo(-150, 6);
  });

  it("asks a far layer for more than the screen, and less of it below the floor", () => {
    const screen = [0, 0, 1600, 900] as const;
    const need = requiredLayerRect(scene, 0.8, screen);
    expect(need[0]).toBeLessThan(0);
    expect(need[2]).toBeGreaterThan(1600);
    expect(need[3]).toBeGreaterThan(900);
    // The game's floor paints everything below its surface, so a layer need not reach under it.
    const aboveFloor = requiredLayerRect(scene, 0.8, screen, scene.world.groundY);
    expect(aboveFloor[1] + aboveFloor[3]).toBeLessThan(need[1] + need[3]);
  });

  it("measures how far a front layer reaches above the floor", () => {
    expect(frontLayerIntrusion(scene, { rect: [-60, 860, 120, 30], depth: 1 })).toBe(0);
    expect(frontLayerIntrusion(scene, { rect: [0, 600, 400, 100], depth: 1 })).toBeGreaterThan(190);
  });
});
