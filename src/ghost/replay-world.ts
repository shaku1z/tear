import type { ReplayActionEnvelope } from "../replay/envelope";
import { stableVerificationHash } from "../replay/hash";
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

export interface GhostSeekResult {
  readonly tick: number;
  readonly semanticHash: string;
  readonly usedSnapshotId?: string;
  readonly correction?: GhostSeekCorrection;
  readonly presentationFallback: boolean;
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

  constructor(
    ghost: GhostEnvelopeV3,
    simulation: GhostReplaySimulation,
    registry = createDefaultStateCodecRegistry(),
  ) {
    this.#ghost = ghost;
    this.#simulation = simulation;
    this.#registry = registry;
    this.#world = simulation.createWorld();
  }

  world(): TearCodecWorld { return cloneWorld(this.#world); }
  semanticHash(): string { return stableVerificationHash(this.#simulation.semanticProjection(this.#world)); }

  seek(targetTick: number): GhostSeekResult {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0) throw new RangeError("seek tick must be a non-negative integer");
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
        replace: (world) => { this.#world = world; },
      });
      if (!result.ok) throw new TypeError(`replay snapshot restore failed: ${result.issues.map((issue) => issue.message).join("; ")}`);
      this.#tick = snapshot.tick;
    }
    for (const action of this.#ghost.actions) {
      if (action.tick <= this.#tick || action.tick > targetTick) continue;
      this.#simulation.advance(this.#world, this.#tick, action.tick);
      this.#tick = action.tick;
      this.#simulation.apply(this.#world, action);
    }
    this.#simulation.advance(this.#world, this.#tick, targetTick);
    this.#tick = targetTick;
    if (snapshot !== undefined && snapshot.hashes.semantic !== this.semanticHash()
      && targetTick === snapshot.tick) {
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

export type GhostPracticeMode =
  | "exact-practice" | "repetition-drill" | "counterfactual-sandbox"
  | "race-practice" | "coach-assisted";

export interface GhostPracticeChild {
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
