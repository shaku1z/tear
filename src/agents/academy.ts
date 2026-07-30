import type { GameAction } from "../input/game-action";
import { canonicalStringify, stableVerificationHash } from "../replay/hash";
import type { TearCausalEventV1, TearObservationV1, TearProvenanceV1 } from "../tearbench/contracts";

export type TearLessonDomain = "movement" | "blade" | "defense" | "enemies" | "bosses" | "strategy" | "interface";

export interface TearAcademyLesson {
  readonly id: string;
  readonly domain: TearLessonDomain;
  readonly objective: string;
  readonly recoveryRequired: boolean;
  readonly unseenSeeds: readonly string[];
  readonly passThreshold: number;
}

export const CANONICAL_ACADEMY_LESSONS = Object.freeze([
  { id: "movement-foundations", domain: "movement", objective: "navigate and recover footing", recoveryRequired: true, unseenSeeds: ["m-91", "m-92"], passThreshold: 0.8 },
  { id: "blade-control", domain: "blade", objective: "slash, throw, and recall deliberately", recoveryRequired: true, unseenSeeds: ["b-91", "b-92"], passThreshold: 0.8 },
  { id: "defense-parry", domain: "defense", objective: "avoid, deflect, and recover", recoveryRequired: true, unseenSeeds: ["d-91", "d-92"], passThreshold: 0.8 },
  { id: "enemy-reading", domain: "enemies", objective: "rank threats and counter archetypes", recoveryRequired: false, unseenSeeds: ["e-91"], passThreshold: 0.75 },
  { id: "boss-phases", domain: "bosses", objective: "respond to phase and attack boundaries", recoveryRequired: true, unseenSeeds: ["boss-91"], passThreshold: 0.75 },
  { id: "run-strategy", domain: "strategy", objective: "select coherent rewards and routes", recoveryRequired: false, unseenSeeds: ["s-91"], passThreshold: 0.75 },
  { id: "interface-journey", domain: "interface", objective: "complete valid menu and reward transitions", recoveryRequired: true, unseenSeeds: ["ui-91"], passThreshold: 0.8 },
] as const satisfies readonly TearAcademyLesson[]);

export type TearAcademyConsent =
  | "private-personalization-only" | "anonymous-improvement" | "public-training";

export type TearDemonstrationSegmentKind =
  | "demonstration" | "recovery" | "human-takeover" | "policy-correction";

export interface TearAcademySample {
  readonly id: string;
  readonly lessonId: string;
  readonly seed: string;
  readonly capsuleId: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly observation: TearObservationV1;
  readonly actions: readonly GameAction[];
  readonly events: readonly TearCausalEventV1[];
  readonly rewardComponents: Readonly<Record<string, number>>;
  readonly build: Readonly<Record<string, unknown>>;
  readonly device: "keyboard-mouse" | "controller" | "touch" | "semantic";
  readonly provenance: TearProvenanceV1;
  readonly consent: TearAcademyConsent;
  readonly segmentKind: TearDemonstrationSegmentKind;
  readonly tags: readonly string[];
  readonly correctionOf?: string;
}

export interface TearDemonstrationReview {
  readonly approved: boolean;
  readonly reviewer: string;
  readonly tags: readonly string[];
  readonly quality: Readonly<{
    synchronization: number;
    actionClarity: number;
    outcomeValue: number;
    recoveryValue: number;
  }>;
  readonly score: number;
}

function unit(value: number): number {
  if (!Number.isFinite(value)) throw new TypeError("quality dimension must be finite");
  return Math.max(0, Math.min(1, value));
}

export function reviewDemonstration(input: Omit<TearDemonstrationReview, "score">): TearDemonstrationReview {
  if (input.reviewer.trim().length === 0) throw new TypeError("demonstration reviewer is required");
  const quality = Object.freeze({
    synchronization: unit(input.quality.synchronization),
    actionClarity: unit(input.quality.actionClarity),
    outcomeValue: unit(input.quality.outcomeValue),
    recoveryValue: unit(input.quality.recoveryValue),
  });
  const score = (quality.synchronization + quality.actionClarity + quality.outcomeValue + quality.recoveryValue) / 4;
  return Object.freeze({
    approved: input.approved,
    reviewer: input.reviewer,
    tags: Object.freeze([...input.tags]),
    quality,
    score,
  });
}

export type TearDatasetSplit = "training" | "validation" | "calibration" | "hidden-release-exam";

export interface TearDatasetEntry {
  readonly sample: TearAcademySample;
  readonly review: TearDemonstrationReview;
  readonly split: TearDatasetSplit;
  readonly contentHash: string;
}

export interface TearBehaviorCloningManifest {
  readonly format: "tear-behavior-cloning-dataset";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly entries: readonly TearDatasetEntry[];
  readonly splitCounts: Readonly<Record<TearDatasetSplit, number>>;
  readonly rootHash: string;
}

function validateSample(sample: TearAcademySample): void {
  if (!CANONICAL_ACADEMY_LESSONS.some((lesson) => lesson.id === sample.lessonId)) {
    throw new TypeError(`unknown Academy lesson: ${sample.lessonId}`);
  }
  if (sample.capsuleId.trim().length === 0 || !Number.isSafeInteger(sample.fromTick)
    || !Number.isSafeInteger(sample.toTick) || sample.fromTick < 0 || sample.toTick < sample.fromTick) {
    throw new TypeError("training sample must resolve to a valid capsule interval");
  }
  if (!["private-personalization-only", "anonymous-improvement", "public-training"].includes(sample.consent)) {
    throw new TypeError("training sample lacks valid consent");
  }
  if (sample.observation.tick < sample.fromTick || sample.observation.tick > sample.toTick) {
    throw new TypeError("sample observation lies outside its capsule interval");
  }
  if (sample.segmentKind === "policy-correction" && sample.correctionOf === undefined) {
    throw new TypeError("policy correction must name the corrected segment");
  }
}

export class TearDemonstrationCorpus {
  readonly #entries: TearDatasetEntry[] = [];
  readonly #hashes = new Set<string>();

  add(sample: TearAcademySample, review: TearDemonstrationReview, split: TearDatasetSplit): TearDatasetEntry {
    validateSample(sample);
    if (!review.approved || review.score < 0.5) throw new TypeError("demonstration must pass review");
    if (!["training", "validation", "calibration", "hidden-release-exam"].includes(split)) {
      throw new TypeError("dataset split is invalid");
    }
    const contentHash = stableVerificationHash({
      observation: sample.observation,
      actions: sample.actions,
      events: sample.events,
      capsuleId: sample.capsuleId,
      fromTick: sample.fromTick,
      toTick: sample.toTick,
    });
    if (this.#hashes.has(contentHash)) throw new TypeError("duplicate demonstration content");
    const entry = Object.freeze({
      sample: Object.freeze(structuredClone(sample)),
      review: Object.freeze(structuredClone(review)),
      split,
      contentHash,
    });
    this.#entries.push(entry);
    this.#hashes.add(contentHash);
    return entry;
  }

  entries(includeHiddenReleaseExam = false): readonly TearDatasetEntry[] {
    return Object.freeze(this.#entries.filter((entry) =>
      includeHiddenReleaseExam || entry.split !== "hidden-release-exam"));
  }

  export(id: string, createdAt: string, includeHiddenReleaseExam = false): TearBehaviorCloningManifest {
    const entries = this.entries(includeHiddenReleaseExam);
    const splitCounts: Record<TearDatasetSplit, number> = {
      training: 0, validation: 0, calibration: 0, "hidden-release-exam": 0,
    };
    for (const entry of entries) splitCounts[entry.split] += 1;
    const rootHash = stableVerificationHash(entries.map((entry) => entry.contentHash));
    return Object.freeze({
      format: "tear-behavior-cloning-dataset",
      schemaVersion: 1,
      id,
      createdAt,
      entries,
      splitCounts: Object.freeze(splitCounts),
      rootHash,
    });
  }
}

export function encodeBehaviorCloningManifest(manifest: TearBehaviorCloningManifest): string {
  return canonicalStringify(manifest);
}

export function decodeBehaviorCloningManifest(encoded: string): TearBehaviorCloningManifest {
  const parsed: unknown = JSON.parse(encoded);
  if (typeof parsed !== "object" || parsed === null
    || !("format" in parsed) || parsed.format !== "tear-behavior-cloning-dataset"
    || !("schemaVersion" in parsed) || parsed.schemaVersion !== 1
    || !("entries" in parsed) || !Array.isArray(parsed.entries)
    || !("rootHash" in parsed) || typeof parsed.rootHash !== "string") {
    throw new TypeError("invalid behavior-cloning manifest");
  }
  const entries = parsed.entries as unknown as TearDatasetEntry[];
  const expected = stableVerificationHash(entries.map((entry) => entry.contentHash));
  if (expected !== parsed.rootHash) throw new TypeError("behavior-cloning manifest integrity mismatch");
  return Object.freeze(structuredClone(parsed)) as unknown as TearBehaviorCloningManifest;
}

export type TearObservationFeature = (observation: TearObservationV1) => string;

export class TearBehaviorClonedPolicy {
  readonly #actionsByFeature: ReadonlyMap<string, readonly GameAction[]>;
  readonly #feature: TearObservationFeature;

  constructor(actionsByFeature: ReadonlyMap<string, readonly GameAction[]>, feature: TearObservationFeature) {
    this.#actionsByFeature = actionsByFeature;
    this.#feature = feature;
  }

  decide(observation: TearObservationV1): readonly GameAction[] {
    return this.#actionsByFeature.get(this.#feature(observation)) ?? [];
  }
}

export function trainBehaviorClonedPolicy(
  manifest: TearBehaviorCloningManifest,
  feature: TearObservationFeature,
): TearBehaviorClonedPolicy {
  const votes = new Map<string, Map<string, { count: number; actions: readonly GameAction[] }>>();
  for (const entry of manifest.entries) {
    if (entry.split !== "training") continue;
    const featureId = feature(entry.sample.observation);
    const actionKey = canonicalStringify(entry.sample.actions);
    let featureVotes = votes.get(featureId);
    if (featureVotes === undefined) {
      featureVotes = new Map();
      votes.set(featureId, featureVotes);
    }
    const existing = featureVotes.get(actionKey);
    featureVotes.set(actionKey, {
      count: (existing?.count ?? 0) + 1,
      actions: existing?.actions ?? entry.sample.actions,
    });
  }
  const actionsByFeature = new Map<string, readonly GameAction[]>();
  for (const [featureId, featureVotes] of votes) {
    const winner = [...featureVotes.entries()]
      .sort(([leftKey, left], [rightKey, right]) => right.count - left.count || leftKey.localeCompare(rightKey))[0]?.[1];
    if (winner !== undefined) actionsByFeature.set(featureId, Object.freeze([...winner.actions]));
  }
  return new TearBehaviorClonedPolicy(actionsByFeature, feature);
}
