import { describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/domain/hash";
import { stageIdsAvailableOn } from "../../src/gameplay/stages";
import { CHAPTER_WAVE_LIVE, chapterState, skipChapter } from "../../src/playtest/headless/chapter";
import {
  createProductionHeadlessEnvironment,
  ProductionCheckpointUnavailableError,
  type ProductionHeadlessEnvironment,
} from "../../src/playtest/headless/production-headless-environment";
import { requireProductionHeadlessScenario } from "../../src/playtest/headless/production-headless-scenario";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "../../src/gameplay/snapshot/snapshot-contract";
import type { TearScenarioV1 } from "../../src/tearbench/contracts";

type Start = Readonly<{ mode: string; wave?: number; stage?: string }>;

function scenario(start: Start, stateClass = "surgical-valid"): TearScenarioV1 {
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `wave-start-${start.mode}-${String(start.wave ?? 1)}`,
    version: 1,
    description: "A run opened on a chosen wave",
    stateClass,
    executionClass: "engineering",
    seed: "wave-start",
    start: { difficulty: "normal", weapon: "sword", ...start },
    maxTicks: 1200,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

interface RunView {
  readonly wave: number;
  readonly stage: number;
  readonly isBossWave: boolean;
}

const runOf = (environment: ProductionHeadlessEnvironment): RunView => environment.world().run() as unknown as RunView;

/** Opens a run and hands it to `read`; the environment is always disposed. */
function opened<T>(start: Start, read: (environment: ProductionHeadlessEnvironment) => T, stateClass?: string): T {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(scenario(start, stateClass));
    return read(environment);
  } finally {
    environment.dispose();
  }
}

describe("a headless run opened on a chosen wave", () => {
  const stages = stageIdsAvailableOn("adventure");

  it.each(stages.map((stage, index) => [stage, index] as const))(
    "opens the Adventure on the first wave of %s, in that stage, behind its story chapter",
    (stage, index) => {
      const wave = index * 10 + 1;
      opened({ mode: "campaign", wave, stage }, (environment) => {
        expect(runOf(environment)).toMatchObject({ wave, stage: index, isBossWave: false });
        // The stage's story holds the wave, as in a player's run, until it is skipped the way a player skips it.
        expect(chapterState(environment)).not.toBe(CHAPTER_WAVE_LIVE);
        expect(skipChapter(environment)).toBe(true);
        expect(runOf(environment).wave).toBe(wave);
      });
    },
  );

  it("starts the wave the game plans for that number: enemies arrive and the wave is the one asked for", () => {
    opened({ mode: "campaign", wave: 35 }, (environment) => {
      expect(runOf(environment)).toMatchObject({ wave: 35, stage: 3 });
      expect(skipChapter(environment)).toBe(true);
      let most = 0;
      for (let tick = 0; tick < 600; tick += 1) {
        environment.step([]);
        most = Math.max(most, environment.world().enemies().length);
      }
      expect(most).toBeGreaterThan(0);
      expect(runOf(environment).wave).toBe(35);
    });
  });

  it("opens a stage's tenth wave as its boss wave, and Endless on a later wave with no chapter", () => {
    opened({ mode: "campaign", wave: 40 }, (environment) => {
      expect(runOf(environment)).toMatchObject({ wave: 40, stage: 3, isBossWave: true });
    });
    opened({ mode: "endless", wave: 12 }, (environment) => {
      expect(runOf(environment).wave).toBe(12);
      expect(environment.cinematicActive()).toBe(false);
    });
  });

  it("plays the same run from the same seed", () => {
    const play = (): string =>
      opened({ mode: "endless", wave: 12 }, (environment) => {
        let state = environment.step([]).observation;
        for (let tick = 0; tick < 240; tick += 1) state = environment.step([]).observation;
        return stableVerificationHash(state);
      });
    expect(play()).toBe(play());
  });

  it("leaves a run that names wave 1, or no wave, exactly the natural opening", () => {
    const first = (start: Start): string =>
      opened(
        start,
        (environment) => {
          let state = environment.step([]).observation;
          for (let tick = 0; tick < 120; tick += 1) state = environment.step([]).observation;
          return stableVerificationHash(state);
        },
        "recorded-canonical",
      );
    expect(first({ mode: "endless", wave: 1 })).toBe(first({ mode: "endless" }));
  });

  it("gives the player a build when asked: one pick from the game's draft for each wave before", () => {
    const owned = (build?: (choices: readonly Readonly<{ id: string }>[]) => number): Record<string, number> => {
      const environment = createProductionHeadlessEnvironment(build === undefined ? {} : { build });
      try {
        environment.reset(scenario({ mode: "campaign", wave: 31 }));
        const run = environment.world().run() as unknown as { mods: { owned: Record<string, number> } };
        return { ...run.mods.owned };
      } finally {
        environment.dispose();
      }
    };
    const picks = (build: Record<string, number>): number => Object.values(build).reduce((sum, n) => sum + n, 0);
    expect(picks(owned())).toBe(0);
    const offered: number[] = [];
    const first = owned((choices) => {
      offered.push(choices.length);
      return 0;
    });
    expect(offered).toHaveLength(30);
    expect(Math.min(...offered)).toBeGreaterThanOrEqual(3);
    expect(picks(first)).toBe(30);
    expect(owned(() => 0)).toEqual(first);
    expect(owned((choices) => choices.length - 1)).not.toEqual(first);
    expect(() => owned(() => 9)).toThrow("not on offer");
  });

  it("is surgical state: it has to say so, and it gives no checkpoint", () => {
    expect(() => scenario({ mode: "endless", wave: 12 }, "recorded-canonical")).toThrow(/natural opening/u);
    expect(() => scenario({ mode: "endless" }, "surgical-valid")).toThrow(/recorded-canonical natural openings/u);
    opened({ mode: "endless", wave: 12 }, (environment) => {
      environment.step([]);
      expect(() => environment.captureCheckpoint()).toThrow(ProductionCheckpointUnavailableError);
    });
  });

  it("refuses, by name, what the game's wave planner cannot start", () => {
    expect(() => scenario({ mode: "bossonly", wave: 5 })).toThrow("opens on wave 1");
    expect(() => scenario({ mode: "gauntlet", wave: 5 })).toThrow("opens on wave 1");
    expect(() => scenario({ mode: "endless", wave: 12, stage: "verdant-sanctum" })).toThrow("only in the Adventure");
    expect(() => scenario({ mode: "campaign", wave: 12, stage: "verdant-sanctum" })).toThrow(
      "stage verdant-sanctum is waves 31 to 40 of the Adventure, not wave 12",
    );
    expect(() => scenario({ mode: "campaign", wave: 0 })).toThrow(TypeError);
  });
});
