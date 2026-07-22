import type { ReplayActionEnvelope, ReplayBuildMetadata, ReplayEnvelopeV2, TearScoreReplayMetadata } from "./envelope";
import { CURRENT_REPLAY_SCHEMA_VERSION, REPLAY_FORMAT, validateReplayEnvelope } from "./envelope";
import { stableVerificationHash } from "./hash";

export interface VisualStageEvent { readonly t: number; readonly s: number }
export interface VisualWaveEvent { readonly t: number; readonly w: number; readonly e: string }
export interface VisualSpawnEvent {
  readonly t: number;
  readonly id: number;
  readonly k: string;
  readonly x: number;
  readonly y: number;
  readonly vn?: string;
  readonly b?: string;
}
export interface VisualDeathEvent { readonly t: number; readonly id: number; readonly c: string }
export interface VisualEffectEvent { readonly t: number; readonly k: string; readonly x: number; readonly y: number }
export interface VisualLoadoutEvent { readonly t: number; readonly id: string; readonly tier: number; readonly w: number }

export interface VisualRecordingV2 {
  readonly [key: string]: unknown;
  readonly v: 2;
  readonly dt: number;
  readonly edt: number;
  readonly px: readonly number[];
  readonly py: readonly number[];
  readonly tx: readonly number[];
  readonly ty: readonly number[];
  readonly fc: readonly number[] | null;
  readonly stages: readonly VisualStageEvent[];
  readonly waves: readonly VisualWaveEvent[];
  readonly spawns: readonly VisualSpawnEvent[];
  readonly esamp: readonly (readonly number[])[];
  readonly deaths: readonly VisualDeathEvent[];
  readonly events: readonly VisualEffectEvent[];
  readonly loadout: readonly VisualLoadoutEvent[];
  readonly thumb: string | null;
}

export type VisualReplayPacket = ReplayEnvelopeV2 & VisualRecordingV2;

export interface VisualReplayProvenance {
  readonly rulesetVersion: string;
  readonly build: ReplayBuildMetadata;
  readonly runId: string;
  readonly seed: string;
  readonly ticksPerSecond: number;
  readonly tearScore: TearScoreReplayMetadata;
}

export type VisualReplayResult =
  | Readonly<{ ok: true; recording: VisualRecordingV2 }>
  | Readonly<{ ok: false; error: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(finiteNumber);
}

function stageEvents(value: unknown): value is readonly VisualStageEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) =>
    isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0 && finiteNumber(entry.s));
}
function waveEvents(value: unknown): value is readonly VisualWaveEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) =>
    isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0 && finiteNumber(entry.w) && typeof entry.e === "string");
}
function spawnEvents(value: unknown): value is readonly VisualSpawnEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) => isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0
    && finiteNumber(entry.id) && typeof entry.k === "string" && finiteNumber(entry.x) && finiteNumber(entry.y));
}
function deathEvents(value: unknown): value is readonly VisualDeathEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) =>
    isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0 && finiteNumber(entry.id) && typeof entry.c === "string");
}
function effectEvents(value: unknown): value is readonly VisualEffectEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) => isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0
    && typeof entry.k === "string" && finiteNumber(entry.x) && finiteNumber(entry.y));
}
function loadoutEvents(value: unknown): value is readonly VisualLoadoutEvent[] {
  return Array.isArray(value) && value.every((entry: unknown) => isRecord(entry) && finiteNumber(entry.t) && entry.t >= 0
    && typeof entry.id === "string" && finiteNumber(entry.tier) && finiteNumber(entry.w));
}

function sourceRecording(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (value.schema === "tear.replay" && isRecord(value.recording)) return value.recording;
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Validates v2 visual tracks and upgrades the original hero-only v1 packet. */
export function migrateVisualRecording(value: unknown): VisualReplayResult {
  const source = sourceRecording(value);
  if (source === undefined) return Object.freeze({ ok: false, error: "Replay recording must be an object." });
  if (!numberArray(source.px) || !numberArray(source.py) || source.px.length < 2 || source.py.length !== source.px.length) {
    return Object.freeze({ ok: false, error: "Replay player tracks are missing or inconsistent." });
  }
  const isV2 = source.v === 2;
  const tx = isV2 ? source.tx : (source.bx ?? source.px);
  const ty = isV2 ? source.ty : (source.by ?? source.py);
  if (!numberArray(tx) || !numberArray(ty) || tx.length !== source.px.length || ty.length !== source.px.length) {
    return Object.freeze({ ok: false, error: "Replay blade tracks are missing or inconsistent." });
  }
  const dt = finiteNumber(source.dt) && source.dt > 0 ? source.dt : 0.1;
  const edt = finiteNumber(source.edt) && source.edt > 0 ? source.edt : 0.25;
  const fc = source.fc ?? null;
  if (fc !== null && (!numberArray(fc) || fc.length !== source.px.length)) {
    return Object.freeze({ ok: false, error: "Replay facing track is inconsistent." });
  }
  const stages = isV2 ? source.stages : [{ t: 0, s: finiteNumber(source.stage) ? source.stage : 0 }];
  const waves = isV2 ? source.waves : [];
  const spawns = isV2 ? source.spawns : [];
  const esamp = isV2 ? source.esamp : [];
  const deaths = isV2 ? source.deaths : [];
  const events = isV2 ? source.events : [];
  const loadout = isV2 ? source.loadout : [];
  if (!stageEvents(stages) || !waveEvents(waves) || !spawnEvents(spawns)
    || !deathEvents(deaths) || !effectEvents(events) || !loadoutEvents(loadout)) {
    return Object.freeze({ ok: false, error: "Replay event tracks are malformed." });
  }
  if (!Array.isArray(esamp) || !esamp.every((sample) => numberArray(sample) && sample.length >= 1 && sample.length % 3 === 1)) {
    return Object.freeze({ ok: false, error: "Replay enemy samples are malformed." });
  }
  const recording: VisualRecordingV2 = {
    ...source,
    v: 2,
    dt,
    edt,
    px: source.px,
    py: source.py,
    tx,
    ty,
    fc,
    stages,
    waves,
    spawns,
    esamp,
    deaths,
    events,
    loadout,
    thumb: optionalString(source.thumb) ?? null,
  };
  return Object.freeze({ ok: true, recording });
}

export function visualVerificationState(
  recording: VisualRecordingV2,
  actions: readonly ReplayActionEnvelope[] = [],
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    v: recording.v,
    dt: recording.dt,
    edt: recording.edt,
    px: recording.px,
    py: recording.py,
    tx: recording.tx,
    ty: recording.ty,
    fc: recording.fc,
    stages: recording.stages,
    waves: recording.waves,
    spawns: recording.spawns,
    esamp: recording.esamp,
    deaths: recording.deaths,
    events: recording.events,
    loadout: recording.loadout,
    actions,
  });
}

export function buildVisualReplayPacket(
  recording: VisualRecordingV2,
  provenance: VisualReplayProvenance,
  actions: readonly ReplayActionEnvelope[],
): VisualReplayPacket {
  const lastActionTick = actions.at(-1)?.tick ?? 0;
  const finalTick = Math.max(0, lastActionTick, Math.round((recording.px.length - 1) * recording.dt * provenance.ticksPerSecond));
  const packet: VisualReplayPacket = {
    ...recording,
    format: REPLAY_FORMAT,
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    rulesetVersion: provenance.rulesetVersion,
    build: Object.freeze({ ...provenance.build }),
    run: Object.freeze({ runId: provenance.runId, seed: provenance.seed, ticksPerSecond: provenance.ticksPerSecond }),
    actions: Object.freeze([...actions]),
    final: Object.freeze({ tick: finalTick, stateHash: stableVerificationHash(visualVerificationState(recording, actions)) }),
    tearScore: Object.freeze({ ...provenance.tearScore }),
  };
  const validated = validateReplayEnvelope(packet);
  if (!validated.ok) throw new TypeError(validated.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; "));
  return packet;
}

export function verifyVisualReplayPacket(value: unknown): boolean {
  const canonical = validateReplayEnvelope(value);
  const visual = migrateVisualRecording(value);
  return canonical.ok && visual.ok
    && canonical.replay.final.stateHash === stableVerificationHash(visualVerificationState(visual.recording, canonical.replay.actions));
}
