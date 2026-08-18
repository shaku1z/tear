import { describe, expect, it } from "vitest";

import {
  assessAcademyCandidateEligibility,
  captureAcademyCandidateTracks,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c31-real-c30-candidate", version: 1, description: "C31 candidate gate source episode",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-candidate-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "candidate"] as const),
  });
}

async function c30Candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  const pool = createProductionHeadlessEpisodePool(1);
  await pool.run([Object.freeze({ id: "c31-real-c30-candidate", scenario: scenario(), maxTicks: 2 })], () => Object.freeze({
    decide: () => Object.freeze([Object.freeze([])]),
  }), { batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); } });
  const candidate = intake.take()[0];
  if (candidate === undefined) throw new Error("real C30 terminal did not reach Academy candidate intake");
  return candidate;
}

function declaration(candidate: ProductionHeadlessAcademyIntakeItem): TearAcademyCandidateDeclarationV1 {
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate, trackBundle: captureAcademyCandidateTracks(candidate),
    tracks: Object.freeze({
      fromTick: 0, toTick: candidate.tick, observationCount: candidate.tick + 1,
      actionEnvelopeCount: candidate.artifact.actions.length, eventsRecorded: true,
      rewardComponentsRecorded: true, intentsRecorded: true, buildRecorded: true, device: "semantic" as const,
    }),
    consent: Object.freeze({
      format: "tear-academy-consent", schemaVersion: 1, revision: "consent-c31-1",
      decidedAt: "2026-08-02T00:00:00.000Z", localRecording: "granted" as const,
      cloudPublication: "denied" as const, analytics: "denied" as const,
      modelTraining: "anonymous-improvement" as const,
    }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({
      actor: "scripted-bot" as const, producer: "c31-candidate-test",
      build: Object.freeze({ version: "1", revision: "r1", target: "unit", rulesetVersion: "rules-1", contentHash: "content-1", configHash: "config-1" }),
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: candidate.episodeId, trainingConsent: "anonymous-improvement" as const,
    }),
  });
}

describe("C31 Academy candidate admission", () => {
  it("keeps a real C30 terminal ineligible while its verified bundle names unavailable native tracks", async () => {
    const candidate = await c30Candidate();
    const admitted = assessAcademyCandidateEligibility(declaration(candidate));
    expect(admitted).toMatchObject({
      format: "tear-academy-candidate-admission", schemaVersion: 1,
      candidateId: candidate.episodeId, disposition: "rejected", reasons: ["incomplete-synchronized-tracks"],
    });
    expect(admitted.candidateHash).toMatch(/^[a-f0-9]{16}$/u);
  });

  it("rejects missing synchronized tracks, absent training consent, invalid consent, and provenance mismatch before any corpus action", async () => {
    const candidate = await c30Candidate();
    const valid = declaration(candidate);
    expect(assessAcademyCandidateEligibility({ ...valid, tracks: { ...valid.tracks, intentsRecorded: false } }).reasons)
      .toContain("incomplete-synchronized-tracks");
    expect(assessAcademyCandidateEligibility({
      ...valid, consent: { ...valid.consent, modelTraining: "no-training" },
    })).toMatchObject({ disposition: "rejected" });
    expect(assessAcademyCandidateEligibility({
      ...valid, provenance: { ...valid.provenance, trainingConsent: "public-training" },
    })).toMatchObject({ disposition: "rejected" });
    expect(assessAcademyCandidateEligibility({
      ...valid, consent: { ...valid.consent, analytics: "invented-consent" },
    })).toMatchObject({ disposition: "rejected" });
  });
});
