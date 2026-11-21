import { startDetachedRun } from "../../src/app/world/detached/detached-run-start";
import type {
  ProductionRunOpening,
  ProductionWaveRewardRuntime,
} from "../../src/app/world/detached/wave-reward-runtime";
import type { ProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { scenarioRunStartChoices } from "../../src/gameplay/run/run-start-choices";

/** A combat simulation stand-in for a world built without one. */
const NO_COMBAT = Object.freeze({
  simulationRuntime: { reset: () => undefined },
  combatEntityRuntime: { resetIdentity: () => undefined },
});

/**
 * Starts a bare detached world's run through the shared run start, with the seed, mode, weapon,
 * difficulty and first boss the world was built with.
 */
export function startDetachedTestRun(
  replay: ProductionReplayWorld,
  waveReward: ProductionWaveRewardRuntime,
  options: Readonly<{
    combat?: Parameters<typeof startDetachedRun>[0]["combat"];
    opening?: ProductionRunOpening;
  }> = {},
): void {
  const run = replay.world.state.run() as unknown as {
    runSeed: number;
    mode: string;
    weaponId: string;
    diff: Parameters<typeof scenarioRunStartChoices>[0]["difficulty"];
    bossOrder: readonly string[];
    variantDiscovery?: readonly string[];
  };
  startDetachedRun({
    replay,
    waveReward,
    combat: options.combat ?? NO_COMBAT,
    choices: scenarioRunStartChoices({
      runSeed: run.runSeed,
      mode: run.mode,
      weaponId: run.weaponId,
      ...(run.diff === undefined ? {} : { difficulty: run.diff }),
      ...(run.bossOrder[0] === undefined ? {} : { firstBoss: run.bossOrder[0] }),
      saved: { variantDiscovery: run.variantDiscovery ?? [] },
    }),
    resetChapter: () => undefined,
    ...(options.opening === undefined ? {} : { opening: options.opening }),
  });
}
