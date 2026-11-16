import { describe, expect, it } from "vitest";
import {
  frontLayerIntrusion,
  layerCoverage,
  layerTransform,
  requiredLayerRect,
  SCENE_DECODED_LIMIT,
  SCENE_ENCODED_LIMIT,
  validateScenePackage,
  viewportWorldRect,
} from "../../src/presentation/scenes/scene-contract";
import { fixturePackage } from "./scene-fixture";

describe("scene package validation", () => {
  it("accepts a complete package and freezes it", () => {
    const scene = validateScenePackage(fixturePackage());
    expect(scene.layers.map((layer) => layer.id)).toEqual(["far", "roots"]);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.layers[0]?.rect)).toBe(true);
  });

  it.each([
    ["wrong format", { format: "tear-verdant-image-package" }, /package.format/u],
    ["no covering back layer", { layers: [] }, /covering back layer/u],
    [
      "unknown image",
      { layers: [{ id: "x", image: "nope", rect: [0, 0, 1, 1], depth: 1, plane: "back", covers: true }] },
      /unknown image/u,
    ],
    ["decoded size over its budget", { decodedBudget: 1000 }, /decoded bytes exceed/u],
    ["encoded size over its budget", { encodedBudget: 1100 }, /encoded bytes exceed/u],
    ["a decoded budget above the limit for any scene", { decodedBudget: SCENE_DECODED_LIMIT + 1 }, /decodedBudget/u],
    ["an encoded budget above the limit for any scene", { encodedBudget: SCENE_ENCODED_LIMIT + 1 }, /encodedBudget/u],
    ["no encoded budget", { encodedBudget: undefined }, /encodedBudget/u],
    [
      "more pixels than any canvas can show",
      {
        layers: [
          { id: "far", image: "far", rect: [-400, -300, 2400, 1500], depth: 0.8, plane: "back", covers: true },
          { id: "roots", image: "roots", rect: [-60, 860, 120, 30], depth: 1, plane: "front" },
        ],
      },
      /image pixels per world unit/u,
    ],
    ["capital colour", { edge: { color: "#ABCDEF", feather: 1 } }, /lower-case/u],
    [
      "front layer in the arena",
      {
        layers: [
          { id: "far", image: "far", rect: [-400, -300, 2400, 1500], depth: 0.8, plane: "back", covers: true },
          { id: "vines", image: "roots", rect: [0, 600, 400, 100], depth: 1, plane: "front" },
        ],
      },
      /gameplay region/u,
    ],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() => validateScenePackage(fixturePackage(overrides))).toThrow(message);
  });

  it("requires the exact tool and prompt for image-tool sources", () => {
    const sources = [
      {
        id: "painting",
        description: "Generated",
        origin: "image-tool",
        licence: "Owner-owned",
        sha256: "a".repeat(64),
      },
      {
        id: "plate",
        description: "Cut",
        origin: "derived",
        licence: "Owner-owned",
        sha256: "a".repeat(64),
        derivedFrom: ["painting"],
      },
    ];
    expect(() => validateScenePackage(fixturePackage({ sources }))).toThrow(/tool and prompt/u);
  });

  it("rejects images whose sources are not recorded", () => {
    const images = [
      {
        id: "far",
        file: "far.avif",
        width: 10,
        height: 10,
        alpha: false,
        bytes: 1,
        sha256: "a".repeat(64),
        sources: [],
      },
    ];
    expect(() => validateScenePackage(fixturePackage({ images }))).toThrow(/names its sources/u);
  });

  it("accepts AVIF only, so a package never carries a second copy in another format", () => {
    const images = (fixturePackage().images as { file: string }[]).map((image) => ({
      ...image,
      file: image.file.replace(".avif", ".webp"),
    }));
    expect(() => validateScenePackage(fixturePackage({ images }))).toThrow(/\.avif/u);
  });
});

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
    const scene = validateScenePackage(fixturePackage());
    expect(viewportWorldRect(scene.world, 2560, 1080)).toEqual([-(2560 / 1.2 - 1600) / 2, 0, 2560 / 1.2, 900]);
    const tall = viewportWorldRect(scene.world, 1200, 900);
    expect(tall[1]).toBeCloseTo(-150, 6);
  });

  it("reports coverage shortfall per side", () => {
    const scene = validateScenePackage(fixturePackage());
    expect(layerCoverage(scene, "far", 1600, 900).covered).toBe(true);
    const ultra = layerCoverage(scene, "far", 5120, 1440);
    expect(ultra.covered).toBe(false);
    expect(ultra.shortfall.left).toBeGreaterThan(0);
    expect(ultra.shortfall.top).toBe(0);
    const need = requiredLayerRect(scene, 0.8, [0, 0, 1600, 900]);
    expect(need[2]).toBeGreaterThan(1600);
  });

  it("measures how far a front layer reaches above the floor", () => {
    const scene = validateScenePackage(fixturePackage());
    const layer = scene.layers[1];
    expect(layer).toBeDefined();
    if (layer) expect(frontLayerIntrusion(scene, layer)).toBe(0);
  });
});

describe("readability shading", () => {
  it("keeps shading as package data drawn over the untouched painting", () => {
    const scene = validateScenePackage(fixturePackage());
    expect(scene.shading.map((shade) => shade.kind)).toEqual(["band"]);
    expect(validateScenePackage(fixturePackage({ shading: undefined })).shading).toEqual([]);
  });

  it("rejects an unknown shade kind and a feather larger than the shade", () => {
    const shade = {
      id: "x",
      kind: "band",
      rect: [0, 0, 100, 100],
      depth: 1,
      color: "#000000",
      opacity: 0.5,
      feather: 10,
    };
    expect(() => validateScenePackage(fixturePackage({ shading: [{ ...shade, kind: "glow" }] }))).toThrow(/band/u);
    expect(() => validateScenePackage(fixturePackage({ shading: [{ ...shade, feather: 500 }] }))).toThrow(/feather/u);
  });
});

describe("platform binding", () => {
  it("binds a material and a texture, never platform art", () => {
    const scene = validateScenePackage(fixturePackage());
    expect(scene.platforms.material).toBe("fixture-stone");
    expect(scene.platforms.texture).toBe("stone");
  });

  it("rejects a texture that is not one of the package images", () => {
    const base = fixturePackage();
    expect(() =>
      validateScenePackage({ ...base, platforms: { ...(base.platforms as object), texture: "missing" } }),
    ).toThrow(/unknown image/u);
  });
});
