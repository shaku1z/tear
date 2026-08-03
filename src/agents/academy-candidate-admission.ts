import { stableVerificationHash } from "../replay/hash";
import type { TearProvenanceV1 } from "../tearbench/contracts";
import type { ProductionHeadlessAcademyIntakeItem } from "../tearbench/production-headless-academy-intake";
import { academyCandidateHash, type TearAcademyCandidateTrackBundleV1 } from "./academy-candidate-tracks";

export type TearConsentDisposition = "granted" | "denied" | "revoked";
export type TearAcademyModelTrainingConsent = TearProvenanceV1["trainingConsent"];

export interface TearAcademyConsentRecordV1 {
  readonly format: "tear-academy-consent";
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly decidedAt: string;
  readonly localRecording: TearConsentDisposition;
  readonly cloudPublication: TearConsentDisposition;
  readonly analytics: TearConsentDisposition;
  readonly modelTraining: TearAcademyModelTrainingConsent;
}

export interface TearAcademyPrivacyRecordV1 {
  readonly classification: "personal" | "pseudonymous" | "anonymous";
  readonly pseudonymousActorId?: string;
}

/** A declaration of synchronized tracks; C31 later owns their durable encoding. */
export interface TearAcademySynchronizedTrackDeclarationV1 {
  readonly fromTick: number;
  readonly toTick: number;
  readonly observationCount: number;
  readonly actionEnvelopeCount: number;
  readonly eventsRecorded: boolean;
  readonly rewardComponentsRecorded: boolean;
  readonly intentsRecorded: boolean;
  readonly buildRecorded: boolean;
  readonly device: "keyboard-mouse" | "controller" | "touch" | "semantic";
}

export interface TearAcademyCandidateDeclarationV1 {
  readonly format: "tear-academy-candidate";
  readonly schemaVersion: 1;
  readonly candidate: ProductionHeadlessAcademyIntakeItem;
  readonly tracks: TearAcademySynchronizedTrackDeclarationV1;
  /** Raw track evidence must corroborate this declaration before it can be eligible. */
  readonly trackBundle?: TearAcademyCandidateTrackBundleV1;
  readonly consent: TearAcademyConsentRecordV1;
  readonly privacy: TearAcademyPrivacyRecordV1;
  readonly provenance: TearProvenanceV1;
}

export type TearAcademyCandidateRejection =
  | "invalid-c30-candidate"
  | "incomplete-synchronized-tracks"
  | "invalid-consent-record"
  | "local-recording-not-granted"
  | "model-training-not-consented"
  | "consent-provenance-mismatch"
  | "privacy-incompatible"
  | "provenance-incompatible";

export interface TearAcademyCandidateAdmissionReceiptV1 {
  readonly format: "tear-academy-candidate-admission";
  readonly schemaVersion: 1;
  readonly candidateId: string | null;
  readonly candidateHash: string | null;
  readonly disposition: "eligible" | "rejected";
  readonly reasons: readonly TearAcademyCandidateRejection[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExpectedTick(value: unknown, expected: number): boolean {
  return record(value) && value.tick === expected;
}

function hasUnavailableTracks(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function capturedSourceTracks(
  source: Readonly<Record<string, unknown>>,
  candidate: ProductionHeadlessAcademyIntakeItem,
): boolean {
  const buildTrack = source.buildProvenance;
  const capsuleTrack = source.capsuleRange;
  if (!record(buildTrack) || buildTrack.status !== "captured" || !record(buildTrack.build)
    || !nonEmpty(buildTrack.replayContextHash) || !nonEmpty(buildTrack.attestationHash)
    || !record(capsuleTrack) || capsuleTrack.status !== "captured" || !nonEmpty(capsuleTrack.capsuleId)
    || !nonEmpty(capsuleTrack.rootIntegrity) || capsuleTrack.fromTick !== 0 || capsuleTrack.toTick !== candidate.tick
    || !nonEmpty(capsuleTrack.actionHash) || !nonEmpty(capsuleTrack.terminalAnchorHash)) return false;
  const build = buildTrack.build;
  if (!nonEmpty(build.version) || !nonEmpty(build.revision) || !nonEmpty(build.target)
    || !nonEmpty(build.rulesetVersion) || !nonEmpty(build.contentHash) || !nonEmpty(build.configHash)
    || capsuleTrack.actionHash !== stableVerificationHash(candidate.artifact.actions)) return false;
  return buildTrack.attestationHash === stableVerificationHash({
    candidateId: candidate.episodeId, candidateHash: academyCandidateHash(candidate), device: "semantic",
    build, replayContextHash: buildTrack.replayContextHash,
    capsuleRange: Object.freeze({
      capsuleId: capsuleTrack.capsuleId, rootIntegrity: capsuleTrack.rootIntegrity, fromTick: 0,
      toTick: candidate.tick, actionHash: capsuleTrack.actionHash, terminalAnchorHash: capsuleTrack.terminalAnchorHash,
    }),
  });
}

function validC30SourceTracks(
  value: unknown,
  unavailableTracks: unknown,
  candidate: ProductionHeadlessAcademyIntakeItem,
): boolean {
  if (!record(value) || value.execution !== "production-headless" || value.device !== "semantic") return false;
  const build = value.buildProvenance;
  const capsule = value.capsuleRange;
  if (record(build) && build.status === "unavailable" && record(capsule) && capsule.status === "unavailable") {
    return nonEmpty(build.reason) && nonEmpty(capsule.reason)
      && hasUnavailableTracks(unavailableTracks, ["build-device-provenance", "capsule-range"]);
  }
  return capturedSourceTracks(value, candidate) && hasUnavailableTracks(unavailableTracks, []);
}

function sourceBuildMatchesProvenance(value: unknown, provenance: unknown): boolean {
  if (!record(value) || !record(value.buildProvenance) || value.buildProvenance.status !== "captured"
    || !record(value.buildProvenance.build) || !record(provenance) || !record(provenance.build)) return false;
  const source = value.buildProvenance.build;
  const declared = provenance.build;
  return source.version === declared.version && source.revision === declared.revision && source.target === declared.target
    && source.rulesetVersion === declared.rulesetVersion && source.contentHash === declared.contentHash
    && source.configHash === declared.configHash;
}

function validTimestamp(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validCandidate(value: unknown): value is ProductionHeadlessAcademyIntakeItem {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<ProductionHeadlessAcademyIntakeItem>;
  const artifact = candidate.artifact;
  const sequence = candidate.sequence;
  const tick = candidate.tick;
  return candidate.format === "tearbench-production-headless-academy-intake" && candidate.schemaVersion === 1
    && typeof sequence === "number" && Number.isSafeInteger(sequence) && sequence > 0 && nonEmpty(candidate.episodeId)
    && typeof tick === "number" && Number.isSafeInteger(tick) && tick > 0
    && artifact?.format === "tearbench-production-headless-terminal"
    && artifact.scenario.executionClass === "training" && artifact.terminal.tick === candidate.tick
    && /^[a-f0-9]{16}$/u.test(artifact.terminal.semanticHash);
}

function validTracks(value: unknown, candidate: ProductionHeadlessAcademyIntakeItem): value is TearAcademySynchronizedTrackDeclarationV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const tracks = value as Partial<TearAcademySynchronizedTrackDeclarationV1>;
  const observationCount = tracks.observationCount;
  return Number.isSafeInteger(tracks.fromTick) && tracks.fromTick === 0
    && Number.isSafeInteger(tracks.toTick) && tracks.toTick === candidate.tick
    && typeof observationCount === "number" && Number.isSafeInteger(observationCount) && observationCount >= 2
    && Number.isSafeInteger(tracks.actionEnvelopeCount)
    && tracks.actionEnvelopeCount === candidate.artifact.actions.length
    && tracks.eventsRecorded === true && tracks.rewardComponentsRecorded === true && tracks.intentsRecorded === true
    && tracks.buildRecorded === true
    && ["keyboard-mouse", "controller", "touch", "semantic"].includes(tracks.device ?? "");
}

function validTrackBundle(value: unknown, candidate: ProductionHeadlessAcademyIntakeItem): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const bundle = value as Partial<TearAcademyCandidateTrackBundleV1>;
  if (!Array.isArray(bundle.observations)) return false;
  const observations = bundle.observations;
  if (bundle.format !== "tear-academy-candidate-tracks" || bundle.schemaVersion !== 1
    || bundle.candidateId !== candidate.episodeId || bundle.candidateHash !== academyCandidateHash(candidate)
    || bundle.captureClass !== "c30-terminal-reconstruction" || observations.length < 2 || !Array.isArray(bundle.actions)
    || bundle.actions.length !== candidate.artifact.actions.length || bundle.terminal?.tick !== candidate.tick
    || bundle.terminal.semanticHash !== candidate.artifact.terminal.semanticHash
    || !Array.isArray(bundle.nativeEvents) || !Array.isArray(bundle.rewardComponents)
    || bundle.rewardComponents.length !== observations.length
    || bundle.rewardComponents.some((entry, index) => !hasExpectedTick(entry, index))
    || !Array.isArray(bundle.intents) || !Array.isArray(bundle.unavailableTracks)
    || !validC30SourceTracks(bundle.source, bundle.unavailableTracks, candidate)
    || !nonEmpty(bundle.bundleHash)) return false;
  return stableVerificationHash({
    candidateHash: bundle.candidateHash, observations: bundle.observations, actions: bundle.actions,
    nativeEvents: bundle.nativeEvents, rewardComponents: bundle.rewardComponents, intents: bundle.intents,
    source: bundle.source, terminal: bundle.terminal, unavailableTracks: bundle.unavailableTracks,
  }) === bundle.bundleHash;
}

function consentReason(value: unknown, provenance: unknown, privacy: unknown): TearAcademyCandidateRejection | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "model-training-not-consented";
  const consent = value as Partial<TearAcademyConsentRecordV1>;
  if (consent.format !== "tear-academy-consent" || consent.schemaVersion !== 1 || !nonEmpty(consent.revision)
    || !validTimestamp(consent.decidedAt)
    || !["granted", "denied", "revoked"].includes(consent.localRecording ?? "")
    || !["granted", "denied", "revoked"].includes(consent.cloudPublication ?? "")
    || !["granted", "denied", "revoked"].includes(consent.analytics ?? "")
    || !["no-training", "private-personalization-only", "anonymous-improvement", "public-training"].includes(consent.modelTraining ?? "")) {
    return "invalid-consent-record";
  }
  if (consent.localRecording !== "granted") return "local-recording-not-granted";
  if (consent.modelTraining === "no-training") return "model-training-not-consented";
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) return "provenance-incompatible";
  const source = provenance as Partial<TearProvenanceV1>;
  if (source.executionClass !== "training" || source.observationClass !== "structured-state"
    || source.trainingConsent !== consent.modelTraining || !nonEmpty(source.producer)
    || !["human", "scripted-bot", "neural-bot", "hybrid", "state-forge", "developer"].includes(source.actor ?? "")
    || source.build === undefined || !nonEmpty(source.build.version) || !nonEmpty(source.build.revision)
    || !nonEmpty(source.build.target) || !nonEmpty(source.build.rulesetVersion)
    || !nonEmpty(source.build.contentHash) || !nonEmpty(source.build.configHash)) {
    return "consent-provenance-mismatch";
  }
  if (privacy === null || typeof privacy !== "object" || Array.isArray(privacy)) return "privacy-incompatible";
  const record = privacy as Partial<TearAcademyPrivacyRecordV1>;
  if (!["personal", "pseudonymous", "anonymous"].includes(record.classification ?? "")) return "privacy-incompatible";
  if (record.classification === "pseudonymous" && !nonEmpty(record.pseudonymousActorId)) return "privacy-incompatible";
  if (record.classification === "personal" && consent.modelTraining !== "private-personalization-only") return "privacy-incompatible";
  return undefined;
}

/**
 * C31's pre-corpus gate. It makes no durable mutation and no training decision;
 * an eligible receipt only permits later review/curation to consider the
 * candidate. Revocation/deletion propagation and immutable manifests remain
 * separate C31 work.
 */
export function assessAcademyCandidateEligibility(value: unknown): TearAcademyCandidateAdmissionReceiptV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({
      format: "tear-academy-candidate-admission", schemaVersion: 1, candidateId: null, candidateHash: null,
      disposition: "rejected", reasons: Object.freeze(["invalid-c30-candidate"] as const),
    });
  }
  const input = value as Partial<TearAcademyCandidateDeclarationV1>;
  const candidate = input.candidate;
  if (input.format !== "tear-academy-candidate" || input.schemaVersion !== 1 || !validCandidate(candidate)) {
    return Object.freeze({
      format: "tear-academy-candidate-admission", schemaVersion: 1, candidateId: null, candidateHash: null,
      disposition: "rejected", reasons: Object.freeze(["invalid-c30-candidate"] as const),
    });
  }
  const reasons: TearAcademyCandidateRejection[] = [];
  if (!validTracks(input.tracks, candidate) || !validTrackBundle(input.trackBundle, candidate)
    || !sourceBuildMatchesProvenance(input.trackBundle?.source, input.provenance)) {
    reasons.push("incomplete-synchronized-tracks");
  }
  const consent = consentReason(input.consent, input.provenance, input.privacy);
  if (consent !== undefined) reasons.push(consent);
  const verifiedCandidateHash = academyCandidateHash(candidate);
  return Object.freeze({
    format: "tear-academy-candidate-admission", schemaVersion: 1,
    candidateId: candidate.episodeId, candidateHash: verifiedCandidateHash,
    disposition: reasons.length === 0 ? "eligible" : "rejected", reasons: Object.freeze(reasons),
  });
}
