import { hasMonotonicEnvelopes } from "../domain/envelopes";
import { normalizeGameAction } from "../input/game-action";
import type { ReplayActionEnvelope } from "../replay/envelope";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import {
  createDefaultStateCodecRegistry,
  restoreSnapshotTransactionally,
  type TearCodecIssue,
  type TearCodecWorld,
  type TearWorldFactory,
} from "../tearbench/state-codecs";
import { validateTearContract } from "../tearbench/validation";
import type { GhostCapsuleEntry, GhostReadCapsule } from "./capsule-reader";
import { createGhostV3, GhostTimeline, type GhostEnvelopeV3, type GhostReplayTrident } from "./truth-kernel";

export interface GhostCapsuleReplayIssue {
  readonly track: "commands" | "events" | "keyframes";
  readonly tick: number;
  readonly reason: string;
}

export interface GhostCapsuleReplayMapping {
  readonly ghost: GhostEnvelopeV3;
  readonly issues: readonly GhostCapsuleReplayIssue[];
  readonly accepted: Readonly<{ commands: number; events: number; snapshots: number; visualSamples: number }>;
}

function issue(
  issues: GhostCapsuleReplayIssue[],
  track: GhostCapsuleReplayIssue["track"],
  tick: number,
  reason: string,
): void {
  issues.push(Object.freeze({ track, tick, reason }));
}

function object(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function commands(entries: readonly GhostCapsuleEntry[], issues: GhostCapsuleReplayIssue[]): readonly ReplayActionEnvelope[] {
  const parsed: ReplayActionEnvelope[] = [];
  for (const entry of entries) {
    const value = object(entry.value);
    if (value?.kind !== "command" || !Number.isSafeInteger(value.id) || (value.id as number) < 1
      || value.tick !== entry.tick) {
      issue(issues, "commands", entry.tick, "entry is not an aligned canonical command envelope");
      continue;
    }
    const normalized = normalizeGameAction(value.command);
    if (!normalized.ok) {
      issue(issues, "commands", entry.tick, `invalid semantic action: ${normalized.reason}`);
      continue;
    }
    parsed.push(Object.freeze({ kind: "command", id: value.id as number, tick: entry.tick, command: normalized.action }));
  }
  if (parsed.length !== entries.length || !hasMonotonicEnvelopes(parsed)) {
    if (parsed.length === entries.length) issue(issues, "commands", entries.at(-1)?.tick ?? 0, "command IDs or ticks are not monotonic");
    return Object.freeze([]);
  }
  return Object.freeze(parsed);
}

function recordedCanonicalSnapshot(value: unknown): TearSnapshotV1 | undefined {
  const contract = validateTearContract(value);
  if (!contract.ok || contract.value.kind !== "snapshot" || contract.value.stateClass !== "recorded-canonical") return undefined;
  // Portable contract validation is the storage boundary. Full restoration is
  // deliberately performed only by GhostReplayWorld with its matching live
  // runtime factory; a generic empty world can reject valid host-owned state.
  return contract.value;
}

function isolatedCodecFactory(): TearWorldFactory {
  return Object.freeze({
    createEmpty: (): TearCodecWorld => ({ components: new Map(), references: new Map(), entityIds: new Set() }),
    // This boundary intentionally validates only the versioned State Forge
    // contract. Production hydration has host-owned constructors and must not
    // be used to decide whether untrusted capsule bytes are admissible.
    validate: () => [],
  });
}

function issueText(issues: readonly TearCodecIssue[]): string {
  return issues
    .map((entry) => `${entry.codecId}:${entry.path}: ${entry.message}`)
    .sort((left, right) => left.localeCompare(right))
    .join("; ");
}

/**
 * Replays use an all-or-nothing state-track policy: every declared canonical
 * keyframe is restored through the versioned codec registry in a disposable
 * data-only world before it can become seekable. This has no production-world
 * composition, hydration, or mutation side effect. A bad keyframe makes the
 * entire state track unavailable rather than silently seeking through a
 * selectively trusted subset.
 */
export function preflightGhostRecordedCanonicalSnapshot(snapshot: TearSnapshotV1):
  | Readonly<{ ok: true; exactHash: string; semanticHash: string }>
  | Readonly<{ ok: false; reason: string }> {
  const registry = createDefaultStateCodecRegistry();
  let staged: TearCodecWorld | undefined;
  const result = restoreSnapshotTransactionally(snapshot, registry, isolatedCodecFactory(), {
    replace(world) { staged = world; },
  });
  if (!result.ok) return Object.freeze({ ok: false, reason: `codec restore rejected: ${issueText(result.issues)}` });
  // `staged` is deliberately local. Keep this assertion explicit so future
  // refactors cannot turn this preflight into a hidden production commit.
  if (staged === undefined) return Object.freeze({ ok: false, reason: "codec restore made no isolated staging world" });
  if (result.exactHash !== snapshot.hashes.exact) {
    return Object.freeze({ ok: false, reason: "isolated codec exact hash does not match the declared keyframe hash" });
  }
  if (result.semanticHash !== snapshot.hashes.semantic) {
    return Object.freeze({ ok: false, reason: "isolated codec semantic hash does not match the declared keyframe hash" });
  }
  return Object.freeze({ ok: true, exactHash: result.exactHash, semanticHash: result.semanticHash });
}

function snapshots(entries: readonly GhostCapsuleEntry[], issues: GhostCapsuleReplayIssue[]): readonly TearSnapshotV1[] {
  const result: TearSnapshotV1[] = [];
  const ids = new Set<string>();
  let rejected = false;
  for (const entry of entries) {
    const snapshot = recordedCanonicalSnapshot(entry.value);
    if (snapshot === undefined) {
      issue(issues, "keyframes", entry.tick, "entry is not a unique recorded-canonical snapshot contract");
      rejected = true;
      continue;
    }
    if (snapshot.tick !== entry.tick || ids.has(snapshot.id)) {
      issue(issues, "keyframes", entry.tick, "entry is not a unique recorded-canonical snapshot contract");
      rejected = true;
      continue;
    }
    const preflight = preflightGhostRecordedCanonicalSnapshot(snapshot);
    if (!preflight.ok) {
      issue(issues, "keyframes", entry.tick, `recorded-canonical keyframe failed isolated codec preflight: ${preflight.reason}`);
      rejected = true;
      continue;
    }
    ids.add(snapshot.id);
    result.push(snapshot);
  }
  return Object.freeze((rejected ? [] : result).sort((left, right) => left.tick - right.tick || left.id.localeCompare(right.id)));
}

function events(entries: readonly GhostCapsuleEntry[], issues: GhostCapsuleReplayIssue[]): readonly TearCausalEventV1[] {
  const result: TearCausalEventV1[] = [];
  for (const entry of entries) {
    const contract = validateTearContract(entry.value);
    if (!contract.ok || contract.value.kind !== "event" || contract.value.tick !== entry.tick) {
      issue(issues, "events", entry.tick, "entry is not an aligned causal-event contract");
      continue;
    }
    result.push(contract.value);
  }
  try {
    new GhostTimeline(result);
    return Object.freeze(result);
  } catch (error) {
    issue(issues, "events", entries.at(-1)?.tick ?? 0, error instanceof Error ? error.message : String(error));
    return Object.freeze([]);
  }
}

function visualSamples(capsule: GhostReadCapsule): readonly Readonly<{ tick: number; value: unknown }>[] {
  const compactKeyframes = capsule.tracks.keyframes.filter((entry) => {
    const contract = validateTearContract(entry.value);
    return !contract.ok || contract.value.kind !== "snapshot";
  });
  return Object.freeze([...compactKeyframes, ...capsule.tracks.presentation, ...capsule.tracks.results]
    .map((entry) => Object.freeze({ tick: entry.tick, value: entry.value })));
}

function rulesetVersion(snapshots: readonly TearSnapshotV1[]): string {
  const versions = new Set(snapshots.map((snapshot) => snapshot.provenance.build.rulesetVersion));
  const [onlyVersion] = versions;
  return versions.size === 1 && onlyVersion !== undefined ? onlyVersion : "live-capsule-v1";
}

/**
 * Converts only validated, integrity-checked capsule tracks into V3 replay
 * truth. Missing or malformed tracks degrade capability rather than inventing
 * actions, state, causal events, or verification status.
 */
export function mapGhostCapsuleToReplayEnvelope(capsule: GhostReadCapsule): GhostCapsuleReplayMapping {
  const issues: GhostCapsuleReplayIssue[] = [];
  const actionTrack = commands(capsule.tracks.commands, issues);
  const snapshotTrack = snapshots(capsule.tracks.keyframes, issues);
  const eventTrack = events(capsule.tracks.events, issues);
  const visualTrack = visualSamples(capsule);
  const trident: GhostReplayTrident = Object.freeze({
    command: Object.freeze({
      kind: "command", status: actionTrack.length > 0 ? "declared-unverified" : "absent", available: actionTrack.length > 0,
      resumable: false, seekable: false,
      reason: actionTrack.length > 0 ? "canonical V3 commands require compatible-runtime replay verification" : "no fully valid canonical command track",
    }),
    state: Object.freeze({
      kind: "state", status: snapshotTrack.length > 0 ? "declared-unverified" : "absent", available: snapshotTrack.length > 0,
      resumable: false, seekable: snapshotTrack.length > 0,
      reason: snapshotTrack.length > 0 ? "recorded V3 keyframes passed isolated codec preflight and require compatible-runtime replay restoration and verification"
        : issues.some((entry) => entry.track === "keyframes" && entry.reason.includes("isolated codec preflight"))
          ? "recorded V3 state track is unavailable because at least one keyframe failed isolated codec preflight"
          : "no recorded-canonical keyframe contract",
    }),
    visual: Object.freeze({
      kind: "visual", status: visualTrack.length > 0 ? "declared-unverified" : "absent", available: visualTrack.length > 0,
      resumable: false, seekable: visualTrack.length > 0,
      reason: visualTrack.length > 0 ? "captured presentation is available only as unverified visual evidence" : "no presentation samples were recorded",
    }),
  });
  const ghost = createGhostV3({
    id: capsule.manifest.id,
    rulesetVersion: rulesetVersion(snapshotTrack),
    sourceClassification: "native-v3",
    trident,
    actions: actionTrack,
    snapshots: snapshotTrack,
    events: eventTrack,
    ...(visualTrack.length === 0 ? {} : { visual: Object.freeze({ samples: visualTrack, capsuleResults: capsule.tracks.results }) }),
  });
  return Object.freeze({
    ghost,
    issues: Object.freeze(issues),
    accepted: Object.freeze({ commands: actionTrack.length, events: eventTrack.length, snapshots: snapshotTrack.length, visualSamples: visualTrack.length }),
  });
}
