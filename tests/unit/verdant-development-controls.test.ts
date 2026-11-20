import { describe, expect, expectTypeOf, it } from "vitest";
import { createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import type { TearClassARuntimeEnvironment } from "../../src/tearbench/live-runtime-contracts";
import {
  buildBloomWellCycleState,
  buildBossFrameState,
  buildRootbinderNetworkState,
} from "../../src/tearbench/state-setup-factories";
import type { TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";

const base: TearSdlDocumentV1 = {
  format: "tearsdl",
  schemaVersion: 1,
  id: "verdant-development",
  stateClass: "surgical-valid",
  seed: "verdant-development",
  start: {
    mode: "sandbox",
    difficulty: "normal",
    weapon: "sword",
    stage: "verdant-sanctum",
    wave: 31,
  },
  state: {},
  constraints: { legalProgression: true },
  tags: ["verdant-sanctum", "developer", "disposable", "non-publishable"],
};

describe("Verdant development controls", () => {
  it("authors Rootbound through the generic boss-frame State Setup boundary", () => {
    const rootbound = buildBossFrameState(base, "rootbound", "2", "regrowth", 42);
    expect(rootbound).toMatchObject({
      start: { mode: "sandbox", stage: "verdant-sanctum", boss: "rootbound", bossPhase: "2" },
      state: { boss: { id: "rootbound", phase: "2", attack: "regrowth", frame: 42 } },
    });
  });

  it("authors Rootbinder and Bloom through their existing specialized State Setup projections", () => {
    const rootbinder = buildRootbinderNetworkState(base);
    expect(rootbinder.state).toMatchObject({
      enemyComposition: [
        { kind: "rootbinder", count: 1 },
        { kind: "charger", count: 2 },
      ],
      environment: { fields: [], combatObjects: [{ kind: "root-link" }, { kind: "root-link" }], routes: [] },
    });

    const bloom = buildBloomWellCycleState(
      base,
      createBloomWellState({
        id: "verdant-development-bloom",
        ownerId: "verdant-sanctum",
        variant: "stage",
        geometry: { x: 800, y: 600, radius: 120 },
        patternId: "central-safe-lanes",
      }),
    );
    expect(bloom.state).toMatchObject({
      environment: { fields: [{ kind: "bloom-well", state: "warning" }], combatObjects: [], routes: [] },
    });
  });

  it("keeps live controls on the structured test-only environment contract", () => {
    expectTypeOf<TearClassARuntimeEnvironment["buildBloomWellCycle"]>().toBeFunction();
    expectTypeOf<TearClassARuntimeEnvironment["buildRootbinderNetwork"]>().toBeFunction();
    expectTypeOf<TearClassARuntimeEnvironment["buildRootboundGraftAnchor"]>().toBeFunction();
  });
});
