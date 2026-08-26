import type { CommandEnvelope } from "../domain/envelopes";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { TearGameplayEventBus, type TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { stableVerificationHash } from "../replay/hash";
import type { createProductionCombatSimulation } from "./production-combat-simulation";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
  projectProductionReplayCanonicalState,
  type ProductionReplayBootstrap,
} from "./production-replay-composition";
import type { ProductionReplayWorld } from "./production-world-factory";
import type { ProductionWaveRewardRuntime } from "./production-wave-reward-runtime";
import type { ProductionWaveRewardIntent } from "./production-wave-reward-runtime";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearCausalEventV1, type TearObservationV1, type TearScenarioV1, type TearSnapshotV1 } from "./contracts";
import { RUN_RANDOM_STREAM_NAMES } from "../simulation/run-random";
import {
  TearHeadlessEnvironmentPool,
  type TearHeadlessEnvironment,
  type TearHeadlessEpisode,
  type TearHeadlessJob,
  type TearHeadlessTransition,
} from "./headless";
import { validateTearContract } from "./validation";
import { canonicalObservationActions, canonicalObservationEnemyKind, canonicalObservationStage } from "./observation-identity";
import { projectLiveProjectiles } from "./live-observation-projectiles";
import { projectLiveActorMechanics, projectLiveBladeMechanics, projectLivePlayerMechanics } from "./live-observation-actors";
import { createGameplayCausalEvent } from "./gameplay-causal-events";

type ProductionHeadlessCore = Readonly<{
  replay: ProductionReplayWorld;
  simulation: ReturnType<typeof createProductionCombatSimulation<CanonicalGameplayState>>;
  waveReward: ProductionWaveRewardRuntime;
  bootstrap: ProductionReplayBootstrap;
  scenario: TearScenarioV1;
  routeAction: (action: GameAction) => boolean;
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

/**
 * An in-memory source keyframe for one interrupted C30 episode. It is not a
 * worker message, durable job record, or storage format; callers explicitly
 * retain and pass it to a fresh environment in the same process.
 */
export interface ProductionHeadlessCheckpoint {
  readonly format: "tearbench-production-headless-checkpoint";
  readonly schemaVersion: 1;
  readonly scenario: TearScenarioV1;
  /** Original run-start identity, retained so restored artifacts attest the same source run. */
  readonly bootstrap: ProductionReplayBootstrap;
  readonly checkpoint: Readonly<{
    tick: number;
    semanticHash: string;
    nextCommandId: number;
  }>;
  readonly snapshot: TearSnapshotV1;
  readonly input: AuthoritativeInputSnapshot;
  readonly actions: readonly CommandEnvelope<GameAction>[];
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
  captureCheckpoint(): ProductionHeadlessCheckpoint;
  restoreCheckpoint(checkpoint: ProductionHeadlessCheckpoint): CanonicalGameplayState;
  restoreStateForgeEvaluation(evaluation: ProductionHeadlessStateForgeEvaluation): CanonicalGameplayState;
  /** Available only when the environment was explicitly created for source-track capture. */
  sourceTracks(): ProductionHeadlessSourceTracks;
}

function requireNaturalScenario(value: TearScenarioV1): TearScenarioV1 {
  if (value.backends !== undefined && !value.backends.includes("headless")) {
    throw new RangeError(`scenario ${value.id} does not support headless execution`);
  }
  if (value.stateClass !== "recorded-canonical") {
    throw new RangeError("production headless runs require recorded-canonical natural openings");
  }
  if (value.start.stage !== undefined || (value.start.wave !== undefined && value.start.wave !== 1)
    || value.start.boss !== undefined || value.start.bossPhase !== undefined) {
    throw new RangeError("production headless runs require a natural opening; use State Forge for surgical state");
  }
  return value;
}

function requireScenario(value: unknown): TearScenarioV1 {
  const validated = validateTearContract(value);
  if (!validated.ok || validated.value.kind !== "scenario") {
    throw new TypeError(`invalid headless scenario: ${validated.ok ? "wrong contract kind"
      : validated.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }
  return requireNaturalScenario(validated.value);
}

function cloneActions(actions: readonly CommandEnvelope<GameAction>[]): readonly CommandEnvelope<GameAction>[] {
  return Object.freeze(actions.map((entry) => Object.freeze({
    kind: entry.kind, id: entry.id, tick: entry.tick, command: Object.freeze({ ...entry.command }),
  })));
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBootstrap(value: unknown): ProductionReplayBootstrap {
  if (!record(value) || !record(value.build) || !record(value.rng)) {
    throw new TypeError("production headless checkpoint bootstrap is invalid");
  }
  const build = value.build;
  const buildKeys = ["version", "revision", "target", "rulesetVersion", "contentHash", "configHash"] as const;
  if (buildKeys.some((key) => typeof build[key] !== "string" || build[key].length === 0)) {
    throw new TypeError("production headless checkpoint build identity is invalid");
  }
  const streams: Record<string, Readonly<{ algorithm: "mulberry32"; seed: number; state: number; cursor: number }>> = {};
  for (const name of RUN_RANDOM_STREAM_NAMES) {
    const stream = value.rng[name];
    if (!record(stream) || stream.algorithm !== "mulberry32"
      || typeof stream.seed !== "number" || !Number.isSafeInteger(stream.seed) || stream.seed < 0
      || typeof stream.state !== "number" || !Number.isSafeInteger(stream.state) || stream.state < 0
      || typeof stream.cursor !== "number" || !Number.isSafeInteger(stream.cursor) || stream.cursor < 0) {
      throw new TypeError("production headless checkpoint random bootstrap is invalid");
    }
    streams[name] = Object.freeze({ algorithm: "mulberry32", seed: stream.seed, state: stream.state, cursor: stream.cursor });
  }
  return Object.freeze({
    build: Object.freeze({
      version: build.version as string, revision: build.revision as string, target: build.target as string,
      rulesetVersion: build.rulesetVersion as string, contentHash: build.contentHash as string, configHash: build.configHash as string,
    }),
    rng: Object.freeze(streams),
  });
}

function validateCheckpoint(value: unknown): ProductionHeadlessCheckpoint {
  if (!record(value) || value.format !== "tearbench-production-headless-checkpoint" || value.schemaVersion !== 1) {
    throw new TypeError("production headless checkpoint format is invalid");
  }
  const scenario = requireScenario(value.scenario);
  const bootstrap = requireBootstrap(value.bootstrap);
  const snapshot = validateTearContract(value.snapshot);
  if (!snapshot.ok || snapshot.value.kind !== "snapshot") {
    throw new TypeError(`invalid production headless checkpoint snapshot: ${snapshot.ok ? "wrong contract kind"
      : snapshot.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
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
  const primaryHeld = input.primaryHeld;
  if (typeof checkpointTick !== "number" || !Number.isSafeInteger(checkpointTick) || checkpointTick < 0
    || typeof inputTick !== "number" || !Number.isSafeInteger(inputTick) || inputTick < 0
    || checkpointTick !== snapshot.value.tick || checkpointTick !== inputTick
    || typeof nextCommandId !== "number" || !Number.isSafeInteger(nextCommandId) || nextCommandId < 0
    || typeof semanticHash !== "string" || !/^[a-f0-9]{16}$/u.test(semanticHash)
    || typeof moveX !== "number" || !Number.isFinite(moveX)
    || typeof moveY !== "number" || !Number.isFinite(moveY)
    || typeof aimTurn !== "number" || !Number.isFinite(aimTurn)
    || typeof primaryHeld !== "boolean") {
    throw new TypeError("production headless checkpoint coordinate is invalid");
  }
  const validCheckpoint = Object.freeze({
    tick: checkpointTick, nextCommandId, semanticHash,
  });
  const validInput = Object.freeze({
    tick: inputTick, moveX, moveY, aimTurn, primaryHeld,
  });
  const run = snapshot.value.state["tear.run.v1"];
  const blade = snapshot.value.state["tear.blade.v1"];
  if (!record(run) || !record(blade) || run.mode !== scenario.start.mode
    || run.difficulty !== scenario.start.difficulty || blade.weaponId !== scenario.start.weapon
    || String(run.runSeed) !== snapshot.value.seed) {
    throw new RangeError("production headless checkpoint does not match its natural scenario");
  }
  let previousId = 0;
  const actions: CommandEnvelope<GameAction>[] = [];
  for (const entry of value.actions) {
    if (!record(entry)) throw new TypeError("production headless checkpoint action trace is invalid");
    const id = entry.id;
    const tick = entry.tick;
    if (entry.kind !== "command" || typeof id !== "number" || !Number.isSafeInteger(id) || id <= previousId
      || typeof tick !== "number" || !Number.isSafeInteger(tick) || tick < 1 || tick > validCheckpoint.tick) {
      throw new TypeError("production headless checkpoint action trace is invalid");
    }
    const normalized = normalizeGameAction(entry.command);
    if (!normalized.ok) throw new TypeError(`invalid checkpoint action: ${normalized.reason}`);
    const actionId = id;
    const actionTick = tick;
    actions.push(Object.freeze({ kind: "command", id: actionId, tick: actionTick, command: normalized.action }));
    previousId = actionId;
  }
  if (previousId !== validCheckpoint.nextCommandId) {
    throw new TypeError("production headless checkpoint command sequence is incomplete");
  }
  return Object.freeze({
    format: "tearbench-production-headless-checkpoint", schemaVersion: 1, scenario, snapshot: snapshot.value,
    bootstrap,
    input: validInput,
    checkpoint: validCheckpoint,
    actions: cloneActions(actions),
  });
}

function validateStateForgeEvaluation(value: unknown): Readonly<{ source: ProductionHeadlessCheckpoint; forgedSnapshot: TearSnapshotV1 }> {
  if (!record(value)) throw new TypeError("production State Forge evaluation is invalid");
  const source = validateCheckpoint(value.source);
  const parsed = validateTearContract(value.forgedSnapshot);
  if (!parsed.ok || parsed.value.kind !== "snapshot") throw new TypeError("production State Forge evaluation snapshot is invalid");
  const forged = parsed.value;
  if (forged.stateClass !== "surgical-valid" || forged.tick !== source.checkpoint.tick || forged.seed !== source.snapshot.seed
    || forged.provenance.actor !== "state-forge" || forged.provenance.producer !== "forgeExitLaunchSnapshot"
    || forged.provenance.sourceId !== source.snapshot.id || forged.lineage?.parentId !== source.snapshot.id
    || forged.lineage.parentRootHash !== source.snapshot.hashes.exact || forged.lineage.forkTick !== source.checkpoint.tick
    || forged.hashes.exact !== stableVerificationHash(forged.state)) {
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
    const run = value.replay.world.state.run() as unknown as { mode: TearObservationV1["run"]["mode"]; diff: TearObservationV1["run"]["difficulty"]; weaponId: TearObservationV1["run"]["weapon"]; wave: number; score: number } | null;
    const sourcePlayer = value.replay.world.state.player();
    const player = sourcePlayer as unknown as { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number; facing?: number; onGround?: boolean; dashCharges?: number } | undefined;
    const blade = value.replay.world.state.blade() as unknown as { x: number; y: number; tipX: number; tipY: number;
      vx: number; vy: number; tipSpeed: number; state: string; riftChambers?: number;
      riftChamberCooldown?: number; wheelSpin?: number; reversals?: readonly unknown[] } | undefined;
    if (run === null || player === undefined || sourcePlayer === undefined || blade === undefined) {
      throw new Error("production policy observation requires an active source world");
    }
    const tick = value.simulation.simulationRuntime.scheduler.tick;
    return Object.freeze({ format: TEAR_CONTRACT_FORMAT, kind: "observation", schemaVersion: TEAR_CONTRACT_VERSION, tick,
      observationClass: "structured-state", player: Object.freeze({ x: player.x, y: player.y, vx: player.vx, vy: player.vy,
        hp: player.hp, maxHp: player.maxHp, facing: player.facing === undefined || player.facing >= 0 ? 1 : -1,
        grounded: player.onGround ?? false, dashCharges: player.dashCharges ?? 0,
        ...projectLivePlayerMechanics(sourcePlayer, "B") }),
      blade: Object.freeze({ handX: blade.x, handY: blade.y, tipX: blade.tipX, tipY: blade.tipY, vx: blade.vx, vy: blade.vy,
        tipSpeed: blade.tipSpeed, state: blade.state, ...projectLiveBladeMechanics(blade, "B") }),
      entities: Object.freeze([...value.replay.world.state.enemies().filter((enemy: { dead?: boolean }) => !enemy.dead).map((enemy, index) => {
        const value = enemy as unknown as { _gid?: number; kind?: string; bossId?: string; supportType?: string;
          isVoidWisp?: boolean; x: number; y: number; vx: number; vy: number; hp: number; maxHp?: number; state?: string };
        return Object.freeze({ id: `production:${String(value._gid ?? index + 1)}`,
          kind: canonicalObservationEnemyKind({ ...value, kind: value.kind ?? "" }), x: value.x, y: value.y,
          vx: value.vx, vy: value.vy, hpRatio: value.maxHp === undefined || value.maxHp <= 0 ? 1 : value.hp / value.maxHp,
          state: value.state ?? "active", ...projectLiveActorMechanics(enemy, "B") });
      }), ...projectLiveProjectiles(value.replay.world.state.projectiles(), sourcePlayer, "B")]),
      run: Object.freeze({ mode: run.mode, difficulty: run.diff, weapon: run.weaponId,
        stage: canonicalObservationStage(value.replay.stage.index), wave: run.wave, score: run.score, elapsedTicks: tick }),
      availableActions: canonicalObservationActions("playing", run.mode, false),
    });
  };
  const compose = (
    scenario: TearScenarioV1,
    snapshot?: TearSnapshotV1,
    input?: AuthoritativeInputSnapshot,
    bootstrap?: ProductionReplayBootstrap,
  ): ProductionHeadlessCore => {
    const nativeEvents: TearGameplayEvent[] = [];
    const sourceTracks: ProductionHeadlessSourceTrackState | undefined = options.captureSourceTracks === true
      ? { nativeEvents, rewardComponents: [], intents: [] }
      : undefined;
    const gameplayEvents = new TearGameplayEventBus(() => snapshot?.tick ?? 0);
    gameplayEvents.subscribe((event) => { nativeEvents.push(event); });
    const composed = createProductionGhostReplayComposition({
      seed: snapshot?.seed ?? scenario.seed,
      mode: scenario.start.mode,
      weaponId: scenario.start.weapon,
      difficulty: scenario.start.difficulty,
      ...(snapshot === undefined || input === undefined ? {} : { inputSnapshots: new Map([[snapshot.tick, input]]) }),
      gameplayEvents,
      ...(sourceTracks === undefined ? {} : { recordWaveIntent: (entry) => { sourceTracks.intents.push(entry); } }),
    }).create(snapshot);
    gameplayEvents.setTickSource(() => composed.simulation.scheduler.tick);
    const core = Object.freeze({ replay: composed.replay, simulation: composed.combat, waveReward: composed.waveReward,
      bootstrap: bootstrap ?? composed.bootstrap,
      scenario, routeAction: composed.routeAction, nativeEvents,
      ...(sourceTracks === undefined ? {} : { sourceTracks }) });
    if (sourceTracks !== undefined) {
      sourceTracks.rewardComponents.push(Object.freeze({ tick: composed.simulation.scheduler.tick,
        value: structuredClone(composed.waveReward.reward.snapshot()) }));
    }
    return core;
  };

  return Object.freeze({
    reset(source: TearScenarioV1): CanonicalGameplayState {
      const scenario = requireScenario(source);
      core = compose(scenario);
      nextCommandId = 0;
      actionTrace = [];
      deliveredCausalEventCount = 0;
      return observation(core);
    },
    policyObservation: () => policyObservation(requireCore()),
    step(actions: readonly GameAction[]): TearHeadlessTransition<CanonicalGameplayState> {
      const current = requireCore();
      const tick = current.simulation.simulationRuntime.scheduler.tick + 1;
      const envelopes: CommandEnvelope<GameAction>[] = actions.map((action) => {
        const normalized = normalizeGameAction(action);
        if (!normalized.ok) throw new TypeError(`invalid headless action: ${normalized.reason}`);
        return Object.freeze({ kind: "command" as const, id: ++nextCommandId, tick, command: normalized.action });
      });
      actionTrace.push(...envelopes);
      const result = current.simulation.simulationRuntime.advanceOne(envelopes.filter(
        (entry) => !current.routeAction(entry.command),
      ));
      if (current.sourceTracks !== undefined) {
        current.sourceTracks.rewardComponents.push(Object.freeze({ tick: result.tick,
          value: structuredClone(current.waveReward.reward.snapshot()) }));
      }
      const lifecycle = current.replay.world.lifecycle.snapshot();
      const terminated = lifecycle.phase === "terminated";
      const truncated = result.tick >= current.scenario.maxTicks;
      const causalEvents: TearCausalEventV1[] = current.nativeEvents.slice(deliveredCausalEventCount)
        .map((event, offset) => {
          const sequence = deliveredCausalEventCount + offset;
          return createGameplayCausalEvent(event, sequence, `headless:${String(event.tick)}:${String(sequence)}`);
        });
      deliveredCausalEventCount = current.nativeEvents.length;
      return Object.freeze({
        observation: result.state,
        events: Object.freeze(causalEvents),
        terminated,
        truncated,
        metrics: Object.freeze({
          tick: result.tick,
          livingEnemies: current.replay.world.state.enemies().filter((enemy) => !enemy.dead).length,
        }),
        ...(terminated || truncated ? { artifact: Object.freeze<ProductionHeadlessTerminalArtifact>({
          format: "tearbench-production-headless-terminal", schemaVersion: 1,
          scenario: current.scenario, bootstrap: current.bootstrap, actions: Object.freeze([...actionTrace]),
          terminal: Object.freeze({
            tick: result.tick, semanticHash: stableVerificationHash(result.state), terminated, truncated,
          }),
        }) } : {}),
      });
    },
    captureCheckpoint(): ProductionHeadlessCheckpoint {
      const current = requireCore();
      const tick = current.simulation.simulationRuntime.scheduler.tick;
      if (!current.replay.world.lifecycle.isWaveActive || current.waveReward.reward.snapshot() !== null
        || current.waveReward.screen() !== "playing" || tick >= current.scenario.maxTicks) {
        throw new RangeError("production headless checkpoints require an active non-draft interrupted episode");
      }
      const captured = captureProductionReplayCheckpoint(
        current.replay, current.simulation, current.waveReward,
        `c30.${current.scenario.id}.checkpoint.${String(tick)}`,
      );
      return Object.freeze({
        format: "tearbench-production-headless-checkpoint", schemaVersion: 1,
        scenario: current.scenario, bootstrap: current.bootstrap,
        checkpoint: Object.freeze({ tick, semanticHash: captured.semanticHash, nextCommandId }),
        snapshot: captured.snapshot, input: Object.freeze({ ...captured.input }), actions: cloneActions(actionTrace),
      });
    },
    restoreCheckpoint(value: ProductionHeadlessCheckpoint): CanonicalGameplayState {
      const checkpoint = validateCheckpoint(value);
      const restored = compose(checkpoint.scenario, checkpoint.snapshot, checkpoint.input, checkpoint.bootstrap);
      const restoredObservation = observation(restored);
      if (stableVerificationHash(restoredObservation) !== checkpoint.checkpoint.semanticHash) {
        throw new RangeError("production headless checkpoint semantic state does not restore exactly");
      }
      core = restored;
      nextCommandId = checkpoint.checkpoint.nextCommandId;
      actionTrace = [...checkpoint.actions];
      deliveredCausalEventCount = 0;
      return restoredObservation;
    },
    restoreStateForgeEvaluation(value: ProductionHeadlessStateForgeEvaluation): CanonicalGameplayState {
      const evaluation = validateStateForgeEvaluation(value);
      const restored = compose(evaluation.source.scenario, evaluation.forgedSnapshot, evaluation.source.input, evaluation.source.bootstrap);
      const restoredObservation = observation(restored);
      // State Forge's exact hash covers its codec payload while this adapter
      // projects CanonicalGameplayState. The former was checked before
      // hydration; comparing those intentionally distinct representations here
      // would create a false equivalence claim.
      core = restored;
      nextCommandId = evaluation.source.checkpoint.nextCommandId;
      actionTrace = [...evaluation.source.actions];
      deliveredCausalEventCount = 0;
      return restoredObservation;
    },
    sourceTracks(): ProductionHeadlessSourceTracks {
      const tracks = requireCore().sourceTracks;
      if (tracks === undefined) throw new Error("production headless source tracks were not requested");
      return Object.freeze({
        nativeEvents: Object.freeze(tracks.nativeEvents.map((event) => Object.freeze(structuredClone(event)))),
        rewardComponents: Object.freeze(tracks.rewardComponents.map((entry) => Object.freeze(structuredClone(entry)))),
        intents: Object.freeze(tracks.intents.map((entry) => Object.freeze(structuredClone(entry)) as ProductionWaveRewardIntent)),
        device: "semantic",
      });
    },
    dispose(): void {
      core = null;
      nextCommandId = 0;
      actionTrace = [];
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
