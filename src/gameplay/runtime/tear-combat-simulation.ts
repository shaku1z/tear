import type { FixedStepScheduler } from "../../simulation/fixed-step";
import type { AuthoritativeInputState } from "./authoritative-input";
import type { AuthoritativeStepController } from "./authoritative-step";
import { CombatEntityRuntime } from "../combat/combat-entity-runtime";
import { LiveCombatRuntime, type LiveCombatRuntimeOptions } from "../combat/live-combat-runtime";
import { LiveKillRuntime, type LiveKillHost } from "../combat/live-kill-runtime";
import type { TearGameplayEventPort } from "./gameplay-events";
import {
  TearSimulationRuntime,
  type TearSimulationActionPort,
} from "./tear-simulation-runtime";

type CombatRuntimeLifecycleOptions = Omit<LiveCombatRuntimeOptions, "opening" | "collision">;

/**
 * The portable, fixed-step half of a combat host. Browser frame coordination,
 * rendering, and platform lifecycle stay outside this composition.
 */
export interface TearCombatSimulation<State> {
  readonly simulationRuntime: TearSimulationRuntime<State>;
  readonly simulation: FixedStepScheduler;
  readonly authoritativeInput: AuthoritativeInputState;
  readonly authoritativeStep: AuthoritativeStepController<State>;
  readonly combatEntityRuntime: CombatEntityRuntime;
  readonly combatRuntime: LiveCombatRuntime;
  readonly killRuntime: LiveKillRuntime;
}

export interface TearCombatSimulationOptions<State> {
  readonly gameplayEvents?: TearGameplayEventPort;
  readonly combatEntities: ConstructorParameters<typeof CombatEntityRuntime>[0];
  readonly kill: LiveKillHost;
  readonly createCombat: (api: Readonly<{
    combatEntities: CombatEntityRuntime;
    resolveKill(enemy: Parameters<LiveKillRuntime["resolve"]>[0], cause?: string): void;
  }>) => Pick<LiveCombatRuntimeOptions, "opening" | "collision"> & CombatRuntimeLifecycleOptions;
  readonly authoritative: Readonly<{
    readonly actionPort: TearSimulationActionPort;
    snapshot(tick: number, input: AuthoritativeInputState): State;
  }>;
}

/**
 * Creates the one authoritative combat scheduler and its gameplay runtimes.
 * Live browser, replay, and detached adapters must wrap this result rather
 * than rebuild the fixed-step/combat graph independently.
 */
export function createTearCombatSimulation<State>(
  options: TearCombatSimulationOptions<State>,
): TearCombatSimulation<State> {
  const combatEntityRuntime = new CombatEntityRuntime(options.combatEntities);
  const killRuntime = new LiveKillRuntime(options.kill);
  const combatOptions = options.createCombat({
    combatEntities: combatEntityRuntime,
    resolveKill: (enemy, cause) => { killRuntime.resolve(enemy, cause); },
  });
  const combatRuntime = new LiveCombatRuntime(combatOptions);
  const simulationRuntime = new TearSimulationRuntime<State>({
    actionPort: options.authoritative.actionPort,
    step: (seconds) => { combatRuntime.step(seconds); },
    snapshot: (tick, input) => options.authoritative.snapshot(tick, input),
    ...(options.gameplayEvents === undefined ? {} : { events: options.gameplayEvents }),
    ticksPerSecond: 120,
    maxCatchUpSteps: 12,
  });
  return Object.freeze({
    simulationRuntime,
    simulation: simulationRuntime.scheduler,
    authoritativeInput: simulationRuntime.input,
    authoritativeStep: simulationRuntime.authoritativeStep,
    combatEntityRuntime,
    combatRuntime,
    killRuntime,
  });
}
