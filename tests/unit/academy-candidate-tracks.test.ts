import { describe, expect, it } from "vitest";

import {
  captureAcademyCandidateTracks,
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
    id: "c31-track-candidate", version: 1, description: "C31 actual track capture source episode",
    stateClass: "recorded-canonical", executionClass: "training", seed: "c31-track-seed",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }), maxTicks: 3,
    assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c31", "tracks"] as const),
  });
}

async function candidate(): Promise<ProductionHeadlessAcademyIntakeItem> {
  const intake = new ProductionHeadlessAcademyIntake(1);
  await createProductionHeadlessEpisodePool(1).run([
    Object.freeze({ id: "c31-track-candidate", scenario: scenario(), maxTicks: 3 }),
  ], () => Object.freeze({
    decide: () => Object.freeze([
      Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }]),
    ]),
  }), { batchSize: 1, artifactConsumer: (sample) => { intake.offer(sample); } });
  const value = intake.take()[0];
  if (value === undefined) throw new Error("C30 source episode did not yield a candidate");
  return value;
}

describe("C31 Academy candidate track capture", () => {
  it("reconstructs a real C30 terminal through the shared production composition and preserves exact canonical timing/actions", async () => {
    const source = await candidate();
    const bundle = captureAcademyCandidateTracks(source);
    expect(bundle).toMatchObject({
      format: "tear-academy-candidate-tracks", schemaVersion: 1,
      candidateId: source.episodeId, captureClass: "c30-terminal-reconstruction",
      terminal: source.artifact.terminal,
    });
    expect(bundle.observations.map((entry) => entry.tick)).toEqual([0, 1, 2, 3]);
    expect(bundle.actions).toEqual(source.artifact.actions);
    expect(bundle.bundleHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(bundle.unavailableTracks).toEqual([
      "native-events", "reward-components", "intents", "build-device-provenance",
    ]);
  });

  it("fails closed when a candidate terminal hash cannot be reconstructed", async () => {
    const source = await candidate();
    const tampered = Object.freeze({
      ...source, artifact: Object.freeze({
        ...source.artifact, terminal: Object.freeze({ ...source.artifact.terminal, semanticHash: "0000000000000000" }),
      }),
    });
    expect(() => captureAcademyCandidateTracks(tampered)).toThrow(/does not match/u);
  });
});
