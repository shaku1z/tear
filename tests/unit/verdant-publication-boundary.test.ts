import { describe, expect, it } from "vitest";

import policy from "../../config/campaign-publication-boundary.json";
import { CURRENT_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { CAMPAIGN_STAGE_IDS } from "../../src/gameplay/stages";
import { assertCampaignPublicationAllowed, validateCampaignPublicationPolicy } from "../../scripts/campaign-publication-boundary.mjs";

describe("Verdant/Pale joint-publication boundary", () => {
  it("binds the non-publishable policy to the exact active stage and ruleset authorities", () => {
    const validated = validateCampaignPublicationPolicy(policy);
    expect(validated).toMatchObject({ status: "engineering-only", rulesetVersion: CURRENT_RULESET_VERSION });
    expect(validated.activeStageIds).toEqual(CAMPAIGN_STAGE_IDS);
    expect(validated.activeStageIds).toContain("verdant-sanctum");
    expect(validated.activeStageIds).toContain("pale-traverse");
    expect(validated.requiredJointStageIds).toEqual(["verdant-sanctum", "pale-traverse"]);
    expect(() => assertCampaignPublicationAllowed(policy)).toThrow(/publication prohibited/u);
  });
});
