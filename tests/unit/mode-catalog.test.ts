import { describe, expect, it } from "vitest";
import { bossIdsAvailableOn } from "../../src/gameplay/stages";
import { MODE_CATALOG, PROFILE_TRACKED_MODE_IDS, tracksModeProgress } from "../../src/gameplay/run/mode-catalog";

describe("mode catalog", () => {
  it("derives the Gauntlet's trial count from the bosses it fields", () => {
    expect(MODE_CATALOG.find((mode) => mode.id === "gauntlet")?.blurb).toContain(
      `${String(bossIdsAvailableOn("gauntlet").length)} trials, one per boss`,
    );
  });

  it("owns the exact standard-mode profile projection", () => {
    expect(PROFILE_TRACKED_MODE_IDS).toEqual(["campaign", "endless", "gauntlet", "playground", "tutorial"]);
    expect(MODE_CATALOG.map((mode) => [mode.id, tracksModeProgress(mode.id)])).toEqual([
      ["campaign", true],
      ["endless", true],
      ["gauntlet", true],
      ["playground", true],
      ["tutorial", true],
      ["bossonly", false],
      ["sandbox", false],
    ]);
  });
});
