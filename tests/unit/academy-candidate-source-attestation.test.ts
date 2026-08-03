import { describe, expect, it } from "vitest";

import {
  assessAcademyCandidateEligibility,
  attestAcademyCandidateSource,
  captureAcademyCandidateTracks,
  createAcademyCandidateTerminalAnchor,
  type TearAcademyCandidateDeclarationV1,
} from "../../src/agents";
import {
  GHOST_REPLAY_CONTEXT_PROVENANCE_KEY,
  GhostLocalVault,
  GhostStreamingRecorder,
  createGhostReplayRunContext,
  createMemoryGhostVaultBackend,
} from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

const build = Object.freeze({
  version: "1", revision: "c31-attestation", target: "unit", rulesetVersion: "rules-1",
  contentHash: "content-1", configHash: "config-1",
});

function scenario(): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c31-source-attestation", version: 1, description: "C31 Vault-bound candidate",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-attestation-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "attestation"] as const),
  });
}

async function candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-source-attestation", scenario: scenario(), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const value = intake.take()[0];
  if (value === undefined) throw new Error("C30 source episode did not yield a candidate");
  return value;
}

async function capsuleFor(
  source: ProductionHeadlessAcademyIntakeItem,
  includeAnchor = true,
): Promise<{ readonly vault: GhostLocalVault; readonly capsuleId: string }> {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const sourceScenario = source.artifact.scenario;
  const context = createGhostReplayRunContext({
    runId: source.episodeId, seed: sourceScenario.seed, mode: sourceScenario.start.mode,
    difficulty: sourceScenario.start.difficulty, weaponId: sourceScenario.start.weapon,
    ticksPerSecond: 120, build, rng: { world: { state: "1" } },
  });
  const capsuleId = "c31-attested-candidate";
  const recorder = new GhostStreamingRecorder({
    sessionId: capsuleId, createdAt: "2026-08-02T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    provenance: Object.freeze({ [GHOST_REPLAY_CONTEXT_PROVENANCE_KEY]: context }),
  });
  await recorder.start();
  for (const action of source.artifact.actions) await recorder.append({ kind: "commands", tick: action.tick, value: action });
  if (includeAnchor) {
    await recorder.append({ kind: "results", tick: source.tick, value: createAcademyCandidateTerminalAnchor(source) });
  } else {
    await recorder.append({ kind: "results", tick: source.tick, value: { status: "incomplete-anchor" } });
  }
  await recorder.finalize("2026-08-02T00:00:01.000Z");
  return Object.freeze({ vault, capsuleId });
}

function declaration(
  candidate: ProductionHeadlessAcademyIntakeItem,
  trackBundle: ReturnType<typeof captureAcademyCandidateTracks>,
): TearAcademyCandidateDeclarationV1 {
  return Object.freeze({
    format: "tear-academy-candidate", schemaVersion: 1, candidate, trackBundle,
    tracks: Object.freeze({
      fromTick: 0, toTick: candidate.tick, observationCount: candidate.tick + 1,
      actionEnvelopeCount: candidate.artifact.actions.length, eventsRecorded: true,
      rewardComponentsRecorded: true, intentsRecorded: true, buildRecorded: true, device: "semantic" as const,
    }),
    consent: Object.freeze({
      format: "tear-academy-consent", schemaVersion: 1, revision: "consent-c31-attested",
      decidedAt: "2026-08-02T00:00:00.000Z", localRecording: "granted" as const,
      cloudPublication: "denied" as const, analytics: "denied" as const,
      modelTraining: "anonymous-improvement" as const,
    }),
    privacy: Object.freeze({ classification: "anonymous" as const }),
    provenance: Object.freeze({
      actor: "scripted-bot" as const, producer: "c31-source-attestation-test", build,
      executionClass: "training" as const, observationClass: "structured-state" as const,
      policyId: "c30-scripted", sourceId: candidate.episodeId, trainingConsent: "anonymous-improvement" as const,
    }),
  });
}

describe("C31 Academy candidate source attestation", () => {
  it("binds a complete Vault capsule's sealed build and exact range to a real C30 terminal before pre-corpus eligibility", async () => {
    const source = await candidate();
    const capsule = await capsuleFor(source);
    const attestation = await attestAcademyCandidateSource(source, capsule.vault, capsule.capsuleId);
    const bundle = captureAcademyCandidateTracks(source, attestation);
    expect(attestation).toMatchObject({
      format: "tear-academy-candidate-source-attestation", candidateId: source.episodeId,
      build, capsuleRange: { capsuleId: capsule.capsuleId, fromTick: 0, toTick: source.tick },
    });
    expect(bundle.unavailableTracks).toEqual([]);
    expect(bundle.source).toMatchObject({ buildProvenance: { status: "captured", build },
      capsuleRange: { status: "captured", capsuleId: capsule.capsuleId } });
    const buildTrack = bundle.source.buildProvenance;
    const capsuleTrack = bundle.source.capsuleRange;
    if (buildTrack.status !== "captured" || capsuleTrack.status !== "captured") throw new Error("test lost captured source tracks");
    expect(buildTrack.attestationHash).toBe(stableVerificationHash({
      candidateId: source.episodeId, candidateHash: bundle.candidateHash, device: "semantic", build,
      replayContextHash: buildTrack.replayContextHash,
      capsuleRange: Object.freeze({
        capsuleId: capsuleTrack.capsuleId, rootIntegrity: capsuleTrack.rootIntegrity, fromTick: 0,
        toTick: source.tick, actionHash: capsuleTrack.actionHash, terminalAnchorHash: capsuleTrack.terminalAnchorHash,
      }),
    }));
    expect(bundle.bundleHash).toBe(stableVerificationHash({
      candidateHash: bundle.candidateHash, observations: bundle.observations, actions: bundle.actions,
      nativeEvents: bundle.nativeEvents, rewardComponents: bundle.rewardComponents, intents: bundle.intents,
      source: bundle.source, terminal: bundle.terminal, unavailableTracks: bundle.unavailableTracks,
    }));
    expect(assessAcademyCandidateEligibility(declaration(source, bundle))).toMatchObject({
      disposition: "eligible", reasons: [],
    });
  });

  it("rejects a complete Vault capsule without the exact C30 terminal anchor", async () => {
    const source = await candidate();
    const capsule = await capsuleFor(source, false);
    await expect(attestAcademyCandidateSource(source, capsule.vault, capsule.capsuleId))
      .rejects.toThrow(/terminal anchor/u);
  });
});
