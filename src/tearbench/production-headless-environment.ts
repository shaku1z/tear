import type { CommandEnvelope } from "../domain/envelopes";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { stableVerificationHash } from "../replay/hash";
import type { createProductionCombatSimulation } from "./production-combat-simulation";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
  projectProductionReplayCanonicalState,
} from "./production-replay-composition";
import type { ProductionReplayWorld } from "./production-world-factory";
import type { ProductionWaveRewardRuntime } from "./production-wave-reward-runtime";
import type { TearScenarioV1, TearSnapshotV1 } from "./contracts";
import {
  TearHeadlessEnvironmentPool,
  type TearHeadlessEnvironment,
  type TearHeadlessEpisode,
  type TearHeadlessJob,
  type TearHeadlessTransition,
} from "./headless";
import { validateTearContract } from "./validation";

type ProductionHeadlessCore = Readonly<{
  replay: ProductionReplayWorld;
  simulation: ReturnType<typeof createProductionCombatSimulation<CanonicalGameplayState>>;
  waveReward: ProductionWaveRewardRuntime;
  scenario: TearScenarioV1;
  routeAction: (action: GameAction) => boolean;
}>;

export interface ProductionHeadlessTerminalArtifact {
  readonly format: "tearbench-production-headless-terminal";
  readonly schemaVersion: 1;
  readonly scenario: TearScenarioV1;
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
  readonly checkpoint: Readonly<{
    tick: number;
    semanticHash: string;
    nextCommandId: number;
  }>;
  readonly snapshot: TearSnapshotV1;
  readonly input: AuthoritativeInputSnapshot;
  readonly actions: readonly CommandEnvelope<GameAction>[];
}

export interface ProductionHeadlessEnvironment extends TearHeadlessEnvironment<
  TearScenarioV1,
  CanonicalGameplayState,
  GameAction
> {
  captureCheckpoint(): ProductionHeadlessCheckpoint;
  restoreCheckpoint(checkpoint: ProductionHeadlessCheckpoint): CanonicalGameplayState;
}

function requireNaturalScenario(value: TearScenarioV1): TearScenarioV1 {
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

function validateCheckpoint(value: unknown): ProductionHeadlessCheckpoint {
  if (!record(value) || value.format !== "tearbench-production-headless-checkpoint" || value.schemaVersion !== 1) {
    throw new TypeError("production headless checkpoint format is invalid");
  }
  const scenario = requireScenario(value.scenario);
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
    input: validInput,
    checkpoint: validCheckpoint,
    actions: cloneActions(actions),
  });
}

/**
 * DOM-free C30 adapter over the same production world/combat composition used
 * by C29 replay. It owns neither a browser scheduler nor an alternate model.
 */
export function createProductionHeadlessEnvironment(): ProductionHeadlessEnvironment {
  let core: ProductionHeadlessCore | null = null;
  let nextCommandId = 0;
  let actionTrace: CommandEnvelope<GameAction>[] = [];

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
  const compose = (
    scenario: TearScenarioV1,
    snapshot?: TearSnapshotV1,
    input?: AuthoritativeInputSnapshot,
  ): ProductionHeadlessCore => {
    const composed = createProductionGhostReplayComposition({
      seed: snapshot?.seed ?? scenario.seed,
      mode: scenario.start.mode,
      weaponId: scenario.start.weapon,
      difficulty: scenario.start.difficulty,
      ...(snapshot === undefined || input === undefined ? {} : { inputSnapshots: new Map([[snapshot.tick, input]]) }),
    }).create(snapshot);
    return Object.freeze({ replay: composed.replay, simulation: composed.combat, waveReward: composed.waveReward,
      scenario, routeAction: composed.routeAction });
  };

  return Object.freeze({
    reset(source: TearScenarioV1): CanonicalGameplayState {
      const scenario = requireScenario(source);
      core = compose(scenario);
      nextCommandId = 0;
      actionTrace = [];
      return observation(core);
    },
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
      const lifecycle = current.replay.world.lifecycle.snapshot();
      const terminated = lifecycle.phase === "terminated";
      const truncated = result.tick >= current.scenario.maxTicks;
      return Object.freeze({
        observation: result.state,
        terminated,
        truncated,
        metrics: Object.freeze({
          tick: result.tick,
          livingEnemies: current.replay.world.state.enemies().filter((enemy) => !enemy.dead).length,
        }),
        ...(terminated || truncated ? { artifact: Object.freeze<ProductionHeadlessTerminalArtifact>({
          format: "tearbench-production-headless-terminal", schemaVersion: 1,
          scenario: current.scenario, actions: Object.freeze([...actionTrace]),
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
        scenario: current.scenario,
        checkpoint: Object.freeze({ tick, semanticHash: captured.semanticHash, nextCommandId }),
        snapshot: captured.snapshot, input: Object.freeze({ ...captured.input }), actions: cloneActions(actionTrace),
      });
    },
    restoreCheckpoint(value: ProductionHeadlessCheckpoint): CanonicalGameplayState {
      const checkpoint = validateCheckpoint(value);
      const restored = compose(checkpoint.scenario, checkpoint.snapshot, checkpoint.input);
      const restoredObservation = observation(restored);
      if (stableVerificationHash(restoredObservation) !== checkpoint.checkpoint.semanticHash) {
        throw new RangeError("production headless checkpoint semantic state does not restore exactly");
      }
      core = restored;
      nextCommandId = checkpoint.checkpoint.nextCommandId;
      actionTrace = [...checkpoint.actions];
      return restoredObservation;
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
