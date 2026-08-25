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

  it("inherits missing start fields without accepting malformed root or child fields", () => {
    const child = parseTearSdl(JSON.stringify({
      ...base,
      id: "partial-child",
      extends: base.id,
      start: { wave: 7 },
    }));
    expect(resolveTearSdl(child, new Map([[base.id, base]])).scenario.start).toMatchObject({
      mode: base.start.mode,
      difficulty: base.start.difficulty,
      weapon: base.start.weapon,
      wave: 7,
    });
    expect(() => parseTearSdl(JSON.stringify({ ...base, start: { wave: 7 } }))).toThrow(/start\.mode must be a string/u);
    expect(() => parseTearSdl(JSON.stringify({ ...base, extends: base.id, start: { mode: 4 } })))
      .toThrow(/start\.mode must be a string/u);
    expect(() => parseTearSdl(JSON.stringify({ ...base, extends: 4 }))).toThrow(/extends must be a string/u);
  });

  it("rejects inheritance cycles and constructor-selecting input", () => {
    const cyclic = { ...base, extends: "base-combat" };
    expect(() => resolveTearSdl(cyclic, new Map([[base.id, cyclic]]))).toThrow(/cycle/u);
    const hostile = JSON.stringify({ ...base, state: { constructor: "Player" } });
    expect(() => resolveTearSdl(parseTearSdl(hostile))).toThrow(/forbids property/u);
  });

  it("rejects unknown or non-string authored stage and boss IDs", () => {
    expect(() => parseTearSdl(JSON.stringify({ ...base, start: { ...base.start, stage: 1 } }))).toThrow(/start\.stage must be a string/u);
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, stage: 1 } as never })).toThrow(/start\.stage.*authored stage ID/u);
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, stage: "forgotten" } })).toThrow(/start\.stage.*authored stage ID/u);
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, mode: "bossonly", boss: "warden-2" } })).toThrow(/start\.boss.*authored boss ID/u);
  });

  it("requires a declared boss and accepts only source-derived numeric phase ordinals", () => {
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, bossPhase: "2" } })).toThrow(/boss phase requires a declared boss/u);
    for (const bossPhase of ["1", "2", "3"]) {
      expect(resolveTearSdl({ ...base, start: { ...base.start, mode: "bossonly", boss: "warden", bossPhase } }).scenario.start)
        .toMatchObject({ mode: "bossonly", boss: "warden", bossPhase });
    }
    for (const bossPhase of ["enraged", ".65", "01"]) {
      expect(() => resolveTearSdl({ ...base, start: { ...base.start, mode: "bossonly", boss: "warden", bossPhase } }))
        .toThrow(/source-derived numeric ordinal/u);
    }
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, mode: "bossonly", boss: "warden", bossPhase: "4" } }))
      .toThrow(/between 1 and 3/u);
  });

  it("rejects a boss selected through a non-boss run mode", () => {
    expect(() => resolveTearSdl({ ...base, start: { ...base.start, boss: "warden" } })).toThrow(/requires bossonly mode/u);
  });

  it("creates threshold-minus, threshold, threshold-plus and exact boss boundaries", () => {
    const boundaries = createBoundaryTearSdl(base, "parrySpeed", 20, 0.01);
    expect(boundaries.map((entry) => entry.state?.parrySpeed)).toEqual([19.99, 20, 20.01]);
    const boss = createExactBossBoundary(base, "warden", "2", 37);
    expect(resolveTearSdl(boss).scenario.start).toMatchObject({ boss: "warden", bossPhase: "2" });
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

  it("exports, migrates, time-travels, diffs, and imports a branch bank atomically", () => {
    const bank = new TearCheckpointBank();
    bank.addSnapshot(checkpoint());
    bank.fork("root", "low-hp", 21, { player: { hp: 1 } });
    bank.fork("root", "high-score", 22, { run: { score: 99_000 } });
    expect(bank.list().map((entry) => entry.id)).toEqual(["root", "low-hp", "high-score"]);
    expect(bank.diff("low-hp", "high-score")).toEqual(["$.player.hp", "$.run.score"]);

    const archive = bank.export();
    const restored = new TearCheckpointBank();
    restored.import(archive);
    expect(restored.materialize("low-hp")).toEqual(bank.materialize("low-hp"));
    expect(restored.export()).toEqual(archive);

    const hostile = {
      ...structuredClone(archive),
      deltas: archive.deltas.map((delta, index) =>
        index === 0 ? { ...delta, parentId: "missing" } : structuredClone(delta)),
    };
    expect(() => { restored.import(hostile); }).toThrow(/missing parent/u);
    expect(restored.materialize("low-hp")).toEqual(bank.materialize("low-hp"));
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
