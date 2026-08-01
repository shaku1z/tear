import type { FixedStepScheduler } from "../simulation/fixed-step";
import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { AuthoritativeStepController } from "../gameplay/runtime/authoritative-step";
import type { TearSimulationRuntime } from "../gameplay/runtime/tear-simulation-runtime";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import type { CombatEntityRuntime } from "../gameplay/combat/combat-entity-runtime";
import type { LiveCombatRuntime } from "../gameplay/combat/live-combat-runtime";
import type { LiveKillRuntime } from "../gameplay/combat/live-kill-runtime";
import { createTearCombatSimulation, type TearCombatSimulationOptions } from
  "../gameplay/runtime/tear-combat-simulation";
import { LiveFrameRuntime, type LiveFrameRuntimeOptions } from "./live-frame-runtime";
import { RuntimeFrameCoordinator, type RuntimeFrameCoordinatorOptions } from "./runtime-frame-coordinator";
import type { RuntimeFrameDriver } from "./runtime-frame-driver";

export interface LiveCombatHostRuntimeApi<State> {
  readonly simulationRuntime: TearSimulationRuntime<State>;
  readonly simulation: FixedStepScheduler;
  readonly authoritativeInput: AuthoritativeInputState;
  readonly authoritativeStep: AuthoritativeStepController<State>;
  readonly combatEntityRuntime: CombatEntityRuntime;
  readonly combatRuntime: LiveCombatRuntime;
  readonly killRuntime: LiveKillRuntime;
  readonly frameRuntime: LiveFrameRuntime;
  readonly frameCoordinator: RuntimeFrameCoordinator;
  startFrameLoop(): void;
}

export interface LiveCombatHostFactoryOptions<State> {
  readonly frameDriver: RuntimeFrameDriver;
  readonly gameplayEvents?: TearGameplayEventPort;
  readonly combatEntities: TearCombatSimulationOptions<State>["combatEntities"];
  readonly kill: TearCombatSimulationOptions<State>["kill"];
  readonly createCombat: TearCombatSimulationOptions<State>["createCombat"];
  readonly authoritative: TearCombatSimulationOptions<State>["authoritative"];
  readonly createFrame: (api: Readonly<{
    simulationRuntime: TearSimulationRuntime<State>;
    simulation: FixedStepScheduler;
    authoritativeInput: AuthoritativeInputState;
    authoritativeStep: AuthoritativeStepController<State>;
    combatRuntime: LiveCombatRuntime;
  }>) => LiveFrameRuntimeOptions;
  readonly createCoordinator: (api: Readonly<{
    simulation: FixedStepScheduler;
    frameRuntime: LiveFrameRuntime;
  }>) => RuntimeFrameCoordinatorOptions;
}

/**
 * Composes the live fixed-step simulation, combat phases, kill transaction,
 * music/frame bridge, and browser-frame coordinator as one bounded host.
 */
export function createLiveCombatHost<State>(options: LiveCombatHostFactoryOptions<State>): LiveCombatHostRuntimeApi<State> {
  const core = createTearCombatSimulation<State>({
    combatEntities: options.combatEntities, kill: options.kill, createCombat: options.createCombat,
    authoritative: options.authoritative,
    ...(options.gameplayEvents === undefined ? {} : { gameplayEvents: options.gameplayEvents }),
  });
  const { simulationRuntime, simulation, authoritativeInput, authoritativeStep,
    combatEntityRuntime, combatRuntime, killRuntime } = core;
  const frameRuntime = new LiveFrameRuntime(options.createFrame({ simulationRuntime, simulation, authoritativeInput,
    authoritativeStep, combatRuntime }));
  const frameCoordinator = new RuntimeFrameCoordinator(options.createCoordinator({ simulation, frameRuntime }));
  let started = false;
  return Object.freeze({ simulationRuntime, simulation, authoritativeInput, authoritativeStep, combatEntityRuntime, combatRuntime, killRuntime,
    frameRuntime, frameCoordinator,
    startFrameLoop() {
      if (started) return;
      started = true;
      options.frameDriver.start(({ deltaSeconds }) => { frameCoordinator.run(deltaSeconds); });
    } });
}
