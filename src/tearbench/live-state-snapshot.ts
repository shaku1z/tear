import type { TearSnapshotV1 } from "./contracts";
import type { CinematicDirectorStateV1 } from "../gameplay/runtime/cinematic-director";
import {
  buildTearIdentityGraph,
  restoreSnapshotTransactionally,
  type TearCodecIssue,
  type TearCodecValue,
  type TearCodecWorld,
  type TearIdentityGraph,
  type TearStateCodecRegistry,
  type TearWorldFactory,
} from "./state-codecs";

type TearStateRecord = Readonly<Record<string, TearCodecValue>>;
interface TearTransformState extends TearStateRecord {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}
interface TearEntityState extends TearTransformState {
  readonly id: string;
}

export interface TearPlayerStateV1 extends TearEntityState {
  readonly id: "player";
  readonly hp: number;
  readonly maxHp: number;
  readonly facing: number;
  readonly onGround: boolean;
}

export interface TearBladeStateV1 extends TearEntityState {
  readonly id: "blade";
  readonly ownerId: "player";
  readonly state: string;
  readonly angle: number;
  readonly weaponId: string;
  readonly targetId?: string;
  readonly stolenBladeId?: string;
}

export interface TearRunStateV1 extends TearStateRecord {
  readonly mode: string;
  readonly difficulty: string;
  readonly stage: number;
  readonly wave: number;
  readonly tick: number;
  readonly score: number;
}

export interface TearWorldStateV1 extends TearStateRecord {
  readonly clock: TearCodecValue;
  readonly camera: TearCodecValue;
  readonly lifecycle: TearCodecValue;
}

export interface TearEnemyStateV1 extends TearEntityState {
  readonly kind: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly dead: boolean;
  readonly targetId?: string;
  readonly summonerId?: string;
}

export interface TearBossStateV1 extends TearEnemyStateV1 {
  readonly bossId: string;
  readonly phase: string | number;
}

export interface TearProjectileStateV1 extends TearEntityState {
  readonly kind: string;
  readonly dead: boolean;
  readonly ownerId?: string;
  readonly targetId?: string;
  readonly platformId?: string;
}

export interface TearPlatformStateV1 extends TearStateRecord {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TearHazardStateV1 extends TearStateRecord {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

export interface TearUiStateV1 extends TearStateRecord {
  readonly screen: string;
  readonly focusId: string | null;
}

export interface TearConfigurationStateV1 extends TearStateRecord {
  readonly rulesetVersion: string;
  readonly values: TearCodecValue;
}

export interface TearRandomStreamStateV1 extends TearStateRecord {
  readonly algorithm: "mulberry32";
  readonly seed: number;
  readonly state: number;
  readonly cursor: number;
}

export type TearRngStateV1 = Readonly<Record<string, TearRandomStreamStateV1>>;

export interface TearLiveCodecPayloadMapV1 {
  readonly "tear.player.v1": TearPlayerStateV1;
  readonly "tear.blade.v1": TearBladeStateV1;
  readonly "tear.run.v1": TearRunStateV1;
  readonly "tear.world.v1": TearWorldStateV1;
  readonly "tear.enemy.v1": readonly TearEnemyStateV1[];
  readonly "tear.boss.v1": readonly TearBossStateV1[];
  readonly "tear.projectile.v1": readonly TearProjectileStateV1[];
  readonly "tear.platform.v1": readonly TearPlatformStateV1[];
  readonly "tear.hazard.v1": readonly TearHazardStateV1[];
  readonly "tear.ui.v1": TearUiStateV1;
  readonly "tear.reward.v1": TearStateRecord;
  readonly "tear.configuration.v1": TearConfigurationStateV1;
  readonly "tear.rng.v1": TearRngStateV1;
  readonly "tear.cinematic.v1": CinematicDirectorStateV1;
}

export interface TearLiveRestoreContext {
  readonly graph: TearIdentityGraph;
  requireIdentity(id: string): Readonly<{ codecId: string; path: string }>;
}

export interface TearLiveWorldAdapter<Candidate> {
  /** Captures the last known-good live state without retaining mutable host objects. */
  capture(): TearCodecWorld;
  /** Rebuilds constructors and object references without mutating the active run. */
  stage(world: TearCodecWorld, context: TearLiveRestoreContext): Candidate;
  validate(candidate: Candidate): readonly string[];
  /** The sole mutation boundary. A failure is followed by a prepared rollback candidate. */
  commit(candidate: Candidate): void;
}

export type TearLiveRestoreResult =
  | Readonly<{ ok: true; exactHash: string; semanticHash: string }>
  | Readonly<{
    ok: false;
    phase: "decode" | "capture" | "stage" | "validate" | "commit";
    issues: readonly TearCodecIssue[];
    rolledBack: boolean;
  }>;

/** A first-world restore has no predecessor to capture or roll back to. */
export interface TearLiveRestoreOptions {
  readonly capturePrevious?: boolean;
}

function worldIssue(message: string): TearCodecIssue {
  return Object.freeze({ codecId: "tear.world.v1", path: "$", message });
}

function cloneWorld(world: TearCodecWorld): TearCodecWorld {
  return {
    components: new Map([...world.components].map(([id, value]) => [id, structuredClone(value)])),
    references: new Map(world.references),
    entityIds: new Set(world.entityIds),
  };
}

function contextFor(world: TearCodecWorld): TearLiveRestoreContext {
  const graph = buildTearIdentityGraph(world);
  return Object.freeze({
    graph,
    requireIdentity(id: string) {
      const identity = graph.identities.get(id);
      if (identity === undefined) throw new RangeError(`identity ${id} does not exist in staged snapshot`);
      return identity;
    },
  });
}

/**
 * Decodes into an isolated codec world, constructs a complete live candidate, and
 * crosses one host mutation boundary. If that boundary throws, the previously
 * captured world is reconstructed and committed as rollback.
 */
export function restoreSnapshotIntoLiveWorld<Candidate>(
  snapshot: TearSnapshotV1,
  registry: TearStateCodecRegistry,
  factory: TearWorldFactory,
  adapter: TearLiveWorldAdapter<Candidate>,
  options: TearLiveRestoreOptions = {},
): TearLiveRestoreResult {
  let decoded: TearCodecWorld | undefined;
  const decodedResult = restoreSnapshotTransactionally(snapshot, registry, factory, {
    replace(world) { decoded = cloneWorld(world); },
  });
  if (!decodedResult.ok) {
    return Object.freeze({ ok: false, phase: "decode", issues: decodedResult.issues, rolledBack: false });
  }
  if (decoded === undefined) {
    return Object.freeze({ ok: false, phase: "decode", issues: [worldIssue("decoded world was not produced")], rolledBack: false });
  }

  let previous: TearCodecWorld | undefined;
  if (options.capturePrevious !== false) {
    try {
      previous = cloneWorld(adapter.capture());
    } catch (error) {
      return Object.freeze({
        ok: false,
        phase: "capture",
        issues: [worldIssue(error instanceof Error ? error.message : String(error))],
        rolledBack: false,
      });
    }
  }

  let candidate: Candidate;
  let rollbackCandidate: Candidate | undefined;
  try {
    candidate = adapter.stage(decoded, contextFor(decoded));
    if (previous !== undefined) rollbackCandidate = adapter.stage(previous, contextFor(previous));
  } catch (error) {
    return Object.freeze({
      ok: false,
      phase: "stage",
      issues: [worldIssue(error instanceof Error ? error.message : String(error))],
      rolledBack: false,
    });
  }
  const candidateIssues = adapter.validate(candidate);
  if (candidateIssues.length > 0) {
    return Object.freeze({
      ok: false,
      phase: "validate",
      issues: Object.freeze(candidateIssues.map(worldIssue)),
      rolledBack: false,
    });
  }

  try {
    adapter.commit(candidate);
  } catch (commitError) {
    if (rollbackCandidate === undefined) return Object.freeze({
      ok: false,
      phase: "commit",
      issues: [worldIssue(commitError instanceof Error ? commitError.message : String(commitError))],
      rolledBack: false,
    });
    try {
      adapter.commit(rollbackCandidate);
    } catch (rollbackError) {
      return Object.freeze({
        ok: false,
        phase: "commit",
        issues: Object.freeze([
          worldIssue(commitError instanceof Error ? commitError.message : String(commitError)),
          worldIssue(`rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`),
        ]),
        rolledBack: false,
      });
    }
    return Object.freeze({
      ok: false,
      phase: "commit",
      issues: [worldIssue(commitError instanceof Error ? commitError.message : String(commitError))],
      rolledBack: true,
    });
  }
  return decodedResult;
}
