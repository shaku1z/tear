import { describe, expect, it } from "vitest";
import { synthesizeProgression } from "../../src/tearbench/progression-ledger";
import {
  certifyWave99HammerProgression,
  createBossPhaseLaunchMatrix,
  createOneFrameBoundaryLaunchMatrix,
} from "../../src/tearbench/state-forge-exit-gate";

describe("C23 State Forge exit matrix", () => {
  it("certifies the canonical Hard Endless wave-99 Hammer ledger exactly", () => {
    const progression = synthesizeProgression({
      mode: "endless",
      difficulty: "hard",
      weapon: "hammer",
      targetWave: 99,
      policy: "archetype",
      selections: [
        { id: "keen_edge", tier: 5 },
        { id: "bloodrite", tier: 3 },
        { id: "air_dash", tier: 1 },
      ],
    });
    expect(certifyWave99HammerProgression(progression)).toMatchObject({
      legal: true,
      targetWave: 99,
      weapon: "hammer",
      earnedPickCount: 99,
      selectedPickCount: 99,
      mutationCount: 99,
      rewardCount: 99,
      snapshotId: "wave99-start",
      ghostSeed: "990099",
    });
  });

  it("declares all fifteen boss phases and all thirty-nine one-frame boundary positions", () => {
    const bosses = createBossPhaseLaunchMatrix();
    const boundaries = createOneFrameBoundaryLaunchMatrix();
    expect(bosses).toHaveLength(15);
    expect(new Set(bosses.map((entry) => entry.boss))).toHaveLength(5);
    expect(bosses.filter((entry) => entry.phase === 3)).toHaveLength(5);
    expect(boundaries).toHaveLength(39);
    expect(new Set(boundaries.map((entry) => entry.boundary))).toHaveLength(13);
    expect(boundaries.filter((entry) => entry.position === "at")).toHaveLength(13);
  });

  it("rejects a non-wave-99 progression", () => {
    const progression = synthesizeProgression({
      mode: "endless", difficulty: "hard", weapon: "hammer",
      targetWave: 98, policy: "coverage-seeking",
    });
    expect(() => certifyWave99HammerProgression(progression)).toThrow(/wave 99/u);
  });
});
