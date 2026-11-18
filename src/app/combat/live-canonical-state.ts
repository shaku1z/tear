import type { EnvironmentRuntime } from "../../gameplay/environment/environment-runtime";
import type { AuthoritativeInputState } from "../../gameplay/runtime/authoritative-input";
import {
  captureCanonicalGameplayState,
  type projectCanonicalGameplayState,
} from "../../gameplay/runtime/canonical-state";
import type { GameBlade, GameEnemy, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { LiveTrainingHost } from "../training/training-host";
import { projectLiveCanonicalEnemy } from "../world/canonical-enemy-projection";
import type { LiveCombatHostRuntimeApi } from "./combat-host-factory";

/** The canonical gameplay state the live fixed-step host hashes and seals. */
export type LiveCanonicalCombatState = ReturnType<typeof projectCanonicalGameplayState>;
export type LiveCanonicalCombatHost = LiveCombatHostRuntimeApi<LiveCanonicalCombatState>;

export interface LiveCanonicalStateSources {
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly enemies: () => GameEnemy[];
  readonly environment: Pick<EnvironmentRuntime, "snapshot">;
  readonly tutorial: Pick<LiveTrainingHost["tutorial"], "captureSession">;
}

/** Captures the live world's canonical gameplay state at a tick with the given authoritative input. */
export function createLiveCanonicalStateCapture(sources: LiveCanonicalStateSources) {
  return (tick: number, input: AuthoritativeInputState) =>
    captureCanonicalGameplayState(
      tick,
      input.snapshot(),
      sources.run(),
      sources.player(),
      sources.blade(),
      sources.enemies().map(projectLiveCanonicalEnemy),
      sources.environment.snapshot(),
      sources.tutorial.captureSession(),
    );
}

export type LiveCanonicalStateCapture = ReturnType<typeof createLiveCanonicalStateCapture>;
