import { describe, expect, it, vi } from "vitest";
import { createSceneLibrary, type SceneLibraryPorts } from "../../src/presentation/scenes/scene-library";
import { fixturePackage } from "./scene-fixture";

function recordingContext() {
  const calls: string[] = [];
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "createLinearGradient") return () => ({ addColorStop: () => undefined });
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

  it("loads lazily, then draws the back plane, platform texture, shadows and theme paper", async () => {
    const loader = vi.fn(ports().packages["fixture-stage"]);
    const library = createSceneLibrary(ports({ packages: { "fixture-stage": loader } }));
    expect(loader).not.toHaveBeenCalled();
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
