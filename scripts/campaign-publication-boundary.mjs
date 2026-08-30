import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FORMAT = "tear-campaign-publication-boundary";
const PUBLISHED_STAGE_IDS = Object.freeze([
  "grounds", "undercroft", "crimson-fields", "verdant-sanctum", "voidspire", "tear",
]);
const PLAYGROUND_PREVIEW_STAGE_IDS = Object.freeze(["pale-traverse"]);

function uniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.some((entry) => typeof entry !== "string" || entry.length < 1)
    || new Set(value).size !== value.length) throw new TypeError(`${label} must contain unique non-empty strings`);
  return Object.freeze([...value]);
}

export function validateCampaignPublicationPolicy(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("campaign publication policy must be an object");
  if (value.format !== FORMAT || value.schemaVersion !== 1) throw new TypeError("campaign publication policy format/schema is unsupported");
  if (value.status !== "engineering-only" && value.status !== "public") throw new TypeError("campaign publication status is unsupported");
  if (typeof value.rulesetVersion !== "string" || value.rulesetVersion.length < 1) throw new TypeError("campaign publication ruleset is missing");
  const activeStageIds = uniqueStrings(value.activeStageIds, "activeStageIds");
  if (activeStageIds.length !== PUBLISHED_STAGE_IDS.length || activeStageIds.some((id, index) => id !== PUBLISHED_STAGE_IDS[index])) {
    throw new TypeError("campaign publication policy must use the exact six published stage order");
  }
  const previewStageIds = uniqueStrings(value.previewStageIds, "previewStageIds");
  if (previewStageIds.length !== PLAYGROUND_PREVIEW_STAGE_IDS.length || previewStageIds.some((id, index) => id !== PLAYGROUND_PREVIEW_STAGE_IDS[index])) {
    throw new TypeError("campaign publication policy must reserve Pale as the sole Playground preview stage");
  }
  if (activeStageIds.some((id) => previewStageIds.includes(id))) throw new TypeError("published and preview stage IDs must not overlap");
  return Object.freeze({ ...value, activeStageIds, previewStageIds });
}

export function assertCampaignPublicationAllowed(value) {
  const policy = validateCampaignPublicationPolicy(value);
  if (policy.status !== "public") {
    throw new Error(`campaign publication prohibited: status=${policy.status}`);
  }
  return policy;
}

export async function readCampaignPublicationPolicy(root) {
  return validateCampaignPublicationPolicy(JSON.parse(await readFile(resolve(root, "config", "campaign-publication-boundary.json"), "utf8")));
}
