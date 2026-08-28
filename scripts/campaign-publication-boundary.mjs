import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FORMAT = "tear-campaign-publication-boundary";

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
  const requiredJointStageIds = uniqueStrings(value.requiredJointStageIds, "requiredJointStageIds");
  if (!requiredJointStageIds.includes("verdant-sanctum") || !requiredJointStageIds.includes("pale-traverse")) {
    throw new TypeError("campaign publication policy must retain the Verdant/Pale joint boundary");
  }
  return Object.freeze({ ...value, activeStageIds, requiredJointStageIds });
}

export function assertCampaignPublicationAllowed(value) {
  const policy = validateCampaignPublicationPolicy(value);
  const missing = policy.requiredJointStageIds.filter((id) => !policy.activeStageIds.includes(id));
  if (policy.status !== "public" || missing.length > 0) {
    throw new Error(`campaign publication prohibited: status=${policy.status}; missing joint stages=${missing.join(",") || "none"}`);
  }
  return policy;
}

export async function readCampaignPublicationPolicy(root) {
  return validateCampaignPublicationPolicy(JSON.parse(await readFile(resolve(root, "config", "campaign-publication-boundary.json"), "utf8")));
}
