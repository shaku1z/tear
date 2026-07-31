import type { FixedStepScheduler } from "../simulation/fixed-step";
import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { AuthoritativeStepController } from "../gameplay/runtime/authoritative-step";
import { TearSimulationRuntime } from "../gameplay/runtime/tear-simulation-runtime";
import type { TearSimulationActionPort } from "../gameplay/runtime/tear-simulation-runtime";
import type { TearGameplayEventPort } from "../gameplay/runtime/gameplay-events";
import { CombatEntityRuntime } from "../gameplay/combat/combat-entity-runtime";
import { LiveCombatRuntime, type LiveCombatRuntimeOptions } from "../gameplay/combat/live-combat-runtime";
import { LiveKillRuntime, type LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import { LiveFrameRuntime, type LiveFrameRuntimeOptions } from "./live-frame-runtime";
import { RuntimeFrameCoordinator, type RuntimeFrameCoordinatorOptions } from "./runtime-frame-coordinator";
import type { RuntimeFrameDriver } from "./runtime-frame-driver";

type CombatRuntimeOptions = Omit<LiveCombatRuntimeOptions, "opening" | "collision">;

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
  readonly combatEntities: ConstructorParameters<typeof CombatEntityRuntime>[0];
  readonly kill: LiveKillHost;
  readonly createCombat: (api: Readonly<{
    combatEntities: CombatEntityRuntime;
    resolveKill(enemy: Parameters<LiveKillRuntime["resolve"]>[0], cause?: string): void;
  }>) => Pick<LiveCombatRuntimeOptions, "opening" | "collision"> & CombatRuntimeOptions;
  readonly authoritative: Readonly<{
    readonly actionPort: TearSimulationActionPort;
    snapshot(tick: number, input: AuthoritativeInputState): State;
  }>;
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
  // Source combat sim: fixed 1/120s steps behind a 0.1s frame clamp (game.js STEP/acc).
  const combatEntityRuntime = new CombatEntityRuntime(options.combatEntities);
  const killRuntime = new LiveKillRuntime(options.kill);
  const combatOptions = options.createCombat({ combatEntities: combatEntityRuntime,
    resolveKill: (enemy, cause) => { killRuntime.resolve(enemy, cause); } });
  const combatRuntime = new LiveCombatRuntime(combatOptions);
  const simulationRuntime = new TearSimulationRuntime<State>({
    actionPort: options.authoritative.actionPort,
    step: (seconds) => { combatRuntime.step(seconds); },
    snapshot: (tick, input) => options.authoritative.snapshot(tick, input),
    ...(options.gameplayEvents === undefined ? {} : { events: options.gameplayEvents }),
    ticksPerSecond: 120,
    maxCatchUpSteps: 12,
  });
  const simulation = simulationRuntime.scheduler;
  const authoritativeInput = simulationRuntime.input;
  const authoritativeStep = simulationRuntime.authoritativeStep;
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
