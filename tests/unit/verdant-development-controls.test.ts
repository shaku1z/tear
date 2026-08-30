import { describe, expect, expectTypeOf, it } from "vitest";
import { createBloomWellState } from "../../src/gameplay/environment/bloom-well";
import type { TearClassARuntimeEnvironment } from "../../src/tearbench/live-runtime-contracts";
import {
  forgeBloomWellCycleState,
  forgeBossFrameState,
  forgeRootbinderNetworkState,
} from "../../src/tearbench/state-forge-factories";
import type { TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";

const base: TearSdlDocumentV1 = {
  format: "tearsdl", schemaVersion: 1, id: "verdant-development", stateClass: "surgical-valid",
  seed: "verdant-development", start: {
    mode: "sandbox", difficulty: "normal", weapon: "sword", stage: "verdant-sanctum", wave: 31,
  },
  state: {}, constraints: { legalProgression: true },
  tags: ["verdant-sanctum", "developer", "disposable", "non-publishable"],
};

describe("Verdant development controls", () => {
  it("authors Rootbound through the generic boss-frame State Forge boundary", () => {
    const rootbound = forgeBossFrameState(base, "rootbound", "2", "regrowth", 42);
    expect(rootbound).toMatchObject({
      start: { mode: "sandbox", stage: "verdant-sanctum", boss: "rootbound", bossPhase: "2" },
      state: { boss: { id: "rootbound", phase: "2", attack: "regrowth", frame: 42 } },
    });
  });

  it("authors Rootbinder and Bloom through their existing specialized State Forge projections", () => {
    const rootbinder = forgeRootbinderNetworkState(base);
    expect(rootbinder.state).toMatchObject({
      enemyComposition: [{ kind: "rootbinder", count: 1 }, { kind: "charger", count: 2 }],
      environment: { fields: [], combatObjects: [{ kind: "root-link" }, { kind: "root-link" }], routes: [] },
    });

    const bloom = forgeBloomWellCycleState(base, createBloomWellState({
      id: "verdant-development-bloom", ownerId: "verdant-sanctum", variant: "stage",
      geometry: { x: 800, y: 600, radius: 120 }, patternId: "central-safe-lanes",
    }));
    expect(bloom.state).toMatchObject({
      environment: { fields: [{ kind: "bloom-well", state: "warning" }], combatObjects: [], routes: [] },
    });
  });

  it("keeps live controls on the structured test-only environment contract", () => {
    expectTypeOf<TearClassARuntimeEnvironment["forgeBloomWellCycle"]>().toBeFunction();
    expectTypeOf<TearClassARuntimeEnvironment["forgeRootbinderNetwork"]>().toBeFunction();
    expectTypeOf<TearClassARuntimeEnvironment["forgeRootboundGraftAnchor"]>().toBeFunction();
  });
});
