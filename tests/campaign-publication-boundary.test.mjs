import assert from "node:assert/strict";
import test from "node:test";

import { assertCampaignPublicationAllowed, validateCampaignPublicationPolicy } from "../scripts/campaign-publication-boundary.mjs";

const engineering = {
  format: "tear-campaign-publication-boundary",
  schemaVersion: 1,
  status: "engineering-only",
  rulesetVersion: "tear-rules-verdant-pale-r3-engineering-v1",
  activeStageIds: ["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"],
  previewStageIds: ["pale-traverse"],
};

test("recognizes the six-stage public policy with a Pale Playground preview", () => {
  const policy = { ...engineering, status: "public" };
  assert.equal(validateCampaignPublicationPolicy(policy).status, "public");
  assert.deepEqual(validateCampaignPublicationPolicy(policy).previewStageIds, ["pale-traverse"]);
  assert.equal(assertCampaignPublicationAllowed(policy).status, "public");
});

test("rejects Pale in the published stage list or any non-Pale preview", () => {
  assert.throws(() => validateCampaignPublicationPolicy({ ...engineering, activeStageIds: [...engineering.activeStageIds, "pale-traverse"] }), /exact six published/u);
  assert.throws(() => validateCampaignPublicationPolicy({ ...engineering, previewStageIds: ["white-hart"] }), /sole Playground preview/u);
  assert.throws(() => validateCampaignPublicationPolicy({ ...engineering, activeStageIds: ["pale-traverse", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"] }), /exact six published/u);
});
