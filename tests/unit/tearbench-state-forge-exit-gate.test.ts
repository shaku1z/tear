import { describe, expect, it } from "vitest";
import { stableVerificationHash } from "../../src/replay/hash";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";
import { synthesizeProgression } from "../../src/tearbench/progression-ledger";
import {
  certifyWave99HammerProgression,
  createBossPhaseLaunchMatrix,
  createOneFrameBoundaryLaunchMatrix,
  forgeExitLaunchSnapshot,
  STATE_FORGE_BOSS_FINISHER_HP,
} from "../../src/tearbench/state-forge-exit-gate";

function bossSnapshot(bosses: readonly Record<string, unknown>[]): TearSnapshotV1 {
  const state = {
    "tear.boss.v1": bosses,
    "tear.run.v1": { mode: "campaign", wave: 60, stage: 5, _biomeIdx: 5,
      chapterState: "WAVE_LIVE", spawnQueue: [] },
    "tear.world.v1": { runtime: { lifecycle: {
      phase: "wave-active", wave: 60, bossWave: true, reward: null,
    } } },
    "tear.cinematic.v1": { active: false },
    "tear.ui.v1": { screen: "playing" },
  };
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "boss-source", tick: 700, stateClass: "recorded-canonical", seed: "boss-finisher-unit",
    hashes: {
      exact: stableVerificationHash(state), semantic: "semantic", visual: "visual",
      progression: "progression", environment: "environment",
    },
    provenance: {
      actor: "state-forge", producer: "unit", executionClass: "engineering",
      observationClass: "privileged-diagnostic", trainingConsent: "no-training",
      build: {
        version: "unit", revision: "unit", target: "test-standalone", rulesetVersion: "unit",
        contentHash: "content", configHash: "config",
      },
    },
    rng: {}, codecs: { "tear.boss.v1": 1 }, state,
  };
}

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

  it("creates a surgical-valid finisher without replacing production boss identity", () => {
    const source = bossSnapshot([{
      factoryId: "source", _gid: 41, stableId: "enemy:41",
      hp: 900, hpDisplay: 880, maxHp: 1_200, dead: false, dying: false, phase: 3,
    }]);
    const forged = forgeExitLaunchSnapshot(source, {
      id: "source-finisher", kind: "boss-finisher", boss: "source",
      remainingHp: STATE_FORGE_BOSS_FINISHER_HP,
    });
    const originalBoss = (source.state["tear.boss.v1"] as readonly Record<string, unknown>[])[0];
    const forgedBoss = (forged.state["tear.boss.v1"] as readonly Record<string, unknown>[])[0];

    expect(forged).toMatchObject({ id: "source-finisher", stateClass: "surgical-valid" });
    expect(forged.provenance).toMatchObject({
      actor: "state-forge", producer: "forgeExitLaunchSnapshot", sourceId: "boss-source",
    });
    expect(forged.lineage).toEqual({
      parentId: "boss-source", relation: "forked-at", parentRootHash: source.hashes.exact, forkTick: 700,
    });
    expect(forgedBoss).toMatchObject({
      factoryId: "source", _gid: 41, stableId: "enemy:41", hp: 1, hpDisplay: 1,
      maxHp: 1_200, dead: false, dying: false, phase: 3,
    });
    expect(originalBoss?.hp).toBe(900);
    expect(forged.hashes.exact).toBe(stableVerificationHash(forged.state));
    expect(forged.hashes.exact).not.toBe(source.hashes.exact);
  });

  it.each([
    ["missing", []],
    ["mismatched", [{ factoryId: "warden", hp: 10, hpDisplay: 10, maxHp: 100, dead: false }]],
    ["duplicate", [
      { factoryId: "source", hp: 10, hpDisplay: 10, maxHp: 100, dead: false },
      { factoryId: "source", hp: 10, hpDisplay: 10, maxHp: 100, dead: false },
    ]],
    ["dead", [{ factoryId: "source", hp: 0, hpDisplay: 0, maxHp: 100, dead: true }]],
  ] as const)("fails closed for a %s boss source", (_label, bosses) => {
    expect(() => forgeExitLaunchSnapshot(bossSnapshot(bosses), {
      id: "source-finisher", kind: "boss-finisher", boss: "source", remainingHp: 1,
    })).toThrow(/requires|source boss/u);
  });

  it("fails closed when the Source is not at the unobstructed final campaign frontier", () => {
    const base = bossSnapshot([{
      factoryId: "source", hp: 10, hpDisplay: 10, maxHp: 100, dead: false, dying: false,
    }]);
    const invalid = [
      (state: Record<string, unknown>) => {
        ((state["tear.world.v1"] as { runtime: { lifecycle: { reward: unknown } } }).runtime.lifecycle).reward = "boss";
      },
      (state: Record<string, unknown>) => { (state["tear.run.v1"] as { spawnQueue: unknown[] }).spawnQueue = [{}]; },
      (state: Record<string, unknown>) => { (state["tear.cinematic.v1"] as { active: boolean }).active = true; },
      (state: Record<string, unknown>) => { (state["tear.run.v1"] as { wave: number }).wave = 59; },
    ];
    for (const corrupt of invalid) {
      const candidate = structuredClone(base);
      corrupt(candidate.state);
      expect(() => forgeExitLaunchSnapshot(candidate, {
        id: "source-finisher", kind: "boss-finisher", boss: "source", remainingHp: 1,
      })).toThrow(/frontier|campaign/u);
    }
  });
});
