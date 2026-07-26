import { describe, expect, it } from "vitest";

import {
  createStateForgeForkSource,
  diffStateForgeValues,
  evaluateStateForgeSource,
  type TearSdlDocumentV1,
} from "../../src/tearbench";

const source = (stateClass = "surgical-valid"): string => JSON.stringify({
  format: "tearsdl",
  schemaVersion: 1,
  id: "studio-scenario",
  stateClass,
  seed: "42",
  start: { mode: "campaign", difficulty: "normal", weapon: "sword", wave: 2 },
  state: { player: { hp: 80 }, run: { score: 40 } },
});

describe("State Forge Studio model", () => {
  it("keeps structural, reachability, and population plausibility reports distinct", () => {
    const valid = evaluateStateForgeSource(source());
    expect(valid.reports).toMatchObject({
      structural: { status: "valid" },
      reachability: { status: "reachable" },
      populationPlausibility: { status: "plausible" },
    });

    const provisional = evaluateStateForgeSource(source("plausible-population"));
    expect(provisional.reports.populationPlausibility).toMatchObject({
      status: "provisional",
    });
    expect(provisional.reports.populationPlausibility.messages).not.toHaveLength(0);

    const impossible = evaluateStateForgeSource(source("adversarial-impossible"));
    expect(impossible.reports).toMatchObject({
      structural: { status: "valid" },
      reachability: { status: "unreachable" },
    });
  });

  it("fails closed and does not evaluate dependent reports for malformed input", () => {
    const result = evaluateStateForgeSource("{");
    expect(result.resolved).toBeUndefined();
    expect(result.reports).toMatchObject({
      structural: { status: "invalid" },
      reachability: { status: "not-evaluated" },
      populationPlausibility: { status: "not-evaluated" },
    });
  });

  it("resolves editor inheritance through the supplied library", () => {
    const parent = JSON.parse(source()) as TearSdlDocumentV1;
    const child = JSON.stringify({
      ...parent,
      id: "child",
      extends: parent.id,
      start: { wave: 7 },
    });
    const result = evaluateStateForgeSource(child, new Map([[parent.id, parent]]));
    expect(result.resolved?.scenario.start).toMatchObject({
      mode: "campaign",
      difficulty: "normal",
      weapon: "sword",
      wave: 7,
    });
  });

  it("produces deterministic deep diffs for checkpoint inspection", () => {
    expect(diffStateForgeValues(
      { player: { hp: 100, x: 20 }, wave: 3 },
      { player: { hp: 70, x: 20 }, wave: 4 },
    )).toEqual([
      { path: "$.player.hp", before: 100, after: 70 },
      { path: "$.wave", before: 3, after: 4 },
    ]);
  });

  it("creates an editable child source without mutating the imported document", () => {
    const original = source();
    const fork = JSON.parse(createStateForgeForkSource(original, "studio-fork", { player: { hp: 1 } })) as {
      id: string; extends: string; state: unknown;
    };
    expect(fork).toMatchObject({
      id: "studio-fork",
      extends: "studio-scenario",
      state: { player: { hp: 1 }, run: { score: 40 } },
    });
    expect(JSON.parse(original)).toMatchObject({ id: "studio-scenario", state: { player: { hp: 80 } } });
  });
});
