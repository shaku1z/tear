import { stableVerificationHash } from "../domain/hash";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { TearGhostManifest } from "./capsule-contract";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { createGhostProductionReplaySession } from "./production-replay-session";
import { readGhostReplayRunContext } from "./replay-admission";

export const GHOST_COACH_HISTORY_VERSION = "native-recorded-observations-v2" as const;
export const GHOST_COACH_METRICS = Object.freeze([
  { id: "throws", label: "Identified blade throws" },
  { id: "catches", label: "Identified blade catches" },
  { id: "returns", label: "Identified throw resolutions" },
  { id: "deflections", label: "Distinct projectiles deflected" },
  { id: "perfect", label: "Explicit perfect deflections" },
  { id: "defeats", label: "Recorded enemy defeats" },
  { id: "waves", label: "Recorded waves cleared" },
  { id: "rescues", label: "Recorded void rescues" },
] as const);
export type GhostCoachMetric = (typeof GHOST_COACH_METRICS)[number]["id"];
export interface GhostCoachCandidate {
  readonly id: string;
  readonly root: string;
  readonly identity: string;
  readonly compatibility: string;
  readonly createdAt: string;
  readonly detail: string;
  readonly eligible: boolean;
  readonly reason: string;
  readonly decodedBytes: number;
  readonly compressedBytes: number;
  readonly chunks: number;
}
export interface GhostCoachHistorySource {
  readonly candidate: GhostCoachCandidate;
  readonly receipts: readonly number[];
  readonly events: readonly TearCausalEventV1[];
}
export interface GhostCoachMoment {
  readonly id: string;
  readonly metric: GhostCoachMetric;
  readonly tick: number;
  readonly eventId: string;
  readonly priorTick?: number;
}
export interface GhostCoachHistory {
  readonly version: typeof GHOST_COACH_HISTORY_VERSION;
  readonly requestHash: string;
  readonly targetId: string;
  readonly provenanceHash: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: number;
  readonly sources: readonly GhostCoachCandidate[];
  readonly metrics: readonly Readonly<{
    id: GhostCoachMetric;
    label: string;
    sampleCount: number;
    minimum: number | null;
    median: number | null;
    maximum: number | null;
    history: readonly Readonly<{
      id: string;
      createdAt: string;
      count: number | null;
      knownCount: number;
      unclassified: number;
      eventIds: readonly string[];
      unclassifiedEventIds: readonly string[];
      per1000Ticks: number | null;
    }>[];
  }>[];
  readonly moments: readonly GhostCoachMoment[];
  readonly limitations: readonly string[];
}

export interface GhostCoachHistoryView {
  readonly targetId: string;
  readonly candidates: readonly GhostCoachCandidate[];
  readonly selected: readonly string[];
  readonly result: GhostCoachHistory | undefined;
  readonly message: string;
  readonly busy: boolean;
  readonly page: number;
  readonly metric: number;
  readonly details: boolean;
  readonly selection: boolean;
  readonly rows: number;
  readonly section: number;
  readonly measurement: GhostCoachHistory["metrics"][number] | undefined;
  readonly cited: GhostCoachMoment | undefined;
  readonly moment: number;
  readonly momentCount: number;
}

/** Metadata only. Local residence is not an authorship or human-play attestation. */
export function ghostCoachCandidate(manifest: TearGhostManifest): GhostCoachCandidate {
  const context = readGhostReplayRunContext(manifest.provenance);
  const eligible =
    Number.isFinite(Date.parse(manifest.createdAt)) &&
    manifest.schemaVersion === 2 &&
    manifest.status === "complete" &&
    context !== undefined &&
    ["coaching", "forensic-qa", "cinematic"].includes(manifest.recordingProfile);
  return Object.freeze({
    id: manifest.id,
    root: manifest.rootIntegrity,
    identity: stableVerificationHash(manifest),
    compatibility:
      context === undefined
        ? ""
        : stableVerificationHash({
            build: context.build,
            mode: context.run.mode,
            difficulty: context.run.difficulty,
            weapon: context.run.weaponId,
            origin: context.simulation.initialState,
            hz: context.simulation.ticksPerSecond,
          }),
    createdAt: manifest.createdAt,
    eligible,
    reason: !Number.isFinite(Date.parse(manifest.createdAt))
      ? "Recorded date is unavailable or invalid; chronological history cannot compare this source."
      : eligible
        ? ""
        : "Requires a complete current capsule with recorded events and a declared replay origin.",
    detail:
      context === undefined
        ? "Replay origin unavailable"
        : `${context.run.mode} · ${context.run.difficulty} · ${context.run.weaponId} · seed ${context.run.seed} · ${manifest.recordingProfile} · recorded attribution unverified`,
    decodedBytes: manifest.chunks.reduce((sum, chunk) => sum + chunk.uncompressedBytes, 0),
    compressedBytes: manifest.chunks.reduce((sum, chunk) => sum + chunk.compressedBytes, 0),
    chunks: manifest.chunks.length,
  });
}

export function ghostCoachRequestHash(sources: readonly GhostCoachCandidate[]): string {
  return stableVerificationHash({
    version: GHOST_COACH_HISTORY_VERSION,
    sources: sources.map(({ id, identity, root }) => ({ id, identity, root })),
  });
}

export function checkGhostCoachSelection(sources: readonly GhostCoachCandidate[]): void {
  if (sources.length < 2 || sources.length > 8 || new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new RangeError("Select two to eight distinct local recordings, including the open run.");
  }
  if (
    sources.some(
      (source) =>
        !source.eligible ||
        !Number.isFinite(Date.parse(source.createdAt)) ||
        source.compatibility !== sources[0]?.compatibility,
    )
  ) {
    throw new RangeError("Selected runs require the same build, mode, difficulty, weapon and replay origin.");
  }
  const total = (key: "decodedBytes" | "compressedBytes" | "chunks") =>
    sources.reduce((sum, source) => sum + source[key], 0);
  if (
    sources.some((source) =>
      [source.decodedBytes, source.compressedBytes, source.chunks].some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ),
    ) ||
    total("decodedBytes") > 128 * 1024 * 1024 ||
    total("compressedBytes") > 64 * 1024 * 1024 ||
    total("chunks") > 4096
  ) {
    throw new RangeError("Selected recordings exceed this analysis's bounded local read budget.");
  }
}

/** Production admission is performed in the worker, once per selected source. */
export function readGhostCoachHistorySource(
  capsule: GhostReadCapsule,
  expected: GhostCoachCandidate,
): GhostCoachHistorySource {
  const candidate = ghostCoachCandidate(capsule.manifest);
  if (!candidate.eligible || candidate.identity !== expected.identity)
    throw new TypeError("Selected recording changed before analysis.");
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  if (mapped.issues.length > 0) {
    throw new TypeError("Selected recording has an unavailable or malformed causal/state track.");
  }
  const session = createGhostProductionReplaySession(capsule);
  return Object.freeze({ candidate, receipts: session.verifiedReceiptTicks, events: mapped.ghost.events });
}

function witness(event: TearCausalEventV1): Readonly<{ metric: GhostCoachMetric; key: string }>[] {
  if (event.source !== "engine") return [];
  const p = event.payload;
  const finite = (...keys: string[]) => keys.every((key) => typeof p[key] === "number" && Number.isFinite(p[key]));
  const identified =
    typeof p.weaponId === "string" &&
    ((typeof p.throwId === "string" && p.throwId.length > 0) ||
      (typeof p.throwId === "number" && Number.isSafeInteger(p.throwId)));
  const blade =
    event.type === "blade.thrown"
      ? "throws"
      : event.type === "blade.caught"
        ? "catches"
        : event.type === "blade.throw-resolved"
          ? "returns"
          : undefined;
  if (blade !== undefined && identified && finite("x", "y"))
    return [{ metric: blade, key: `${String(p.weaponId)}:${String(p.throwId)}` }];
  if (
    event.type === "projectile.deflected" &&
    event.actorId &&
    finite("x", "y", "vx", "vy") &&
    (p.owner === "player" || p.owner === "enemy")
  ) {
    return [
      { metric: "deflections", key: event.actorId },
      ...(p.perfect === true ? [{ metric: "perfect" as const, key: event.actorId }] : []),
    ];
  }
  if (event.type === "enemy.defeated" && event.actorId && typeof p.cause === "string")
    return [{ metric: "defeats", key: event.actorId }];
  if (
    event.type === "wave.cleared" &&
    Number.isSafeInteger(p.wave) &&
    (p.wave as number) >= 0 &&
    (p.marker === "clear" || p.marker === "cleared")
  )
    return [{ metric: "waves", key: String(p.wave) }];
  if (
    event.type === "world.void-rescue" &&
    finite("x", "y", "hp") &&
    (p.lane === null || p.lane === "lower" || p.lane === "upper")
  )
    return [{ metric: "rescues", key: event.id }];
  return [];
}

/** Descriptive recorded counts, never inferred accuracy, idle time, skill or improvement. */
export function projectGhostCoachHistory(sources: readonly GhostCoachHistorySource[]): GhostCoachHistory {
  const candidates = sources.map((source) => source.candidate);
  checkGhostCoachSelection(candidates);
  const first = sources[0];
  if (first === undefined) throw new RangeError("No target recording.");
  const common = first.receipts
    .filter((tick) => sources.every((source) => source.receipts.includes(tick)))
    .sort((a, b) => a - b);
  const fromTick = common[0],
    toTick = common.at(-1);
  if (fromTick === undefined || toTick === undefined || fromTick >= toTick)
    throw new RangeError("Selected recordings need two shared verified checkpoint ticks.");
  const ticks = toTick - fromTick,
    moments: GhostCoachMoment[] = [];
  const counts = sources.map((source, sourceIndex) => {
    const keys = new Map(
      GHOST_COACH_METRICS.map(({ id }) => [
        id,
        { keys: new Set<string>(), eventIds: [] as string[], unknown: [] as string[] },
      ]),
    );
    const window = source.events.filter(
      (event) => event.tick > fromTick && event.tick <= toTick && event.source === "engine",
    );
    const kind = (event: TearCausalEventV1): GhostCoachMetric | undefined =>
      event.type === "blade.thrown"
        ? "throws"
        : event.type === "blade.caught"
          ? "catches"
          : event.type === "blade.throw-resolved"
            ? "returns"
            : event.type === "projectile.deflected"
              ? "deflections"
              : event.type === "enemy.defeated"
                ? "defeats"
                : event.type === "wave.cleared"
                  ? "waves"
                  : event.type === "world.void-rescue"
                    ? "rescues"
                    : undefined;
    for (const event of window) {
      const facts = witness(event),
        affected = kind(event);
      if (affected !== undefined && facts.length === 0) {
        // Similar location/time is not a causal identity link. Preserve the
        // known subset and explicitly report every identityless record.
        keys.get(affected)?.unknown.push(event.id);
      }
      if (event.type === "projectile.deflected" && (typeof event.payload.perfect !== "boolean" || facts.length === 0))
        keys.get("perfect")?.unknown.push(event.id);
      for (const fact of facts) {
        const seen = keys.get(fact.metric);
        if (seen === undefined) continue;
        seen.eventIds.push(event.id);
        if (seen.keys.has(fact.key)) continue;
        seen.keys.add(fact.key);
        if (sourceIndex === 0 && moments.length < 256) {
          const priorTick = source.receipts.filter((tick) => tick >= fromTick && tick < event.tick).at(-1);
          moments.push(
            Object.freeze({
              id: `${fact.metric}:${event.id}`,
              metric: fact.metric,
              tick: event.tick,
              eventId: event.id,
              ...(priorTick === undefined ? {} : { priorTick }),
            }),
          );
        }
      }
    }
    return keys;
  });
  const chronological = sources
    .map((source, index) => ({ source, index }))
    .sort(
      (a, b) =>
        Date.parse(a.source.candidate.createdAt) - Date.parse(b.source.candidate.createdAt) ||
        a.source.candidate.id.localeCompare(b.source.candidate.id),
    );
  const metrics = GHOST_COACH_METRICS.map(({ id, label }) => {
    const history = chronological.map(({ source, index }) => {
      const observed = counts[index]?.get(id),
        knownCount = observed?.keys.size ?? 0,
        unclassified = observed?.unknown.length ?? 0;
      const count = unclassified === 0 ? knownCount : null;
      return Object.freeze({
        id: source.candidate.id,
        createdAt: source.candidate.createdAt,
        count,
        knownCount,
        unclassified,
        eventIds: Object.freeze(observed?.eventIds ?? []),
        unclassifiedEventIds: Object.freeze(observed?.unknown ?? []),
        per1000Ticks: count === null ? null : (count * 1000) / ticks,
      });
    });
    const sorted = history.flatMap((row) => (row.count === null ? [] : [row.count])).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2),
      low = sorted[middle - (sorted.length % 2 === 0 ? 1 : 0)] ?? 0;
    return Object.freeze({
      id,
      label,
      sampleCount: sorted.length,
      minimum: sorted[0] ?? null,
      maximum: sorted.at(-1) ?? null,
      median: sorted.length === 0 ? null : (low + (sorted[middle] ?? 0)) / 2,
      history: Object.freeze(history),
    });
  });
  return Object.freeze({
    version: GHOST_COACH_HISTORY_VERSION,
    requestHash: ghostCoachRequestHash(candidates),
    targetId: first.candidate.id,
    fromTick,
    toTick,
    ticks,
    provenanceHash: stableVerificationHash({
      version: GHOST_COACH_HISTORY_VERSION,
      requestHash: ghostCoachRequestHash(candidates),
      fromTick,
      toTick,
      ticks,
      metrics,
    }),
    sources: Object.freeze(candidates),
    metrics: Object.freeze(metrics),
    moments: Object.freeze(moments),
    limitations: Object.freeze([
      "Recorded counts only; absence is not evidence of a miss or a lack of skill. Identityless records and missing perfect flags make affected measurements unavailable; known witnesses remain listed.",
      "Integrity and compatible origin/checkpoint continuation verified; not every intervening causal event was re-executed.",
      "Different seeds/loadout choices may differ. Local selection does not attest authorship or human play. First 256 cited moments shown; no accuracy, damage, idle-time or improvement measurement.",
    ]),
  });
}
