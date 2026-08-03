import { describe, expect, it } from "vitest";

import {
  TearAcademyCandidateCurationStore,
  TearAcademyCandidateCustodyStore,
  TearAcademyCandidateQualityStore,
  TearAcademyReviewedSampleStore,
  inspectAcademy,
  TearAcademyCandidateSplitStore,
  captureAcademyCandidateTracks,
  materializeAcademyCandidateCapsule,
  type TearAcademyCandidateCapsuleMaterializationReceiptV1,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c31-curation", version: 1, description: "C31 curation evidence",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-curation-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "curation"] as const),
  });
}

async function prepare() {
  const backend = createMemoryGhostVaultBackend();
  const vault = new GhostLocalVault(backend);
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-curation", scenario: scenario(), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const source = intake.take()[0];
  if (source === undefined) throw new Error("C30 source episode did not yield a candidate");
  const materialized = await materializeAcademyCandidateCapsule(source, {
    vault, capsuleId: "c31-curation-source", createdAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:01.000Z",
  });
  const declaration = candidateDeclaration(source, materialized);
  const custody = new TearAcademyCandidateCustodyStore(backend);
  await custody.accept({
    declaration, materialization: materialized,
    privacyRetention: Object.freeze({ classification: "anonymous" as const, revision: "c31-curation-privacy-1",
      declaredAt: "2026-08-03T00:00:00.000Z", authorizedActorIds: Object.freeze(["academy-curator", "player"]) }),
    retention: Object.freeze({ mode: "indefinite" as const }),
    decidedAt: "2026-08-03T00:01:00.000Z", actor: "academy-curator", reason: "held for curation",
  });
  const quality = new TearAcademyCandidateQualityStore(backend, custody);
  const assessment = await quality.assess({ declaration, assessedAt: "2026-08-03T00:02:00.000Z", actor: "academy-curator" });
  return Object.freeze({ backend, custody, quality, assessment, declaration });
}

function candidateDeclaration(
  source: ProductionHeadlessAcademyIntakeItem,
  materialized: TearAcademyCandidateCapsuleMaterializationReceiptV1,
): TearAcademyCandidateDeclarationV1 {
  const build = materialized.attestation.build;
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate: source,
    trackBundle: captureAcademyCandidateTracks(source, materialized.attestation),
    tracks: Object.freeze({ fromTick: 0, toTick: source.tick, observationCount: source.tick + 1,
      actionEnvelopeCount: source.artifact.actions.length, eventsRecorded: true, rewardComponentsRecorded: true,
      intentsRecorded: true, buildRecorded: true, device: "semantic" as const }),
    consent: Object.freeze({ format: "tear-academy-consent", schemaVersion: 1, revision: "c31-curation-consent-1",
      decidedAt: "2026-08-03T00:00:00.000Z", localRecording: "granted" as const, cloudPublication: "denied" as const,
      analytics: "denied" as const, modelTraining: "anonymous-improvement" as const }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({ actor: "scripted-bot" as const, producer: "c31-curation-test", build,
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: source.episodeId, trainingConsent: "anonymous-improvement" as const }),
  });
}

describe("C31 held Academy candidate curation", () => {
  it("records an authorized human curation decision without creating a sample, manifest, or trainer input", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const decision = await curation.decide({
      candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "human verified source context", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]),
    });
    expect(decision).toMatchObject({ disposition: "curation-approved", tags: ["baseline"] });
    expect(await curation.active("2026-08-03T00:04:00.000Z")).toEqual([decision]);
    expect(await input.backend.keys("analysis")).not.toContain("academy-demonstration-corpus");
  });

  it("assigns only an active approved source to one immutable split and hides exam assignments from a trainer manifest", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const decision = await curation.decide({
      candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "ready for governed split", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]),
    });
    expect(decision.disposition).toBe("curation-approved");
    const splits = new TearAcademyCandidateSplitStore(input.backend, input.custody, input.quality, curation);
    const assignment = await splits.assign({ candidateHash: input.assessment.candidateHash, split: "hidden-release-exam",
      assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    expect(assignment.lineage).toMatchObject({ session: input.declaration.candidate.episodeId, seed: "c31-curation-seed" });
    await expect(splits.assign({ candidateHash: input.assessment.candidateHash, split: "training",
      assignedAt: "2026-08-03T00:05:00.000Z", actor: "academy-curator" })).rejects.toThrow(/already exists/u);
    expect((await splits.manifest("trainer", "2026-08-03T00:05:00.000Z", { kind: "trainer", id: "bc" })).entries).toEqual([]);
    expect((await splits.manifest("exam", "2026-08-03T00:05:00.000Z", { kind: "examiner", id: "release" })).entries).toEqual([assignment]);
    const first = await splits.publishManifest({ id: "release", version: 1, createdAt: "2026-08-03T00:05:00.000Z", reader: { kind: "examiner", id: "release" } });
    expect(await splits.getManifest("release", 1)).toEqual(first);
    await expect(splits.publishManifest({ id: "release", version: 2, createdAt: "2026-08-03T00:06:00.000Z", reader: { kind: "examiner", id: "release" } })).rejects.toThrow(/predecessor/u);
    const second = await splits.publishManifest({ id: "release", version: 2, createdAt: "2026-08-03T00:06:00.000Z", reader: { kind: "examiner", id: "release" }, previousManifestHash: first.manifestHash });
    expect(second.previousManifestHash).toBe(first.manifestHash);
    const samples = new TearAcademyReviewedSampleStore(input.backend, input.custody, input.quality, curation, splits);
    const sample = await samples.materialize(input.declaration, "2026-08-03T00:06:00.000Z", "academy-curator");
    expect(sample).toMatchObject({ split: "hidden-release-exam", source: { capsuleId: "c31-curation-source", fromTick: 0 } });
    expect(sample.tracks?.actions).toEqual(input.declaration.trackBundle?.actions);
    expect(await samples.get(sample.candidateHash)).toEqual(sample);
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-sample-consent-2",
      decidedAt: "2026-08-03T00:07:00.000Z", modelTraining: "no-training" as const });
    await input.custody.revoke({ candidateHash: sample.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-03T00:07:00.000Z", actor: "player", reason: "withdrawn after review" });
    const rebuilt = await splits.publishManifest({ id: "release", version: 3, createdAt: "2026-08-03T00:08:00.000Z",
      reader: { kind: "examiner", id: "release" }, previousManifestHash: second.manifestHash });
    expect(rebuilt.entries).toEqual([]);
    const inspection = await inspectAcademy({ custody: input.custody, quality: input.quality, curation, splits, samples }, "2026-08-03T00:08:00.000Z");
    expect(inspection).toMatchObject({ custody: { revoked: 1 }, quality: { reviewRequired: 1 }, curation: { approved: 1 }, splits: { "hidden-release-exam": 1 }, reviewedSamples: 1 });
  });

  it("rejects unauthorized, duplicate, or revoked review decisions and keeps correction requests immutable", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    const request = Object.freeze({ candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "needs-correction" as const, reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "label needs review", tags: Object.freeze(["needs-label"]),
      corrections: Object.freeze([Object.freeze({ kind: "label" as const, detail: "verify terminal labeling" })]) });
    await expect(curation.decide({ ...request, reviewer: "untrusted" })).rejects.toThrow(/authorized/u);
    const decision = await curation.decide(request);
    expect(decision.corrections).toEqual([{ kind: "label", detail: "verify terminal labeling" }]);
    await expect(curation.decide(request)).rejects.toThrow(/already exists/u);
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-curation-consent-2",
      decidedAt: "2026-08-03T00:04:00.000Z", modelTraining: "no-training" as const });
    await input.custody.revoke({ candidateHash: input.assessment.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-03T00:04:00.000Z", actor: "player", reason: "withdrawn training consent" });
    expect(await curation.active("2026-08-03T00:05:00.000Z")).toEqual([]);
  });
});
