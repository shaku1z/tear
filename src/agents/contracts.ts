import type { GameAction } from "../input/game-action";
import type { TearObservationClass, TearObservationV1 } from "../tearbench/contracts";

export type TearAgentProfileId =
  | "smoke" | "competent" | "style" | "survival" | "chaos" | "menu" | "transition-hunter";

export type TearAgentObjective =
  | "navigate-menu" | "start-run" | "survive" | "clear-wave" | "defeat-boss"
  | "select-reward" | "recover" | "exercise-transition" | "return-to-menu";

export type TearBladeManeuver =
  | "track" | "slash" | "throw" | "recall" | "parry" | "secondary" | "recover";

export interface TearAgentUiObservation {
  readonly screen: string;
  readonly focusedId?: string;
  readonly choices?: readonly Readonly<{ id: string; score?: number; unique?: boolean }>[];
}

export interface TearAgentObservation {
  readonly state: TearObservationV1;
  readonly ui?: TearAgentUiObservation;
  readonly boss?: Readonly<{ id: string; phase: string }>;
}

export interface TearAgentIntentTrace {
  readonly tick: number;
  readonly profile: TearAgentProfileId;
  readonly objective: TearAgentObjective;
  readonly targetId?: string;
  readonly maneuver: TearBladeManeuver;
  readonly confidence: number;
  readonly recovery: boolean;
  readonly observationClass: TearObservationClass;
  readonly critic: readonly string[];
}

export interface TearAgentDecision {
  readonly actions: readonly GameAction[];
  readonly trace: TearAgentIntentTrace;
}

export interface TearAgentModule<TInput, TOutput> {
  decide(input: TInput): TOutput;
}

export interface TearAgentActionPort {
  submit(actions: readonly GameAction[], trace: TearAgentIntentTrace): void;
}
