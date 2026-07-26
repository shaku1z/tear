import { describe, expect, it } from "vitest";
import { TUTORIAL_BASELINE_CONTRACT, tutorialUsesBaselineLoadout } from "../../src/gameplay/training/tutorial-contract";

describe("tutorial baseline contract", () => {
  it("keeps permanent progression out of the teaching run only", () => {
    expect(tutorialUsesBaselineLoadout("tutorial")).toBe(true);
    expect(tutorialUsesBaselineLoadout("campaign")).toBe(false);
    expect(TUTORIAL_BASELINE_CONTRACT).toMatchObject({
      appliesPermanentUpgrades: false, allowsDrafts: false, allowsShop: false, restoresPlayerBetweenBlocks: true,
    });
  });
});
