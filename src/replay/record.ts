/**
 * The one replay record: what a replay contains, its format id and version, and the check that turns
 * untrusted data into a record. Every other module (recorder, verify, store, share, watch, race, the
 * cloud summary and the list rows) takes the types from here. A unit test fails when another `src`
 * module declares a replay format id or version (tests/unit/replay-record.test.ts).
 *
 * A record is a seed, the run's start choices and its semantic actions at ticks, with a state hash
 * every REPLAY_CHECKPOINT_TICKS and at the end. It holds no keyframes, random tracks or frame clocks:
 * the detached world re-simulates the run, and keyframes for seeking are a cache kept beside a record.
 *
 * Live play and the detached world start a run the same way: one run start (src/app/run/run-start-world.ts)
 * from the same start choices, the record's `seed` and `start`. Until the rest of replay PR 5b, a record
 * from live play is still not guaranteed to verify, for two reasons: its reward picks are UI calls, not
 * actions, and the cinema frame clock. The detached world also carries one frame-clock exception
 * (src/app/world/detached/detached-step.ts): while a boss intro or a cinematic holds the fight, each tick
 * first runs one application frame of one tick's length with no confirm press.
 *
 * Tutorial and Playground runs are never recorded (they earn nothing and are practice), so a record of
 * one is refused.
 */
import { isRecord } from "../domain/records";
import { hasMonotonicEnvelopes, type CommandEnvelope } from "../domain/envelopes";
import { isBossDefinitionId, isEngineeringOnlyBoss } from "../gameplay/run/boss-definitions";
import { DIFFICULTY_IDS, type DifficultyId } from "../gameplay/run/difficulty-catalog";
import { MODE_IDS } from "../gameplay/run/mode-catalog";
import { rulesetRefusal } from "../gameplay/run/ruleset-version";
import type { RunMode } from "../gameplay/run/session";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { isWeaponId, type WeaponId } from "../gameplay/weapon-selection";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import { isRunSeed, type RunStartChoices } from "../gameplay/run/run-start-choices";

export const REPLAY_FORMAT = "tear-replay";
/**
 * Version 2 is the Ghost 2 packet (src/replay/envelope.ts), which goes with Ghost 2. A record starts at 3,
 * so a Ghost 2 file or upload is read as a replay from an earlier version.
 */
export const REPLAY_VERSION = 3;
export const REPLAY_TICKS_PER_SECOND = 120;
/** One state hash per second of simulation. */
export const REPLAY_CHECKPOINT_TICKS = REPLAY_TICKS_PER_SECOND;

/** A semantic action at the tick it was applied, numbered in the order it was applied. */
export type ReplayAction = CommandEnvelope<GameAction>;

export interface ReplayBuild {
  readonly version: string;
  readonly revision: string;
  readonly target: string;
}

/**
 * The run's start choices besides its seed: the player's picks, and the saved progress and settings the
 * start read (see RunStartChoices).
 */
export interface ReplayStart extends Omit<RunStartChoices, "runSeed" | "boss" | "mode" | "difficulty" | "weapon"> {
  readonly mode: RunMode;
  readonly difficulty: DifficultyId;
  readonly weapon: WeaponId;
  /** The boss a boss-only run fights; absent when the mode chooses. */
  readonly boss?: string;
}

/** Modes whose runs are recorded: every mode but the practice ones. */
export const RECORDED_MODE_IDS = Object.freeze(MODE_IDS.filter((mode) => mode !== "tutorial" && mode !== "playground"));

/** The start choices a record's run starts from. */
export function replayStartChoices(run: Pick<ReplayRun, "seed" | "start">): RunStartChoices {
  const { boss, ...start } = run.start;
  return Object.freeze({ ...start, boss: boss ?? "shuffle", runSeed: run.seed });
}

export interface ReplayCheckpoint {
  readonly tick: number;
  readonly hash: string;
}

export type ReplayOutcome = "victory" | "defeat" | "quit";

export interface ReplayResult {
  readonly tick: number;
  readonly hash: string;
  readonly outcome: ReplayOutcome;
}

/** What the simulation needs. Verify and the world builder read only this part. */
export interface ReplayRun {
  readonly ruleset: string;
  readonly build: ReplayBuild;
  /** The run seed: a non-zero unsigned 32-bit integer. */
  readonly seed: number;
  readonly start: ReplayStart;
  readonly actions: readonly ReplayAction[];
  readonly checkpoints: readonly ReplayCheckpoint[];
  readonly result: ReplayResult;
}

export type ReplayMarkKind = "stage" | "wave" | "boss";

/** A moment the seek bar names: a stage entered, a wave started or a boss wave started. */
export interface ReplayMark {
  readonly tick: number;
  readonly kind: ReplayMarkKind;
  readonly value: number;
}

/** What a list row and the seek bar show without re-simulating. Verify re-derives it and compares. */
export interface ReplaySummary {
  readonly score: number;
  readonly wave: number;
  /** Run time in seconds, as the run's clock counted it. */
  readonly time: number;
  readonly kills: number;
  readonly marks: readonly ReplayMark[];
}

/** Presentation only: never read by the simulation and never part of a hash. */
export interface ReplayLook {
  readonly playerName: string;
  /** Shards slot id to cosmetic id; an unknown id draws the default. */
  readonly cosmetics: Readonly<Record<string, string>>;
  readonly music: string | null;
  /** Wall-clock date of the recording, for display only. */
  readonly recordedAt: string;
}

export interface ReplayRecord {
  readonly format: typeof REPLAY_FORMAT;
  readonly version: typeof REPLAY_VERSION;
  readonly run: ReplayRun;
  readonly summary: ReplaySummary;
  readonly look: ReplayLook;
}

export type ReplayReadResult =
  | Readonly<{ ok: true; record: ReplayRecord }>
  | Readonly<{ ok: false; reason: "earlier-version" | "malformed"; message: string; detail: string }>;

/** Shown for a replay file or upload from before this record existed. */
export const EARLIER_VERSION_MESSAGE = "This replay is from an earlier version of Tear.";
/** Shown for data that is not a replay or is damaged. */
export const MALFORMED_MESSAGE = "This replay is damaged or is not a Tear replay.";

/** Ghost V3 files and capsules; this build reads them only to say they are from an earlier version. */
const EARLIER_FORMATS: readonly string[] = Object.freeze(["tearghost-capsule", "tearghost-linked-archive"]);

class RecordIssue extends Error {}

function fail(path: string, message: string): never {
  throw new RecordIssue(`${path} ${message}`);
}

function text(value: unknown, path: string, maximum = 200): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) fail(path, "must be a short string");
  return value;
}

function count(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(path, "must be a whole number");
  return value;
}

function amount(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(path, "must be a number");
  return value;
}

function stateHash(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{16}$/u.test(value)) fail(path, "must be a 16-digit hex hash");
  return value;
}

function object(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) fail(path, "must be an object");
  return value;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, "must be a list");
  return value;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) fail(path, `must be one of ${options.join(", ")}`);
  return value as T;
}

function runSeed(value: unknown, path: string): number {
  if (!isRunSeed(value)) fail(path, "must be a non-zero 32-bit whole number");
  return value;
}

function texts(value: unknown, path: string): readonly string[] {
  return Object.freeze(list(value, path).map((entry, index) => text(entry, `${path}[${String(index)}]`)));
}

function readRanks(value: unknown, path: string): Readonly<Record<string, number>> {
  const ranks: Record<string, number> = {};
  for (const [id, rank] of Object.entries(object(value, path))) ranks[text(id, path)] = count(rank, `${path}.${id}`);
  return Object.freeze(ranks);
}

function readChapters(value: unknown, path: string): readonly number[] {
  const chapters = list(value, path).map((entry, index) => count(entry, `${path}[${String(index)}]`));
  if (chapters.some((chapter, index) => index > 0 && chapter <= (chapters[index - 1] ?? -1)))
    fail(path, "must be in ascending order without repeats");
  return Object.freeze(chapters);
}

function readStart(value: unknown): ReplayStart {
  const start = object(value, "run.start");
  const weapon = text(start.weapon, "run.start.weapon");
  if (!isWeaponId(weapon)) fail("run.start.weapon", "is not a weapon");
  const boss = start.boss === undefined ? undefined : text(start.boss, "run.start.boss");
  if (boss !== undefined && !isBossDefinitionId(boss)) fail("run.start.boss", "is not a boss");
  // Engineering-only bosses stay outside replay identity (ENGINEERING_ONLY_BOSS_IDS).
  if (boss !== undefined && isEngineeringOnlyBoss(boss)) fail("run.start.boss", "is an engineering-only boss");
  if (typeof start.restoredTrail !== "boolean") fail("run.start.restoredTrail", "must be true or false");
  return Object.freeze({
    mode: oneOf(start.mode, RECORDED_MODE_IDS, "run.start.mode"),
    difficulty: oneOf(start.difficulty, DIFFICULTY_IDS, "run.start.difficulty"),
    weapon,
    ...(boss === undefined ? {} : { boss }),
    metaRanks: readRanks(start.metaRanks, "run.start.metaRanks"),
    variantDiscovery: texts(start.variantDiscovery, "run.start.variantDiscovery"),
    achievementSnapshot: texts(start.achievementSnapshot, "run.start.achievementSnapshot"),
    restoredTrail: start.restoredTrail,
    cinematics: oneOf(start.cinematics, ["full", "brief", "off"] as const, "run.start.cinematics"),
    playedChapters: readChapters(start.playedChapters, "run.start.playedChapters"),
  });
}

function readActions(value: unknown, resultTick: number): readonly ReplayAction[] {
  const actions = list(value, "run.actions").map((entry, index): ReplayAction => {
    const path = `run.actions[${String(index)}]`;
    const action = object(entry, path);
    if (action.kind !== "command") fail(`${path}.kind`, "must be command");
    const normalized = normalizeGameAction(action.command);
    if (!normalized.ok) fail(`${path}.command`, normalized.reason);
    const tick = count(action.tick, `${path}.tick`);
    if (tick < 1 || tick > resultTick) fail(`${path}.tick`, "is outside the run");
    return Object.freeze({ kind: "command", id: count(action.id, `${path}.id`), tick, command: normalized.action });
  });
  if (!hasMonotonicEnvelopes(actions)) fail("run.actions", "must be in tick and number order");
  return Object.freeze(actions);
}

function readCheckpoints(value: unknown, resultTick: number): readonly ReplayCheckpoint[] {
  const checkpoints = list(value, "run.checkpoints").map((entry, index) => {
    const path = `run.checkpoints[${String(index)}]`;
    const checkpoint = object(entry, path);
    const expected = (index + 1) * REPLAY_CHECKPOINT_TICKS;
    if (checkpoint.tick !== expected) fail(`${path}.tick`, `must be ${String(expected)}`);
    return Object.freeze({ tick: expected, hash: stateHash(checkpoint.hash, `${path}.hash`) });
  });
  if (checkpoints.length !== Math.floor(resultTick / REPLAY_CHECKPOINT_TICKS))
    fail("run.checkpoints", "must hold one hash per checkpoint tick of the run");
  return Object.freeze(checkpoints);
}

function readRun(value: unknown): ReplayRun {
  const run = object(value, "run");
  const build = object(run.build, "run.build");
  const result = object(run.result, "run.result");
  const resultTick = count(result.tick, "run.result.tick");
  if (resultTick < 1) fail("run.result.tick", "must be at least 1");
  return Object.freeze({
    ruleset: text(run.ruleset, "run.ruleset"),
    build: Object.freeze({
      version: text(build.version, "run.build.version"),
      revision: text(build.revision, "run.build.revision"),
      target: text(build.target, "run.build.target"),
    }),
    seed: runSeed(run.seed, "run.seed"),
    start: readStart(run.start),
    actions: readActions(run.actions, resultTick),
    checkpoints: readCheckpoints(run.checkpoints, resultTick),
    result: Object.freeze({
      tick: resultTick,
      hash: stateHash(result.hash, "run.result.hash"),
      outcome: oneOf(result.outcome, ["victory", "defeat", "quit"] as const, "run.result.outcome"),
    }),
  });
}

function readSummary(value: unknown, resultTick: number): ReplaySummary {
  const summary = object(value, "summary");
  const marks = list(summary.marks, "summary.marks").map((entry, index) => {
    const path = `summary.marks[${String(index)}]`;
    const mark = object(entry, path);
    const tick = count(mark.tick, `${path}.tick`);
    if (tick > resultTick) fail(`${path}.tick`, "is outside the run");
    return Object.freeze({
      tick,
      kind: oneOf(mark.kind, ["stage", "wave", "boss"] as const, `${path}.kind`),
      value: count(mark.value, `${path}.value`),
    });
  });
  return Object.freeze({
    score: amount(summary.score, "summary.score"),
    wave: count(summary.wave, "summary.wave"),
    time: amount(summary.time, "summary.time"),
    kills: count(summary.kills, "summary.kills"),
    marks: Object.freeze(marks),
  });
}

function readLook(value: unknown): ReplayLook {
  const look = object(value, "look");
  const cosmetics = Object.entries(object(look.cosmetics, "look.cosmetics")).map(([slot, id]) => [
    text(slot, "look.cosmetics", 64),
    text(id, `look.cosmetics.${slot}`, 64),
  ]);
  return Object.freeze({
    playerName: text(look.playerName, "look.playerName", 64),
    cosmetics: Object.freeze(Object.fromEntries(cosmetics) as Record<string, string>),
    music: look.music === null ? null : text(look.music, "look.music"),
    recordedAt: text(look.recordedAt, "look.recordedAt", 40),
  });
}

function earlierVersion(detail: string): ReplayReadResult {
  return Object.freeze({ ok: false, reason: "earlier-version", message: EARLIER_VERSION_MESSAGE, detail });
}

/** Turns untrusted data (a parsed file, a cloud document, a store entry) into a record, or says why not. */
export function readReplayRecord(value: unknown): ReplayReadResult {
  if (isRecord(value) && typeof value.format === "string" && EARLIER_FORMATS.includes(value.format))
    return earlierVersion(`format ${value.format}`);
  if (isRecord(value) && value.format === REPLAY_FORMAT && value.version !== REPLAY_VERSION)
    return earlierVersion(`version ${JSON.stringify(value.version ?? value.schemaVersion ?? null)}`);
  try {
    const data = object(value, "record");
    if (data.format !== REPLAY_FORMAT) fail("format", `must be ${REPLAY_FORMAT}`);
    const run = readRun(data.run);
    return Object.freeze({
      ok: true,
      record: Object.freeze({
        format: REPLAY_FORMAT,
        version: REPLAY_VERSION,
        run,
        summary: readSummary(data.summary, run.result.tick),
        look: readLook(data.look),
      }),
    });
  } catch (error) {
    if (!(error instanceof RecordIssue)) throw error;
    return Object.freeze({ ok: false, reason: "malformed", message: MALFORMED_MESSAGE, detail: error.message });
  }
}

/** Why this build cannot play a record, or null when it can. A retired record is still listed and kept. */
export function replayPlaybackRefusal(run: Pick<ReplayRun, "ruleset">): string | null {
  const reason = rulesetRefusal(run.ruleset);
  return reason === null ? null : `This replay was ${reason}.`;
}

/**
 * Keeps the summary and outcome while a run plays. The recorder and verify both feed it the run's
 * gameplay events, so the summary a record carries is the one a re-simulation derives.
 */
export interface ReplaySummaryCounter {
  readonly observe: (event: TearGameplayEvent) => void;
  readonly outcome: () => ReplayOutcome;
  readonly summary: (run: Readonly<{ score: number; wave: number; time: number }>) => ReplaySummary;
}

export function createReplaySummaryCounter(): ReplaySummaryCounter {
  const marks: ReplayMark[] = [];
  let kills = 0;
  let outcome: ReplayOutcome = "quit";
  const mark = (tick: number, kind: ReplayMarkKind, value: number): void => {
    marks.push(Object.freeze({ tick, kind, value }));
  };
  return Object.freeze<ReplaySummaryCounter>({
    observe(event: TearGameplayEvent): void {
      if (event.kind === "death") kills += 1;
      else if (event.kind === "stage" && event.transition !== "exited") mark(event.tick, "stage", event.stage);
      else if (event.kind === "wave" && event.event === "start") mark(event.tick, "wave", event.wave);
      else if (event.kind === "wave" && event.event === "boss") mark(event.tick, "boss", event.wave);
      else if (event.kind === "run" && event.transition === "completed") outcome = "victory";
      else if (event.kind === "run" && event.transition === "defeated") outcome = "defeat";
    },
    outcome: () => outcome,
    summary: (run) => Object.freeze({ ...run, kills, marks: Object.freeze([...marks]) }),
  });
}
