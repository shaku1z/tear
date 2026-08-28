import { describe, expect, it } from "vitest";
import { STAGE_IDS } from "../../src/gameplay/stages";
import { CAMPAIGN_STAGE_CURVES, campaignStageCurve } from "../../src/gameplay/run/campaign-stage-curve";

describe("campaign stage curve authority", () => {
  it("covers every current source-owned StageId exactly once", () => {
    expect(Object.keys(CAMPAIGN_STAGE_CURVES)).toEqual(STAGE_IDS);
    for (const stageId of STAGE_IDS) expect(campaignStageCurve(stageId)).toBe(CAMPAIGN_STAGE_CURVES[stageId]);
  });

  it("owns the authored Verdant prototype without compounding its array index", () => {
    expect(campaignStageCurve("verdant-sanctum")).toEqual({
      health: 1.82,
      damage: 1.34,
      countAdd: 5,
      concurrentAdd: 2,
      disposition: "authored-prototype",
    });
  });

  it("keeps relocated late-stage tuning explicitly provisional until C15-S8", () => {
    expect(campaignStageCurve("voidspire").disposition).toBe("legacy-position-placeholder");
    expect(campaignStageCurve("tear").disposition).toBe("legacy-position-placeholder");
  });
});
