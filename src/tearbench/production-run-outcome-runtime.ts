import { createTearTerminalRunFactPublisher } from "../gameplay/runtime/gameplay-event-publishers";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { LiveRunOutcomeController, type LiveOutcomeControllerPort } from "../gameplay/run/live-outcome-controller";
import { snapshotOutcomeRun, type PreparedVictory } from "../gameplay/run/outcome-planner";
import type { ProductionReplayWorld } from "./production-world-factory";

export interface ProductionRunOutcomeRuntime {
  readonly controller: LiveRunOutcomeController;
  readonly outward: readonly string[];
}

/**
 * Source-owned terminal boundary for replay/headless worlds. It runs the real
 * outcome controller and native terminal publisher, while retaining only
 * semantic requests for presentation, persistence, cloud, and device work.
 */
export function createProductionRunOutcomeRuntime(
  replay: ProductionReplayWorld,
  gameplayEvents?: TearGameplayEventPort,
): ProductionRunOutcomeRuntime {
  const outward: string[] = [];
  const active = () => replay.world.state.run() as never as Record<string, unknown>;
  const publishTerminal = gameplayEvents === undefined
    ? () => undefined
    : createTearTerminalRunFactPublisher(gameplayEvents, () => replay.world.lifecycle.snapshot().sessionId);
  const port: LiveOutcomeControllerPort = {
    snapshot: () => snapshotOutcomeRun(active() as never),
    replaceWaveLog: (log) => { active().waveLog = [...log]; },
    waveActive: () => replay.world.lifecycle.isWaveActive,
    preparedVictory: () => (active()._victoryPrepared as PreparedVictory | null | undefined) ?? null,
    storePreparedVictory: (prepared) => { active()._victoryPrepared = prepared; },
    stopClipper: () => { outward.push("stopClipper"); },
    terminate: (outcome) => { replay.world.lifecycle.terminate(outcome); },
    publishTerminal,
    saveBest: () => false,
    best: (run) => ({ wave: run.wave, score: run.score, time: run.runTime }),
    awardCoins: () => 0,
    coins: () => 0,
    achievementTracking: () => false,
    economyTelemetry: () => Object.freeze({}),
    recordDefeatProgress: () => undefined,
    executeVictoryIntents: () => undefined,
    persistPendingFinale: () => { outward.push("persistFinale"); },
    saveProfile: () => { outward.push("saveProfile"); },
    clearPendingFinale: () => { outward.push("clearFinale"); },
    pushCloud: () => { outward.push("pushCloud"); },
    present: (outcome) => { outward.push(`present:${outcome}`); },
    midgame: (callback) => { callback(); },
    restartCurrentRun: () => undefined,
  };
  return Object.freeze({ controller: new LiveRunOutcomeController(port),
    get outward() { return Object.freeze([...outward]); } });
}
