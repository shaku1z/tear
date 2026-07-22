import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { FixedStepScheduler } from "../simulation/fixed-step";
import { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import { AuthoritativeStepController } from "../gameplay/runtime/authoritative-step";
import { CombatEntityRuntime } from "../gameplay/combat/combat-entity-runtime";
import { LiveCombatRuntime, type LiveCombatRuntimeOptions } from "../gameplay/combat/live-combat-runtime";
import { LiveKillRuntime, type LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import { LiveFrameRuntime, type LiveFrameRuntimeOptions } from "./live-frame-runtime";
import { RuntimeFrameCoordinator, type RuntimeFrameCoordinatorOptions } from "./runtime-frame-coordinator";
import type { RuntimeFrameDriver } from "./runtime-frame-driver";

type CombatRuntimeOptions = Omit<LiveCombatRuntimeOptions, "opening" | "collision">;

export interface LiveCombatHostRuntimeApi<State> {
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
  readonly combatEntities: ConstructorParameters<typeof CombatEntityRuntime>[0];
  readonly kill: LiveKillHost;
  readonly createCombat: (api: Readonly<{
    combatEntities: CombatEntityRuntime;
    resolveKill(enemy: Parameters<LiveKillRuntime["resolve"]>[0], cause?: string): void;
  }>) => Pick<LiveCombatRuntimeOptions, "opening" | "collision"> & CombatRuntimeOptions;
  readonly authoritative: Readonly<{
    applyInput(input: AuthoritativeInputState, tick: number,
      actions: readonly CommandEnvelope<GameAction>[]): void;
    snapshot(tick: number, input: AuthoritativeInputState): State;
  }>;
  readonly createFrame: (api: Readonly<{
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
  const simulation = new FixedStepScheduler({ ticksPerSecond: 60, maxCatchUpSteps: 6 });
  const authoritativeInput = new AuthoritativeInputState();
  const combatEntityRuntime = new CombatEntityRuntime(options.combatEntities);
  const killRuntime = new LiveKillRuntime(options.kill);
  const combatOptions = options.createCombat({ combatEntities: combatEntityRuntime,
    resolveKill: (enemy, cause) => { killRuntime.resolve(enemy, cause); } });
  const combatRuntime = new LiveCombatRuntime(combatOptions);
  const authoritativeStep = new AuthoritativeStepController<State>({
    applyActions: (tick, actions) => { options.authoritative.applyInput(authoritativeInput, tick, actions); },
    step: (seconds) => { combatRuntime.step(seconds); },
    snapshot: (tick) => options.authoritative.snapshot(tick, authoritativeInput),
  });
  const frameRuntime = new LiveFrameRuntime(options.createFrame({ simulation, authoritativeInput,
    authoritativeStep, combatRuntime }));
  const frameCoordinator = new RuntimeFrameCoordinator(options.createCoordinator({ simulation, frameRuntime }));
  let started = false;
  return Object.freeze({ simulation, authoritativeInput, authoritativeStep, combatEntityRuntime, combatRuntime, killRuntime,
    frameRuntime, frameCoordinator,
    startFrameLoop() {
      if (started) return;
      started = true;
      options.frameDriver.start(({ deltaSeconds }) => { frameCoordinator.run(deltaSeconds); });
    } });
}
