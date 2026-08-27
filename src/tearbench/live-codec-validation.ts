import type { TearCodecId } from "./registries";
import type { TearCodecIssue } from "./state-codecs";
import { findVariant } from "../gameplay/variants";

function issue(codecId: TearCodecId, path: string, message: string): TearCodecIssue {
  return Object.freeze({ codecId, path, message });
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(codecId: TearCodecId, payload: unknown): readonly TearCodecIssue[] {
  return record(payload) ? [] : [issue(codecId, "$", "live codec payload must be an object")];
}

function requireArray(codecId: TearCodecId, payload: unknown): readonly TearCodecIssue[] {
  return Array.isArray(payload) ? [] : [issue(codecId, "$", "live codec payload must be an array")];
}

function finiteField(
  codecId: TearCodecId,
  payload: Readonly<Record<string, unknown>>,
  key: string,
): TearCodecIssue[] {
  return typeof payload[key] === "number" && Number.isFinite(payload[key])
    ? [] : [issue(codecId, `$.${key}`, `${key} must be finite`)];
}

function entityArray(codecId: TearCodecId, payload: unknown): readonly TearCodecIssue[] {
  const structural = requireArray(codecId, payload);
  if (structural.length > 0 || !Array.isArray(payload)) return structural;
  return Object.freeze(payload.flatMap((entry, index) => {
    if (!record(entry)) return [issue(codecId, `$[${String(index)}]`, "entity must be an object")];
    const issues: TearCodecIssue[] = [];
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      issues.push(issue(codecId, `$[${String(index)}].id`, "entity requires a stable id"));
    }
    if (typeof entry.factoryId !== "string" || entry.factoryId.length === 0) {
      issues.push(issue(codecId, `$[${String(index)}].factoryId`, "entity requires an approved factory id"));
    }
    const variantId = entry.variantId ?? entry.variant;
    if (variantId !== undefined && variantId !== "") {
      if (typeof variantId !== "string" || variantId.length > 80) {
        issues.push(issue(codecId, `$[${String(index)}].variantId`, "variant identity must be a bounded string"));
      } else if (typeof entry.factoryId === "string" && findVariant(entry.factoryId, variantId) === null) {
        issues.push(issue(codecId, `$[${String(index)}].variantId`, "variant identity is not valid for the enemy factory family"));
      }
    }
    issues.push(...finiteField(codecId, entry, "x"), ...finiteField(codecId, entry, "y"));
    return issues;
  }));
}

/** Domain shape checks layered on top of bounded declarative-data validation. */
export function validateLiveCodecPayload(
  codecId: TearCodecId,
  payload: unknown,
): readonly TearCodecIssue[] {
  if (codecId === "tear.enemy.v1" || codecId === "tear.boss.v1" || codecId === "tear.projectile.v1") {
    return entityArray(codecId, payload);
  }
  if (codecId === "tear.platform.v1") return requireArray(codecId, payload);
  const structural = requireRecord(codecId, payload);
  if (structural.length > 0 || !record(payload)) return structural;
  const issues: TearCodecIssue[] = [];
  if (codecId === "tear.player.v1") {
    if (payload.id !== "player") issues.push(issue(codecId, "$.id", "player stable id must be player"));
    issues.push(...finiteField(codecId, payload, "x"), ...finiteField(codecId, payload, "y"),
      ...finiteField(codecId, payload, "hp"), ...finiteField(codecId, payload, "maxHp"));
  } else if (codecId === "tear.blade.v1") {
    if (payload.id !== "blade" || payload.ownerId !== "player") {
      issues.push(issue(codecId, "$.ownerId", "blade must use stable id blade and owner player"));
    }
    if (typeof payload.weaponId !== "string") issues.push(issue(codecId, "$.weaponId", "blade requires weaponId"));
  } else if (codecId === "tear.run.v1") {
    for (const key of ["mode", "difficulty"] as const) {
      if (typeof payload[key] !== "string") issues.push(issue(codecId, `$.${key}`, `${key} must be a string`));
    }
    issues.push(...finiteField(codecId, payload, "wave"), ...finiteField(codecId, payload, "tick"));
  } else if (codecId === "tear.world.v1") {
    issues.push(...finiteField(codecId, payload, "clock"));
    if (!record(payload.identityState)) issues.push(issue(codecId, "$.identityState", "world requires identity allocator state"));
  } else if (codecId === "tear.hazard.v1") {
    if (!Array.isArray(payload.slowZones) || !Array.isArray(payload.walls)) {
      issues.push(issue(codecId, "$", "hazard codec requires slowZones and walls arrays"));
    }
  } else if (codecId === "tear.ui.v1") {
    if (typeof payload.screen !== "string" || typeof payload.focusId !== "string") {
      issues.push(issue(codecId, "$", "UI codec requires screen and focusId"));
    }
  } else if (codecId === "tear.reward.v1") {
    if (!("selection" in payload)) issues.push(issue(codecId, "$.selection", "reward codec requires selection"));
  } else if (codecId === "tear.configuration.v1") {
    if (typeof payload.rulesetVersion !== "string" || !record(payload.values)) {
      issues.push(issue(codecId, "$", "configuration codec requires rulesetVersion and values"));
    }
  } else if (codecId === "tear.cinematic.v1") {
    if (payload.format !== "tear.cinematic-director" || payload.schemaVersion !== 1) {
      issues.push(issue(codecId, "$", "cinematic codec requires the v1 director format"));
    }
    const active = payload.active === true;
    const nullableIdentity = (key: "scriptId" | "scriptRevision" | "beatId") =>
      payload[key] === null || typeof payload[key] === "string";
    for (const key of ["scriptId", "scriptRevision", "beatId"] as const) {
      if (!nullableIdentity(key)) issues.push(issue(codecId, `$.${key}`, `${key} must be string or null`));
    }
    for (const key of ["elapsedSeconds", "revealElapsedSeconds", "fullyVisibleElapsedSeconds", "totalElapsedSeconds"] as const) {
      issues.push(...finiteField(codecId, payload, key));
      if (typeof payload[key] === "number" && payload[key] < 0) {
        issues.push(issue(codecId, `$.${key}`, `${key} cannot be negative`));
      }
    }
    if (!Number.isSafeInteger(payload.beatIndex)) issues.push(issue(codecId, "$.beatIndex", "beatIndex must be a safe integer"));
    for (const key of ["active", "fullyVisible", "skipping", "finished"] as const) {
      if (typeof payload[key] !== "boolean") issues.push(issue(codecId, `$.${key}`, `${key} must be boolean`));
    }
    if (active && (typeof payload.scriptId !== "string" || payload.scriptId.length === 0 ||
      typeof payload.scriptRevision !== "string" || payload.scriptRevision.length === 0 ||
      typeof payload.beatId !== "string" || payload.beatId.length === 0 ||
      !Number.isSafeInteger(payload.beatIndex) || Number(payload.beatIndex) < 0 || payload.finished === true)) {
      issues.push(issue(codecId, "$", "active cinematic requires a revisioned script, beat, and unfinished state"));
    }
    if (!active && (payload.scriptId !== null || payload.scriptRevision !== null || payload.beatId !== null ||
      payload.beatIndex !== -1 || payload.skipping !== false)) {
      issues.push(issue(codecId, "$", "inactive cinematic cannot retain an active script, beat, or skip state"));
    }
    if (typeof payload.totalElapsedSeconds === "number" && typeof payload.elapsedSeconds === "number" &&
      payload.totalElapsedSeconds < payload.elapsedSeconds) {
      issues.push(issue(codecId, "$.totalElapsedSeconds", "total elapsed cannot precede beat elapsed"));
    }
    const elapsedSeconds = payload.elapsedSeconds;
    if (typeof elapsedSeconds === "number" &&
      ([payload.revealElapsedSeconds, payload.fullyVisibleElapsedSeconds]
        .some((value) => typeof value === "number" && value > elapsedSeconds))) {
      issues.push(issue(codecId, "$", "reveal timing cannot exceed beat elapsed"));
    }
    if (!active && (payload.elapsedSeconds !== 0 || payload.revealElapsedSeconds !== 0 ||
      payload.fullyVisibleElapsedSeconds !== 0 || payload.totalElapsedSeconds !== 0 ||
      payload.fullyVisible !== true || payload.finished !== false)) {
      issues.push(issue(codecId, "$", "inactive cinematic must use the canonical idle position"));
    }
  } else if (Object.keys(payload).length === 0) {
    issues.push(issue(codecId, "$", "RNG codec requires at least one named stream"));
  }
  return Object.freeze(issues);
}
