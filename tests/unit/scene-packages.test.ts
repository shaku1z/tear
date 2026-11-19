// Every scene package present, shipped or test fixture: manifest, files and
// hashes, the size rule, coverage of the required viewports, the stage's own ink and platform
// material, readable contrast for that ink, and a real load through the game's
// scene library. Nothing here is specific to one biome; the Pale Traverse
// fixture (tests/fixtures/scene-packages) exists to prove that.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { stageDefinition } from "../../src/gameplay/stages";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";
import { createSceneLibrary, type ImageScenePackage } from "../../src/presentation/scenes/scene-library";
import { SCENE_PACKAGES } from "../../src/presentation/scenes/scene-registry";
import {
  coverageReport,
  FIXTURE_SCENES_ROOT,
  inspectPackage,
  isShippedPackage,
  SCENES_ROOT,
  sceneDirectories,
} from "../../scripts/scene/package-files.mjs";
import { pixelChecks } from "../../scripts/scene/pixel-checks.mjs";
import { contrastReport } from "../../scripts/scene/reports.mjs";

const directories = sceneDirectories();

/**
 * Minimum share of each zone where the stage's ink reaches 3:1 at rest, the
 * playbook's readability floor for every biome (docs/BACKGROUND_WORKFLOW.md).
 */
const CONTRAST_FLOOR = {
  "HUD title (600..1000, y < 115)": 0.9,
  "HUD status (20..460, y < 100)": 0.9,
  "play band (130..floor)": 0.75,
};

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
          calls.push(String(key) + ":" + String(args.length));
        };
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

describe("scene packages", () => {
  it("registers every shipped package on disk, and never a fixture", () => {
    const shipped = sceneDirectories(false, [SCENES_ROOT]).map((directory) => basename(directory));
    const fixtures = sceneDirectories(false, [FIXTURE_SCENES_ROOT]).map((directory) => basename(directory));
    expect(Object.keys(SCENE_PACKAGES)).toEqual(expect.arrayContaining(shipped));
    expect(
      Object.keys(SCENE_PACKAGES).filter((stageId) => fixtures.includes(stageId) && !shipped.includes(stageId)),
    ).toEqual([]);
  });

  it("checks a package that is not tied to one biome", () => {
    expect(sceneDirectories(false, [FIXTURE_SCENES_ROOT]).length).toBeGreaterThan(0);
  });

  for (const directory of directories) {
    const name = basename(directory);
    describe(`${name}${isShippedPackage(directory) ? "" : " (fixture)"}`, () => {
      // Hashing every file is slow; inspect each package once for all its tests.
      let inspected: ReturnType<typeof inspectPackage> | undefined;
      const inspect = async () => {
        inspected ??= inspectPackage(directory);
        const result = await inspected;
        expect(result.problems).toEqual([]);
        if (result.scene === undefined) throw new Error("invalid package");
        return result.scene;
      };

      it("validates, and its files match the manifest", async () => {
        const scene = await inspect();
        expect(scene.stageId).toBe(name);
        expect(() => stageDefinition(scene.stageId as never)).not.toThrow();
      });

      it("meets the size rule: no unused alpha, no oversized soft layer, nothing painted twice", async () => {
        const report = await pixelChecks(directory, await inspect());
        expect(report.problems).toEqual([]);
      }, 60_000);

      it("covers every required viewport", async () => {
        const rows = await coverageReport(await inspect());
        expect(rows.filter((row) => row.required && !row.covered).map((row) => row.label)).toEqual([]);
      });

      it("matches the game's world and binds the stage's own platform material", async () => {
        const scene = await inspect();
        expect(scene.world).toEqual({ width: CONFIG.view.w, height: CONFIG.view.h, groundY: CONFIG.world.groundY });
        // Platforms are game objects drawn from collision geometry by the stage's
        // material; the package may only choose that material's texture.
        expect(scene.platforms.material).toBe(stagePresentationDefinition(scene.stageId as never)?.platformMaterialId);
        expect(scene.images.some((image) => image.id === scene.platforms.texture)).toBe(true);
      });

      it("keeps the stage's own ink, so a painting never plays a stage inverted", async () => {
        const scene = await inspect();
        expect(scene.theme.paper).toBe(stageDefinition(scene.stageId as never).bg);
      });

      it("keeps its stage's ink readable over the HUD rows and the play band", async () => {
        const scene = await inspect();
        const platforms = stageDefinition(scene.stageId as never)
          .layout.map((platform) => [platform.x, platform.y, platform.w, platform.h].join(","))
          .join(";");
        const report = await contrastReport(directory, { platforms, quiet: true });
        const shortfalls = Object.entries(CONTRAST_FLOOR)
          .map(([zone, floor]) => ({ zone, floor, share: report.zones[zone]?.["theme ink"] ?? 0 }))
          .filter((row) => row.share < row.floor);
        expect(shortfalls).toEqual([]);
      }, 60_000);

      it("loads through the game's scene library and draws every plane", async () => {
        const scene = await inspect();
        const module = (await import(join(directory, "scene.ts"))) as ImageScenePackage;
        const sizes = new Map(scene.images.map((image) => [module.files[image.file], image]));
        const library = createSceneLibrary({
          packages: { [scene.stageId]: () => Promise.resolve(module) },
          world: { width: 1600, height: 900, groundY: 800 },
          nextSlice: () => Promise.resolve(),
          loadImage: (url) => {
            const image = sizes.get(url);
            return Promise.resolve({ width: image?.width ?? 0, height: image?.height ?? 0 } as unknown as ImageBitmap);
          },
          now: () => 10_000,
          lowGraphics: () => false,
          reducedMotion: () => true,
        });
        library.prefetch(scene.stageId);
        await expect.poll(() => library.status(scene.stageId)).toBe("ready");
        expect(library.paper(scene.stageId)).toBe(stageDefinition(scene.stageId as never).bg);
        const { context, calls } = recordingContext();
        const input = {
          stageId: scene.stageId,
          camera: { cx: 800, cy: 450, ox: 0, oy: 0, scale: 1 },
          playerWorldX: 800,
          worldWidth: 1600,
          view: { left: -56, top: -56, right: 1656, bottom: 956 },
          timeSeconds: 1,
        };
        library.drawBack(context, input);
        library.drawFront(context, input);
        const backLayers = scene.layers.filter((layer) => layer.plane === "back").length;
        expect(calls.filter((call) => call.startsWith("drawImage")).length).toBeGreaterThanOrEqual(backLayers);
        const platform = stageDefinition(scene.stageId as never).layout[0];
        if (platform === undefined) throw new Error("stage has no platforms");
        expect(library.surfaceMaterial(scene.stageId).draw(context, platform, false)).toBe(true);
      });

      it("pins every source the recipe uses, with provenance", async () => {
        const scene = await inspect();
        const recipe = JSON.parse(readFileSync(join(directory, "recipe.json"), "utf8")) as {
          sources: readonly { id: string; sha256: string }[];
        };
        for (const source of scene.sources) {
          expect(source.licence.length).toBeGreaterThan(0);
          const pinned = recipe.sources.find((item) => item.id === source.id);
          if (source.origin !== "derived" && source.origin !== "procedural") expect(pinned?.sha256).toBe(source.sha256);
        }
      });
    });
  }
});
