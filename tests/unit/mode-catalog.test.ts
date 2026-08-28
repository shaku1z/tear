import { describe, expect, it } from "vitest";
import { BOSS_IDENTITY_IDS } from "../../src/gameplay/run/boss-definitions";
import { MODE_CATALOG, PROFILE_TRACKED_MODE_IDS, tracksModeProgress } from "../../src/gameplay/run/mode-catalog";

describe("mode catalog", () => {
  it("derives Gauntlet boss copy from the canonical boss roster", () => {
    expect(MODE_CATALOG.find((mode) => mode.id === "gauntlet")?.blurb)
      .toContain(`cycling all ${String(BOSS_IDENTITY_IDS.length)}`);
  });

  it("owns the exact standard-mode profile projection", () => {
    expect(PROFILE_TRACKED_MODE_IDS).toEqual(["campaign", "endless", "gauntlet", "playground", "tutorial"]);
    expect(MODE_CATALOG.map((mode) => [mode.id, tracksModeProgress(mode.id)])).toEqual([
      ["campaign", true], ["endless", true], ["gauntlet", true], ["playground", true],
      ["tutorial", true], ["bossonly", false], ["sandbox", false],
    ]);
  });
});
