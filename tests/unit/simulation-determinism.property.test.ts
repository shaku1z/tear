/**
 * The simulation is deterministic: for any seed, weapon, mode, difficulty and
 * any player input, the same run gives the same state at every tick. It holds
 * in a fresh environment and in one reused after a different run, so nothing
 * leaks from one run into the next.
 */
import { afterAll, describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/domain/hash";
import type { GameAction } from "../../src/input/game-action";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment } from "../../src/tearbench/production-headless-environment";
import { DIFFICULTY_IDS, RUN_MODE_IDS, WEAPON_IDS } from "../../src/tearbench/registries";
import { playTicks } from "./property-arbitraries";
import { checkProperty, fc } from "./property-harness";

interface Run {
  readonly seed: string;
  readonly mode: string;
  readonly difficulty: string;
  readonly weapon: string;
  readonly ticks: readonly (readonly GameAction[])[];
}

function scenario(run: Run): TearScenarioV1 {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: "determinism-property",
    version: 1,
    description: "Same seed and inputs give the same state",
    stateClass: "recorded-canonical",
    executionClass: "training",
    seed: run.seed,
    start: { mode: run.mode, difficulty: run.difficulty, weapon: run.weapon },
    maxTicks: run.ticks.length,
    assertions: ["runtime.finite-state"],
    tags: ["determinism"],
  } as TearScenarioV1;
}

type Environment = ReturnType<typeof createProductionHeadlessEnvironment>;

/** The state hash after every tick, or the refusal when the game does not start this run. */
function play(environment: Environment, run: Run): readonly string[] {
  try {
    environment.reset(scenario(run));
  } catch (error) {
    return [`refused: ${error instanceof Error ? error.message : String(error)}`];
  }
  const hashes: string[] = [];
  for (const actions of run.ticks) {
    const transition = environment.step(actions);
    hashes.push(stableVerificationHash(transition.observation));
    if (transition.terminated || transition.truncated) break;
  }
  return hashes;
}

const run: fc.Arbitrary<Run> = fc.record({
  seed: fc.string({ minLength: 1, maxLength: 12 }),
  mode: fc.constantFrom(...RUN_MODE_IDS),
  difficulty: fc.constantFrom(...DIFFICULTY_IDS),
  weapon: fc.constantFrom(...WEAPON_IDS),
  ticks: playTicks(60, 240),
});

describe("simulation determinism", () => {
  const reused = createProductionHeadlessEnvironment();
  afterAll(() => {
    reused.dispose();
  });

  it("gives the same state for the same seed and inputs, fresh or after another run", () => {
    checkProperty(
      fc.property(run, run, (first, other) => {
        const fresh = createProductionHeadlessEnvironment();
        try {
          const expected = play(fresh, first);
          play(reused, other);
          expect(play(reused, first)).toEqual(expected);
        } finally {
          fresh.dispose();
        }
      }),
      "simulation",
    );
  }, 120_000);
});
