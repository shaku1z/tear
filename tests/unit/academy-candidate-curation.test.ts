import { describe, expect, it } from "vitest";

import {
  TearAcademyCandidateCurationStore,
  TearAcademyCandidateCustodyStore,
  TearAcademyCandidateQualityStore,
  TearActivePolicyRuntime,
  TearAcademyCorpusStore,
  createTearBehaviorCloningArtifact,
  createTearBehaviorCloningBatches,
  createTearBehaviorCloningNormalization,
  evaluateTearBehaviorCloningPolicy,
  TearBehaviorCloningEvaluationVault,
  captureTearDaggerCorrections,
  TearDaggerCorrectionReviewStore,
  createTearDaggerRetrainingInput,
  trainTearBehaviorCloningPolicy,
  TearAcademyTrainingDatasetLoader,
  TearBehaviorCloningTrainingVault,
  TearPolicyArtifactRegistry,
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
  createProductionHeadlessEnvironment,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(id = "c31-curation", seed = "c31-curation-seed"): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id, version: 1, description: "C31 curation evidence",
    stateClass: "recorded-canonical", executionClass: "training", seed,
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "curation"] as const),
  });
}

function createAcademyHarness() {
  const backend = createMemoryGhostVaultBackend();
  const vault = new GhostLocalVault(backend);
  const custody = new TearAcademyCandidateCustodyStore(backend);
  const quality = new TearAcademyCandidateQualityStore(backend, custody);
  return Object.freeze({ backend, vault, custody, quality });
}

async function prepare(harness = createAcademyHarness(), fixtureId = "c31-curation") {
  const { backend, vault, custody, quality } = harness;
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: fixtureId, scenario: scenario(fixtureId, `${fixtureId}-seed`), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const source = intake.take()[0];
  if (source === undefined) throw new Error("C30 source episode did not yield a candidate");
  const materialized = await materializeAcademyCandidateCapsule(source, {
    vault, capsuleId: `${fixtureId}-source`, createdAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:01.000Z",
  });
  const declaration = candidateDeclaration(source, materialized);
  await custody.accept({
    declaration, materialization: materialized,
    privacyRetention: Object.freeze({ classification: "anonymous" as const, revision: "c31-curation-privacy-1",
      declaredAt: "2026-08-03T00:00:00.000Z", authorizedActorIds: Object.freeze(["academy-curator", "player"]) }),
    retention: Object.freeze({ mode: "indefinite" as const }),
    decidedAt: "2026-08-03T00:01:00.000Z", actor: "academy-curator", reason: "held for curation",
  });
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
    const corpus = new TearAcademyCorpusStore(input.backend, input.custody, curation, splits, samples);
    const corpusEntry = await corpus.admit({ candidateHash: sample.candidateHash, lessonId: "movement-foundations",
      segmentKind: "demonstration", tags: Object.freeze(["baseline"]), admittedAt: "2026-08-03T00:06:30.000Z", actor: "academy-curator" });
    expect(await corpus.get(sample.candidateHash)).toEqual(corpusEntry);
    expect((await corpus.manifest({ id: "trainer", reader: { kind: "trainer", id: "bc" }, version: 1,
      createdAt: "2026-08-03T00:06:30.000Z" })).entries).toEqual([]);
    const corpusFirst = await corpus.publishManifest({ id: "exam", reader: { kind: "examiner", id: "release" }, version: 1,
      createdAt: "2026-08-03T00:06:30.000Z" });
    expect(corpusFirst.entries).toEqual([corpusEntry]);
    expect(await corpus.getManifest("exam", { kind: "examiner", id: "release" }, 1)).toEqual(corpusFirst);
    const revokedConsent = Object.freeze({ ...input.declaration.consent, revision: "c31-sample-consent-2",
      decidedAt: "2026-08-03T00:07:00.000Z", modelTraining: "no-training" as const });
    await input.custody.revoke({ candidateHash: sample.candidateHash, scope: "model-training", consent: revokedConsent,
      decidedAt: "2026-08-03T00:07:00.000Z", actor: "player", reason: "withdrawn after review" });
    const rebuilt = await splits.publishManifest({ id: "release", version: 3, createdAt: "2026-08-03T00:08:00.000Z",
      reader: { kind: "examiner", id: "release" }, previousManifestHash: second.manifestHash });
    expect(rebuilt.entries).toEqual([]);
    const corpusSecond = await corpus.publishManifest({ id: "exam", reader: { kind: "examiner", id: "release" }, version: 2,
      createdAt: "2026-08-03T00:08:00.000Z", previousManifestHash: corpusFirst.manifestHash });
    expect(corpusSecond.entries).toEqual([]);
    const inspection = await inspectAcademy({ custody: input.custody, quality: input.quality, curation, splits, samples, corpus }, "2026-08-03T00:08:00.000Z");
    expect(inspection).toMatchObject({ custody: { revoked: 1 }, quality: { reviewRequired: 1 }, curation: { approved: 1 }, splits: { "hidden-release-exam": 1 }, reviewedSamples: 1, corpusEntries: 1 });
    expect(inspection.records).toMatchObject([{
      candidateHash: sample.candidateHash, custody: "revoked", modelTrainingConsent: "no-training",
      retention: "indefinite", privacyClass: "anonymous", quality: "review-required",
      curation: "curation-approved", correctionCount: 0, split: "hidden-release-exam", reviewed: true, inCorpus: true,
    }]);
    expect(inspection.manifests).toMatchObject([
      { id: "release", version: 1, entries: 1 }, { id: "release", version: 2, entries: 1 }, { id: "release", version: 3, entries: 0 },
    ]);
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

  it("loads one immutable trainer manifest deterministically without exposing hidden exams or producing a policy", async () => {
    const input = await prepare();
    const curation = new TearAcademyCandidateCurationStore(input.backend, input.custody, input.quality);
    await curation.decide({ candidateHash: input.assessment.candidateHash, assessmentHash: input.assessment.assessmentHash,
      disposition: "curation-approved", reviewer: "academy-curator", reviewedAt: "2026-08-03T00:03:00.000Z",
      rationale: "approved C33 trainer source", tags: Object.freeze(["baseline"]), corrections: Object.freeze([]) });
    const splits = new TearAcademyCandidateSplitStore(input.backend, input.custody, input.quality, curation);
    await splits.assign({ candidateHash: input.assessment.candidateHash, split: "training", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    const samples = new TearAcademyReviewedSampleStore(input.backend, input.custody, input.quality, curation, splits);
    const sample = await samples.materialize(input.declaration, "2026-08-03T00:05:00.000Z", "academy-curator");
    const corpus = new TearAcademyCorpusStore(input.backend, input.custody, curation, splits, samples);
    await corpus.admit({ candidateHash: sample.candidateHash, lessonId: "movement-foundations", segmentKind: "demonstration",
      tags: Object.freeze(["baseline"]), admittedAt: "2026-08-03T00:06:00.000Z", actor: "academy-curator" });
    const manifest = await corpus.publishManifest({ id: "c33-bc", reader: { kind: "trainer", id: "c33-local" }, version: 1,
      createdAt: "2026-08-03T00:07:00.000Z" });
    const loader = new TearAcademyTrainingDatasetLoader(corpus, samples);
    const first = await loader.load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    const second = await loader.load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ format: "tear-academy-training-dataset", manifest: { manifestHash: manifest.manifestHash },
      sequences: [{ candidateHash: sample.candidateHash, lessonId: "movement-foundations" }] });
    expect(first.sequences.every((entry) => entry.tracks.candidateHash === entry.candidateHash)).toBe(true);
    await expect(loader.load({ manifestId: manifest.id, trainerId: "other-trainer", version: 1 })).rejects.toThrow(/unavailable/u);
    const normalization = createTearBehaviorCloningNormalization(first);
    const batches = createTearBehaviorCloningBatches(first, normalization, { split: "training", batchSize: 2 });
    expect(createTearBehaviorCloningNormalization(second)).toEqual(normalization);
    expect(createTearBehaviorCloningBatches(second, normalization, { split: "training", batchSize: 2 })).toEqual(batches);
    expect(batches.flatMap((batch) => batch.examples).every((example) => example.features.length === 17)).toBe(true);
    expect(() => createTearBehaviorCloningBatches(first, normalization, { split: "validation", batchSize: 2 })).toThrow(/no examples/u);
    const config = Object.freeze({ seed: 7, epochs: 3, learningRate: 0.25, batchSize: 2 });
    const training = trainTearBehaviorCloningPolicy(first, normalization, config);
    expect(trainTearBehaviorCloningPolicy(second, normalization, config)).toEqual(training);
    expect(training.metrics.examples).toBe(3);
    expect(training.metrics.classes).toBe(2);
    expect(training.metrics.trainingAccuracy).toBe(1);
    const trainingVault = new TearBehaviorCloningTrainingVault(input.backend);
    expect(await trainingVault.persist(training)).toEqual(training);
    expect(await trainingVault.persist(training)).toEqual(training);
    expect(await trainingVault.get(training.trainingHash)).toEqual(training);
    const artifact = createTearBehaviorCloningArtifact(training, {
      id: "c33-linear-policy", createdAt: "2026-08-03T00:08:00.000Z", encoder: { id: "tear-policy-features.v1", schemaVersion: 1,
        observationClass: "structured-state", normalizationHash: normalization.normalizationHash }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash },
      rewardVersion: "tear-reward.v1", build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" },
      metrics: {}, levelTarget: "class-a", lineage: { trainingRunId: training.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" },
      compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["linear-policy-v1"] },
    });
    expect(artifact.model).toMatchObject({ format: "linear-policy-v1" });
    const registry = new TearPolicyArtifactRegistry(input.backend, artifact.compatibility);
    await registry.register(artifact); await registry.activate(artifact.id, "2026-08-03T00:09:00.000Z");
    const corrections = await captureTearDaggerCorrections(registry, scenario(), { maxCorrections: 2 });
    expect(corrections).toMatchObject({ format: "tear-dagger-correction-capture", artifact: { id: artifact.id }, terminal: { truncated: true } });
    expect(corrections.corrections).not.toEqual([]);
    expect(corrections.corrections.every((entry) => entry.challengerReceipt.source === "artifact"
      && entry.challengerActions !== entry.teacherActions)).toBe(true);
    const proposed = corrections.corrections[0];
    if (proposed === undefined) throw new Error("expected a DAgger correction proposal");
    const reviews = new TearDaggerCorrectionReviewStore(input.backend, ["academy-curator"]);
    await expect(reviews.decide({ capture: corrections, correctionHash: proposed.correctionHash, reviewer: "untrusted",
      reviewedAt: "2026-08-03T00:09:30.000Z", disposition: "accepted", rationale: "invalid actor" })).rejects.toThrow(/invalid/u);
    const review = await reviews.decide({ capture: corrections, correctionHash: proposed.correctionHash, reviewer: "academy-curator",
      reviewedAt: "2026-08-03T00:09:30.000Z", disposition: "accepted", rationale: "teacher action verified" });
    expect(await reviews.get(corrections.captureHash, proposed.correctionHash)).toEqual(review);
    const augmentation = createTearDaggerRetrainingInput(first, normalization, corrections, [review]);
    expect(augmentation).toMatchObject({ datasetHash: first.datasetHash, captureHash: corrections.captureHash, examples: [{ correctionHash: proposed.correctionHash }] });
    const retrained = trainTearBehaviorCloningPolicy(first, normalization, config, augmentation);
    expect(retrained).toMatchObject({ datasetHash: first.datasetHash, augmentationHash: augmentation.inputHash });
    expect(retrained.metrics.examples).toBeGreaterThan(training.metrics.examples);
    const environment = createProductionHeadlessEnvironment(), runtime = new TearActivePolicyRuntime(registry);
    try {
      environment.reset(scenario()); await runtime.reset();
      expect(runtime.decide({ state: environment.policyObservation(), ui: { screen: "playing" } }).receipt)
        .toMatchObject({ source: "artifact", artifactId: artifact.id });
    } finally { environment.dispose(); }
    await input.backend.put("analysis", `behavior-cloning-training:v1:${training.trainingHash}`, "not-json");
    expect(await trainingVault.get(training.trainingHash)).toBeUndefined();
    expect((await input.backend.keys("quarantine")).some((key) => key.endsWith(training.trainingHash))).toBe(true);
  });

  it("builds separately governed training and validation sequences in one immutable trainer manifest", async () => {
    const harness = createAcademyHarness();
    const training = await prepare(harness, "c33-training"), validation = await prepare(harness, "c33-validation");
    const curation = new TearAcademyCandidateCurationStore(harness.backend, harness.custody, harness.quality);
    for (const input of [training, validation]) await curation.decide({ candidateHash: input.assessment.candidateHash,
      assessmentHash: input.assessment.assessmentHash, disposition: "curation-approved", reviewer: "academy-curator",
      reviewedAt: "2026-08-03T00:03:00.000Z", rationale: "separate C33 split source", tags: Object.freeze(["c33"]), corrections: Object.freeze([]) });
    const splits = new TearAcademyCandidateSplitStore(harness.backend, harness.custody, harness.quality, curation);
    await splits.assign({ candidateHash: training.assessment.candidateHash, split: "training", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    await splits.assign({ candidateHash: validation.assessment.candidateHash, split: "validation", assignedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator" });
    const samples = new TearAcademyReviewedSampleStore(harness.backend, harness.custody, harness.quality, curation, splits);
    const [trainingSample, validationSample] = await Promise.all([
      samples.materialize(training.declaration, "2026-08-03T00:05:00.000Z", "academy-curator"),
      samples.materialize(validation.declaration, "2026-08-03T00:05:00.000Z", "academy-curator"),
    ]);
    const corpus = new TearAcademyCorpusStore(harness.backend, harness.custody, curation, splits, samples);
    for (const sample of [trainingSample, validationSample]) await corpus.admit({ candidateHash: sample.candidateHash,
      lessonId: "movement-foundations", segmentKind: "demonstration", tags: Object.freeze(["c33"]), admittedAt: "2026-08-03T00:06:00.000Z", actor: "academy-curator" });
    const manifest = await corpus.publishManifest({ id: "c33-heldout", reader: { kind: "trainer", id: "c33-local" }, version: 1, createdAt: "2026-08-03T00:07:00.000Z" });
    const dataset = await new TearAcademyTrainingDatasetLoader(corpus, samples).load({ manifestId: manifest.id, trainerId: "c33-local", version: 1 });
    const normalization = createTearBehaviorCloningNormalization(dataset);
    expect(dataset.sequences.map((entry) => entry.split).sort()).toEqual(["training", "validation"]);
    const config = Object.freeze({ seed: 7, epochs: 3, learningRate: 0.25, batchSize: 2 });
    const fit = trainTearBehaviorCloningPolicy(dataset, normalization, config);
    const artifact = createTearBehaviorCloningArtifact(fit, { id: "c33-heldout-parent", createdAt: "2026-08-03T00:08:00.000Z",
      encoder: { id: "tear-policy-features.v1", schemaVersion: 1, observationClass: "structured-state", normalizationHash: normalization.normalizationHash }, actionSchema: "tear-game-action-command-envelope.v1",
      recurrentState: { kind: "none", schemaVersion: 1 }, trainingManifest: { id: manifest.id, version: manifest.version, rootHash: manifest.rootHash }, rewardVersion: "tear-reward.v1",
      build: { version: "test", revision: "c33", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }, metrics: {}, levelTarget: "class-a",
      lineage: { trainingRunId: fit.trainingHash }, signature: { kind: "local-unsigned", keyId: "development" }, compatibility: { runtime: "tear-policy-runtime.v1", observationClass: "structured-state", actionSchema: "tear-game-action-command-envelope.v1", modelFormats: ["linear-policy-v1"] } });
    const registry = new TearPolicyArtifactRegistry(harness.backend, artifact.compatibility);
    await registry.register(artifact); await registry.activate(artifact.id, "2026-08-03T00:08:30.000Z");
    const capture = await captureTearDaggerCorrections(registry, scenario("c33-heldout-dagger", "c33-heldout-dagger-seed"), { maxCorrections: 1 });
    const correction = capture.corrections[0]; if (correction === undefined) throw new Error("expected held-out DAgger proposal");
    const review = await new TearDaggerCorrectionReviewStore(harness.backend, ["academy-curator"]).decide({ capture, correctionHash: correction.correctionHash,
      reviewer: "academy-curator", reviewedAt: "2026-08-03T00:08:45.000Z", disposition: "accepted", rationale: "C33 comparison evidence" });
    const retrained = trainTearBehaviorCloningPolicy(dataset, normalization, config, createTearDaggerRetrainingInput(dataset, normalization, capture, [review]));
    const persisted = await new TearBehaviorCloningTrainingVault(harness.backend).persist(fit);
    const first = evaluateTearBehaviorCloningPolicy(persisted, dataset, normalization, { split: "validation", batchSize: 2 });
    const second = evaluateTearBehaviorCloningPolicy(persisted, dataset, normalization, { split: "validation", batchSize: 2 });
    expect(first).toEqual(second);
    const evaluationVault = new TearBehaviorCloningEvaluationVault(harness.backend);
    expect(await evaluationVault.persist(first)).toEqual(first);
    expect(await evaluationVault.persist(first)).toEqual(first);
    expect(await evaluationVault.get(first.reportHash)).toEqual(first);
    expect(first).toMatchObject({ split: "validation", examples: 3, batchCount: 2 });
    const retrainedReport = evaluateTearBehaviorCloningPolicy(retrained, dataset, normalization, { split: "validation", batchSize: 2 });
    expect(retrainedReport).toMatchObject({ split: "validation", examples: first.examples });
    expect(retrainedReport.trainingHash).not.toBe(first.trainingHash);
    expect(first.actionConformance).toBeGreaterThanOrEqual(0);
    expect(first.actionConformance).toBeLessThanOrEqual(1);
    expect(() => evaluateTearBehaviorCloningPolicy(fit, dataset, normalization, { split: "training", batchSize: 2 } as never)).toThrow(/held-out/u);
    await harness.backend.put("analysis", `behavior-cloning-evaluation:v1:${first.reportHash}`, "not-json");
    expect(await evaluationVault.get(first.reportHash)).toBeUndefined();
    expect((await harness.backend.keys("quarantine")).some((key) => key.endsWith(first.reportHash))).toBe(true);
  });
});
