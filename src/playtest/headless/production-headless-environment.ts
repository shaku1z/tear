import { isRecord } from "../../domain/records";
import type { CommandEnvelope } from "../../domain/envelopes";
import { AIM_MAGNITUDE_SCALE, normalizeGameAction, type GameAction } from "../../input/game-action";
import type { CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot } from "../../gameplay/runtime/authoritative-input";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../gameplay/runtime/gameplay-events";
import { stableVerificationHash } from "../../domain/hash";
import type { createProductionCombatSimulation } from "../../tearbench/production-combat-simulation";
import {
  captureProductionReplayCheckpoint,
  captureProductionRewardSelection,
  createProductionGhostReplayComposition,
  projectProductionReplayCanonicalState,
  type ProductionReplayBootstrap,
  type ProductionApplicationFrameConfirm,
} from "../../tearbench/production-replay-composition";
import { productionRunSeed, type ProductionReplayWorld } from "../../tearbench/production-world-factory";
import type { ProductionWaveRewardRuntime } from "../../tearbench/production-wave-reward-runtime";
import type { ProductionWaveRewardIntent } from "../../tearbench/production-wave-reward-runtime";
import type { TearCausalEventV1, TearObservationV1, TearScenarioV1, TearSnapshotV1 } from "../../tearbench/contracts";
import {
  TearHeadlessEnvironmentPool,
  type TearHeadlessEnvironment,
  type TearHeadlessEpisode,
  type TearHeadlessJob,
  type TearHeadlessTransition,
} from "../../tearbench/headless";
import { validateTearContract } from "../../tearbench/validation";
import { requireProductionHeadlessScenario } from "./production-headless-scenario";
import {
  cloneActions,
  ProductionCheckpointUnavailableError,
  validateProductionHeadlessCheckpoint,
  type ProductionHeadlessCheckpoint,
} from "./production-headless-checkpoint";
import { beginProductionBossPractice } from "./production-boss-practice-start";
import type { PracticeBossId, PracticeBossPhase } from "../../gameplay/training/boss-phase-practice-runtime";
import { projectProductionPolicyObservation } from "./production-policy-observation";
import { createGameplayCausalEvent } from "../../tearbench/gameplay-causal-events";
import { assertTearSimulationStepSeconds, TEAR_SIMULATION_TICKS_PER_SECOND } from "../../tearbench/simulation-profile";

type ProductionHeadlessCore = Readonly<{
  replay: ProductionReplayWorld;
  simulation: ReturnType<typeof createProductionCombatSimulation<CanonicalGameplayState>>;
  waveReward: ProductionWaveRewardRuntime;
  bootstrap: ProductionReplayBootstrap;
  scenario: TearScenarioV1;
  routeAction: (action: GameAction) => boolean;
  advanceApplicationFrame: (seconds: number, confirm?: ProductionApplicationFrameConfirm) => void;
  nativeEvents: TearGameplayEvent[];
  sourceTracks?: ProductionHeadlessSourceTrackState;
}>;

interface ProductionHeadlessSourceTrackState {
  readonly nativeEvents: TearGameplayEvent[];
  readonly rewardComponents: Readonly<{ tick: number; value: unknown }>[];
  readonly intents: ProductionWaveRewardIntent[];
}

/** Opt-in raw observation streams captured from a fresh shared composition. */
export interface ProductionHeadlessSourceTracks {
  readonly nativeEvents: readonly TearGameplayEvent[];
  readonly rewardComponents: readonly Readonly<{ tick: number; value: unknown }>[];
  readonly intents: readonly ProductionWaveRewardIntent[];
  /** Headless runs have no hardware input surface; their source device is semantic. */
  readonly device: "semantic";
  /** Restored captures contain a suffix, never a fabricated full native source trace. */
  readonly origin: "fresh" | "checkpoint-suffix" | "state-forge-suffix";
}

export interface ProductionHeadlessEnvironmentOptions {
  /**
   * Reconstruct through an event-enabled production composition and expose
   * its native facts, reward state, and planner-intent streams. Callers must
   * still prove the terminal agrees with their sealed source artifact.
   */
  readonly captureSourceTracks?: boolean;
}

export interface ProductionHeadlessTerminalArtifact {
  readonly format: "tearbench-production-headless-terminal";
  readonly schemaVersion: 1;
  readonly scenario: TearScenarioV1;
  /** Source-owned run-start identity before natural opening content consumes RNG. */
  readonly bootstrap: ProductionReplayBootstrap;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly terminal: Readonly<{
    tick: number;
    semanticHash: string;
    terminated: boolean;
    truncated: boolean;
  }>;
}

/** Distinct from a game terminal: existing production-terminal consumers must refuse it. */
export interface ProductionTutorialHandoffArtifact {
  readonly format: "tearbench-production-tutorial-handoff";
  readonly schemaVersion: 1;
  readonly tutorialHandoff: NonNullable<ReturnType<ProductionReplayWorld["tutorialHandoff"]>>;
  readonly tick: number;
  readonly semanticHash: string;
  readonly reason: "tutorial-episode-completed-awaiting-next-run";
}

export {
  ProductionCheckpointUnavailableError,
  validateProductionHeadlessCheckpoint,
  validateProductionHeadlessCheckpointRequest,
  type ProductionHeadlessCheckpoint,
} from "./production-headless-checkpoint";

/** A State Setup recovery frontier bound to one natural source checkpoint; arbitrary surgical snapshot execution stays unavailable. */
export interface ProductionHeadlessStateSetupEvaluation {
  readonly source: ProductionHeadlessCheckpoint;
  readonly builtSnapshot: TearSnapshotV1;
}

export interface ProductionHeadlessEnvironment extends TearHeadlessEnvironment<
  TearScenarioV1,
  CanonicalGameplayState,
  GameAction
> {
  /** Structured policy projection from this exact source-owned production world. */
  policyObservation(): TearObservationV1;
  /** Exact source-owned UI facts; observing never selects or rerolls a reward. */
  policyUiObservation(): Readonly<{ screen: string; choices: readonly Readonly<{ id: string }>[]; focusedId?: string }>;
  /** The running world, for measurement that reads what the observation does not carry. Read only. */
  world(): ProductionReplayWorld["world"]["state"];
  /** True while a cinematic (a boss phase change, a chapter page) holds the simulation. */
  cinematicActive(): boolean;
  /** Build provenance remains available outside checkpointable lifecycle states. */
  sourceBuild(): ProductionReplayBootstrap["build"];
  /** Before the associated fixed step; no implicit cadence or confirm policy. */
  advanceApplicationFrame(seconds: number, confirm?: ProductionApplicationFrameConfirm): void;
  tutorialHandoff(): ReturnType<ProductionReplayWorld["tutorialHandoff"]>;
  /** A new episode from caller-supplied identity, never an inferred historical next-run seed. */
  continueTutorialPractice(nextScenario: TearScenarioV1): CanonicalGameplayState;
  /** In a fresh tutorial episode: Playground boss practice at a chosen phase. Returns a reader of its lifecycle. */
  practiceBoss(bossId: PracticeBossId, phase: PracticeBossPhase): ReturnType<typeof beginProductionBossPractice>;
  /** Replaces the enemies in play with these, made by the game's own factory, for a playtest of chosen enemies. */
  replaceEnemies(spawns: readonly Readonly<{ id: string; x: number; y: number }>[]): void;
  captureCheckpoint(): ProductionHeadlessCheckpoint;
  restoreCheckpoint(checkpoint: ProductionHeadlessCheckpoint): CanonicalGameplayState;
  restoreStateSetupEvaluation(evaluation: ProductionHeadlessStateSetupEvaluation): CanonicalGameplayState;
  /** Available only when the environment was explicitly created for source-track capture. */
  sourceTracks(): ProductionHeadlessSourceTracks;
}

function validateStateSetupEvaluation(
  value: unknown,
): Readonly<{ source: ProductionHeadlessCheckpoint; builtSnapshot: TearSnapshotV1 }> {
  if (!isRecord(value)) throw new TypeError("production State Setup evaluation is invalid");
  const source = validateProductionHeadlessCheckpoint(value.source);
  const parsed = validateTearContract(value.builtSnapshot);
  if (!parsed.ok || parsed.value.kind !== "snapshot")
    throw new TypeError("production State Setup evaluation snapshot is invalid");
  const built = parsed.value;
  if (
    built.stateClass !== "surgical-valid" ||
    built.tick !== source.checkpoint.tick ||
    built.seed !== source.snapshot.seed ||
    built.provenance.actor !== "state-forge" ||
    built.provenance.producer !== "forgeExitLaunchSnapshot" ||
    built.provenance.sourceId !== source.snapshot.id ||
    built.lineage?.parentId !== source.snapshot.id ||
    built.lineage.parentRootHash !== source.snapshot.hashes.exact ||
    built.lineage.forkTick !== source.checkpoint.tick ||
    built.hashes.exact !== stableVerificationHash(built.state)
  ) {
    throw new RangeError("production State Setup evaluation requires a lineage-bound surgical snapshot");
  }
  return Object.freeze({ source, builtSnapshot: built });
}

/**
 * DOM-free C30 adapter over the same production world/combat composition used
 * by C29 replay. It owns neither a browser scheduler nor an alternate model.
 */
export function createProductionHeadlessEnvironment(
  options: ProductionHeadlessEnvironmentOptions = {},
): ProductionHeadlessEnvironment {
  let core: ProductionHeadlessCore | null = null;
  let nextCommandId = 0;
  let actionTrace: CommandEnvelope<GameAction>[] = [];
  let deliveredCausalEventCount = 0;
  let eventSequenceBase = 0;
  let pendingEvents: readonly TearCausalEventV1[] = [];
  let origin: ProductionHeadlessSourceTracks["origin"] = "fresh";
  const undelivered = (current: ProductionHeadlessCore): readonly TearCausalEventV1[] => [
    ...pendingEvents,
    ...current.nativeEvents.slice(deliveredCausalEventCount).map((event, offset) => {
      const sequence = eventSequenceBase + deliveredCausalEventCount + offset;
      return createGameplayCausalEvent(event, sequence, `headless:${String(event.tick)}:${String(sequence)}`, "engine");
    }),
  ];
  const assertCheckpointable = (current: ProductionHeadlessCore): void => {
    const phase = current.replay.world.lifecycle.phase,
      selection = current.waveReward.reward.snapshot();
    const screen = current.waveReward.screen();
    const selecting = selection !== null && ["draft", "reserve", "tierup"].includes(selection.phase);
    if (
      !["wave-active", "wave-prepared", "reward-pending", "training-active"].includes(phase) ||
      (phase === "training-active" &&
        !["tutorial", "playground"].includes(current.replay.world.state.run()?.mode ?? "")) ||
      (phase === "training-active" &&
        current.replay.world.state.run()?.mode === "tutorial" &&
        current.replay.tutorial.captureSession() === undefined) ||
      (phase === "reward-pending") !== selecting ||
      (phase === "wave-prepared" &&
        (!current.replay.world.lifecycle.activationDeferred ||
          !current.replay.world.context.cinema.active ||
          current.replay.world.context.cinema.script?.kind !== "chapter")) ||
      (selecting ? screen !== selection.phase : !["playing", "paused"].includes(screen)) ||
      current.simulation.simulationRuntime.scheduler.tick >= current.scenario.maxTicks ||
      // A checkpoint attests recorded-canonical source state; a run opened on a chosen wave has none.
      current.scenario.stateClass !== "recorded-canonical"
    ) {
      throw new ProductionCheckpointUnavailableError(
        "production headless checkpoints require a coherent nonterminal prepared, active or reward episode",
      );
    }
  };

  const requireCore = (): ProductionHeadlessCore => {
    if (core === null) throw new Error("production headless environment must be reset before stepping");
    return core;
  };
  const observation = (value: ProductionHeadlessCore): CanonicalGameplayState =>
    projectProductionReplayCanonicalState(
      value.replay,
      value.simulation.simulationRuntime.scheduler.tick,
      value.simulation.simulationRuntime.input,
    );
  const policyObservation = (value: ProductionHeadlessCore): TearObservationV1 =>
    projectProductionPolicyObservation(
      value.replay,
      value.simulation.simulationRuntime.scheduler.tick,
      value.waveReward.screen(),
    );
  const compose = (
    scenario: TearScenarioV1,
    snapshot?: TearSnapshotV1,
    input?: AuthoritativeInputSnapshot,
    bootstrap?: ProductionReplayBootstrap,
  ): ProductionHeadlessCore => {
    const nativeEvents: TearGameplayEvent[] = [];
    const sourceTracks: ProductionHeadlessSourceTrackState | undefined =
      options.captureSourceTracks === true ? { nativeEvents, rewardComponents: [], intents: [] } : undefined;
    const gameplayEvents = new TearGameplayEventBus(() => snapshot?.tick ?? 0);
    gameplayEvents.subscribe((event) => {
      nativeEvents.push(event);
    });
    const composed = createProductionGhostReplayComposition({
      seed: snapshot?.seed ?? scenario.seed,
      mode: scenario.start.mode,
      weaponId: scenario.start.weapon,
      difficulty: scenario.start.difficulty,
      ...(scenario.start.boss === undefined ? {} : { firstBoss: scenario.start.boss }),
      ...(scenario.start.wave === undefined ? {} : { firstWave: scenario.start.wave }),
      ...(snapshot === undefined || input === undefined ? {} : { inputSnapshots: new Map([[snapshot.tick, input]]) }),
      gameplayEvents,
      ...(sourceTracks === undefined
        ? {}
        : {
            recordWaveIntent: (entry) => {
              sourceTracks.intents.push(entry);
            },
          }),
    }).create(snapshot);
    if (
      snapshot !== undefined &&
      composed.replay.world.state.bossIntro() !== null &&
      bootstrap?.applicationFramePolicy === undefined
    )
      throw new TypeError("restored active intro has unknown generated application-frame policy");
    assertTearSimulationStepSeconds(composed.simulation.stepSeconds);
    gameplayEvents.setTickSource(() => composed.simulation.scheduler.tick);
    const core = Object.freeze({
      replay: composed.replay,
      simulation: composed.combat,
      waveReward: composed.waveReward,
      bootstrap:
        bootstrap ??
        Object.freeze({
          ...composed.bootstrap,
          applicationFramePolicy: Object.freeze({
            version: 1 as const,
            kind: "generated-step-intro" as const,
            secondsPerStep: 1 / 120,
          }),
        }),
      scenario,
      routeAction: composed.routeAction,
      advanceApplicationFrame: composed.advanceApplicationFrame,
      nativeEvents,
      ...(sourceTracks === undefined ? {} : { sourceTracks }),
    });
    if (sourceTracks !== undefined) {
      sourceTracks.rewardComponents.push(
        Object.freeze({
          tick: composed.simulation.scheduler.tick,
          value: captureProductionRewardSelection(composed.waveReward.reward.snapshot()),
        }),
      );
    }
    return core;
  };

  return Object.freeze({
    reset(source: TearScenarioV1): CanonicalGameplayState {
      const scenario = requireProductionHeadlessScenario(source);
      core = compose(scenario);
      nextCommandId = 0;
      actionTrace = [];
      deliveredCausalEventCount = 0;
      eventSequenceBase = 0;
      pendingEvents = [];
      origin = "fresh";
      return observation(core);
    },
    policyObservation: () => policyObservation(requireCore()),
    policyUiObservation: () => {
      const current = requireCore(),
        screen = current.waveReward.screen(),
        selection = current.waveReward.reward.snapshot();
      const choices =
        screen === "reserve"
          ? (selection?.reserveChoices ?? [])
          : screen === "draft" || screen === "tierup"
            ? (selection?.choices ?? [])
            : [];
      const focusedId = choices[current.waveReward.focus()]?.id;
      return Object.freeze({
        screen,
        choices: Object.freeze(choices.map((choice) => Object.freeze({ id: choice.id }))),
        ...(focusedId === undefined ? {} : { focusedId }),
      });
    },
    world: () => requireCore().replay.world.state,
    cinematicActive: () => requireCore().replay.world.context.cinema.active,
    sourceBuild: () => Object.freeze({ ...requireCore().bootstrap.build }),
    advanceApplicationFrame: (seconds: number, confirm?: ProductionApplicationFrameConfirm) => {
      requireCore().advanceApplicationFrame(seconds, confirm);
    },
    tutorialHandoff: () => requireCore().replay.tutorialHandoff(),
    practiceBoss: (bossId: PracticeBossId, phase: PracticeBossPhase) => {
      const current = requireCore();
      return beginProductionBossPractice(
        current.replay,
        current.simulation.simulationRuntime.scheduler.tick,
        bossId,
        phase,
      );
    },
    replaceEnemies: (spawns: Parameters<ProductionHeadlessEnvironment["replaceEnemies"]>[0]) => {
      const { state, entities } = requireCore().replay.world;
      const placed = spawns.map((spawn) => entities.createEnemy(spawn.id, spawn.x, spawn.y, state.run() as never));
      state.setEnemies(placed);
    },
    continueTutorialPractice: (source: TearScenarioV1): CanonicalGameplayState => {
      const current = requireCore();
      if (current.replay.tutorialHandoff() === null)
        throw new RangeError("tutorial has not reached its next-run handoff");
      const next = requireProductionHeadlessScenario(source);
      if (
        next.start.mode !== "playground" ||
        next.start.difficulty !== "normal" ||
        next.start.weapon !== "sword" ||
        next.seed === current.scenario.seed ||
        productionRunSeed(next.seed) === current.replay.world.state.run()?.runSeed
      ) {
        throw new RangeError("tutorial practice requires a fresh supplied normal playground sword identity");
      }
      const candidate = compose(next);
      candidate.replay.tutorial.restoreSession(current.replay.tutorial.captureSession());
      candidate.replay.tutorial.restorePresentation(current.replay.tutorial.capturePresentation());
      candidate.waveReward.restoreUi("paused", -1);
      const state = observation(candidate);
      core = candidate;
      nextCommandId = 0;
      actionTrace = [];
      deliveredCausalEventCount = 0;
      eventSequenceBase = 0;
      pendingEvents = [];
      origin = "fresh";
      return state;
    },
    step(actions: readonly GameAction[]): TearHeadlessTransition<CanonicalGameplayState> {
      const current = requireCore();
      if (current.replay.tutorialHandoff() !== null)
        throw new RangeError("tutorial episode completed; awaiting a supplied next-run identity");
      if (
        current.replay.world.lifecycle.phase === "training-active" &&
        current.waveReward.screen() === "paused" &&
        !actions.some((action) => action.type === "pause")
      )
        throw new RangeError("paused training episode must resume before a simulation step");
      const tick = current.simulation.simulationRuntime.scheduler.tick + 1;
      const normalizedActions = actions.map((action) => {
        const normalized = normalizeGameAction(action);
        if (!normalized.ok) throw new TypeError(`invalid headless action: ${normalized.reason}`);
        return normalized.action;
      });
      if (!Number.isSafeInteger(nextCommandId + normalizedActions.length))
        throw new RangeError("headless command sequence is exhausted");
      if (current.replay.world.state.bossIntro() !== null) {
        const policy = current.bootstrap.applicationFramePolicy;
        if (policy === undefined)
          throw new TypeError("active intro requires its declared generated application-frame policy");
        current.advanceApplicationFrame(policy.secondsPerStep);
      } else if (current.replay.world.context.cinema.active) {
        // A cinematic (a boss phase change) holds the simulation and runs on application frames.
        current.advanceApplicationFrame(1 / TEAR_SIMULATION_TICKS_PER_SECOND);
      }
      const envelopes: CommandEnvelope<GameAction>[] = normalizedActions.map((command) =>
        Object.freeze({ kind: "command" as const, id: ++nextCommandId, tick, command }),
      );
      actionTrace.push(...envelopes);
      const result = current.simulation.simulationRuntime.advanceOne(
        envelopes.filter((entry) => !current.routeAction(entry.command)),
      );
      if (current.sourceTracks !== undefined) {
        current.sourceTracks.rewardComponents.push(
          Object.freeze({
            tick: result.tick,
            value: captureProductionRewardSelection(current.waveReward.reward.snapshot()),
          }),
        );
      }
      const lifecycle = current.replay.world.lifecycle.snapshot();
      const tutorialHandoff = current.replay.tutorialHandoff();
      const terminated = lifecycle.phase === "terminated" || tutorialHandoff !== null;
      // A terminal lifecycle transition at the horizon is a natural
      // termination, not a truncation. Keep the two terminal dispositions
      // mutually exclusive for browser and artifact consumers.
      const truncated = !terminated && result.tick >= current.scenario.maxTicks;
      const causalEvents = undelivered(current);
      deliveredCausalEventCount = current.nativeEvents.length;
      pendingEvents = [];
      return Object.freeze({
        get observation() {
          return result.state;
        },
        events: Object.freeze(causalEvents),
        terminated,
        truncated,
        metrics: Object.freeze({
          tick: result.tick,
          livingEnemies: current.replay.world.state.enemies().filter((enemy) => !enemy.dead).length,
        }),
        ...(tutorialHandoff !== null
          ? {
              artifact: Object.freeze<ProductionTutorialHandoffArtifact>({
                format: "tearbench-production-tutorial-handoff",
                schemaVersion: 1,
                tutorialHandoff,
                tick: result.tick,
                semanticHash: stableVerificationHash(result.state),
                reason: "tutorial-episode-completed-awaiting-next-run",
              }),
            }
          : terminated || truncated
            ? {
                artifact: Object.freeze<ProductionHeadlessTerminalArtifact>({
                  format: "tearbench-production-headless-terminal",
                  schemaVersion: 1,
                  scenario: current.scenario,
                  bootstrap: current.bootstrap,
                  actions: Object.freeze([...actionTrace]),
                  terminal: Object.freeze({
                    tick: result.tick,
                    semanticHash: stableVerificationHash(result.state),
                    terminated,
                    truncated,
                  }),
                }),
              }
            : {}),
      });
    },
    captureCheckpoint(): ProductionHeadlessCheckpoint {
      const current = requireCore();
      const tick = current.simulation.simulationRuntime.scheduler.tick;
      assertCheckpointable(current);
      const captured = captureProductionReplayCheckpoint(
        current.replay,
        current.simulation,
        current.waveReward,
        `c30.${current.scenario.id}.checkpoint.${String(tick)}`,
        current.bootstrap.build,
      );
      const value = {
        format: "tearbench-production-headless-checkpoint",
        schemaVersion: 2,
        scenario: current.scenario,
        bootstrap: current.bootstrap,
        checkpoint: Object.freeze({ tick, semanticHash: captured.semanticHash, nextCommandId }),
        snapshot: captured.snapshot,
        input: Object.freeze({ ...captured.input, aimMagnitude: captured.input.aimMagnitude ?? AIM_MAGNITUDE_SCALE }),
        actions: cloneActions(actionTrace),
      } as const;
      const delivery = {
        nextSequence: eventSequenceBase + current.nativeEvents.length,
        pendingEvents: Object.freeze(structuredClone(undelivered(current))),
      };
      return Object.freeze({
        ...value,
        delivery: Object.freeze({ ...delivery, hash: stableVerificationHash({ ...value, delivery }) }),
      });
    },
    restoreCheckpoint(value: ProductionHeadlessCheckpoint): CanonicalGameplayState {
      const checkpoint = validateProductionHeadlessCheckpoint(value);
      const restored = compose(checkpoint.scenario, checkpoint.snapshot, checkpoint.input, checkpoint.bootstrap);
      assertCheckpointable(restored);
      if (restored.nativeEvents.length !== 0)
        throw new RangeError("checkpoint hydration emitted unexpected native facts");
      const restoredObservation = observation(restored);
      if (stableVerificationHash(restoredObservation) !== checkpoint.checkpoint.semanticHash) {
        throw new RangeError("production headless checkpoint semantic state does not restore exactly");
      }
      core = restored;
      nextCommandId = checkpoint.checkpoint.nextCommandId;
      actionTrace = [...checkpoint.actions];
      deliveredCausalEventCount = 0;
      eventSequenceBase = checkpoint.delivery.nextSequence;
      pendingEvents = checkpoint.delivery.pendingEvents;
      origin = "checkpoint-suffix";
      return restoredObservation;
    },
    restoreStateSetupEvaluation(value: ProductionHeadlessStateSetupEvaluation): CanonicalGameplayState {
      const evaluation = validateStateSetupEvaluation(value);
      const restored = compose(
        evaluation.source.scenario,
        evaluation.builtSnapshot,
        evaluation.source.input,
        evaluation.source.bootstrap,
      );
      const restoredObservation = observation(restored);
      // State Setup's exact hash covers its codec payload while this adapter
      // projects CanonicalGameplayState. The former was checked before
      // hydration; comparing those intentionally distinct representations here
      // would create a false equivalence claim.
      core = restored;
      nextCommandId = evaluation.source.checkpoint.nextCommandId;
      actionTrace = [...evaluation.source.actions];
      deliveredCausalEventCount = 0;
      // Surgical hydration must not relabel pending natural-source facts as its own evidence.
      eventSequenceBase = evaluation.source.delivery.nextSequence;
      pendingEvents = [];
      origin = "state-forge-suffix";
      return restoredObservation;
    },
    sourceTracks(): ProductionHeadlessSourceTracks {
      const tracks = requireCore().sourceTracks;
      if (tracks === undefined) throw new Error("production headless source tracks were not requested");
      return Object.freeze({
        nativeEvents: Object.freeze(tracks.nativeEvents.map((event) => Object.freeze(structuredClone(event)))),
        rewardComponents: Object.freeze(tracks.rewardComponents.map((entry) => Object.freeze(structuredClone(entry)))),
        intents: Object.freeze(
          tracks.intents.map((entry) => Object.freeze(structuredClone(entry)) as ProductionWaveRewardIntent),
        ),
        device: "semantic",
        origin,
      });
    },
    dispose(): void {
      core = null;
      nextCommandId = 0;
      actionTrace = [];
      pendingEvents = [];
      eventSequenceBase = 0;
      deliveredCausalEventCount = 0;
      origin = "fresh";
    },
  });
}

export type ProductionHeadlessEpisode = TearHeadlessEpisode<TearScenarioV1, CanonicalGameplayState>;
export type ProductionHeadlessJob = TearHeadlessJob<TearScenarioV1>;

/**
 * Fresh production worlds for bounded C30 episode scheduling. This is a pool
 * of DOM-free composition roots, not a worker-process implementation.
 */
export function createProductionHeadlessEpisodePool(
  size: number,
): TearHeadlessEnvironmentPool<TearScenarioV1, CanonicalGameplayState, GameAction> {
  return new TearHeadlessEnvironmentPool(size, createProductionHeadlessEnvironment);
}
