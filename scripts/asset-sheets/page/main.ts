/**
 * The page `pnpm assets:sheets` drives in headless Chrome. It runs the game's own detached world and draws
 * frames through the game's own frame path; nothing here draws an asset itself. The command reads the
 * catalogue once, then calls `renderScene` one scene at a time.
 */
import { loadShippingTutorialGold } from "../../../src/gameplay/training/tutorial-gold-shipping";
import { ASSET_MANIFEST, bossMoveChecklist, sheetAssets, sheetScenes } from "../manifest";
import { renderScene } from "./capture";
import { overviewSheet } from "./overview";

const { manifest, problems } = ASSET_MANIFEST;

Object.assign(window, {
  assetSheets: Object.freeze({
    /** Everything the command needs to plan a run, and the manifest's problems (a run refuses to start on any). */
    catalogue: () => ({
      problems,
      budget: manifest.budget,
      categories: manifest.categories.map((category) => ({
        id: category.id,
        about: category.about,
        byproduct: category.stager === null,
      })),
      assets: sheetAssets(manifest),
      scenes: sheetScenes(manifest),
      bossMoves: bossMoveChecklist(manifest),
    }),
    /** `taken`: keys of stage objects and projectiles that already have a picture. */
    async renderScene(sceneId: string, taken: readonly string[]) {
      const scene = sheetScenes(manifest).find((entry) => entry.id === sceneId);
      if (scene === undefined) throw new Error(`unknown scene ${sceneId}`);
      await loadShippingTutorialGold();
      const keys = new Set(taken);
      const result = await renderScene(scene, keys);
      return { ...result, taken: [...keys] };
    },
    overviewSheet,
  }),
});
