import type { RecordedGhostChallenge } from "./recorded-challenge";
import type { ReplayActionEnvelope } from "../replay/envelope";
import { stableVerificationHash } from "../replay/hash";
import type {
  TearSimulationRuntime,
  TearSimulationAdvanceLifecycle,
} from "../gameplay/runtime/tear-simulation-runtime";
import type { TearSnapshotV1 } from "../tearbench/contracts";
import {
  createDefaultStateCodecRegistry,
  restoreSnapshotTransactionally,
  type TearCodecWorld,
  type TearStateCodecRegistry,
  type TearWorldFactory,
} from "../tearbench/state-codecs";
import type { GhostEnvelopeV3 } from "./truth-kernel";

export interface GhostReplaySimulation {
  createWorld(): TearCodecWorld;
  validateWorld(world: TearCodecWorld): readonly string[];
  apply(world: TearCodecWorld, action: ReplayActionEnvelope): void;
  advance(world: TearCodecWorld, fromTick: number, toTick: number): void;
  semanticProjection(world: TearCodecWorld): unknown;
}

export interface GhostSeekCorrection {
  readonly disclosed: true;
  readonly tick: number;
  readonly reason: string;
  readonly beforeHash: string;
  readonly afterHash: string;
}

/** Draw-only capability over one isolated, settled production seek. No runtime/world mutators escape. */
export interface GhostReplayRenderView {
  readonly tick: number;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly clockSeconds: number;
  readonly camera: Readonly<{ policy: "player-follow"; x: number; y: number; scale: number; reconstructed: true }>;
  readonly screen: string;
  readonly clockBlocked: boolean;
  draw(canvas: CanvasRenderingContext2D, rectangle: Readonly<{ x: number; y: number; w: number; h: number }>): void;
}
export interface GhostSeekResult {
  readonly tick: number;
  readonly semanticHash: string;
  readonly usedSnapshotId?: string;
  readonly correction?: GhostSeekCorrection;
  readonly presentationFallback: boolean;
}

/**
 * A replay-owned view of a production world. The factory is responsible for
 * composing and (when supplied) restoring the C27A world; replay owns only
 * action timing and never constructs a second simulation runtime.
 */
export interface GhostProductionReplaySession<State> {
  readonly simulation: TearSimulationRuntime<State>;
  /** Production-owned screen gating; absent for generic unconditional sessions. */
  readonly replayLifecycle?: TearSimulationAdvanceLifecycle;
  renderView?(): GhostReplayRenderView;
  semanticProjection(): unknown;
  /** Optional State Forge semantic hash, only when its codec projection is available. */
  snapshotSemanticHash?(): string;
  /** Complete an admitted post-capture start transaction before its first simulation tick. */
  completeRecordedOpening?(): void;
  invalidateRecordedOpening?(): void;
  /** Read-only evidence observer; simulation still advances through the existing loop. */
  afterReplayAdvance?(): void;
  /** Consume admitted between-tick application inputs before this real simulation tick. */
  beforeReplayAdvance?(tick: number): void;
}

export interface GhostProductionReplayComposition<State> {
  create(snapshot: TearSnapshotV1 | undefined): GhostProductionReplaySession<State>;
}

function cloneWorld(world: TearCodecWorld): TearCodecWorld {
  return {
    components: new Map([...world.components].map(([id, value]) => [id, structuredClone(value)])),
    references: new Map(world.references),
    entityIds: new Set(world.entityIds),
  };
}

export class GhostReplayWorld {
  readonly #ghost: GhostEnvelopeV3;
  readonly #simulation: GhostReplaySimulation;
  readonly #registry: TearStateCodecRegistry;
  #world: TearCodecWorld;
  #tick = 0;

  constructor(ghost: GhostEnvelopeV3, simulation: GhostReplaySimulation, registry = createDefaultStateCodecRegistry()) {
    this.#ghost = ghost;
    this.#simulation = simulation;
    this.#registry = registry;
    this.#world = simulation.createWorld();
  }

  world(): TearCodecWorld {
    return cloneWorld(this.#world);
  }
  semanticHash(): string {
    return stableVerificationHash(this.#simulation.semanticProjection(this.#world));
  }

  seek(targetTick: number): GhostSeekResult {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0)
      throw new RangeError("seek tick must be a non-negative integer");
    const snapshot = [...this.#ghost.snapshots]
      .filter((candidate) => candidate.tick <= targetTick)
      .sort((left, right) => right.tick - left.tick)[0];
    this.#world = this.#simulation.createWorld();
    this.#tick = 0;
    let correction: GhostSeekCorrection | undefined;
    if (snapshot !== undefined) {
      const factory: TearWorldFactory = {
        createEmpty: () => this.#simulation.createWorld(),
        validate: (world) => this.#simulation.validateWorld(world),
      };
      const result = restoreSnapshotTransactionally(snapshot, this.#registry, factory, {
        replace: (world) => {
          this.#world = world;
        },
      });
      if (!result.ok)
        throw new TypeError(
          `replay snapshot restore failed: ${result.issues.map((issue) => issue.message).join("; ")}`,
        );
      this.#tick = snapshot.tick;
    }
    let actionIndex = 0;
    while (actionIndex < this.#ghost.actions.length) {
      const actionTick = this.#ghost.actions[actionIndex]?.tick;
      if (actionTick === undefined) break;
      const groupStart = actionIndex;
      while (actionIndex < this.#ghost.actions.length && this.#ghost.actions[actionIndex]?.tick === actionTick) {
        actionIndex += 1;
      }
      if (actionTick > targetTick) continue;
      // A snapshot already includes all commands at its tick. Keep the whole
      // group skipped at/before the restored tick, while applying every
      // command in a newly reached tick in authored order.
      if (actionTick <= this.#tick) continue;
      this.#simulation.advance(this.#world, this.#tick, actionTick);
      this.#tick = actionTick;
      for (let index = groupStart; index < actionIndex; index += 1) {
        const action = this.#ghost.actions[index];
        if (action !== undefined) this.#simulation.apply(this.#world, action);
      }
    }
    this.#simulation.advance(this.#world, this.#tick, targetTick);
    this.#tick = targetTick;
    if (snapshot !== undefined && snapshot.hashes.semantic !== this.semanticHash() && targetTick === snapshot.tick) {
      const beforeHash = this.semanticHash();
      correction = Object.freeze({
        disclosed: true,
        tick: targetTick,
        reason: "restored state did not match declared keyframe semantic hash",
        beforeHash,
        afterHash: snapshot.hashes.semantic,
      });
    }
    return Object.freeze({
      tick: targetTick,
      semanticHash: this.semanticHash(),
      ...(snapshot === undefined ? {} : { usedSnapshotId: snapshot.id }),
      ...(correction === undefined ? {} : { correction }),
      presentationFallback: !this.#ghost.trident.visual.available,
    });
  }

  playFull(finalTick: number): GhostSeekResult {
    return this.seek(finalTick);
  }
}

/**
 * Runs a Ghost through the one simulation runtime created by a production
 * composition. It is intentionally separate from the codec-only
 * GhostReplayWorld: that class remains useful for contract-level fallback,
 * while this class is the C29 path that can make a shared-runtime claim.
 */
export class GhostProductionReplayWorld<State> {
  readonly #ghost: GhostEnvelopeV3;
  readonly #composition: GhostProductionReplayComposition<State>;
  #session: GhostProductionReplaySession<State> | null = null;
  #tick = 0;
  #seeking = false;
  #originSnapshot: TearSnapshotV1 | undefined;

  constructor(ghost: GhostEnvelopeV3, composition: GhostProductionReplayComposition<State>) {
    this.#ghost = ghost;
    this.#composition = composition;
  }

  /** Exposes the active production runtime for identity-level evidence only. */
  simulation(): TearSimulationRuntime<State> | null {
    return this.#session?.simulation ?? null;
  }
  renderView(): GhostReplayRenderView {
    if (this.#session?.renderView === undefined) throw new Error("production replay presentation is unavailable");
    return this.#session.renderView();
  }
  semanticHash(): string {
    if (this.#session === null) throw new Error("production replay world has not been sought");
    return stableVerificationHash(this.#session.semanticProjection());
  }

  seek(targetTick: number): GhostSeekResult {
    if (this.#seeking) {
      this.#session?.invalidateRecordedOpening?.();
      throw new Error("production replay seek is reentrant");
    }
    this.#seeking = true;
    try {
      return this.#seek(targetTick);
    } finally {
      this.#seeking = false;
    }
  }

  /** Opt-in continuous playback. Backward targets rebuild using ordinary seek. */
  advanceTo(targetTick: number): GhostSeekResult {
    if (this.#seeking) {
      this.#session?.invalidateRecordedOpening?.();
      throw new Error("production replay seek is reentrant");
    }
    if (!Number.isSafeInteger(targetTick) || targetTick < 0)
      throw new RangeError("seek tick must be a non-negative integer");
    this.#seeking = true;
    try {
      return this.#session === null || targetTick < this.#tick ? this.#seek(targetTick) : this.#advance(targetTick);
    } catch (error) {
      // A failed observer/step must not leave a partially advanced reusable world.
      this.#session = null;
      this.#originSnapshot = undefined;
      this.#tick = 0;
      throw error;
    } finally {
      this.#seeking = false;
    }
  }

  #seek(targetTick: number): GhostSeekResult {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0)
      throw new RangeError("seek tick must be a non-negative integer");
    const snapshot = [...this.#ghost.snapshots]
      .filter((candidate) => candidate.tick <= targetTick)
      .sort((left, right) => right.tick - left.tick)[0];
    const session = this.#composition.create(snapshot);
    const startingTick = snapshot?.tick ?? 0;
    if (session.simulation.scheduler.tick !== startingTick) {
      throw new TypeError(
        `production replay composition started at tick ${String(session.simulation.scheduler.tick)}, expected ${String(startingTick)}`,
      );
    }
    this.#session = session;
    this.#originSnapshot = snapshot;
    this.#tick = startingTick;
    return this.#advance(targetTick);
  }

  #advance(targetTick: number): GhostSeekResult {
    const session = this.#session;
    if (session === null) throw new Error("production replay world has no active session");
    const snapshot = this.#originSnapshot;
    if (targetTick > this.#tick && this.#tick === (snapshot?.tick ?? 0)) session.completeRecordedOpening?.();
    for (let tick = this.#tick + 1; tick <= targetTick; tick += 1) {
      const actions = this.#ghost.actions.filter((action) => action.tick === tick);
      session.beforeReplayAdvance?.(tick);
      session.simulation.advanceExact(() => actions, session.replayLifecycle);
      session.afterReplayAdvance?.();
    }
    this.#tick = targetTick;
    const semanticHash = this.semanticHash();
    const snapshotSemanticHash = session.snapshotSemanticHash?.();
    const correction =
      snapshot?.tick === targetTick &&
      snapshotSemanticHash !== undefined &&
      snapshot.hashes.semantic !== snapshotSemanticHash
        ? Object.freeze({
            disclosed: true as const,
            tick: targetTick,
            reason: "restored production state did not match declared keyframe semantic hash",
            beforeHash: snapshotSemanticHash,
            afterHash: snapshot.hashes.semantic,
          })
        : undefined;
    return Object.freeze({
      tick: targetTick,
      semanticHash,
      ...(snapshot === undefined ? {} : { usedSnapshotId: snapshot.id }),
      ...(correction === undefined ? {} : { correction }),
      presentationFallback: !this.#ghost.trident.visual.available,
    });
  }

  playFull(finalTick: number): GhostSeekResult {
    return this.seek(finalTick);
  }
}

export type GhostPracticeMode =
  "exact-practice" | "repetition-drill" | "counterfactual-sandbox" | "race-practice" | "coach-assisted";

export interface GhostPracticeChild {
  readonly challenge?: RecordedGhostChallenge;
  readonly id: string;
  readonly sourceGhostId: string;
  readonly sourceRootHash: string;
  readonly forkTick: number;
  readonly mode: GhostPracticeMode;
  readonly snapshot: TearSnapshotV1;
  readonly inputLatchPolicy: "release-all" | "preserve-held";
  readonly rankedEligible: false;
  readonly leaderboardEligible: false;
  readonly lineage: Readonly<{
    relation: "forked-at";
    parentId: string;
    parentRootHash: string;
    forkTick: number;
  }>;
}

export function createPracticeFromHere(
  source: GhostEnvelopeV3,
  snapshot: TearSnapshotV1,
  mode: GhostPracticeMode,
  inputLatchPolicy: GhostPracticeChild["inputLatchPolicy"] = "release-all",
): GhostPracticeChild {
  if (!source.snapshots.some((candidate) => candidate.id === snapshot.id && candidate.tick === snapshot.tick)) {
    throw new TypeError("practice snapshot must belong to the source Ghost");
  }
  const clonedSnapshot = structuredClone(snapshot);
  return Object.freeze({
    id: `${source.id}:practice:${String(snapshot.tick)}:${mode}`,
    sourceGhostId: source.id,
    sourceRootHash: source.rootHash,
    forkTick: snapshot.tick,
    mode,
    snapshot: Object.freeze(clonedSnapshot),
    inputLatchPolicy,
    rankedEligible: false,
    leaderboardEligible: false,
    lineage: Object.freeze({
      relation: "forked-at",
      parentId: source.id,
      parentRootHash: source.rootHash,
      forkTick: snapshot.tick,
    }),
  });
}
