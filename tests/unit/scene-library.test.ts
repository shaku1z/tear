import { describe, expect, it, vi } from "vitest";
import {
  createSceneLibrary,
  type SceneLibraryPorts,
  type ScenePaintPorts,
} from "../../src/presentation/scenes/scene-library";
import type { LoadedScene, SceneBitmap, SceneCanvas } from "../../src/presentation/scenes/scene-renderer";
import { fixturePackage } from "./scene-fixture";

function recordingContext() {
  const calls: string[] = [];
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "createLinearGradient" || key === "createRadialGradient")
          return () => ({ addColorStop: () => undefined });
        if (key === "createPattern") return () => ({ setTransform: () => undefined });
        return (...args: unknown[]) => {
          calls.push(`${String(key)}(${String(args.length)})`);
        };
      },
      set() {
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

function sizedBitmap(width: number, height: number) {
  return { width, height } as unknown as ImageBitmap;
}

function ports(overrides: Partial<SceneLibraryPorts> = {}): SceneLibraryPorts {
  const manifest = fixturePackage();
  const sizes = new Map(
    (manifest.images as { file: string; width: number; height: number }[]).map((image) => [image.file, image]),
  );
  return {
    packages: {
      "fixture-stage": () =>
        Promise.resolve({
          manifest,
          files: Object.fromEntries([...sizes.keys()].map((file) => [file, `/assets/${file}`])),
        }),
    },
    world: { width: 1600, height: 900, groundY: 800 },
    nextSlice: () => Promise.resolve(),
    loadImage: (url) => {
      const image = sizes.get(url.replace("/assets/", ""));
      return Promise.resolve(sizedBitmap(image?.width ?? 1, image?.height ?? 1));
    },
    now: () => 10_000,
    lowGraphics: () => false,
    reducedMotion: () => true,
    ...overrides,
  };
}

const input = {
  stageId: "fixture-stage",
  camera: { cx: 800, cy: 450, ox: 0, oy: 0, scale: 1 },
  playerWorldX: 800,
  worldWidth: 1600,
  view: { left: -56, top: -56, right: 1656, bottom: 956 },
  timeSeconds: 1,
};

describe("scene library", () => {
  it("leaves stages without a package to their own art", () => {
    const library = createSceneLibrary(ports());
    expect(library.status("grounds")).toBe("none");
    expect(library.opaque("grounds")).toBe(false);
    expect(library.paper("grounds")).toBeUndefined();
  });

  it("never starts a download from a read or a draw, only from show or prefetch", () => {
    // The menu's background draws every stage in turn. If drawing one fetched its
    // art, a new player would download a biome before their first run.
    const loader = vi.fn(ports().packages["fixture-stage"]);
    const library = createSceneLibrary(ports({ packages: { "fixture-stage": loader } }));
    const { context, calls } = recordingContext();
    const platform = { x: 150, y: 645, w: 330, h: 24 };
    expect(library.status("fixture-stage")).toBe("none");
    expect(library.paper("fixture-stage")).toBeUndefined();
    expect(library.opaque("fixture-stage")).toBe(false);
    expect(library.loaded("fixture-stage")).toBeUndefined();
    library.drawBack(context, input);
    library.drawFront(context, input);
    library.drawShadows(context, "fixture-stage", [platform]);
    expect(library.surfaceMaterial("fixture-stage").draw(context, platform, false)).toBe(false);
    expect(calls).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
    library.prefetch("fixture-stage");
    library.prefetch("fixture-stage");
    library.show("fixture-stage");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(library.status("fixture-stage")).toBe("loading");
  });

  describe("release", () => {
    const stages = (overrides: Partial<SceneLibraryPorts> = {}) => {
      const base = ports();
      const loader = base.packages["fixture-stage"];
      if (loader === undefined) throw new Error("fixture loader missing");
      const released: unknown[] = [];
      const library = createSceneLibrary({
        ...base,
        packages: { first: loader, second: loader, third: loader },
        releaseImage: (image) => released.push(image),
        ...overrides,
      });
      const ready = (stageId: string) =>
        vi.waitFor(() => {
          expect(library.status(stageId)).toBe("ready");
        });
      return { library, released, ready };
    };
    const imageCount = (fixturePackage().images as unknown[]).length;

    it("keeps the shown stage and the next one, and frees a stage the run has left", async () => {
      const { library, released, ready } = stages();
      library.show("first");
      library.prefetch("second");
      await ready("first");
      await ready("second");
      expect(released).toEqual([]);
      // The run moves on: the second stage is shown and the third is next.
      library.show("second");
      expect(library.status("first")).toBe("none");
      expect(library.loaded("first")).toBeUndefined();
      expect(released).toHaveLength(imageCount);
      expect(library.status("second")).toBe("ready");
      library.prefetch("third");
      await ready("third");
      expect(released).toHaveLength(imageCount);
      expect(library.status("second")).toBe("ready");
    });

    it("frees every stage on the main menu, and loads again on the next run", async () => {
      const { library, released, ready } = stages();
      library.show("first");
      library.prefetch("second");
      await ready("first");
      await ready("second");
      library.leave();
      expect(released).toHaveLength(imageCount * 2);
      expect(library.status("first")).toBe("none");
      expect(library.status("second")).toBe("none");
      library.leave();
      expect(released).toHaveLength(imageCount * 2);
      library.show("first");
      await ready("first");
    });

    it("frees a stage that was left while it was still loading, without keeping or reporting it", async () => {
      const onError = vi.fn();
      const { library, released } = stages({ onError });
      library.show("first");
      library.leave();
      expect(library.status("first")).toBe("none");
      await vi.waitFor(() => {
        expect(released).toHaveLength(imageCount);
      });
      expect(library.status("first")).toBe("none");
      expect(onError).not.toHaveBeenCalled();
    });

    it("frees the decoded copy of a layer once its shading is baked into a canvas", async () => {
      const baking = recordingContext();
      const createCanvas = (width: number, height: number) =>
        ({ width, height, getContext: () => baking.context }) as unknown as OffscreenCanvas;
      const { library, released, ready } = stages({ createCanvas });
      library.show("first");
      await ready("first");
      const far = (fixturePackage().images as { id: string; width: number }[]).find((image) => image.id === "far");
      expect(released.map((image) => (image as { width: number }).width)).toEqual([far?.width]);
    });
  });

  it("loads on prefetch, then draws the back plane, platform texture, shadows and theme paper", async () => {
    const loader = vi.fn(ports().packages["fixture-stage"]);
    const library = createSceneLibrary(ports({ packages: { "fixture-stage": loader } }));
    expect(loader).not.toHaveBeenCalled();
    library.prefetch("fixture-stage");
    expect(library.status("fixture-stage")).toBe("loading");
    await vi.waitFor(() => {
      expect(library.status("fixture-stage")).toBe("ready");
    });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(library.opaque("fixture-stage")).toBe(true);
    expect(library.paper("fixture-stage")).toBe("#203a30");
    const { context, calls } = recordingContext();
    library.drawBack(context, input);
    expect(calls.filter((call) => call.startsWith("drawImage"))).toHaveLength(1);
    const platform = { x: 150, y: 645, w: 330, h: 24 };
    expect(library.surfaceMaterial("fixture-stage").draw(context, platform, false)).toBe(true);
    expect(library.surfaceMaterial("grounds").draw(context, platform, false)).toBe(false);
    calls.length = 0;
    library.drawShadows(context, "fixture-stage", [
      platform,
      { ...platform, arenaState: "broken" },
      { x: 0, y: 800, w: 1600, h: 100, floor: true },
    ]);
    // Only the standing platform casts a shadow.
    expect(calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(1);
  });

  it("bakes shading into its covering layer once at load, so frames draw no shading", async () => {
    const baking = recordingContext();
    const created: { width: number; height: number }[] = [];
    const createCanvas = (width: number, height: number) => {
      created.push({ width, height });
      return { width, height, getContext: () => baking.context } as unknown as OffscreenCanvas;
    };
    const library = createSceneLibrary(ports({ createCanvas }));
    library.prefetch("fixture-stage");
    await vi.waitFor(() => {
      expect(library.status("fixture-stage")).toBe("ready");
    });
    const manifest = fixturePackage() as { images: { id: string; width: number; height: number }[] };
    const far = manifest.images.find((image) => image.id === "far");
    expect(created).toEqual([{ width: far?.width, height: far?.height }]);
    expect(baking.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(1);
    expect(library.loaded("fixture-stage")?.shading).toEqual([]);
    const { context, calls } = recordingContext();
    library.drawBack(context, input);
    // The edge fill and the feathered edges only; the shade band is in the bitmap.
    const unbaked = recordingContext();
    const plain = createSceneLibrary(ports());
    plain.prefetch("fixture-stage");
    await vi.waitFor(() => {
      expect(plain.status("fixture-stage")).toBe("ready");
    });
    plain.drawBack(unbaked.context, input);
    expect(calls.filter((call) => call.startsWith("fillRect")).length).toBe(
      unbaked.calls.filter((call) => call.startsWith("fillRect")).length - 1,
    );
  });

  it("falls back for good when an image decodes at the wrong size", async () => {
    const onError = vi.fn();
    const library = createSceneLibrary(ports({ loadImage: () => Promise.resolve(sizedBitmap(3, 3)), onError }));
    library.prefetch("fixture-stage");
    await vi.waitFor(() => {
      expect(library.status("fixture-stage")).toBe("failed");
    });
    expect(onError).toHaveBeenCalledOnce();
    const { context, calls } = recordingContext();
    library.drawBack(context, input);
    expect(calls).toEqual([]);
  });

  it("fades in over its first frames unless motion is reduced", async () => {
    let now = 0;
    const library = createSceneLibrary(ports({ now: () => now, reducedMotion: () => false }));
    library.prefetch("fixture-stage");
    await vi.waitFor(() => {
      expect(library.status("fixture-stage")).toBe("ready");
    });
    expect(library.opaque("fixture-stage")).toBe(false);
    now = 1_000;
    expect(library.opaque("fixture-stage")).toBe(true);
  });
});

describe("drawn stages", () => {
  /** A drawn stage whose painting finishes when the test says so. */
  function drawnStage() {
    const paints: ScenePaintPorts[] = [];
    let finish: (loaded: LoadedScene) => void = () => undefined;
    const loaded: LoadedScene = {
      scene: {
        world: { width: 1600, height: 900, groundY: 800 },
        camera: { playerShift: 48, zoomMin: 1, zoomMax: 1.2, shake: 24 },
        edge: { color: "#000000", feather: 72 },
        theme: { paper: "#dff2d6" },
        layers: [
          {
            id: "far",
            image: "far",
            rect: [-400, -300, 2400, 1500],
            depth: 0.9,
            plane: "back",
            opacity: 1,
            covers: true,
          },
        ],
        shading: [],
        platforms: {
          material: "fixture",
          texture: "far",
          scale: 1,
          fill: "#000000",
          shadow: { color: "#000000", opacity: 0.5, length: 40 },
        },
      },
      images: new Map([["far", sizedBitmap(1200, 750)]]),
      shading: [],
    };
    const packages = {
      "drawn-stage": () =>
        Promise.resolve({
          paint: (paintPorts: ScenePaintPorts) => {
            paints.push(paintPorts);
            return new Promise<LoadedScene>((resolve) => {
              finish = resolve;
            });
          },
        }),
    };
    return {
      packages,
      paints,
      finish: () => {
        finish(loaded);
      },
    };
  }
  const canvas = () => sizedBitmap(1, 1) as unknown as SceneCanvas & SceneBitmap;
  const drawnInput = { ...input, stageId: "drawn-stage" };

  it("keeps the caller's own art until painting finishes: never blank, nothing half painted", async () => {
    const stage = drawnStage();
    const library = createSceneLibrary(ports({ packages: stage.packages, createCanvas: canvas }));
    library.show("drawn-stage");
    await vi.waitFor(() => {
      expect(stage.paints.length).toBe(1);
    });
    const { context, calls } = recordingContext();
    library.drawBack(context, drawnInput);
    expect(library.status("drawn-stage")).toBe("loading");
    // Not opaque tells the world to draw its own backdrop first; the scene adds nothing yet.
    expect(library.opaque("drawn-stage")).toBe(false);
    expect(calls).toEqual([]);
    stage.finish();
    await vi.waitFor(() => {
      expect(library.status("drawn-stage")).toBe("ready");
    });
    library.drawBack(context, drawnInput);
    expect(calls.some((call) => call.startsWith("drawImage"))).toBe(true);
  });

  it("paints once per load, in world units: a different view or camera never paints again", async () => {
    const stage = drawnStage();
    const library = createSceneLibrary(ports({ packages: stage.packages, createCanvas: canvas }));
    library.show("drawn-stage");
    await vi.waitFor(() => {
      expect(stage.paints.length).toBe(1);
    });
    stage.finish();
    await vi.waitFor(() => {
      expect(library.status("drawn-stage")).toBe("ready");
    });
    const { context } = recordingContext();
    for (const scale of [1, 1.2]) {
      for (const view of [input.view, { left: -400, top: -56, right: 2000, bottom: 956 }]) {
        library.show("drawn-stage");
        library.drawBack(context, { ...drawnInput, view, camera: { ...input.camera, scale } });
      }
    }
    expect(stage.paints.length).toBe(1);
  });

  it("chooses the canvas detail from the graphics setting when the stage loads", async () => {
    for (const [low, detail] of [
      [false, 1],
      [true, 0.6],
    ] as const) {
      const stage = drawnStage();
      const library = createSceneLibrary(
        ports({ packages: stage.packages, createCanvas: canvas, lowGraphics: () => low }),
      );
      library.show("drawn-stage");
      await vi.waitFor(() => {
        expect(stage.paints.length).toBe(1);
      });
      expect(stage.paints[0]?.detail).toBe(detail);
      expect(stage.paints[0]?.sliceMs).toBeLessThanOrEqual(4);
    }
  });
});
