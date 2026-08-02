import { describe, expect, it } from "vitest";

import { createGhostV3, GhostProductionReplayWorld, type GhostReplayTrident } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  createProductionGhostReplayComposition,
  createProductionHeadlessEnvironment,
  type TearScenarioV1,
} from "../../src/tearbench";

const scenario = Object.freeze({
  format: "tear-contract", kind: "scenario", schemaVersion: 1,
  id: "c30-production-headless", version: 1,
  description: "C30 same-composition headless episode",
  stateClass: "recorded-canonical", executionClass: "training",
  seed: "c30-production-headless-seed",
  start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
  maxTicks: 120, assertions: Object.freeze(["runtime.finite-state"] as const),
  tags: Object.freeze(["c30", "headless", "production-composition"] as const),
} as const) satisfies TearScenarioV1;

const trident: GhostReplayTrident = Object.freeze({
  command: Object.freeze({ kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "C30 test" }),
  state: Object.freeze({ kind: "state", status: "absent", available: false, resumable: false, seekable: false, reason: "C30 test" }),
  visual: Object.freeze({ kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "C30 test" }),
});

function actionsAt(tick: number) {
  if (tick === 1) return Object.freeze([{ type: "move" as const, x: 1_000, y: 0 }]);
  if (tick === 20) return Object.freeze([{ type: "jump" as const, phase: "pressed" as const }]);
  if (tick === 40) return Object.freeze([{ type: "dash" as const, x: 1_000, y: 0 }]);
  return Object.freeze([]);
}

describe("C30 production headless environment", () => {
  it("runs a DOM-free episode through the same production replay composition", () => {
    const environment = createProductionHeadlessEnvironment();
    let final = environment.reset(scenario);
    const recordedActions = [] as { readonly kind: "command"; readonly id: number; readonly tick: number; readonly command: ReturnType<typeof actionsAt>[number] }[];
    for (let tick = 1; tick <= scenario.maxTicks; tick += 1) {
      const actions = actionsAt(tick);
      for (const action of actions) recordedActions.push(Object.freeze({ kind: "command", id: recordedActions.length + 1, tick, command: action }));
      final = environment.step(actions).observation;
    }
    environment.dispose();

    const ghost = createGhostV3({
      id: "c30-production-headless", rulesetVersion: "tear-rules-2026.07", sourceClassification: "native-v3",
      trident, actions: Object.freeze(recordedActions), snapshots: Object.freeze([]), events: Object.freeze([]),
    });
    const replay = new GhostProductionReplayWorld(ghost,
      createProductionGhostReplayComposition({ seed: scenario.seed, mode: scenario.start.mode }));
    expect(replay.seek(scenario.maxTicks).semanticHash).toBe(stableVerificationHash(final));
  });

  it("constructs independent worlds and refuses surgical state masquerading as a natural episode", () => {
    const first = createProductionHeadlessEnvironment();
    const second = createProductionHeadlessEnvironment();
    const firstOrigin = first.reset(scenario);
    const secondOrigin = second.reset(scenario);
    expect(firstOrigin).toEqual(secondOrigin);
    expect(firstOrigin).not.toBe(secondOrigin);

    const firstMoved = first.step(actionsAt(1)).observation;
    const secondIdle = second.step([]).observation;
    expect(stableVerificationHash(firstMoved)).not.toBe(stableVerificationHash(secondIdle));
    const third = createProductionHeadlessEnvironment();
    third.reset(scenario);
    expect(third.step(actionsAt(1)).observation).toEqual(firstMoved);

    expect(() => first.reset(Object.freeze({ ...scenario,
      start: Object.freeze({ ...scenario.start, wave: 2 }),
    }))).toThrow(/natural opening/);
    first.dispose(); second.dispose(); third.dispose();
  });
});
