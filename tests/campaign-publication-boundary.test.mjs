import assert from "node:assert/strict";
import test from "node:test";

import { assertCampaignPublicationAllowed, validateCampaignPublicationPolicy } from "../scripts/campaign-publication-boundary.mjs";

const engineering = {
  format: "tear-campaign-publication-boundary",
  schemaVersion: 1,
  status: "engineering-only",
  rulesetVersion: "tear-rules-verdant-r3-engineering-v1",
  activeStageIds: ["grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear"],
  requiredJointStageIds: ["verdant-sanctum", "pale-traverse"],
};

test("recognizes the six-stage engineering policy but refuses publication", () => {
  assert.equal(validateCampaignPublicationPolicy(engineering).status, "engineering-only");
  assert.throws(() => assertCampaignPublicationAllowed(engineering), /publication prohibited.*pale-traverse/u);
});

test("allows only an explicit public policy containing both joint stages", () => {
  const publicPolicy = { ...engineering, status: "public", activeStageIds: [...engineering.activeStageIds, "pale-traverse"] };
  assert.equal(assertCampaignPublicationAllowed(publicPolicy).status, "public");
  assert.throws(() => assertCampaignPublicationAllowed({ ...engineering, status: "public" }), /pale-traverse/u);
});
