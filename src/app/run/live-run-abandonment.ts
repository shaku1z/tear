import { cleanupBossEncounterActors } from "../../gameplay/run/boss-encounter";
import type { BrowserInput } from "../../input/browser-input-contracts";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveWorldComposition } from "../world/world-composition";

export interface LiveRunAbandonmentOptions {
  readonly world: Pick<LiveWorldComposition, "state" | "lifecycle" | "environment">;
  readonly events: GameRuntimeDependencies["GAMEPLAY_EVENTS"];
  readonly input: Pick<BrowserInput, "stopSemanticRecording">;
  /** The old recorder's sidecar, stopped with the quit run (replay PR 8b removes it). */
  readonly ghostRecording?: Readonly<{ stop(meta: Readonly<Record<string, unknown>>): void }>;
  readonly run: () => GameRun;
  /** The quit run's replay record ends here (src/app/replay/live-replay-production.ts). */
  readonly replayRunEnded?: (run: GameRun) => void;
}

export interface LiveRunAbandonment {
  readonly abandon: (reason: string) => void;
}

/** Ends an active live run without an outcome: lifecycle, environment, event, and its replay record. */
export function createLiveRunAbandonment(options: LiveRunAbandonmentOptions): LiveRunAbandonment {
  const { state: hostState, lifecycle, environment } = options.world;
  const abandon = (reason: string): void => {
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
      options.replayRunEnded?.(run);
      options.ghostRecording?.stop({ abandoned: reason });
    } finally {
      options.input.stopSemanticRecording();
    }
  };
  return Object.freeze({ abandon });
}
