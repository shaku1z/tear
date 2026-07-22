import type { CommandEnvelope } from "../app/messages";
import { hasMonotonicEnvelopes } from "../app/messages";
import type { GameAction } from "../input/game-action";
import { normalizeGameAction } from "../input/game-action";
import { stableVerificationHash } from "./hash";

export const REPLAY_FORMAT = "tear-replay";
export const CURRENT_REPLAY_SCHEMA_VERSION = 2;

export interface ReplayBuildMetadata {
  readonly version: string;
  readonly revision: string;
  readonly target: string;
}

export interface ReplayRunMetadata {
  readonly runId: string;
  readonly seed: string;
  readonly ticksPerSecond: number;
}

export type TearScoreReplayMetadata =
  | Readonly<{
    enabled: true;
    engineVersion: string;
    scoreVersion: string;
    seed: string;
    eventJournalHash: string;
  }>
  | Readonly<{
    enabled: false;
    reason: "disabled" | "fallback" | "not-recorded";
  }>;

export type ReplayActionEnvelope = CommandEnvelope<GameAction>;

export interface ReplayEnvelopeV2 {
  readonly format: typeof REPLAY_FORMAT;
  readonly schemaVersion: typeof CURRENT_REPLAY_SCHEMA_VERSION;
  readonly rulesetVersion: string;
  readonly build: ReplayBuildMetadata;
  readonly run: ReplayRunMetadata;
  readonly actions: readonly ReplayActionEnvelope[];
  readonly final: Readonly<{ tick: number; stateHash: string }>;
  readonly tearScore: TearScoreReplayMetadata;
}

export interface ReplayEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly rulesetVersion: string;
  readonly buildVersion: string;
  readonly seed: string | number;
  readonly ticksPerSecond?: number;
  readonly actions: readonly Readonly<{ tick: number; action: GameAction }>[];
  readonly finalTick: number;
  readonly finalHash: string;
}

export interface ReplayValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ReplayValidationResult =
  | Readonly<{ ok: true; replay: ReplayEnvelopeV2 }>
  | Readonly<{ ok: false; issues: readonly ReplayValidationIssue[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return safeNonNegativeInteger(value) && value > 0;
}

function issue(issues: ReplayValidationIssue[], path: string, message: string): void {
  issues.push(Object.freeze({ path, message }));
}

function parseTearScore(value: unknown, issues: ReplayValidationIssue[]): TearScoreReplayMetadata | undefined {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    issue(issues, "tearScore", "must describe whether TearScore was enabled");
    return undefined;
  }
  if (!value.enabled) {
    if (value.reason !== "disabled" && value.reason !== "fallback" && value.reason !== "not-recorded") {
      issue(issues, "tearScore.reason", "must be disabled, fallback, or not-recorded");
      return undefined;
    }
    return Object.freeze({ enabled: false, reason: value.reason });
  }
  const fields = ["engineVersion", "scoreVersion", "seed", "eventJournalHash"] as const;
  for (const field of fields) {
    if (!nonEmptyString(value[field])) issue(issues, `tearScore.${field}`, "must be a non-empty string");
  }
  if (fields.some((field) => !nonEmptyString(value[field]))) return undefined;
  return Object.freeze({
    enabled: true,
    engineVersion: value.engineVersion as string,
    scoreVersion: value.scoreVersion as string,
    seed: value.seed as string,
    eventJournalHash: value.eventJournalHash as string,
  });
}

/** Validates unknown data and returns a canonical current-schema replay. */
export function validateReplayEnvelope(value: unknown): ReplayValidationResult {
  const issues: ReplayValidationIssue[] = [];
  if (!isRecord(value)) return Object.freeze({ ok: false, issues: [Object.freeze({ path: "$", message: "must be an object" })] });
  if (value.format !== REPLAY_FORMAT) issue(issues, "format", `must be ${REPLAY_FORMAT}`);
  if (value.schemaVersion !== CURRENT_REPLAY_SCHEMA_VERSION) issue(issues, "schemaVersion", `must be ${String(CURRENT_REPLAY_SCHEMA_VERSION)}`);
  if (!nonEmptyString(value.rulesetVersion)) issue(issues, "rulesetVersion", "must be a non-empty string");

  let build: ReplayBuildMetadata | undefined;
  if (!isRecord(value.build)) {
    issue(issues, "build", "must be an object");
  } else if (!nonEmptyString(value.build.version) || !nonEmptyString(value.build.revision) || !nonEmptyString(value.build.target)) {
    issue(issues, "build", "version, revision, and target must be non-empty strings");
  } else {
    build = Object.freeze({ version: value.build.version, revision: value.build.revision, target: value.build.target });
  }

  let run: ReplayRunMetadata | undefined;
  if (!isRecord(value.run)) {
    issue(issues, "run", "must be an object");
  } else if (!nonEmptyString(value.run.runId) || !nonEmptyString(value.run.seed) || !positiveInteger(value.run.ticksPerSecond)) {
    issue(issues, "run", "runId and seed must be non-empty strings and ticksPerSecond a positive integer");
  } else {
    run = Object.freeze({ runId: value.run.runId, seed: value.run.seed, ticksPerSecond: value.run.ticksPerSecond });
  }

  const actions: ReplayActionEnvelope[] = [];
  if (!Array.isArray(value.actions)) {
    issue(issues, "actions", "must be an array");
  } else {
    value.actions.forEach((candidate, index) => {
      const path = `actions[${String(index)}]`;
      if (!isRecord(candidate) || candidate.kind !== "command" || !positiveInteger(candidate.id) || !safeNonNegativeInteger(candidate.tick)) {
        issue(issues, path, "must be a command with positive id and non-negative tick");
        return;
      }
      const normalized = normalizeGameAction(candidate.command);
      if (!normalized.ok) {
        issue(issues, `${path}.command`, normalized.reason);
        return;
      }
      actions.push(Object.freeze({ kind: "command", id: candidate.id, tick: candidate.tick, command: normalized.action }));
    });
    if (actions.length === value.actions.length && !hasMonotonicEnvelopes(actions)) {
      issue(issues, "actions", "ids must increase and ticks must never decrease");
    }
  }

  let final: ReplayEnvelopeV2["final"] | undefined;
  if (!isRecord(value.final) || !safeNonNegativeInteger(value.final.tick) || !nonEmptyString(value.final.stateHash)) {
    issue(issues, "final", "tick must be non-negative and stateHash must be a non-empty string");
  } else {
    final = Object.freeze({ tick: value.final.tick, stateHash: value.final.stateHash });
  }

  const tearScore = parseTearScore(value.tearScore, issues);
  if (final !== undefined && actions.some((action) => action.tick > final.tick)) {
    issue(issues, "final.tick", "must not precede an action tick");
  }
  if (issues.length > 0 || build === undefined || run === undefined || final === undefined || tearScore === undefined || !nonEmptyString(value.rulesetVersion)) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({
    ok: true,
    replay: Object.freeze({
      format: REPLAY_FORMAT,
      schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
      rulesetVersion: value.rulesetVersion,
      build,
      run,
      actions: Object.freeze(actions),
      final,
      tearScore,
    }),
  });
}

/** Converts the sole legacy schema into the current explicit envelope. */
export function migrateReplayV1(value: ReplayEnvelopeV1): ReplayEnvelopeV2 {
  const actions = value.actions.map((entry, index): ReplayActionEnvelope => {
    const normalized = normalizeGameAction(entry.action);
    if (!normalized.ok || !safeNonNegativeInteger(entry.tick)) throw new TypeError(`Invalid legacy action at index ${String(index)}`);
    return Object.freeze({ kind: "command", id: index + 1, tick: entry.tick, command: normalized.action });
  });
  if (!hasMonotonicEnvelopes(actions)) throw new TypeError("Legacy action ticks must never decrease");
  const replay: ReplayEnvelopeV2 = {
    format: REPLAY_FORMAT,
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    rulesetVersion: value.rulesetVersion,
    build: Object.freeze({ version: value.buildVersion, revision: "legacy-unknown", target: "legacy-browser" }),
    run: Object.freeze({ runId: `legacy-${stableVerificationHash(value.seed)}`, seed: String(value.seed), ticksPerSecond: value.ticksPerSecond ?? 60 }),
    actions: Object.freeze(actions),
    final: Object.freeze({ tick: value.finalTick, stateHash: value.finalHash }),
    tearScore: Object.freeze({ enabled: false, reason: "not-recorded" }),
  };
  const result = validateReplayEnvelope(replay);
  if (!result.ok) throw new TypeError(`Migrated replay is invalid: ${result.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`);
  return result.replay;
}

function normalizeReplayV1(value: Record<string, unknown>): ReplayEnvelopeV1 | null {
  if (value.schemaVersion !== 1 || !nonEmptyString(value.rulesetVersion) || !nonEmptyString(value.buildVersion)
    || (typeof value.seed !== "string" && typeof value.seed !== "number")
    || (typeof value.seed === "number" && !Number.isFinite(value.seed))
    || (value.ticksPerSecond !== undefined && !positiveInteger(value.ticksPerSecond))
    || !safeNonNegativeInteger(value.finalTick) || !nonEmptyString(value.finalHash)
    || !Array.isArray(value.actions)) return null;
  const actions: Readonly<{ tick: number; action: GameAction }>[] = [];
  for (const candidate of value.actions) {
    if (!isRecord(candidate) || !safeNonNegativeInteger(candidate.tick)) return null;
    const normalized = normalizeGameAction(candidate.action);
    if (!normalized.ok) return null;
    actions.push(Object.freeze({ tick: candidate.tick, action: normalized.action }));
  }
  return Object.freeze({ schemaVersion: 1, rulesetVersion: value.rulesetVersion,
    buildVersion: value.buildVersion, seed: value.seed,
    ...(value.ticksPerSecond === undefined ? {} : { ticksPerSecond: value.ticksPerSecond }),
    actions: Object.freeze(actions), finalTick: value.finalTick, finalHash: value.finalHash });
}

/** Parses serialized or unknown replay data, migrating recognized older schemas. */
export function parseReplayEnvelope(value: unknown): ReplayValidationResult {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return Object.freeze({ ok: false, issues: [Object.freeze({ path: "$", message: "is not valid JSON" })] });
    }
  }
  if (isRecord(parsed) && parsed.schemaVersion === 1) {
    try {
      const legacy = normalizeReplayV1(parsed);
      if (legacy === null) throw new TypeError("Invalid legacy replay envelope");
      return Object.freeze({ ok: true, replay: migrateReplayV1(legacy) });
    } catch (error) {
      return Object.freeze({
        ok: false,
        issues: [Object.freeze({ path: "$", message: error instanceof Error ? error.message : "legacy migration failed" })],
      });
    }
  }
  return validateReplayEnvelope(parsed);
}

export function verifyReplayFinalState(replay: ReplayEnvelopeV2, finalState: unknown): boolean {
  return stableVerificationHash(finalState) === replay.final.stateHash;
}
