import type { CommandEnvelope } from "../domain/envelopes";
import { AIM_MAGNITUDE_SCALE, normalizeGameAction, type GameAction } from "../input/game-action";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { TearGameplayEventBus, type TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { stableVerificationHash } from "../domain/hash";
import type { createProductionCombatSimulation } from "./production-combat-simulation";
import {
  captureProductionReplayCheckpoint,
  captureProductionRewardSelection,
  createProductionGhostReplayComposition,
  projectProductionReplayCanonicalState,
  type ProductionReplayBootstrap,
  type ProductionApplicationFrameConfirm,
} from "./production-replay-composition";
import { productionRunSeed, type ProductionReplayWorld } from "./production-world-factory";
import type { ProductionWaveRewardRuntime } from "./production-wave-reward-runtime";
import type { ProductionWaveRewardIntent } from "./production-wave-reward-runtime";
import {
  TEAR_CONTRACT_FORMAT,
  TEAR_CONTRACT_VERSION,
  type TearCausalEventV1,
  type TearObservationV1,
  type TearScenarioV1,
  type TearSnapshotV1,
} from "./contracts";
import {
  TearHeadlessEnvironmentPool,
  type TearHeadlessEnvironment,
  type TearHeadlessEpisode,
  type TearHeadlessJob,
  type TearHeadlessTransition,
} from "./headless";
import { validateTearContract } from "./validation";
import { requireProductionHeadlessScenario } from "./production-headless-scenario";
import { beginProductionBossPractice } from "./production-boss-practice-start";
import { requireProductionReplayBootstrap as requireBootstrap } from "./production-replay-bootstrap-check";
import type { PracticeBossId, PracticeBossPhase } from "../gameplay/training/boss-phase-practice-runtime";
import {
  canonicalObservationActions,
  canonicalObservationEnemyKind,
  canonicalObservationStage,
} from "./observation-identity";
import { projectLiveProjectiles } from "./live-observation-projectiles";
import {
  projectLiveActorMechanics,
  projectLiveBladeMechanics,
  projectLivePlayerMechanics,
} from "./live-observation-actors";
import { createGameplayCausalEvent } from "./gameplay-causal-events";
import { assertTearSimulationStepSeconds, TEAR_SIMULATION_TICKS_PER_SECOND } from "./simulation-profile";

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

/**
 * An in-memory source keyframe for one interrupted C30 episode. It is not a
 * worker message, durable job record, or storage format; callers explicitly
 * retain and pass it to a fresh environment in the same process.
 */
export interface ProductionHeadlessCheckpoint {
  readonly format: "tearbench-production-headless-checkpoint";
  readonly schemaVersion: 2;
  readonly scenario: TearScenarioV1;
  /** Original run-start identity; this alone does not attest a complete source trace. */
  readonly bootstrap: ProductionReplayBootstrap;
  readonly checkpoint: Readonly<{
    tick: number;
    semanticHash: string;
    nextCommandId: number;
  }>;
  readonly snapshot: TearSnapshotV1;
  readonly input: AuthoritativeInputSnapshot & Readonly<{ aimMagnitude: number }>;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly delivery: Readonly<{
    nextSequence: number;
    pendingEvents: readonly TearCausalEventV1[];
    /** Complete checkpoint integrity binding, not provenance authority. */
    hash: string;
  }>;
}

/** Expected lifecycle pressure, distinct from malformed or incompatible checkpoint data. */
export class ProductionCheckpointUnavailableError extends RangeError {
  override name = "ProductionCheckpointUnavailableError";
}

/** Bind a retained checkpoint to the admitted original schedule, without replaying its prefix. */
export function validateProductionHeadlessCheckpointRequest(
  value: unknown,
  sourceScenario: unknown,
  batches: readonly Readonly<{ tick: number; actions: readonly unknown[] }>[],
): ProductionHeadlessCheckpoint {
  const checkpoint = validateProductionHeadlessCheckpoint(value),
    scenario = requireProductionHeadlessScenario(sourceScenario);
  if (stableVerificationHash(scenario) !== stableVerificationHash(checkpoint.scenario)) {
    throw new TypeError("checkpoint scenario differs from admitted request");
  }
  const ticks = new Set<number>(),
    actions: CommandEnvelope<GameAction>[] = [];
  for (const batch of [...batches].sort((a, b) => a.tick - b.tick)) {
    if (!Number.isSafeInteger(batch.tick) || batch.tick < 1 || ticks.has(batch.tick) || !Array.isArray(batch.actions)) {
      throw new TypeError("invalid admitted checkpoint action schedule");
    }
    ticks.add(batch.tick);
    for (const action of batch.actions) {
      const normalized = normalizeGameAction(action);
      if (!normalized.ok) throw new TypeError(`invalid admitted checkpoint action: ${normalized.reason}`);
      if (batch.tick <= checkpoint.checkpoint.tick)
        actions.push(
          Object.freeze({
            kind: "command",
            id: actions.length + 1,
            tick: batch.tick,
            command: normalized.action,
          }),
        );
    }
  }
  if (stableVerificationHash(actions) !== stableVerificationHash(checkpoint.actions)) {
    throw new TypeError("checkpoint action prefix differs from admitted request");
  }
  return checkpoint;
}

/** A State Forge recovery frontier bound to one natural source checkpoint; arbitrary surgical snapshot execution stays unavailable. */
export interface ProductionHeadlessStateForgeEvaluation {
  readonly source: ProductionHeadlessCheckpoint;
  readonly forgedSnapshot: TearSnapshotV1;
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
  captureCheckpoint(): ProductionHeadlessCheckpoint;
  restoreCheckpoint(checkpoint: ProductionHeadlessCheckpoint): CanonicalGameplayState;
  restoreStateForgeEvaluation(evaluation: ProductionHeadlessStateForgeEvaluation): CanonicalGameplayState;
  /** Available only when the environment was explicitly created for source-track capture. */
  sourceTracks(): ProductionHeadlessSourceTracks;
}

function cloneActions(actions: readonly CommandEnvelope<GameAction>[]): readonly CommandEnvelope<GameAction>[] {
  return Object.freeze(
    actions.map((entry) =>
      Object.freeze({
        kind: entry.kind,
        id: entry.id,
        tick: entry.tick,
        command: Object.freeze({ ...entry.command }),
      }),
    ),
  );
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateProductionHeadlessCheckpoint(value: unknown): ProductionHeadlessCheckpoint {
  if (!record(value) || value.format !== "tearbench-production-headless-checkpoint" || value.schemaVersion !== 2) {
    throw new TypeError("production headless checkpoint format is invalid");
  }
  const scenario = requireProductionHeadlessScenario(value.scenario);
  const bootstrap = requireBootstrap(value.bootstrap);
  const snapshot = validateTearContract(value.snapshot);
  if (!snapshot.ok || snapshot.value.kind !== "snapshot") {
    throw new TypeError(
      `invalid production headless checkpoint snapshot: ${
        snapshot.ok
          ? "wrong contract kind"
          : snapshot.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")
      }`,
    );
  }
  if (snapshot.value.stateClass !== "recorded-canonical") {
    throw new RangeError("production headless checkpoints require recorded-canonical source state");
  }
  if (!record(value.checkpoint) || !record(value.input) || !Array.isArray(value.actions)) {
    throw new TypeError("production headless checkpoint coordinate is invalid");
  }
  const checkpoint = value.checkpoint;
  const input = value.input;
  const checkpointTick = checkpoint.tick;
  const nextCommandId = checkpoint.nextCommandId;
  const semanticHash = checkpoint.semanticHash;
  const inputTick = input.tick;
  const moveX = input.moveX;
  const moveY = input.moveY;
  const aimTurn = input.aimTurn;
  const aimMagnitude = input.aimMagnitude;
  const primaryHeld = input.primaryHeld;
  if (
    typeof checkpointTick !== "number" ||
    !Number.isSafeInteger(checkpointTick) ||
    checkpointTick < 0 ||
    typeof inputTick !== "number" ||
    !Number.isSafeInteger(inputTick) ||
    inputTick < 0 ||
    checkpointTick !== snapshot.value.tick ||
    checkpointTick !== inputTick ||
    typeof nextCommandId !== "number" ||
    !Number.isSafeInteger(nextCommandId) ||
    nextCommandId < 0 ||
    typeof semanticHash !== "string" ||
    !/^[a-f0-9]{16}$/u.test(semanticHash) ||
    typeof moveX !== "number" ||
    !Number.isFinite(moveX) ||
    typeof moveY !== "number" ||
    !Number.isFinite(moveY) ||
    typeof aimTurn !== "number" ||
    !Number.isFinite(aimTurn) ||
    typeof aimMagnitude !== "number" ||
    !Number.isSafeInteger(aimMagnitude) ||
    aimMagnitude < 0 ||
    aimMagnitude > AIM_MAGNITUDE_SCALE ||
    typeof primaryHeld !== "boolean"
  ) {
    throw new TypeError("production headless checkpoint coordinate is invalid");
  }
  const validCheckpoint = Object.freeze({
    tick: checkpointTick,
    nextCommandId,
    semanticHash,
  });
  const validInput = Object.freeze({
    tick: inputTick,
    moveX,
    moveY,
    aimTurn,
    aimMagnitude,
    primaryHeld,
  });
  const run = snapshot.value.state["tear.run.v1"];
  const blade = snapshot.value.state["tear.blade.v1"];
  if (
    !record(run) ||
    !record(blade) ||
    run.mode !== scenario.start.mode ||
    run.difficulty !== scenario.start.difficulty ||
    blade.weaponId !== scenario.start.weapon ||
    String(run.runSeed) !== snapshot.value.seed ||
    run.runSeed !== productionRunSeed(scenario.seed)
  ) {
    throw new RangeError("production headless checkpoint does not match its natural scenario");
  }
  let previousId = 0,
    previousTick = 0;
  const actions: CommandEnvelope<GameAction>[] = [];
  for (const entry of value.actions) {
    if (!record(entry)) throw new TypeError("production headless checkpoint action trace is invalid");
    const id = entry.id;
    const tick = entry.tick;
    if (
      entry.kind !== "command" ||
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id !== previousId + 1 ||
      typeof tick !== "number" ||
      !Number.isSafeInteger(tick) ||
      tick < 1 ||
      tick < previousTick ||
      tick > validCheckpoint.tick
    ) {
      throw new TypeError("production headless checkpoint action trace is invalid");
    }
    const normalized = normalizeGameAction(entry.command);
    if (!normalized.ok) throw new TypeError(`invalid checkpoint action: ${normalized.reason}`);
    const actionId = id;
    const actionTick = tick;
    actions.push(Object.freeze({ kind: "command", id: actionId, tick: actionTick, command: normalized.action }));
    previousId = actionId;
    previousTick = actionTick;
  }
  if (previousId !== validCheckpoint.nextCommandId) {
    throw new TypeError("production headless checkpoint command sequence is incomplete");
  }
  if (
    !record(value.delivery) ||
    !Number.isSafeInteger(value.delivery.nextSequence) ||
    Number(value.delivery.nextSequence) < 0 ||
    !Array.isArray(value.delivery.pendingEvents) ||
    typeof value.delivery.hash !== "string"
  ) {
    throw new TypeError("production headless checkpoint delivery frontier is required");
  }
  const nextSequence = Number(value.delivery.nextSequence),
    pendingEvents: TearCausalEventV1[] = [];
  let pendingTick = 0;
  for (const [index, raw] of value.delivery.pendingEvents.entries()) {
    const result = validateTearContract(raw);
    const sequence = nextSequence - value.delivery.pendingEvents.length + index;
    if (
      !result.ok ||
      result.value.kind !== "event" ||
      result.value.source !== "engine" ||
      sequence < 0 ||
      result.value.sequence !== sequence ||
      result.value.tick < pendingTick ||
      result.value.tick > checkpointTick ||
      result.value.id !== `headless:${String(result.value.tick)}:${String(sequence)}`
    ) {
      throw new TypeError("production headless checkpoint pending event frontier is invalid");
    }
    pendingEvents.push(Object.freeze(structuredClone(result.value)));
    pendingTick = result.value.tick;
  }
  const valid = {
    format: "tearbench-production-headless-checkpoint",
    schemaVersion: 2,
    scenario,
    snapshot: snapshot.value,
    bootstrap,
    input: validInput,
    checkpoint: validCheckpoint,
    actions: cloneActions(actions),
  } as const;
  const delivery = Object.freeze({
    nextSequence,
    pendingEvents: Object.freeze(pendingEvents),
    hash: value.delivery.hash,
  });
  if (delivery.hash !== stableVerificationHash({ ...valid, delivery: { nextSequence, pendingEvents } })) {
    throw new TypeError("production headless checkpoint delivery integrity binding is invalid");
  }
  if (checkpointTick >= scenario.maxTicks) throw new RangeError("production headless checkpoint exhausted its horizon");
  return Object.freeze({ ...valid, delivery });
}

function validateStateForgeEvaluation(
  value: unknown,
): Readonly<{ source: ProductionHeadlessCheckpoint; forgedSnapshot: TearSnapshotV1 }> {
  if (!record(value)) throw new TypeError("production State Forge evaluation is invalid");
  const source = validateProductionHeadlessCheckpoint(value.source);
  const parsed = validateTearContract(value.forgedSnapshot);
  if (!parsed.ok || parsed.value.kind !== "snapshot")
    throw new TypeError("production State Forge evaluation snapshot is invalid");
  const forged = parsed.value;
  if (
    forged.stateClass !== "surgical-valid" ||
    forged.tick !== source.checkpoint.tick ||
    forged.seed !== source.snapshot.seed ||
    forged.provenance.actor !== "state-forge" ||
    forged.provenance.producer !== "forgeExitLaunchSnapshot" ||
    forged.provenance.sourceId !== source.snapshot.id ||
    forged.lineage?.parentId !== source.snapshot.id ||
    forged.lineage.parentRootHash !== source.snapshot.hashes.exact ||
    forged.lineage.forkTick !== source.checkpoint.tick ||
    forged.hashes.exact !== stableVerificationHash(forged.state)
  ) {
    throw new RangeError("production State Forge evaluation requires a lineage-bound surgical snapshot");
  }
  return Object.freeze({ source, forgedSnapshot: forged });
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
      current.simulation.simulationRuntime.scheduler.tick >= current.scenario.maxTicks
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
  const policyObservation = (value: ProductionHeadlessCore): TearObservationV1 => {
    const run = value.replay.world.state.run() as unknown as {
      mode: TearObservationV1["run"]["mode"];
      diff: TearObservationV1["run"]["difficulty"];
      weaponId: TearObservationV1["run"]["weapon"];
      wave: number;
      score: number;
    } | null;
    const sourcePlayer = value.replay.world.state.player();
    const player = sourcePlayer as unknown as
      | {
          x: number;
          y: number;
          vx: number;
          vy: number;
          hp: number;
          maxHp: number;
          facing?: number;
          onGround?: boolean;
          dashCharges?: number;
        }
      | undefined;
    const blade = value.replay.world.state.blade() as unknown as
      | {
          x: number;
          y: number;
          tipX: number;
          tipY: number;
          vx: number;
          vy: number;
          tipSpeed: number;
          state: string;
          riftChambers?: number;
          riftChamberCooldown?: number;
          wheelSpin?: number;
          reversals?: readonly unknown[];
        }
      | undefined;
    if (run === null || player === undefined || sourcePlayer === undefined || blade === undefined) {
      throw new Error("production policy observation requires an active source world");
    }
    const tick = value.simulation.simulationRuntime.scheduler.tick;
    return Object.freeze({
      format: TEAR_CONTRACT_FORMAT,
      kind: "observation",
      schemaVersion: TEAR_CONTRACT_VERSION,
      tick,
      observationClass: "structured-state",
      player: Object.freeze({
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        hp: player.hp,
        maxHp: player.maxHp,
        facing: player.facing === undefined || player.facing >= 0 ? 1 : -1,
        grounded: player.onGround ?? false,
        dashCharges: player.dashCharges ?? 0,
        ...projectLivePlayerMechanics(sourcePlayer, "B"),
      }),
      blade: Object.freeze({
        handX: blade.x,
        handY: blade.y,
        tipX: blade.tipX,
        tipY: blade.tipY,
        vx: blade.vx,
        vy: blade.vy,
        tipSpeed: blade.tipSpeed,
        state: blade.state,
        ...projectLiveBladeMechanics(blade, "B"),
      }),
      entities: Object.freeze([
        ...value.replay.world.state
          .enemies()
          .filter((enemy: { dead?: boolean }) => !enemy.dead)
          .map((enemy, index) => {
            const value = enemy as unknown as {
              _gid?: number;
              kind?: string;
              bossId?: string;
              supportType?: string;
              isVoidWisp?: boolean;
              x: number;
              y: number;
              vx: number;
              vy: number;
              hp: number;
              maxHp?: number;
              state?: string;
            };
            return Object.freeze({
              id: `production:${String(value._gid ?? index + 1)}`,
              kind: canonicalObservationEnemyKind({ ...value, kind: value.kind ?? "" }),
              x: value.x,
              y: value.y,
              vx: value.vx,
              vy: value.vy,
              hpRatio: value.maxHp === undefined || value.maxHp <= 0 ? 1 : value.hp / value.maxHp,
              state: value.state ?? "active",
              ...projectLiveActorMechanics(enemy, "B"),
            });
          }),
        ...projectLiveProjectiles(value.replay.world.state.projectiles(), sourcePlayer, "B"),
      ]),
      run: Object.freeze({
        mode: run.mode,
        difficulty: run.diff,
        weapon: run.weaponId,
        stage: canonicalObservationStage(value.replay.stage.index),
        wave: run.wave,
        score: run.score,
        elapsedTicks: tick,
      }),
      availableActions: canonicalObservationActions(value.waveReward.screen(), run.mode, false),
    });
  };
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
        observation: result.state,
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
    restoreStateForgeEvaluation(value: ProductionHeadlessStateForgeEvaluation): CanonicalGameplayState {
      const evaluation = validateStateForgeEvaluation(value);
      const restored = compose(
        evaluation.source.scenario,
        evaluation.forgedSnapshot,
        evaluation.source.input,
        evaluation.source.bootstrap,
      );
      const restoredObservation = observation(restored);
      // State Forge's exact hash covers its codec payload while this adapter
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
