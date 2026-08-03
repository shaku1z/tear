import { stableVerificationHash } from "../replay/hash";
import type { GhostVaultBackend } from "../ghost";
import {
  assessAcademyCandidateEligibility,
  type TearAcademyCandidateDeclarationV1,
} from "./academy-candidate-admission";
import type {
  TearAcademyCandidateCustodyStore,
  TearAcademyCandidateCustodyRecordV1,
} from "./academy-candidate-custody";

const QUALITY_KEY_PREFIX = "academy-candidate-quality:v1:";

export type TearAcademyCandidateQualityDisposition = "review-required" | "duplicate";
export type TearAcademyCandidateOutlierReason = "short-terminal" | "truncated-terminal" | "dense-action-burst";

/** Derived metadata only; it does not declare a skill rating or approve training use. */
export interface TearAcademyCandidateSourceMetadataV1 {
  readonly execution: "production-headless";
  readonly device: "semantic";
  readonly actor: TearAcademyCandidateDeclarationV1["provenance"]["actor"];
  readonly mode: string;
  readonly difficulty: string;
  readonly weapon: string;
  readonly terminalTick: number;
  readonly terminalKind: "terminated" | "truncated";
  readonly actionTypes: readonly string[];
  readonly observationCount: number;
  readonly nativeEventCount: number;
  readonly rewardComponentCount: number;
  readonly plannerIntentCount: number;
}

/** Transparent score components for curator triage, never an automatic acceptance threshold. */
export interface TearAcademyCandidateQualityScoreV1 {
  readonly score: number;
  readonly synchronizedTrackCoverage: number;
  readonly nativeFactDensity: number;
  readonly plannerIntentDensity: number;
}

/** Durable, pre-corpus assessment linked to one held custody record and source bundle. */
export interface TearAcademyCandidateQualityAssessmentV1 {
  readonly format: "tear-academy-candidate-quality-assessment";
  readonly schemaVersion: 1;
  readonly candidateHash: string;
  readonly custodyRecordHash: string;
  readonly declarationHash: string;
  readonly trackBundleHash: string;
  /** Content coordinate deliberately excludes candidate sequence/episode labels for deduplication. */
  readonly sourceContentHash: string;
  readonly disposition: TearAcademyCandidateQualityDisposition;
  readonly duplicateOfCandidateHash?: string;
  readonly outlierReasons: readonly TearAcademyCandidateOutlierReason[];
  readonly metadata: TearAcademyCandidateSourceMetadataV1;
  readonly quality: TearAcademyCandidateQualityScoreV1;
  readonly assessedAt: string;
  readonly actor: string;
  readonly assessmentHash: string;
}

export interface TearAcademyCandidateQualityAssessmentRequest {
  readonly declaration: TearAcademyCandidateDeclarationV1;
  readonly assessedAt: string;
  readonly actor: string;
}

export interface TearAcademyCandidateQualityInventoryV1 {
  readonly assessments: readonly TearAcademyCandidateQualityAssessmentV1[];
  /** Corrupt bytes remain untouched and cannot influence deduplication. */
  readonly rejectedKeys: readonly string[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function qualityKey(candidateHash: string): string {
  return `${QUALITY_KEY_PREFIX}${candidateHash}`;
}

function contentHash(declaration: TearAcademyCandidateDeclarationV1): string {
  const bundle = declaration.trackBundle;
  if (bundle === undefined) throw new TypeError("C31 quality requires verified source tracks");
  return stableVerificationHash({
    scenario: declaration.candidate.artifact.scenario,
    actions: bundle.actions,
    terminal: bundle.terminal,
    observations: bundle.observations,
    nativeEvents: bundle.nativeEvents,
    rewardComponents: bundle.rewardComponents,
    intents: bundle.intents,
  });
}

function assessmentHash(value: Omit<TearAcademyCandidateQualityAssessmentV1, "assessmentHash">): string {
  return stableVerificationHash(value);
}

function freezeAssessment(value: Omit<TearAcademyCandidateQualityAssessmentV1, "assessmentHash">): TearAcademyCandidateQualityAssessmentV1 {
  return Object.freeze({
    ...value,
    outlierReasons: Object.freeze([...value.outlierReasons]),
    metadata: Object.freeze({ ...value.metadata, actionTypes: Object.freeze([...value.metadata.actionTypes]) }),
    quality: Object.freeze({ ...value.quality }),
    assessmentHash: assessmentHash(value),
  });
}

function parseAssessment(value: string): TearAcademyCandidateQualityAssessmentV1 {
  const source: unknown = JSON.parse(value);
  if (source === null || typeof source !== "object" || Array.isArray(source)) throw new TypeError("invalid Academy quality record");
  const entry = source as Record<string, unknown>;
  const metadata = entry.metadata;
  const quality = entry.quality;
  if (entry.format !== "tear-academy-candidate-quality-assessment" || entry.schemaVersion !== 1
    || !/^[a-f0-9]{16}$/u.test(String(entry.candidateHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.custodyRecordHash))
    || !/^[a-f0-9]{16}$/u.test(String(entry.declarationHash)) || !/^[a-f0-9]{16}$/u.test(String(entry.trackBundleHash))
    || !/^[a-f0-9]{16}$/u.test(String(entry.sourceContentHash)) || !["review-required", "duplicate"].includes(String(entry.disposition))
    || !Array.isArray(entry.outlierReasons) || !entry.outlierReasons.every((reason) => ["short-terminal", "truncated-terminal", "dense-action-burst"].includes(String(reason)))
    || !timestamp(entry.assessedAt) || !nonEmpty(entry.actor) || !nonEmpty(entry.assessmentHash)
    || metadata === null || typeof metadata !== "object" || Array.isArray(metadata)
    || quality === null || typeof quality !== "object" || Array.isArray(quality)) throw new TypeError("invalid Academy quality record");
  const typed = entry as unknown as Omit<TearAcademyCandidateQualityAssessmentV1, "assessmentHash"> & { assessmentHash: string };
  if (typed.disposition === "duplicate") {
    if (!/^[a-f0-9]{16}$/u.test(String(typed.duplicateOfCandidateHash)) || typed.duplicateOfCandidateHash === typed.candidateHash) {
      throw new TypeError("invalid Academy duplicate assessment");
    }
  } else if (typed.duplicateOfCandidateHash !== undefined) throw new TypeError("invalid Academy review assessment");
  const { assessmentHash: recordedHash, ...draft } = typed;
  if (recordedHash !== assessmentHash(draft)) throw new TypeError("Academy quality assessment integrity mismatch");
  return freezeAssessment(draft);
}

function derive(
  declaration: TearAcademyCandidateDeclarationV1,
  custody: TearAcademyCandidateCustodyRecordV1,
  assessedAt: string,
  actor: string,
  duplicateOfCandidateHash: string | undefined,
): TearAcademyCandidateQualityAssessmentV1 {
  const bundle = declaration.trackBundle;
  if (bundle === undefined) throw new Error("verified C31 declaration lost its tracks");
  const tick = declaration.candidate.tick;
  const actionTypes = [...new Set(bundle.actions.map((entry) => entry.command.type))].sort();
  const actionDensity = bundle.actions.length / tick;
  const outlierReasons: TearAcademyCandidateOutlierReason[] = [];
  if (tick < 30) outlierReasons.push("short-terminal");
  if (bundle.terminal.truncated) outlierReasons.push("truncated-terminal");
  if (actionDensity > 8) outlierReasons.push("dense-action-burst");
  const synchronizedTrackCoverage = bundle.observations.length === tick + 1
    && bundle.rewardComponents.length === tick + 1 ? 1 : 0;
  const nativeFactDensity = bundle.nativeEvents.length / tick;
  const plannerIntentDensity = bundle.intents.length / tick;
  const score = Math.round((synchronizedTrackCoverage * 60)
    + Math.min(20, nativeFactDensity * 20) + Math.min(20, plannerIntentDensity * 20));
  return freezeAssessment({
    format: "tear-academy-candidate-quality-assessment", schemaVersion: 1,
    candidateHash: custody.candidateHash, custodyRecordHash: custody.recordHash,
    declarationHash: stableVerificationHash(declaration), trackBundleHash: bundle.bundleHash,
    sourceContentHash: contentHash(declaration),
    disposition: duplicateOfCandidateHash === undefined ? "review-required" : "duplicate",
    ...(duplicateOfCandidateHash === undefined ? {} : { duplicateOfCandidateHash }),
    outlierReasons: Object.freeze(outlierReasons),
    metadata: Object.freeze({
      execution: bundle.source.execution, device: bundle.source.device, actor: declaration.provenance.actor,
      mode: declaration.candidate.artifact.scenario.start.mode,
      difficulty: declaration.candidate.artifact.scenario.start.difficulty,
      weapon: declaration.candidate.artifact.scenario.start.weapon,
      terminalTick: tick, terminalKind: bundle.terminal.truncated ? "truncated" : "terminated",
      actionTypes: Object.freeze(actionTypes), observationCount: bundle.observations.length,
      nativeEventCount: bundle.nativeEvents.length, rewardComponentCount: bundle.rewardComponents.length,
      plannerIntentCount: bundle.intents.length,
    }),
    quality: Object.freeze({ score, synchronizedTrackCoverage, nativeFactDensity, plannerIntentDensity }),
    assessedAt, actor,
  });
}

/**
 * C31 pre-corpus quality/deduplication ledger. It only assesses custody that
 * remains held and independently re-verifies its raw declaration. It cannot
 * write a corpus sample, approval, manifest, or trainer input.
 */
export class TearAcademyCandidateQualityStore {
  readonly #backend: GhostVaultBackend;
  readonly #custody: TearAcademyCandidateCustodyStore;

  constructor(backend: GhostVaultBackend, custody: TearAcademyCandidateCustodyStore) {
    if (custody.backend() !== backend) throw new TypeError("C31 quality and custody must share one Vault backend");
    this.#backend = backend;
    this.#custody = custody;
  }

  async assess(input: TearAcademyCandidateQualityAssessmentRequest): Promise<TearAcademyCandidateQualityAssessmentV1> {
    if (!timestamp(input.assessedAt) || !nonEmpty(input.actor)) throw new TypeError("C31 quality requires an assessment decision");
    const admission = assessAcademyCandidateEligibility(input.declaration);
    const bundle = input.declaration.trackBundle;
    if (admission.disposition !== "eligible" || admission.candidateHash === null || bundle === undefined) {
      throw new RangeError("C31 quality requires an eligible, verified declaration");
    }
    const custody = await this.#custody.get(admission.candidateHash);
    const buildTrack = bundle.source.buildProvenance;
    if (custody?.status !== "held" || custody.declarationHash !== stableVerificationHash(input.declaration)
      || custody.admissionHash !== stableVerificationHash(admission) || buildTrack.status !== "captured"
      || custody.source.attestationHash !== buildTrack.attestationHash) {
      throw new RangeError("C31 quality requires the exact held custody source");
    }
    if (!(await this.#custody.held(input.assessedAt)).some((entry) => entry.candidateHash === custody.candidateHash)) {
      throw new RangeError("C31 quality requires unexpired held custody");
    }
    const existing = await this.get(custody.candidateHash);
    if (existing !== undefined) return existing;
    const sourceContentHash = contentHash(input.declaration);
    const inventory = await this.inventory();
    const duplicateOfCandidateHash = inventory.assessments
      .filter((entry) => entry.sourceContentHash === sourceContentHash && entry.candidateHash !== custody.candidateHash)
      .map((entry) => entry.candidateHash).sort()[0];
    const assessment = derive(input.declaration, custody, input.assessedAt, input.actor, duplicateOfCandidateHash);
    await this.#backend.commit([Object.freeze({ store: "analysis", key: qualityKey(assessment.candidateHash), value: JSON.stringify(assessment) })]);
    return assessment;
  }

  async get(candidateHash: string): Promise<TearAcademyCandidateQualityAssessmentV1 | undefined> {
    const stored = await this.#backend.get("analysis", qualityKey(candidateHash));
    return stored === undefined ? undefined : parseAssessment(stored);
  }

  async inventory(): Promise<TearAcademyCandidateQualityInventoryV1> {
    const assessments: TearAcademyCandidateQualityAssessmentV1[] = [];
    const rejectedKeys: string[] = [];
    for (const key of await this.#backend.keys("analysis")) {
      if (!key.startsWith(QUALITY_KEY_PREFIX)) continue;
      const stored = await this.#backend.get("analysis", key);
      if (stored === undefined) continue;
      try { assessments.push(parseAssessment(stored)); }
      catch { rejectedKeys.push(key); }
    }
    return Object.freeze({
      assessments: Object.freeze(assessments.sort((left, right) => left.candidateHash.localeCompare(right.candidateHash))),
      rejectedKeys: Object.freeze(rejectedKeys.sort()),
    });
  }
}
