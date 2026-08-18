import { describe, expect, it } from "vitest";

import {
  TearAcademyCandidateCustodyStore,
  TearAcademyCandidateQualityStore,
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
    id: "c31-quality", version: 1, description: "C31 quality evidence",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-quality-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "quality"] as const),
  });
}

async function candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-quality", scenario: scenario(), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const value = intake.take()[0];
  if (value === undefined) throw new Error("C30 source episode did not yield a candidate");
  return value;
}

function declaration(
  source: ProductionHeadlessAcademyIntakeItem,
  materialized: TearAcademyCandidateCapsuleMaterializationReceiptV1,
): TearAcademyCandidateDeclarationV1 {
  const build = materialized.attestation.build;
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate: source,
    trackBundle: captureAcademyCandidateTracks(source, materialized.attestation),
    tracks: Object.freeze({
      fromTick: 0, toTick: source.tick, observationCount: source.tick + 1,
      actionEnvelopeCount: source.artifact.actions.length, eventsRecorded: true,
      rewardComponentsRecorded: true, intentsRecorded: true, buildRecorded: true, device: "semantic" as const,
    }),
    consent: Object.freeze({
      format: "tear-academy-consent", schemaVersion: 1, revision: "c31-quality-consent-1",
      decidedAt: "2026-08-03T00:00:00.000Z", localRecording: "granted" as const,
      cloudPublication: "denied" as const, analytics: "denied" as const,
      modelTraining: "anonymous-improvement" as const,
    }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({
      actor: "scripted-bot" as const, producer: "c31-quality-test", build,
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: source.episodeId, trainingConsent: "anonymous-improvement" as const,
    }),
  });
}

function privacyRetention() {
  return Object.freeze({
    classification: "anonymous" as const, revision: "c31-quality-privacy-1",
    declaredAt: "2026-08-03T00:00:00.000Z", authorizedActorIds: Object.freeze(["academy-curator"]),
  });
}

async function hold(
  custody: TearAcademyCandidateCustodyStore,
  source: ProductionHeadlessAcademyIntakeItem,
  materialized: TearAcademyCandidateCapsuleMaterializationReceiptV1,
): Promise<TearAcademyCandidateDeclarationV1> {
  const value = declaration(source, materialized);
  await custody.accept({
    declaration: value, materialization: materialized, privacyRetention: privacyRetention(),
    retention: Object.freeze({ mode: "indefinite" as const }),
    decidedAt: "2026-08-03T00:01:00.000Z", actor: "academy-curator", reason: "held for quality assessment",
  });
  return value;
}

describe("C31 held Academy candidate quality", () => {
  it("persists transparent quality, source metadata, and deterministic duplicate custody without creating a corpus sample", async () => {
    const backend = createMemoryGhostVaultBackend();
    const vault = new GhostLocalVault(backend);
    const custody = new TearAcademyCandidateCustodyStore(backend);
    const quality = new TearAcademyCandidateQualityStore(backend, custody);
    const source = await candidate();
    const firstMaterialized = await materializeAcademyCandidateCapsule(source, {
      vault, capsuleId: "c31-quality-first", createdAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:01.000Z",
    });
    const first = await hold(custody, source, firstMaterialized);
    const assessed = await quality.assess({ declaration: first, assessedAt: "2026-08-03T00:02:00.000Z", actor: "academy-curator" });
    expect(assessed).toMatchObject({
      disposition: "review-required", metadata: { execution: "production-headless", device: "semantic", weapon: "sword" },
      outlierReasons: ["short-terminal", "truncated-terminal"],
    });
    expect(await new TearAcademyCandidateQualityStore(backend, custody).get(assessed.candidateHash)).toEqual(assessed);

    const duplicateSource = Object.freeze({ ...source, sequence: source.sequence + 1, episodeId: "c31-quality-duplicate" });
    const duplicateMaterialized = await materializeAcademyCandidateCapsule(duplicateSource, {
      vault, capsuleId: "c31-quality-duplicate", createdAt: "2026-08-03T00:03:00.000Z", completedAt: "2026-08-03T00:00:04.000Z",
    });
    const duplicate = await hold(custody, duplicateSource, duplicateMaterialized);
    const duplicateAssessment = await quality.assess({
      declaration: duplicate, assessedAt: "2026-08-03T00:04:00.000Z", actor: "academy-curator",
    });
    expect(duplicateAssessment).toMatchObject({ disposition: "duplicate", duplicateOfCandidateHash: assessed.candidateHash });
    expect(await backend.keys("analysis")).not.toContain("academy-demonstration-corpus");
  });

  it("fails closed for a non-held or corrupted declaration and quarantines corrupt assessment bytes", async () => {
    const backend = createMemoryGhostVaultBackend();
    const vault = new GhostLocalVault(backend);
    const custody = new TearAcademyCandidateCustodyStore(backend);
    const quality = new TearAcademyCandidateQualityStore(backend, custody);
    const source = await candidate();
    const materialized = await materializeAcademyCandidateCapsule(source, {
      vault, capsuleId: "c31-quality-invalid", createdAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:01.000Z",
    });
    const unheld = declaration(source, materialized);
    await expect(quality.assess({ declaration: unheld, assessedAt: "2026-08-03T00:02:00.000Z", actor: "academy-curator" }))
      .rejects.toThrow(/held custody/u);
    const held = await hold(custody, source, materialized);
    const heldBundle = held.trackBundle;
    if (heldBundle === undefined) throw new Error("held quality declaration lost its track bundle");
    const corrupted = Object.freeze({ ...held, trackBundle: Object.freeze({ ...heldBundle, bundleHash: "tampered" }) });
    await expect(quality.assess({ declaration: corrupted, assessedAt: "2026-08-03T00:02:00.000Z", actor: "academy-curator" }))
      .rejects.toThrow(/eligible/u);
    await backend.put("analysis", "academy-candidate-quality:v1:bad", "not-json");
    expect((await quality.inventory()).rejectedKeys).toEqual(["academy-candidate-quality:v1:bad"]);
  });
});
