// Every committed scene package: manifest, files and hashes, coverage of the
// required viewports, and alignment of its surface art with the stage's real
// collision geometry.
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { stageDefinition } from "../../src/gameplay/stages";
import { stagePresentationDefinition } from "../../src/presentation/stage-presentation-definitions";
import { SCENE_PACKAGES } from "../../src/presentation/scenes/scene-registry";
import { coverageReport, inspectPackage, sceneDirectories } from "../../scripts/scene/package-files.mjs";

const directories = sceneDirectories();

describe("scene packages", () => {
  it("registers exactly the packages on disk", () => {
    expect(Object.keys(SCENE_PACKAGES).sort()).toEqual(directories.map((directory) => basename(directory)).sort());
  });

  for (const directory of directories) {
    const name = basename(directory);
    describe(name, () => {
      const inspect = async () => {
        const result = await inspectPackage(directory);
        expect(result.problems).toEqual([]);
        if (result.scene === undefined) throw new Error("invalid package");
        return result.scene;
      };

      it("validates, and its files match the manifest", async () => {
        const scene = await inspect();
        expect(scene.stageId).toBe(name);
        expect(() => stageDefinition(scene.stageId as never)).not.toThrow();
      });

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
