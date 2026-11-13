import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import type { BrowserInput } from "../../input/browser-input-contracts";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun } from "../shell/game-runtime-state";
import type { LiveWorldComposition } from "../world/world-composition";

export interface LiveRunAbandonmentOptions {
  readonly world: Pick<LiveWorldComposition, "state" | "lifecycle" | "environment">;
  readonly events: GameRuntimeDependencies["GAMEPLAY_EVENTS"];
  readonly ghost: Pick<GameRuntimeDependencies["GHOST"], "recording" | "stopRec">;
  readonly input: Pick<BrowserInput, "stopSemanticRecording">;
  readonly run: () => GameRun;
}

export interface LiveRunAbandonment {
  readonly abandon: (reason: string, metadata?: Readonly<Record<string, unknown>>) => void;
  /** The ghost challenge, built later, may claim an abandon request first. */
  readonly bindChallengeStop: (stop: () => boolean) => void;
}

/** Ends an active live run without an outcome: lifecycle, environment, event, and Ghost 2 recording. */
export function createLiveRunAbandonment(options: LiveRunAbandonmentOptions): LiveRunAbandonment {
  const { state: hostState, lifecycle, environment } = options.world;
  let stopChallengeRun: () => boolean = () => false;
  const abandon = (reason: string, metadata: Readonly<Record<string, unknown>> = {}): void => {
    if (stopChallengeRun()) return;
    const snapshot = lifecycle.snapshot();
    if (snapshot.sessionId === null || snapshot.phase === "terminated") return;
    cleanupBossEncounterActors(hostState.enemies(), "exit");
    environment.clear("abandon");
    lifecycle.terminate("quit");
    try {
      const run = options.run();
      options.events.emit({
        kind: "run",
        transition: "abandoned",
        runId: snapshot.sessionId,
        mode: run.mode,
        difficulty: run.diff,
        weaponId: run.weaponId,
        wave: run.wave,
        score: run.score,
        runTimeSeconds: run.runTime,
        reason,
      });
      if (options.ghost.recording()) options.ghost.stopRec({ ...metadata, abandoned: reason });
    } finally {
      options.input.stopSemanticRecording();
    }
  };
  return Object.freeze({
    abandon,
    bindChallengeStop(stop: () => boolean): void {
      stopChallengeRun = stop;
    },
  });
}
