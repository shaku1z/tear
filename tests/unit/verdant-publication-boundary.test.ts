import { describe, expect, it } from "vitest";

import policy from "../../config/campaign-publication-boundary.json";
import { CURRENT_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { CAMPAIGN_STAGE_IDS, PUBLISHED_STAGE_IDS, PREVIEW_STAGE_IDS, STAGE_IDS, STAGE_CONTENT_AVAILABILITY } from "../../src/gameplay/stages";
import { assertCampaignPublicationAllowed, validateCampaignPublicationPolicy } from "../../scripts/campaign-publication-boundary.mjs";

describe("published six-stage boundary with Pale preview", () => {
  it("binds the public policy to the exact published and preview authorities", () => {
    const validated = validateCampaignPublicationPolicy(policy);
    expect(validated).toMatchObject({ status: "public", rulesetVersion: CURRENT_RULESET_VERSION });
    expect(validated.activeStageIds).toEqual(CAMPAIGN_STAGE_IDS);
    expect(validated.activeStageIds).toContain("verdant-sanctum");
    expect(validated.activeStageIds).not.toContain("pale-traverse");
    expect(validated.previewStageIds).toEqual(["pale-traverse"]);
    expect(assertCampaignPublicationAllowed(policy).status).toBe("public");
  });

  it("keeps the authored seven-stage view distinct from the six-stage public view", () => {
    expect(STAGE_IDS).toHaveLength(7);
    expect(PUBLISHED_STAGE_IDS).toEqual(policy.activeStageIds);
    expect(PUBLISHED_STAGE_IDS).toHaveLength(6);
    expect(PREVIEW_STAGE_IDS).toEqual(policy.previewStageIds);
    expect(STAGE_CONTENT_AVAILABILITY["pale-traverse"].published).toBe(false);
    expect(STAGE_CONTENT_AVAILABILITY["pale-traverse"].playground).toBe(true);
  });
});
