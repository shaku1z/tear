import { describe, expect, it } from "vitest";

import { createProductionHeadlessEnvironment, type TearScenarioV1 } from "../../src/tearbench";
import {
  canonicalizeTearC34C32ActionVocabulary,
  createTearC34C32RuntimeModel,
  encodeC30SourceStateForC34C32,
  encodeC32RuntimeSourceStateForC34,
  encodeC34TrainingSourceStateForC32,
  maskTearC34C32Actions,
  requireTearC34C32AdapterEligibleTrainingResult,
  selectTearC34C32RuntimeAction,
  tearC34C32SemanticActionHash,
} from "../../src/agents";

const scenario = Object.freeze({ format: "tear-contract" as const, kind: "scenario" as const, schemaVersion: 1 as const,
  id: "c34-c32-source-contract", version: 1, description: "shared canonical source state", stateClass: "recorded-canonical" as const,
  executionClass: "training" as const, seed: "c34-c32-source-contract", start: Object.freeze({ mode: "endless" as const,
    difficulty: "normal" as const, weapon: "sword" as const }), maxTicks: 4, assertions: Object.freeze(["runtime.finite-state"] as const), tags: Object.freeze(["c34", "c32"] as const) }) satisfies TearScenarioV1;

describe("C34/C32 canonical source-state adapter", () => {
  it("projects the same real C30 source state identically for C30, C34 training, and a future C32 runtime", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const initial = environment.reset(scenario), next = environment.step([{ type: "move", x: 1_000, y: 0 }]).observation;
      for (const state of [initial, next]) {
        expect(encodeC30SourceStateForC34C32(state)).toEqual(encodeC34TrainingSourceStateForC32(state));
        expect(encodeC30SourceStateForC34C32(state)).toEqual(encodeC32RuntimeSourceStateForC34(state));
      }
    } finally { environment.dispose(); }
  });

  it("uses one canonical vocabulary, masks unavailable types, and breaks equal Q values by semantic hash", () => {
    const environment = createProductionHeadlessEnvironment();
    try {
      const state = environment.reset(scenario);
      const vocabulary = canonicalizeTearC34C32ActionVocabulary([
        { type: "jump", phase: "pressed" }, { type: "move", x: 1_000, y: 0 }, { type: "move", x: 1_000, y: 0 },
      ]);
      expect(vocabulary).toHaveLength(2);
      expect(maskTearC34C32Actions(vocabulary, ["move"])).toEqual([{ type: "move", x: 1_000, y: 0 }]);
      const stateHash = encodeC30SourceStateForC34C32(state).stateHash;
      const entries = vocabulary.map((action) => ({ stateHash, semanticActionHash: tearC34C32SemanticActionHash([action]), actionHash: "1".repeat(16), value: 3 }));
      const model = createTearC34C32RuntimeModel(entries);
      const selected = selectTearC34C32RuntimeAction(model, state, vocabulary, ["move", "jump"]);
      const expected = [...vocabulary].sort((left, right) => tearC34C32SemanticActionHash([left]).localeCompare(tearC34C32SemanticActionHash([right])))[0];
      expect(selected?.actions).toEqual([expected]);
      expect(selectTearC34C32RuntimeAction(model, state, vocabulary, [])).toBeUndefined();
    } finally { environment.dispose(); }
  });

  it("refuses legacy V2 C34 result bytes instead of creating a C32 compatibility fallback", () => {
    expect(() => requireTearC34C32AdapterEligibleTrainingResult({ model: { format: "tear-offline-tabular-q-model-v2" } } as never))
      .toThrow(/explicit V3-compatible/u);
  });
});
