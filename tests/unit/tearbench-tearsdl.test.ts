import { describe, expect, it } from "vitest";

import {
  TearCheckpointBank,
  createBoundaryTearSdl,
  createExactBossBoundary,
  createWave99HammerPackage,
  parseTearSdl,
  resolveTearSdl,
  type TearSdlDocumentV1,
  type TearSnapshotV1,
} from "../../src/tearbench";

const base: TearSdlDocumentV1 = {
  format: "tearsdl",
  schemaVersion: 1,
  id: "base-combat",
  stateClass: "surgical-valid",
  seed: "42",
  start: { mode: "campaign", difficulty: "normal", weapon: "sword", wave: 1 },
  state: { player: { hp: 100 }, blade: { state: "held" } },
  constraints: { finite: true },
  tags: ["base"],
};

function checkpoint(): TearSnapshotV1 {
  return {
    format: "tear-contract",
    kind: "snapshot",
    schemaVersion: 1,
    id: "root",
    tick: 20,
    stateClass: "recorded-canonical",
    seed: "42",
    hashes: {
      exact: "sha256:11111111", semantic: "sha256:22222222", visual: "sha256:33333333",
      progression: "sha256:44444444", environment: "sha256:55555555",
    },
    provenance: {
      actor: "developer",
      producer: "test",
      build: {
        version: "0.1.0", revision: "test", target: "unit", rulesetVersion: "test",
        contentHash: "sha256:aaaaaaaa", configHash: "sha256:bbbbbbbb",
      },
      executionClass: "engineering",
      observationClass: "structured-state",
      trainingConsent: "no-training",
    },
    rng: {},
    codecs: {},
    state: { player: { hp: 100, x: 50 }, run: { wave: 9 }, environment: { stage: "grounds" } },
  };
}

describe("TearSDL and checkpoint forking", () => {
  it("parses, flattens inheritance, and emits separate validity reports", () => {
    const child = parseTearSdl(JSON.stringify({
      ...base,
      id: "child",
      extends: "base-combat",
      stateClass: "plausible-population",
      start: { ...base.start, wave: 8 },
      state: { player: { hp: 65 } },
    }));
    const resolved = resolveTearSdl(child, new Map([[base.id, base]]));
    expect(resolved.document.extends).toBeUndefined();
    expect(resolved.document.state).toMatchObject({ player: { hp: 65 }, blade: { state: "held" } });
    expect(resolved.structural.valid).toBe(true);
    expect(resolved.reachability.reachable).toBe(true);
    expect(resolved.plausibility).toMatchObject({ plausible: false, provisional: true });
  });

  it("rejects inheritance cycles and constructor-selecting input", () => {
    const cyclic = { ...base, extends: "base-combat" };
    expect(() => resolveTearSdl(cyclic, new Map([[base.id, cyclic]]))).toThrow(/cycle/u);
    const hostile = JSON.stringify({ ...base, state: { constructor: "Player" } });
    expect(() => resolveTearSdl(parseTearSdl(hostile))).toThrow(/forbids property/u);
  });

  it("creates threshold-minus, threshold, threshold-plus and exact boss boundaries", () => {
    const boundaries = createBoundaryTearSdl(base, "parrySpeed", 20, 0.01);
    expect(boundaries.map((entry) => entry.state?.parrySpeed)).toEqual([19.99, 20, 20.01]);
    const boss = createExactBossBoundary(base, "warden", "enraged", 37);
    expect(resolveTearSdl(boss).scenario.start).toMatchObject({ boss: "warden", bossPhase: "enraged" });
    expect(boss.state).toMatchObject({ bossAttackFrame: 37 });
  });

  it("forks one checkpoint into 1,000 variants while unchanged fields remain equal", () => {
    const bank = new TearCheckpointBank();
    bank.addSnapshot(checkpoint());
    const unchanged: unknown[] = [];
    for (let index = 0; index < 1_000; index += 1) {
      const id = `fork-${String(index)}`;
      bank.fork("root", id, 20, { variation: { enemyX: index } });
      const materialized = bank.materialize(id);
      unchanged.push({ player: materialized.player, run: materialized.run, environment: materialized.environment });
    }
    expect(new Set(unchanged.map((value) => JSON.stringify(value)))).toHaveLength(1);
  });

  it("builds the canonical hard endless wave-99 Hammer package", () => {
    const result = createWave99HammerPackage();
    expect(result).toMatchObject({
      format: "tearbench-forge-package",
      document: { id: "hard-endless-wave-99-hammer" },
      resolved: { reachability: { reachable: true } },
      progression: { reachable: true, ledger: { targetWave: 99 } },
      visibleEpisode: { scenarioId: "hard-endless-wave-99-hammer" },
      snapshot: { id: "wave99-start" },
    });
    expect(result).toHaveProperty("replay");
    expect(result).toHaveProperty("metrics");
    expect(result).toHaveProperty("configurationTrace");
  });
});
