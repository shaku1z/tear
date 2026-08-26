import { hasMonotonicEnvelopes } from "../domain/envelopes";
import { normalizeGameAction } from "../input/game-action";
import { bossDefinition } from "../gameplay/run/boss-definitions";
import type {
  GhostRangeV1,
  TearBuildIdentityV1,
  TearContractValidationIssue,
  TearContractValidationResult,
  TearFailureArtifactV1,
  TearHashSetV1,
  TearObservationV1,
  TearPortableContractV1,
  TearProvenanceV1,
  TearScenarioV1,
  TearSnapshotV1,
  TearCausalEventV1,
} from "./contracts";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "./contracts";
import {
  BOSS_REGISTRY,
  DIFFICULTY_REGISTRY,
  ENTITY_KIND_REGISTRY,
  EVENT_REGISTRY,
  GAMEPLAY_SCENARIO_SUBJECT_REGISTRY,
  HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS,
  INVARIANT_REGISTRY,
  RUN_MODE_REGISTRY,
  STAGE_REGISTRY,
  WEAPON_REGISTRY,
  WITHIN_TICK_PHASES,
} from "./registries";

const MAX_COLLECTION = 100_000;
const MAX_IDENTIFIER = 256;
const MAX_TEXT = 16_384;
const HASH_PATTERN = /^(?:[a-z0-9][a-z0-9._-]*:)?[a-f0-9]{8,256}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, max = MAX_IDENTIFIER): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function safeInteger(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_COLLECTION;
}

function issue(issues: TearContractValidationIssue[], path: string, message: string): void {
  issues.push(Object.freeze({ path, message }));
}

function validateObservedBounds(value: unknown, path: string, issues: TearContractValidationIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "must be an object"); return; }
  for (const key of ["minX", "maxX", "minY", "maxY"]) {
    if (!finite(value[key])) issue(issues, `${path}.${key}`, "must be finite");
  }
  if (finite(value.minX) && finite(value.maxX) && value.minX > value.maxX) {
    issue(issues, path, "must have ordered horizontal bounds");
  }
  if (finite(value.minY) && finite(value.maxY) && value.minY > value.maxY) {
    issue(issues, path, "must have ordered vertical bounds");
  }
}

function validateNavigation(value: unknown, issues: TearContractValidationIssue[]): void {
  if (!isRecord(value)) { issue(issues, "navigation", "must be an object"); return; }
  if (!boundedArray(value.surfaces)) issue(issues, "navigation.surfaces", "must be a bounded array");
  else value.surfaces.forEach((entry, index) => {
    const path = `navigation.surfaces[${String(index)}]`;
    if (!isRecord(entry)) { issue(issues, path, "must be an object"); return; }
    if (!stringValue(entry.id)) issue(issues, `${path}.id`, "must be a bounded identifier");
    validateObservedBounds(entry.bounds, `${path}.bounds`, issues);
    if (typeof entry.oneWay !== "boolean" || typeof entry.collidable !== "boolean") {
      issue(issues, path, "must declare boolean oneWay and collidable values");
    }
    if (!stringValue(entry.materializationState)) issue(issues, `${path}.materializationState`, "must be a bounded string");
    if (entry.lane !== undefined && (typeof entry.lane !== "string"
      || !["lower", "upper"].includes(entry.lane))) issue(issues, `${path}.lane`, "is not recognized");
    if (!boundedArray(entry.connectionIds) || entry.connectionIds.some((id) => !stringValue(id))) {
      issue(issues, `${path}.connectionIds`, "must be a bounded identifier array");
    }
  });
  if (!boundedArray(value.hazards)) issue(issues, "navigation.hazards", "must be a bounded array");
  else value.hazards.forEach((entry, index) => {
    const path = `navigation.hazards[${String(index)}]`;
    if (!isRecord(entry)) { issue(issues, path, "must be an object"); return; }
    if (!stringValue(entry.id) || !stringValue(entry.surfaceId)) issue(issues, path, "must have bounded identifiers");
    if (!["fire", "crumble", "cage"].includes(String(entry.type))) issue(issues, `${path}.type`, "is not recognized");
    if (!stringValue(entry.state)) issue(issues, `${path}.state`, "must be a bounded string");
    if (typeof entry.active !== "boolean") issue(issues, `${path}.active`, "must be boolean");
    validateObservedBounds(entry.bounds, `${path}.bounds`, issues);
  });
}

function readHashSet(value: unknown, path: string, issues: TearContractValidationIssue[]): TearHashSetV1 | undefined {
  if (!isRecord(value)) { issue(issues, path, "must be an object"); return undefined; }
  const keys = ["exact", "semantic", "visual", "progression", "environment"] as const;
  for (const key of keys) if (!stringValue(value[key]) || !HASH_PATTERN.test(value[key])) issue(issues, `${path}.${key}`, "must be a hash");
  if (keys.some((key) => !stringValue(value[key]) || !HASH_PATTERN.test(value[key]))) return undefined;
  return Object.freeze({
    exact: value.exact as string, semantic: value.semantic as string, visual: value.visual as string,
    progression: value.progression as string, environment: value.environment as string,
  });
}

function readBuild(value: unknown, path: string, issues: TearContractValidationIssue[]): TearBuildIdentityV1 | undefined {
  if (!isRecord(value)) { issue(issues, path, "must be an object"); return undefined; }
  const keys = ["version", "revision", "target", "rulesetVersion", "contentHash", "configHash"] as const;
  for (const key of keys) if (!stringValue(value[key])) issue(issues, `${path}.${key}`, "must be a non-empty bounded string");
  if (keys.some((key) => !stringValue(value[key]))) return undefined;
  return Object.freeze({
    version: value.version as string, revision: value.revision as string, target: value.target as string,
    rulesetVersion: value.rulesetVersion as string, contentHash: value.contentHash as string, configHash: value.configHash as string,
  });
}

function readProvenance(value: unknown, issues: TearContractValidationIssue[]): TearProvenanceV1 | undefined {
  if (!isRecord(value)) { issue(issues, "provenance", "must be an object"); return undefined; }
  const actors = ["human", "scripted-bot", "neural-bot", "hybrid", "state-forge", "developer"];
  const execution = ["training", "engineering", "black-box"];
  const observation = ["human-equivalent", "structured-state", "privileged-diagnostic", "pixel-only"];
  const consent = ["no-training", "private-personalization-only", "anonymous-improvement", "public-training"];
  if (!actors.includes(String(value.actor))) issue(issues, "provenance.actor", "is not recognized");
  if (!execution.includes(String(value.executionClass))) issue(issues, "provenance.executionClass", "is not recognized");
  if (!observation.includes(String(value.observationClass))) issue(issues, "provenance.observationClass", "is not recognized");
  if (!consent.includes(String(value.trainingConsent))) issue(issues, "provenance.trainingConsent", "is not recognized");
  if (!stringValue(value.producer)) issue(issues, "provenance.producer", "must be a bounded identifier");
  if (value.policyId !== undefined && !stringValue(value.policyId)) issue(issues, "provenance.policyId", "must be a bounded identifier");
  if (value.sourceId !== undefined && !stringValue(value.sourceId)) issue(issues, "provenance.sourceId", "must be a bounded identifier");
  const build = readBuild(value.build, "provenance.build", issues);
  if (issues.length > 0 || build === undefined) return undefined;
  return Object.freeze({
    actor: value.actor as TearProvenanceV1["actor"], producer: value.producer as string, build,
    executionClass: value.executionClass as TearProvenanceV1["executionClass"],
    observationClass: value.observationClass as TearProvenanceV1["observationClass"],
    ...(value.policyId === undefined ? {} : { policyId: value.policyId as string }),
    ...(value.sourceId === undefined ? {} : { sourceId: value.sourceId as string }),
    trainingConsent: value.trainingConsent as TearProvenanceV1["trainingConsent"],
  });
}

function parseObservation(value: Record<string, unknown>, issues: TearContractValidationIssue[]): TearObservationV1 | undefined {
  if (!safeInteger(value.tick)) issue(issues, "tick", "must be a non-negative safe integer");
  const observationClasses = ["human-equivalent", "structured-state", "privileged-diagnostic", "pixel-only"];
  if (!observationClasses.includes(String(value.observationClass))) issue(issues, "observationClass", "is not recognized");
  const player = value.player;
  if (!isRecord(player)) issue(issues, "player", "must be an object");
  else {
    for (const key of ["x", "y", "vx", "vy", "hp", "maxHp", "dashCharges"]) if (!finite(player[key])) issue(issues, `player.${key}`, "must be finite");
    for (const key of ["halfWidth", "halfHeight", "dashTimer", "dashCooldown", "iframe", "maxCharges"]) {
      if (player[key] !== undefined && (!finite(player[key]) || player[key] < 0)) issue(issues, `player.${key}`, "must be finite and nonnegative when present");
    }
    if (player.facing !== -1 && player.facing !== 1) issue(issues, "player.facing", "must be -1 or 1");
    if (typeof player.grounded !== "boolean") issue(issues, "player.grounded", "must be boolean");
  }
  const blade = value.blade;
  if (!isRecord(blade)) issue(issues, "blade", "must be an object");
  else {
    for (const key of ["handX", "handY", "tipX", "tipY", "vx", "vy", "tipSpeed"]) if (!finite(blade[key])) issue(issues, `blade.${key}`, "must be finite");
    if (!stringValue(blade.state)) issue(issues, "blade.state", "must be a bounded string");
    for (const key of ["chambers", "chamberCooldown", "wheelSpin", "reversalCount"]) {
      if (blade[key] !== undefined && !finite(blade[key])) issue(issues, `blade.${key}`, "must be finite when present");
    }
  }
  if (!boundedArray(value.entities)) issue(issues, "entities", "must be a bounded array");
  else value.entities.forEach((entry, index) => {
    if (!isRecord(entry)) { issue(issues, `entities[${String(index)}]`, "must be an object"); return; }
    if (!stringValue(entry.id)) issue(issues, `entities[${String(index)}].id`, "must be a bounded identifier");
    if (typeof entry.kind !== "string" || !ENTITY_KIND_REGISTRY.has(entry.kind)) issue(issues, `entities[${String(index)}].kind`, "is not registered");
    for (const key of ["x", "y", "vx", "vy"]) if (!finite(entry[key])) issue(issues, `entities[${String(index)}].${key}`, "must be finite");
    if (entry.behaviorMode !== undefined && !stringValue(entry.behaviorMode)) {
      issue(issues, `entities[${String(index)}].behaviorMode`, "must be a bounded string");
    }
    for (const key of ["halfWidth", "halfHeight", "contactReach", "contactDamage", "chargeMult", "auraDmg", "stun", "bound", "radius", "damage"]) {
      if (entry[key] !== undefined && (!finite(entry[key]) || entry[key] < 0)) issue(issues, `entities[${String(index)}].${key}`, "must be finite and nonnegative when present");
    }
    if (entry.contactEnabled !== undefined && typeof entry.contactEnabled !== "boolean") issue(issues, `entities[${String(index)}].contactEnabled`, "must be boolean when present");
    if (entry.unparryable !== undefined && typeof entry.unparryable !== "boolean") issue(issues, `entities[${String(index)}].unparryable`, "must be boolean when present");
    if (entry.counterplay !== undefined && !stringValue(entry.counterplay)) issue(issues, `entities[${String(index)}].counterplay`, "must be a bounded string");
  });
  if (value.navigation !== undefined) validateNavigation(value.navigation, issues);
  const run = value.run;
  if (!isRecord(run)) issue(issues, "run", "must be an object");
  else {
    if (typeof run.mode !== "string" || !RUN_MODE_REGISTRY.has(run.mode)) issue(issues, "run.mode", "is not registered");
    if (typeof run.difficulty !== "string" || !DIFFICULTY_REGISTRY.has(run.difficulty)) issue(issues, "run.difficulty", "is not registered");
    if (typeof run.weapon !== "string" || !WEAPON_REGISTRY.has(run.weapon)) issue(issues, "run.weapon", "is not registered");
    if (!stringValue(run.stage) || !safeInteger(run.wave, 1) || !safeInteger(run.score) || !safeInteger(run.elapsedTicks)) issue(issues, "run", "contains invalid stage, wave, score, or elapsedTicks");
  }
  if (!boundedArray(value.availableActions) || value.availableActions.some((entry) => typeof entry !== "string")) issue(issues, "availableActions", "must be a bounded string array");
  return issues.length === 0 ? value as unknown as TearObservationV1 : undefined;
}

function parseEvent(value: Record<string, unknown>, issues: TearContractValidationIssue[]): TearCausalEventV1 | undefined {
  if (!stringValue(value.id)) issue(issues, "id", "must be a bounded identifier");
  if (typeof value.type !== "string" || !EVENT_REGISTRY.has(value.type)) issue(issues, "type", "is not a registered event");
  if (!safeInteger(value.tick) || !safeInteger(value.sequence)) issue(issues, "tick", "tick and sequence must be non-negative safe integers");
  if (typeof value.phase !== "string" || !(WITHIN_TICK_PHASES as readonly string[]).includes(value.phase)) issue(issues, "phase", "is not registered");
  if (!["engine", "derived", "agent", "developer"].includes(String(value.source))) issue(issues, "source", "is not recognized");
  if (!isRecord(value.payload)) issue(issues, "payload", "must be an object");
  if (value.confidence !== undefined && (!finite(value.confidence) || value.confidence < 0 || value.confidence > 1)) issue(issues, "confidence", "must be from 0 to 1");
  for (const key of ["targetIds", "parentIds"] as const) {
    if (value[key] !== undefined && (!boundedArray(value[key]) || value[key].some((entry) => !stringValue(entry)))) issue(issues, key, "must be a bounded identifier array");
  }
  return issues.length === 0 ? value as unknown as TearCausalEventV1 : undefined;
}

function parseScenario(value: Record<string, unknown>, issues: TearContractValidationIssue[]): TearScenarioV1 | undefined {
  if (!stringValue(value.id) || !safeInteger(value.version, 1) || !stringValue(value.description, MAX_TEXT)) issue(issues, "$", "scenario id, version, or description is invalid");
  if (!["recorded-canonical", "reconstructed-reachable", "plausible-population", "surgical-valid", "adversarial-impossible"].includes(String(value.stateClass))) issue(issues, "stateClass", "is not recognized");
  if (!["training", "engineering", "black-box"].includes(String(value.executionClass))) issue(issues, "executionClass", "is not recognized");
  if (!stringValue(value.seed) || !safeInteger(value.maxTicks, 1)) issue(issues, "$", "seed or maxTicks is invalid");
  const start = value.start;
  if (!isRecord(start)) issue(issues, "start", "must be an object");
  else {
    if (typeof start.mode !== "string" || !RUN_MODE_REGISTRY.has(start.mode)) issue(issues, "start.mode", "is not registered");
    if (typeof start.difficulty !== "string" || !DIFFICULTY_REGISTRY.has(start.difficulty)) issue(issues, "start.difficulty", "is not registered");
    if (typeof start.weapon !== "string" || !WEAPON_REGISTRY.has(start.weapon)) issue(issues, "start.weapon", "is not registered");
    if (start.stage !== undefined && (typeof start.stage !== "string" || !STAGE_REGISTRY.has(start.stage))) {
      issue(issues, "start.stage", "is not a registered current-game stage");
    }
    if (start.boss !== undefined && (typeof start.boss !== "string" || !BOSS_REGISTRY.has(start.boss))) {
      issue(issues, "start.boss", "is not a registered current-game boss");
    }
    if (start.boss !== undefined && typeof start.mode === "string") {
      if (["tutorial", "playground", "sandbox"].includes(start.mode)) {
        issue(issues, "start.boss", "is incompatible with the selected run mode");
      } else if (value.stateClass === "recorded-canonical" && start.mode !== "bossonly") {
        issue(issues, "start.boss", "natural boss selection requires bossonly mode");
      }
    }
    if (start.bossPhase !== undefined) {
      if (typeof start.boss !== "string" || !BOSS_REGISTRY.has(start.boss)) {
        issue(issues, "start.bossPhase", "requires a registered boss");
      } else {
        const phaseCount = bossDefinition(start.boss).phaseMarks.length + 1;
        if (typeof start.bossPhase !== "string" || !/^[1-9][0-9]*$/u.test(start.bossPhase)
          || Number(start.bossPhase) < 1 || Number(start.bossPhase) > phaseCount) {
          issue(issues, "start.bossPhase", "is not a valid production boss phase ordinal");
        }
      }
    }
    if (start.wave !== undefined && !safeInteger(start.wave, 1)) issue(issues, "start.wave", "must be a positive integer");
  }
  if (!boundedArray(value.assertions) || value.assertions.some((entry) => typeof entry !== "string" || !INVARIANT_REGISTRY.has(entry))) issue(issues, "assertions", "contains an unregistered invariant");
  if (!boundedArray(value.tags) || value.tags.some((entry) => !stringValue(entry))) issue(issues, "tags", "must be a bounded identifier array");
  if (value.backends !== undefined) {
    if (!boundedArray(value.backends) || value.backends.length === 0
      || value.backends.some((backend) => backend !== "live" && backend !== "headless")
      || new Set(value.backends).size !== value.backends.length) {
      issue(issues, "backends", "must contain unique supported live/headless backends");
    }
  }
  if (value.subject !== undefined) {
    const subject = value.subject;
    if (!isRecord(subject) || !["gameplay", "weapon", "boss"].includes(String(subject.kind))
      || !stringValue(subject.id)) {
      issue(issues, "subject", "must declare a recognized current scenario subject");
    } else if (isRecord(start) && start.boss !== undefined
      && (subject.kind !== "boss" || subject.id !== start.boss)) {
      issue(issues, "subject", "a current boss start requires its matching authoritative boss subject");
    } else if (subject.kind === "weapon") {
      if (!WEAPON_REGISTRY.has(subject.id) || !isRecord(start) || start.weapon !== subject.id) {
        issue(issues, "subject", "weapon must be current and match the scenario start");
      }
    } else if (subject.kind === "boss") {
      if (!BOSS_REGISTRY.has(subject.id) || !isRecord(start) || start.boss !== subject.id) {
        issue(issues, "subject", "boss must be current and match the scenario start");
      }
      if (Array.isArray(value.backends) && value.backends.includes("headless")) {
        issue(issues, "backends", "current boss scenarios require the supported live backend");
      }
    } else if (subject.kind === "gameplay") {
      if (!GAMEPLAY_SCENARIO_SUBJECT_REGISTRY.has(subject.id)) {
        issue(issues, "subject", "gameplay subject is not registered in the current scenario authority");
      } else if (Array.isArray(value.backends) && value.backends.includes("headless")
        && !HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS.some((supported) => supported === subject.id)) {
        issue(issues, "backends", "gameplay subject has no supported ordinary-headless transition");
      }
    }
  }
  return issues.length === 0 ? value as unknown as TearScenarioV1 : undefined;
}

function parseSnapshot(value: Record<string, unknown>, issues: TearContractValidationIssue[]): TearSnapshotV1 | undefined {
  if (!stringValue(value.id) || !safeInteger(value.tick) || !stringValue(value.seed)) issue(issues, "$", "snapshot id, tick, or seed is invalid");
  if (!["recorded-canonical", "reconstructed-reachable", "plausible-population", "surgical-valid", "adversarial-impossible"].includes(String(value.stateClass))) issue(issues, "stateClass", "is not recognized");
  const hashes = readHashSet(value.hashes, "hashes", issues);
  const provenance = readProvenance(value.provenance, issues);
  if (!isRecord(value.rng) || !isRecord(value.codecs) || !isRecord(value.state)) issue(issues, "$", "rng, codecs, and state must be objects");
  return issues.length === 0 && hashes !== undefined && provenance !== undefined ? value as unknown as TearSnapshotV1 : undefined;
}

function parseFailure(value: Record<string, unknown>, issues: TearContractValidationIssue[]): TearFailureArtifactV1 | undefined {
  if (!stringValue(value.id) || !stringValue(value.scenarioId) || !safeInteger(value.scenarioVersion, 1) || !stringValue(value.seed)) issue(issues, "$", "failure identity is invalid");
  const build = readBuild(value.build, "build", issues);
  const hashes = readHashSet(value.hashes, "hashes", issues);
  if (!safeInteger(value.firstFailureTick)) issue(issues, "firstFailureTick", "must be non-negative");
  if (typeof value.invariantId !== "string" || !INVARIANT_REGISTRY.has(value.invariantId)) issue(issues, "invariantId", "is not registered");
  if (!["info", "warning", "error", "fatal"].includes(String(value.severity))) issue(issues, "severity", "is not recognized");
  if (!stringValue(value.message, MAX_TEXT)) issue(issues, "message", "must be bounded text");
  if (!boundedArray(value.actions)) issue(issues, "actions", "must be a bounded array");
  else {
    for (const [index, action] of value.actions.entries()) {
      if (!isRecord(action) || action.kind !== "command" || !safeInteger(action.id, 1) || !safeInteger(action.tick) || !normalizeGameAction(action.command).ok) issue(issues, `actions[${String(index)}]`, "is not a valid command envelope");
    }
    if (!hasMonotonicEnvelopes(value.actions as readonly Readonly<{ id: number; tick: number }>[])) issue(issues, "actions", "must be monotonic");
  }
  if (!boundedArray(value.eventIds) || value.eventIds.some((entry) => !stringValue(entry))) issue(issues, "eventIds", "must be a bounded identifier array");
  if (!isRecord(value.attachments) || Object.values(value.attachments).some((entry) => !stringValue(entry, 4_096))) issue(issues, "attachments", "must map names to bounded paths");
  return issues.length === 0 && build !== undefined && hashes !== undefined ? value as unknown as TearFailureArtifactV1 : undefined;
}

function parseRange(value: Record<string, unknown>, issues: TearContractValidationIssue[]): GhostRangeV1 | undefined {
  if (!stringValue(value.ghostId)) issue(issues, "ghostId", "must be a bounded identifier");
  if (!safeInteger(value.fromTick) || !safeInteger(value.toTick) || value.toTick < value.fromTick) issue(issues, "$", "range ticks are invalid");
  if (!safeInteger(value.preRollTicks) || !safeInteger(value.postRollTicks)) issue(issues, "$", "roll ticks must be non-negative");
  return issues.length === 0 ? value as unknown as GhostRangeV1 : undefined;
}

export function validateTearContract(input: unknown): TearContractValidationResult {
  let value: unknown = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input) as unknown; }
    catch { return Object.freeze({ ok: false, issues: [Object.freeze({ path: "$", message: "is not valid JSON" })] }); }
  }
  const issues: TearContractValidationIssue[] = [];
  if (!isRecord(value)) return Object.freeze({ ok: false, issues: [Object.freeze({ path: "$", message: "must be an object" })] });
  if (value.format !== TEAR_CONTRACT_FORMAT) issue(issues, "format", `must be ${TEAR_CONTRACT_FORMAT}`);
  if (value.schemaVersion !== TEAR_CONTRACT_VERSION) issue(issues, "schemaVersion", `must be ${String(TEAR_CONTRACT_VERSION)}`);
  let parsed: TearPortableContractV1 | undefined;
  if (issues.length === 0) {
    switch (value.kind) {
      case "observation": parsed = parseObservation(value, issues); break;
      case "event": parsed = parseEvent(value, issues); break;
      case "scenario": parsed = parseScenario(value, issues); break;
      case "snapshot": parsed = parseSnapshot(value, issues); break;
      case "failure": parsed = parseFailure(value, issues); break;
      case "ghost-range": parsed = parseRange(value, issues); break;
      default: issue(issues, "kind", "is not a recognized Tear contract kind");
    }
  }
  return parsed === undefined || issues.length > 0
    ? Object.freeze({ ok: false, issues: Object.freeze(issues) })
    : Object.freeze({ ok: true, value: parsed });
}
