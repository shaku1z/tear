import type { TearCodecId } from "./registries";
import type { TearCodecIssue } from "./state-codecs";
import { findVariant } from "../gameplay/variants";
import { ROOTBOUND_LAST_SPRING } from "../gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_REGROWTH_CONNECTION_COUNT, ROOTBOUND_REGROWTH_OUTCOMES } from "../gameplay/environment/regrowth-link";

function issue(codecId: TearCodecId, path: string, message: string): TearCodecIssue {
  return Object.freeze({ codecId, path, message });
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function canonicalVariantBehavior(factoryId: string, variantId: string): string | null {
  const variant = findVariant(factoryId, variantId);
  if (variant === null) return null;
  const probe = { behavior: "", contactReach: 0, speedMult: 1, hp: 1, maxHp: 1 };
  variant.apply(probe);
  return probe.behavior;
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
    if (entry.variantId !== undefined && entry.variant !== undefined && entry.variantId !== entry.variant) {
      issues.push(issue(codecId, `$[${String(index)}].variant`, "variant aliases must identify the same family variant"));
    }
    const variantId = entry.variantId ?? entry.variant;
    if (variantId !== undefined && variantId !== "") {
      if (typeof variantId !== "string" || variantId.length > 80) {
        issues.push(issue(codecId, `$[${String(index)}].variantId`, "variant identity must be a bounded string"));
      } else if (typeof entry.factoryId === "string") {
        const behavior = canonicalVariantBehavior(entry.factoryId, variantId);
        if (behavior === null) {
          issues.push(issue(codecId, `$[${String(index)}].variantId`, "variant identity is not valid for the enemy factory family"));
        } else if (entry.behavior !== behavior) {
          issues.push(issue(codecId, `$[${String(index)}].behavior`, "variant behavior must match its canonical family identity"));
        }
      }
    }
    issues.push(...finiteField(codecId, entry, "x"), ...finiteField(codecId, entry, "y"));
    if (codecId === "tear.boss.v1" && entry.factoryId === "rootbound") {
      issues.push(...rootboundPhaseThreeState(codecId, entry, `$[${String(index)}]`));
    }
    return issues;
  }));
}

function rootboundPhaseThreeState(
  codecId: TearCodecId,
  entry: Readonly<Record<string, unknown>>,
  path: string,
): TearCodecIssue[] {
  const issues: TearCodecIssue[] = [];
  const regrowth = entry.regrowthState;
  if (!record(regrowth)) {
    issues.push(issue(codecId, `${path}.regrowthState`, "Rootbound requires canonical Regrowth state"));
  } else {
    const phase = regrowth.phase;
    const useCount = regrowth.useCount;
    const required = regrowth.requiredConnectionIds;
    const surviving = regrowth.survivingConnectionIds;
    const classification = regrowth.interruptClassification;
    const heal = regrowth.resolvedHealFraction;
    if (!(["idle", "channeling", "resolved"] as const).includes(phase as never)) {
      issues.push(issue(codecId, `${path}.regrowthState.phase`, "Regrowth phase is not approved"));
    }
    if (useCount !== 0 && useCount !== 1) issues.push(issue(codecId, `${path}.regrowthState.useCount`, "Regrowth use count must be zero or one"));
    if (!Array.isArray(required) || !Array.isArray(surviving)
      || required.some((id: unknown) => typeof id !== "string" || id.length === 0)
      || surviving.some((id: unknown) => typeof id !== "string" || id.length === 0)
      || new Set(required).size !== required.length || new Set(surviving).size !== surviving.length) {
      issues.push(issue(codecId, `${path}.regrowthState.requiredConnectionIds`, "Regrowth connection IDs must be unique non-empty arrays"));
    } else if (surviving.some((id) => !required.includes(id))) {
      issues.push(issue(codecId, `${path}.regrowthState.survivingConnectionIds`, "surviving Regrowth connections must belong to the required set"));
    }
    if (!finite(regrowth.progress) || regrowth.progress < 0 || regrowth.progress > 1) {
      issues.push(issue(codecId, `${path}.regrowthState.progress`, "Regrowth progress must be within zero and one"));
    }
    if (regrowth.startTick !== null && (!Number.isSafeInteger(regrowth.startTick) || Number(regrowth.startTick) < 0)) {
      issues.push(issue(codecId, `${path}.regrowthState.startTick`, "Regrowth start tick must be null or a non-negative safe integer"));
    }
    if (classification !== null && !(["full-interrupt", "partial-interrupt", "no-interrupt"] as const).includes(classification as never)) {
      issues.push(issue(codecId, `${path}.regrowthState.interruptClassification`, "Regrowth interrupt classification is not approved"));
    }
    if (heal !== null && (!finite(heal) || heal < 0 || heal > ROOTBOUND_REGROWTH_OUTCOMES.maximumHealFraction)) {
      issues.push(issue(codecId, `${path}.regrowthState.resolvedHealFraction`, "Regrowth healing must remain within its canonical budget"));
    }
    if (phase === "idle" && (useCount !== 0 || regrowth.startTick !== null || (Array.isArray(required) && required.length !== 0)
      || classification !== null || heal !== null)) {
      issues.push(issue(codecId, `${path}.regrowthState`, "idle Regrowth cannot retain channel or resolution state"));
    }
    if ((phase === "channeling" || phase === "resolved") && (useCount !== 1 || !Number.isSafeInteger(regrowth.startTick)
      || !Array.isArray(required) || required.length !== ROOTBOUND_REGROWTH_CONNECTION_COUNT)) {
      issues.push(issue(codecId, `${path}.regrowthState`, `active or resolved Regrowth requires exactly ${String(ROOTBOUND_REGROWTH_CONNECTION_COUNT)} connections and one use`));
    }
    if (phase === "channeling" && (classification !== null || heal !== null)) {
      issues.push(issue(codecId, `${path}.regrowthState`, "channeling Regrowth cannot retain a resolved outcome"));
    }
    if (phase === "resolved" && (regrowth.progress !== 1 || classification === null)) {
      issues.push(issue(codecId, `${path}.regrowthState`, "resolved Regrowth requires complete progress and an interrupt classification"));
    }
  }
  const springStages = ["warning", "bloom", "commit", "punish", "complete"] as const;
  if (entry.lastSpringStage !== null && !springStages.includes(entry.lastSpringStage as never)) {
    issues.push(issue(codecId, `${path}.lastSpringStage`, "Last Spring stage is not approved"));
  }
  if (entry.lastSpringUseCount !== 0 && entry.lastSpringUseCount !== 1) {
    issues.push(issue(codecId, `${path}.lastSpringUseCount`, "Last Spring use count must be zero or one"));
  }
  if (!finite(entry.lastSpringT) || entry.lastSpringT < 0
    || entry.lastSpringT > Math.max(ROOTBOUND_LAST_SPRING.warning, ROOTBOUND_LAST_SPRING.bloom,
      ROOTBOUND_LAST_SPRING.commit, ROOTBOUND_LAST_SPRING.punish)) {
    issues.push(issue(codecId, `${path}.lastSpringT`, "Last Spring timer is outside its authored bounds"));
  }
  if (typeof entry.lastSpringHitSpent !== "boolean") {
    issues.push(issue(codecId, `${path}.lastSpringHitSpent`, "Last Spring hit state must be boolean"));
  }
  if (entry.lastSpringStage !== null && entry.lastSpringUseCount !== 1) {
    issues.push(issue(codecId, `${path}.lastSpringStage`, "active or complete Last Spring requires its single use"));
  }
  if (entry.lastSpringStage === "complete" && entry.lastSpringT !== 0) {
    issues.push(issue(codecId, `${path}.lastSpringT`, "complete Last Spring must have a zero timer"));
  }
  return issues;
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
