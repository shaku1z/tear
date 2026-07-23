import type { ReplayActionEnvelope, ReplayEnvelopeV2 } from "../replay/envelope";
import { parseReplayEnvelope } from "../replay/envelope";
import { stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearSnapshotV1 } from "../tearbench/contracts";
import { EVENT_REGISTRY, withinTickPhaseOrder } from "../tearbench/registries";
import type { TearEventId } from "../tearbench/registries";

export const GHOST_FORMAT = "tear-ghost";
export const GHOST_SCHEMA_VERSION = 3;

export type GhostTruthKind = "command" | "state" | "visual";
export type GhostTruthStatus = "verified" | "declared-unverified" | "legacy-visual" | "absent" | "degraded";

export interface GhostTruthCapability {
  readonly kind: GhostTruthKind;
  readonly status: GhostTruthStatus;
  readonly available: boolean;
  readonly resumable: boolean;
  readonly seekable: boolean;
  readonly reason: string;
}

export interface GhostReplayTrident {
  readonly command: GhostTruthCapability;
  readonly state: GhostTruthCapability;
  readonly visual: GhostTruthCapability;
}

export interface GhostTimelineEntry {
  readonly tick: number;
  readonly phase: TearCausalEventV1["phase"];
  readonly sequence: number;
  readonly event: TearCausalEventV1;
}

export interface GhostEventPayloadSchema {
  readonly required: Readonly<Record<string, "string" | "number" | "boolean" | "string-array">>;
}

export const GHOST_EVENT_PAYLOAD_SCHEMAS: Readonly<Partial<Record<TearEventId, GhostEventPayloadSchema>>> = Object.freeze({
  "run.started": { required: { mode: "string", difficulty: "string", weapon: "string" } },
  "blade.hit": { required: { damage: "number", speed: "number" } },
  "combat.kill": { required: { enemyKind: "string", cause: "string" } },
  "boss.phase-changed": { required: { bossId: "string", from: "string", to: "string" } },
  "draft.selected": { required: { choiceId: "string", tier: "number" } },
  "system.exception": { required: { code: "string", message: "string" } },
  "agent.objective-changed": { required: { objective: "string", confidence: "number" } },
});

export function validateGhostEventPayload(event: TearCausalEventV1): readonly string[] {
  const schema = GHOST_EVENT_PAYLOAD_SCHEMAS[event.type];
  if (schema === undefined) return Object.freeze([]);
  const issues: string[] = [];
  for (const [field, expected] of Object.entries(schema.required)) {
    const value = event.payload[field];
    const valid = expected === "string-array"
      ? Array.isArray(value) && value.every((entry) => typeof entry === "string")
      : typeof value === expected && (expected !== "number" || Number.isFinite(value));
    if (!valid) issues.push(`${event.type}.${field} must be ${expected}`);
  }
  return Object.freeze(issues);
}

export class GhostTimeline {
  readonly #entries: readonly GhostTimelineEntry[];
  readonly #byId: ReadonlyMap<string, GhostTimelineEntry>;

  constructor(events: readonly TearCausalEventV1[]) {
    const entries = events.map((event) => {
      if (!Number.isSafeInteger(event.tick) || event.tick < 0) throw new TypeError(`event ${event.id} has an invalid integer tick`);
      EVENT_REGISTRY.assert(event.type);
      const payloadIssues = validateGhostEventPayload(event);
      if (payloadIssues.length > 0) throw new TypeError(payloadIssues.join("; "));
      return Object.freeze({ tick: event.tick, phase: event.phase, sequence: event.sequence, event });
    }).sort((left, right) =>
      left.tick - right.tick
      || withinTickPhaseOrder(left.phase) - withinTickPhaseOrder(right.phase)
      || left.sequence - right.sequence
      || left.event.id.localeCompare(right.event.id));
    const byId = new Map(entries.map((entry) => [entry.event.id, entry]));
    if (byId.size !== entries.length) throw new TypeError("GhostTimeline event IDs must be unique");
    for (const entry of entries) {
      for (const parentId of entry.event.parentIds ?? []) {
        const parent = byId.get(parentId);
        if (parent === undefined) throw new TypeError(`event ${entry.event.id} has missing parent ${parentId}`);
        if (parent.tick > entry.tick) throw new TypeError(`event ${entry.event.id} precedes parent ${parentId}`);
      }
    }
    this.#entries = Object.freeze(entries);
    this.#byId = byId;
  }

  entries(): readonly GhostTimelineEntry[] { return this.#entries; }

  range(fromTick: number, toTick: number): readonly GhostTimelineEntry[] {
    return Object.freeze(this.#entries.filter((entry) => entry.tick >= fromTick && entry.tick <= toTick));
  }

  childrenOf(parentId: string): readonly GhostTimelineEntry[] {
    return Object.freeze(this.#entries.filter((entry) => entry.event.parentIds?.includes(parentId) === true));
  }

  ancestorsOf(id: string): readonly GhostTimelineEntry[] {
    const result: GhostTimelineEntry[] = [];
    const visited = new Set<string>();
    const visit = (eventId: string): void => {
      const entry = this.#byId.get(eventId);
      if (entry === undefined) throw new RangeError(`timeline event does not exist: ${eventId}`);
      for (const parentId of entry.event.parentIds ?? []) {
        if (visited.has(parentId)) continue;
        visited.add(parentId);
        const parent = this.#byId.get(parentId);
        if (parent !== undefined) result.push(parent);
        visit(parentId);
      }
    };
    visit(id);
    return Object.freeze(result.sort((left, right) => left.tick - right.tick || left.sequence - right.sequence));
  }
}

export interface GhostQualityDimension {
  readonly score: number;
  readonly reason: string;
}

export interface GhostQualityCard {
  readonly fidelity: GhostQualityDimension;
  readonly integrity: GhostQualityDimension;
  readonly compatibility: GhostQualityDimension;
  readonly completeness: GhostQualityDimension;
  readonly seekability: GhostQualityDimension;
  readonly resumability: GhostQualityDimension;
  readonly eligibility: GhostQualityDimension;
  readonly coachingRichness: GhostQualityDimension;
  readonly creatorRichness: GhostQualityDimension;
  readonly privacy: GhostQualityDimension;
}

export interface GhostRecordingProfile {
  readonly id: string;
  readonly tracks: Readonly<Record<string, "required" | "preferred" | "optional" | "disabled">>;
}

export interface GhostRecordingEnvironment {
  readonly supportedTracks: readonly string[];
  readonly maxTracks: number;
}

export interface GhostNegotiatedProfile {
  readonly profileId: string;
  readonly acceptedTracks: readonly string[];
  readonly droppedTracks: readonly string[];
  readonly viable: boolean;
  readonly reason: string;
}

const TRACK_SURVIVAL_PRIORITY = Object.freeze([
  "manifest", "commands", "rng", "events", "result", "keyframes", "visual-player", "visual-entities", "presentation",
]);

export function negotiateRecordingProfile(
  profile: GhostRecordingProfile,
  environment: GhostRecordingEnvironment,
): GhostNegotiatedProfile {
  const supported = new Set(environment.supportedTracks);
  const requested = Object.entries(profile.tracks).filter(([, need]) => need !== "disabled");
  const missingRequired = requested.filter(([track, need]) => need === "required" && !supported.has(track)).map(([track]) => track);
  const eligible = requested.filter(([track]) => supported.has(track)).map(([track]) => track);
  eligible.sort((left, right) => {
    const leftIndex = TRACK_SURVIVAL_PRIORITY.indexOf(left);
    const rightIndex = TRACK_SURVIVAL_PRIORITY.indexOf(right);
    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) || left.localeCompare(right);
  });
  const accepted = eligible.slice(0, Math.max(0, environment.maxTracks));
  const dropped = requested.map(([track]) => track).filter((track) => !accepted.includes(track));
  const requiredDropped = dropped.some((track) => profile.tracks[track] === "required");
  return Object.freeze({
    profileId: profile.id,
    acceptedTracks: Object.freeze(accepted),
    droppedTracks: Object.freeze(dropped),
    viable: missingRequired.length === 0 && !requiredDropped,
    reason: missingRequired.length > 0
      ? `required tracks unsupported: ${missingRequired.join(", ")}`
      : requiredDropped ? "capacity dropped a required track" : dropped.length > 0 ? "optional tracks degraded by capacity" : "all requested tracks accepted",
  });
}

export interface GhostEnvelopeV3 {
  readonly format: typeof GHOST_FORMAT;
  readonly schemaVersion: typeof GHOST_SCHEMA_VERSION;
  readonly id: string;
  readonly rulesetVersion: string;
  readonly sourceClassification: "native-v3" | "legacy-v1" | "legacy-v2" | "legacy-visual";
  readonly trident: GhostReplayTrident;
  readonly actions: readonly ReplayActionEnvelope[];
  readonly snapshots: readonly TearSnapshotV1[];
  readonly events: readonly TearCausalEventV1[];
  readonly visual?: Readonly<Record<string, unknown>>;
  readonly quality: GhostQualityCard;
  readonly rootHash: string;
}

function capability(
  kind: GhostTruthKind,
  status: GhostTruthStatus,
  available: boolean,
  resumable: boolean,
  seekable: boolean,
  reason: string,
): GhostTruthCapability {
  return Object.freeze({ kind, status, available, resumable, seekable, reason });
}

export function resolveTridentPrecedence(
  trident: GhostReplayTrident,
  purpose: "watch" | "seek" | "resume" | "verify",
): Readonly<{ selected?: GhostTruthKind; reason: string }> {
  if (purpose === "resume") {
    if (trident.command.status === "verified" && trident.command.resumable) return { selected: "command", reason: "verified command truth has resume precedence" };
    if (trident.state.status === "verified" && trident.state.resumable) return { selected: "state", reason: "verified state truth provides a resumable checkpoint" };
    return { reason: "no verified resumable truth track" };
  }
  if (purpose === "seek") {
    if (trident.state.available && trident.state.seekable) return { selected: "state", reason: "state keyframes have seek precedence" };
    if (trident.visual.available && trident.visual.seekable) return { selected: "visual", reason: "visual samples provide degraded seek" };
    return { reason: "no seekable truth track" };
  }
  if (purpose === "verify") {
    if (trident.command.status === "verified") return { selected: "command", reason: "verified deterministic commands have verification precedence" };
    if (trident.state.status === "verified") return { selected: "state", reason: "verified state truth has verification precedence" };
    return { reason: "visual or unverified tracks cannot establish simulation verification" };
  }
  if (trident.visual.available) return { selected: "visual", reason: "visual truth has watch precedence" };
  if (trident.state.available) return { selected: "state", reason: "state projection supplies degraded watch mode" };
  if (trident.command.available) return { selected: "command", reason: "commands require compatible simulation playback" };
  return { reason: "Ghost contains no watchable truth track" };
}

function qualityFor(trident: GhostReplayTrident, legacy: boolean): GhostQualityCard {
  const dimension = (score: number, reason: string): GhostQualityDimension => Object.freeze({ score, reason });
  return Object.freeze({
    fidelity: dimension(trident.visual.available ? 1 : trident.state.available ? 0.75 : 0.5, "derived only from declared truth tracks"),
    integrity: dimension(legacy ? 0.35 : 1, legacy ? "legacy source lacks native chunk integrity" : "native root hash"),
    compatibility: dimension(legacy ? 0.9 : 1, legacy ? "legacy adapter required" : "native schema"),
    completeness: dimension([trident.command, trident.state, trident.visual].filter((entry) => entry.available).length / 3, "independent track coverage"),
    seekability: dimension(trident.state.seekable ? 1 : trident.visual.seekable ? 0.6 : 0, "state or visual seek capability"),
    resumability: dimension(trident.command.resumable || trident.state.resumable ? 1 : 0, "verified resumable truth required"),
    eligibility: dimension(legacy ? 0 : 1, legacy ? "legacy visual is ineligible for verified competition" : "native evidence"),
    coachingRichness: dimension(trident.command.available && trident.state.available ? 1 : 0.25, "commands plus state support causal coaching"),
    creatorRichness: dimension(trident.visual.available ? 1 : 0.4, "presentation tracks improve authoring"),
    privacy: dimension(1, "local no-training default"),
  });
}

export function createGhostV3(input: Omit<GhostEnvelopeV3, "format" | "schemaVersion" | "quality" | "rootHash">): GhostEnvelopeV3 {
  const quality = qualityFor(input.trident, input.sourceClassification !== "native-v3");
  const rootHash = stableVerificationHash({
    id: input.id,
    rulesetVersion: input.rulesetVersion,
    sourceClassification: input.sourceClassification,
    trident: input.trident,
    actions: input.actions,
    snapshots: input.snapshots,
    events: input.events,
    ...(input.visual === undefined ? {} : { visual: input.visual }),
  });
  return Object.freeze({
    format: GHOST_FORMAT,
    schemaVersion: GHOST_SCHEMA_VERSION,
    ...input,
    quality,
    rootHash,
  });
}

export function migrateLegacyReplayToGhost(value: unknown): GhostEnvelopeV3 {
  const parsed = parseReplayEnvelope(value);
  if (!parsed.ok) throw new TypeError(`legacy replay is invalid: ${parsed.issues.map((issue) => issue.message).join("; ")}`);
  const replay: ReplayEnvelopeV2 = parsed.replay;
  const sourceClassification = isLegacyV1(value) ? "legacy-v1" : "legacy-v2";
  return createGhostV3({
    id: `ghost-${replay.run.runId}`,
    rulesetVersion: replay.rulesetVersion,
    sourceClassification,
    trident: Object.freeze({
      command: capability("command", "declared-unverified", replay.actions.length > 0, false, false,
        "legacy actions lack native V3 environment and checkpoint verification"),
      state: capability("state", "absent", false, false, false, "legacy replay has only a final hash"),
      visual: capability("visual", "legacy-visual", true, false, true, "watchable legacy presentation; never simulation verification"),
    }),
    actions: replay.actions,
    snapshots: [],
    events: [],
    visual: Object.freeze({ legacyFinalTick: replay.final.tick, legacyFinalHash: replay.final.stateHash }),
  });
}

function isLegacyV1(value: unknown): boolean {
  if (typeof value === "string") {
    try { return isLegacyV1(JSON.parse(value) as unknown); } catch { return false; }
  }
  return typeof value === "object" && value !== null && "schemaVersion" in value && value.schemaVersion === 1;
}

export interface GhostRoundTripReport {
  readonly record: boolean;
  readonly seek: boolean;
  readonly zeroModificationFork: boolean;
  readonly practice: boolean;
  readonly exportImport: boolean;
  readonly migration: boolean;
}

export function verifyGhostRoundTrips(ghost: GhostEnvelopeV3): GhostRoundTripReport {
  const serialized = JSON.stringify(ghost);
  const imported: unknown = JSON.parse(serialized);
  const importedRecord: Readonly<Record<string, unknown>> =
    typeof imported === "object" && imported !== null ? imported as Readonly<Record<string, unknown>> : {};
  const timeline = new GhostTimeline(ghost.events);
  const seekTick = ghost.snapshots[0]?.tick ?? ghost.events[0]?.tick ?? 0;
  const forkHash = stableVerificationHash({ actions: ghost.actions, snapshots: ghost.snapshots, events: ghost.events });
  const originalHash = stableVerificationHash({
    actions: importedRecord.actions,
    snapshots: importedRecord.snapshots,
    events: importedRecord.events,
  });
  return Object.freeze({
    record: ghost.rootHash.length > 0 && timeline.entries().length === ghost.events.length,
    seek: resolveTridentPrecedence(ghost.trident, "seek").selected !== undefined || seekTick === 0,
    zeroModificationFork: forkHash === originalHash,
    practice: resolveTridentPrecedence(ghost.trident, "resume").selected !== undefined,
    exportImport: importedRecord.format === GHOST_FORMAT
      && importedRecord.schemaVersion === GHOST_SCHEMA_VERSION
      && importedRecord.rootHash === ghost.rootHash,
    migration: ghost.sourceClassification === "native-v3" || ghost.quality.integrity.score < 1,
  });
}
