/**
 * Merging a run's pictures into the last run's output must not depend on which scenes were drawn this time:
 * when two scenes show the same state of an asset, the scene earlier in the catalogue keeps it.
 */
import { describe, expect, it } from "vitest";

import { mergeAssets } from "../../scripts/asset-sheets/output.mjs";

const picture = (scene, state) => ({
  category: "bosses",
  asset: "boss_warden",
  state,
  scene,
  tick: 1,
  rect: { x: 0, y: 0, w: 1, h: 1 },
  approximations: [],
});
const sceneOrder = new Map([
  ["bosses/boss_warden/phase-1", 0],
  ["bosses/boss_warden/phase-2", 1],
]);
const describeAsset = () => ({ name: "The Warden", subject: "warden", sources: [], sheet: "sheet.svg" });
const scenesOf = (merged) =>
  merged.assets.flatMap((asset) => asset.states.map((state) => `${state.state} from ${state.scene}`));

describe("asset sheets output merge", () => {
  it("keeps the earlier scene's picture when two scenes drawn together show the same state", () => {
    const merged = mergeAssets({
      previous: null,
      pictures: [
        picture("bosses/boss_warden/phase-2", "phase-2-idle"),
        picture("bosses/boss_warden/phase-1", "phase-2-idle"),
      ],
      drawnScenes: new Set(sceneOrder.keys()),
      sceneOrder,
      describe: describeAsset,
    });
    expect(scenesOf(merged)).toEqual(["phase-2-idle from bosses/boss_warden/phase-1"]);
    expect(merged.accepted).toHaveLength(1);
  });

  it("keeps a kept earlier scene's picture over a later scene drawn again", () => {
    const first = mergeAssets({
      previous: null,
      pictures: [picture("bosses/boss_warden/phase-1", "phase-2-idle")],
      drawnScenes: new Set(["bosses/boss_warden/phase-1"]),
      sceneOrder,
      describe: describeAsset,
    });
    const again = mergeAssets({
      previous: { assets: first.assets },
      pictures: [picture("bosses/boss_warden/phase-2", "phase-2-idle")],
      drawnScenes: new Set(["bosses/boss_warden/phase-2"]),
      sceneOrder,
      describe: describeAsset,
    });
    expect(scenesOf(again)).toEqual(["phase-2-idle from bosses/boss_warden/phase-1"]);
    expect(again.accepted).toEqual([]);
    expect(again.stale).toEqual([]);
  });
});
