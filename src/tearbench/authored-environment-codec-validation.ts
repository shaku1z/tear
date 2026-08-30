import { assertAuroraTrackFieldState, assertGhostTrackRouteState } from "../gameplay/environment/aurora-track";
import { isValidBloomWellForcePolicy } from "../gameplay/environment/bloom-well";
import { GRAFT_ANCHOR_TYPES, graftAnchorDefinition } from "../gameplay/environment/graft-anchor";
import { validateEnvironmentCodecPayload as validateNeutral,
  type EnvironmentCodecIssue, type EnvironmentCodecValidationPort } from "./environment-codec";

const issue = (path: string, message: string): EnvironmentCodecIssue => Object.freeze({ path, message });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function geometry(value: unknown, path: string): readonly EnvironmentCodecIssue[] {
  if (!record(value) || !finite(value.x) || !finite(value.y)) return [issue(path, "geometry requires finite x and y")];
  const issues: EnvironmentCodecIssue[] = [];
  for (const key of ["w", "h", "radius"] as const) {
    if (value[key] !== undefined && (!finite(value[key]) || value[key] < 0)) {
      issues.push(issue(`${path}.${key}`, `${key} must be finite and non-negative`));
    }
  }
  return issues;
}

const VERDANT_CODEC_VALIDATION: EnvironmentCodecValidationPort = Object.freeze({
  id: "verdant-authored-environment",
  validateField(entry: Readonly<Record<string, unknown>>, path: string) {
    if (entry.kind !== "bloom-well" || !text(entry.bloomWellId) || isValidBloomWellForcePolicy(entry.force)) return [];
    return [issue(`${path}.force`, "Bloom Well force must fit its bounded declared magnitude")];
  },
  validateCombatObject(entry: Readonly<Record<string, unknown>>, path: string) {
    const issues: EnvironmentCodecIssue[] = [];
    if (entry.factoryId === "graft-anchor") {
      const graftType = GRAFT_ANCHOR_TYPES.find((candidate) => candidate === entry.graftType);
      if (graftType === undefined) issues.push(issue(`${path}.graftType`, "Graft Anchor type is not approved"));
      else for (const [name, expected] of Object.entries(graftAnchorDefinition(graftType))) {
        if (entry[name] !== expected) issues.push(issue(`${path}.${name}`, "Graft Anchor effect definition does not match canonical tuning"));
      }
      issues.push(...geometry(entry.connectionGeometry, `${path}.connectionGeometry`));
      for (const name of ["createdTick", "activationTick"] as const) if (!Number.isSafeInteger(entry[name]) || Number(entry[name]) < 0) {
        issues.push(issue(`${path}.${name}`, `${name} must be a non-negative safe integer`));
      }
      if (entry.nextPulseTick !== null && (!Number.isSafeInteger(entry.nextPulseTick) || Number(entry.nextPulseTick) < 0)) {
        issues.push(issue(`${path}.nextPulseTick`, "nextPulseTick must be null or a non-negative safe integer"));
      }
      if (!finite(entry.recoverySpentHealthFraction) || entry.recoverySpentHealthFraction < 0 || entry.recoverySpentHealthFraction > 0.1) {
        issues.push(issue(`${path}.recoverySpentHealthFraction`, "Graft recovery spend must be finite and bounded"));
      }
      if (entry.procPolicyId !== "boss-combat-object") issues.push(issue(`${path}.procPolicyId`, "Graft Anchor proc policy must remain boss-combat-object"));
    }
    if (entry.factoryId === "root-link" && entry.rootCageId !== undefined) {
      if (!text(entry.rootCageId)) issues.push(issue(`${path}.rootCageId`, "Root Cage ID must be stable"));
      if (entry.patternId !== "root-cage") issues.push(issue(`${path}.patternId`, "Root Cage must retain its canonical pattern ID"));
      if (entry.boundarySide !== "left" && entry.boundarySide !== "right") issues.push(issue(`${path}.boundarySide`, "Root Cage boundary side is not approved"));
      if (entry.response !== "sever-either-boundary") issues.push(issue(`${path}.response`, "Root Cage must retain a guaranteed sever response"));
      for (const name of ["createdTick", "activationTick", "expiryTick"] as const) if (!Number.isSafeInteger(entry[name]) || Number(entry[name]) < 0) {
        issues.push(issue(`${path}.${name}`, `${name} must be a non-negative safe integer`));
      }
      if (Number(entry.createdTick) > Number(entry.activationTick) || Number(entry.activationTick) >= Number(entry.expiryTick)) {
        issues.push(issue(`${path}.expiryTick`, "Root Cage timing must preserve warning before bounded expiry"));
      }
    }
    return issues;
  },
});

const PALE_CODEC_VALIDATION: EnvironmentCodecValidationPort = Object.freeze({
  id: "pale-authored-environment",
  validateField(entry: Readonly<Record<string, unknown>>, path: string) {
    if (entry.kind !== "aurora-track") return [];
    try { assertAuroraTrackFieldState(entry as never); return []; }
    catch (error) { return [issue(path, error instanceof Error ? error.message : "Aurora Track data is invalid")]; }
  },
  validateRoute(entry: Readonly<Record<string, unknown>>, path: string) {
    if (entry.kind !== "ghost-track") return [];
    try { assertGhostTrackRouteState(entry as never); return []; }
    catch (error) { return [issue(path, error instanceof Error ? error.message : "Ghost Track data is invalid")]; }
  },
});

/** Authored validators are composed beside the neutral codec; neither biome imports the other. */
export const AUTHORED_ENVIRONMENT_CODEC_VALIDATORS = Object.freeze([
  VERDANT_CODEC_VALIDATION,
  PALE_CODEC_VALIDATION,
] as const);

export function validateAuthoredEnvironmentCodecPayload(payload: unknown): readonly EnvironmentCodecIssue[] {
  return validateNeutral(payload, AUTHORED_ENVIRONMENT_CODEC_VALIDATORS);
}
