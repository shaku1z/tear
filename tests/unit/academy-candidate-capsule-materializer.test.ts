import { describe, expect, it } from "vitest";

import {
  captureAcademyCandidateTracks,
  materializeAcademyCandidateCapsule,
} from "../../src/agents";
import { GhostCapsuleReader, GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  ProductionHeadlessAcademyIntake,
  createProductionHeadlessEpisodePool,
  type ProductionHeadlessAcademyIntakeItem,
  type TearScenarioV1,
} from "../../src/tearbench";

function scenario(): TearScenarioV1 {
  return Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1,
    id: "c31-capsule-materializer", version: 1, description: "C31 C30-to-Vault source materialization",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-materializer-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 2,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "materializer"] as const),
  });
}

async function candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-capsule-materializer", scenario: scenario(), maxTicks: 2 }),
  ], () => Object.freeze({ decide: () => Object.freeze([Object.freeze([])]) }), {
    batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); },
  });
  const value = intake.take()[0];
  if (value === undefined) throw new Error("C30 source episode did not yield a candidate");
  return value;
}

describe("C31 Academy candidate capsule materializer", () => {
  it("drains a bounded C30 candidate into a complete Vault source capsule and returns its verified attestation", async () => {
    const source = await candidate();
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const materialized = await materializeAcademyCandidateCapsule(source, {
      vault, capsuleId: "c31-materialized-candidate",
      createdAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
    });
    const capsule = await new GhostCapsuleReader(vault).read(materialized.capsuleId);
    const bundle = captureAcademyCandidateTracks(source, materialized.attestation);
    expect(materialized).toMatchObject({
      format: "tear-academy-candidate-capsule-materialization", candidateId: source.episodeId,
      attestation: { capsuleRange: { capsuleId: materialized.capsuleId, toTick: source.tick } },
    });
    expect(capsule.manifest).toMatchObject({ status: "complete", schemaVersion: 2 });
    expect(capsule.tracks.results).toHaveLength(1);
    expect(capsule.tracks.events.length).toBeGreaterThan(0);
    expect(bundle.unavailableTracks).toEqual([]);
  });

  it("refuses a legacy or malformed C30 terminal without its source bootstrap", async () => {
    const source = await candidate();
    const legacy = Object.freeze({
      ...source, artifact: Object.freeze({ ...source.artifact, bootstrap: undefined }),
    }) as unknown as ProductionHeadlessAcademyIntakeItem;
    await expect(materializeAcademyCandidateCapsule(legacy, {
      vault: new GhostLocalVault(createMemoryGhostVaultBackend()), capsuleId: "c31-missing-bootstrap",
      createdAt: "2026-08-02T00:00:00.000Z", completedAt: "2026-08-02T00:00:01.000Z",
    })).rejects.toThrow(/run-start bootstrap/u);
  });
});
