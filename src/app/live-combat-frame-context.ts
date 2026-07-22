import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { AuthoritativeStepController } from "../gameplay/runtime/authoritative-step";
import type { LiveCombatRuntime } from "../gameplay/combat/live-combat-runtime";
import type { FixedStepScheduler } from "../simulation/fixed-step";
import type { LiveFrameRuntime, LiveFrameRuntimeOptions, LiveMusicSyncInput } from "./live-frame-runtime";
import type { RuntimeFrameCoordinatorOptions } from "./runtime-frame-coordinator";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";

export interface LiveCombatFrameApi<State> {
  readonly simulation: FixedStepScheduler;
  readonly authoritativeInput: AuthoritativeInputState;
  readonly authoritativeStep: AuthoritativeStepController<State>;
  readonly combatRuntime: LiveCombatRuntime;
}

type FrameBase = Omit<LiveFrameRuntimeOptions, "fixedSimulationInput" | "musicInput">;
export interface LiveCombatFrameContext extends FrameBase {
  readonly state: () => string;
  readonly recording: () => boolean;
  readonly sampleAim: () => Readonly<{ x: number; y: number }>;
  readonly pushAim: (turn: number) => void;
  readonly drainActions: (tick: number) => readonly CommandEnvelope<GameAction>[];
  readonly clearOverrides: () => void;
  readonly gauge: (name: "simulationTick" | "simulationSteps" | "simulationDroppedMs", value: number) => void;
  readonly musicObservation: () => LiveMusicSyncInput;
}

type CoordinatorApiFields = "advancePlayingPrelude" | "advancePlayingSimulation" | "resetSimulation" | "syncMusic";
export type LiveCombatCoordinatorContext = Omit<RuntimeFrameCoordinatorOptions, CoordinatorApiFields>;

export function createLiveCombatFrameOptions<State>(context: LiveCombatFrameContext,
  api: LiveCombatFrameApi<State>): LiveFrameRuntimeOptions {
  return { ...context,
    fixedSimulationInput: () => ({ state: context.state, simulation: api.simulation,
      recording: context.recording, sampleAim: context.sampleAim, pushAim: context.pushAim, drainActions: context.drainActions,
      authoritativeStep: (tick, seconds, actions) => { api.authoritativeStep.execute(tick, seconds, actions); },
      clearOverrides: context.clearOverrides, step: (seconds) => { api.combatRuntime.step(seconds); }, gauge: context.gauge }),
    musicInput: context.musicObservation };
}


export function createLiveCombatCoordinatorOptions(context: LiveCombatCoordinatorContext,
  simulation: FixedStepScheduler, frameRuntime: LiveFrameRuntime): RuntimeFrameCoordinatorOptions {
  return { ...context,
    advancePlayingPrelude: (seconds) => { frameRuntime.advancePrelude(seconds); },
    advancePlayingSimulation: (seconds) => { frameRuntime.advanceSimulation(seconds); },
    resetSimulation: () => { simulation.reset(simulation.tick); }, syncMusic: () => { frameRuntime.syncMusic(); } };
}
