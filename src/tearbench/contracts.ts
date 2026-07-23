import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type {
  TearDifficultyId,
  TearEntityKindId,
  TearEventId,
  TearInvariantId,
  TearRunModeId,
  TearWeaponId,
  TearWithinTickPhase,
} from "./registries";

export const TEAR_CONTRACT_FORMAT = "tear-contract";
export const TEAR_CONTRACT_VERSION = 1;

export type TearExecutionClass = "training" | "engineering" | "black-box";
export type TearStateClass =
  | "recorded-canonical"
  | "reconstructed-reachable"
  | "plausible-population"
  | "surgical-valid"
  | "adversarial-impossible";
export type TearObservationClass =
  | "human-equivalent"
  | "structured-state"
  | "privileged-diagnostic"
  | "pixel-only";

export interface TearBuildIdentityV1 {
  readonly version: string;
  readonly revision: string;
  readonly target: string;
  readonly rulesetVersion: string;
  readonly contentHash: string;
  readonly configHash: string;
}

export interface TearProvenanceV1 {
  readonly actor: "human" | "scripted-bot" | "neural-bot" | "hybrid" | "state-forge" | "developer";
  readonly producer: string;
  readonly build: TearBuildIdentityV1;
  readonly executionClass: TearExecutionClass;
  readonly observationClass: TearObservationClass;
  readonly policyId?: string;
  readonly sourceId?: string;
  readonly trainingConsent: "no-training" | "private-personalization-only" | "anonymous-improvement" | "public-training";
}

export interface TearLineageV1 {
  readonly parentId: string;
  readonly relation:
    | "migrated-from" | "repaired-from" | "clipped-from" | "forked-at"
    | "corrected-by" | "minimized-from" | "scenario-from" | "recorded-from-scenario";
  readonly parentRootHash: string;
  readonly forkTick?: number;
}

export interface TearHashSetV1 {
  readonly exact: string;
  readonly semantic: string;
  readonly visual: string;
  readonly progression: string;
  readonly environment: string;
}

export interface TearObservedActorV1 {
  readonly id: string;
  readonly kind: TearEntityKindId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hpRatio?: number;
  readonly state?: string;
  readonly threat?: number;
  readonly ownerId?: string;
}

export interface TearObservationV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "observation";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly tick: number;
  readonly observationClass: TearObservationClass;
  readonly player: Readonly<{
    x: number; y: number; vx: number; vy: number; hp: number; maxHp: number;
    facing: -1 | 1; grounded: boolean; dashCharges: number;
  }>;
  readonly blade: Readonly<{
    handX: number; handY: number; tipX: number; tipY: number;
    vx: number; vy: number; tipSpeed: number; state: string;
  }>;
  readonly entities: readonly TearObservedActorV1[];
  readonly run: Readonly<{
    mode: TearRunModeId; difficulty: TearDifficultyId; weapon: TearWeaponId;
    stage: string; wave: number; score: number; elapsedTicks: number;
  }>;
  readonly diagnostics?: Readonly<{
    worldBounds?: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
    waveComplete?: boolean;
    livingWaveEnemies?: number;
    boss?: Readonly<{ id: string; phase: string; validPhases: readonly string[] }>;
    ui?: Readonly<{ focusedId?: string; focusableIds: readonly string[] }>;
    paused?: boolean;
    progressTick?: number;
    softlockLimitTicks?: number;
  }>;
  readonly availableActions: readonly GameAction["type"][];
}

export interface TearCausalEventV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "event";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly id: string;
  readonly type: TearEventId;
  readonly tick: number;
  readonly phase: TearWithinTickPhase;
  readonly sequence: number;
  readonly source: "engine" | "derived" | "agent" | "developer";
  readonly actorId?: string;
  readonly targetIds?: readonly string[];
  readonly parentIds?: readonly string[];
  readonly confidence?: number;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TearScenarioV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "scenario";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly stateClass: TearStateClass;
  readonly executionClass: TearExecutionClass;
  readonly seed: string;
  readonly start: Readonly<{
    mode: TearRunModeId;
    difficulty: TearDifficultyId;
    weapon: TearWeaponId;
    stage?: string;
    wave?: number;
    boss?: string;
    bossPhase?: string;
  }>;
  readonly maxTicks: number;
  readonly assertions: readonly TearInvariantId[];
  readonly tags: readonly string[];
}

export interface TearSnapshotV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "snapshot";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly id: string;
  readonly tick: number;
  readonly stateClass: TearStateClass;
  readonly seed: string;
  readonly hashes: TearHashSetV1;
  readonly provenance: TearProvenanceV1;
  readonly lineage?: TearLineageV1;
  readonly rng: Readonly<Record<string, Readonly<{ algorithm: string; state: string }>>>;
  readonly codecs: Readonly<Record<string, number>>;
  readonly state: Readonly<Record<string, unknown>>;
}

export interface TearFailureArtifactV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "failure";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly id: string;
  readonly scenarioId: string;
  readonly scenarioVersion: number;
  readonly seed: string;
  readonly build: TearBuildIdentityV1;
  readonly policyId?: string;
  readonly firstFailureTick: number;
  readonly invariantId: TearInvariantId;
  readonly severity: "info" | "warning" | "error" | "fatal";
  readonly message: string;
  readonly startingSnapshotId?: string;
  readonly actions: readonly CommandEnvelope<GameAction>[];
  readonly eventIds: readonly string[];
  readonly hashes: TearHashSetV1;
  readonly attachments: Readonly<Record<string, string>>;
}

export interface GhostRangeV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "ghost-range";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly ghostId: string;
  readonly fromTick: number;
  readonly toTick: number;
  readonly anchorEventId?: string;
  readonly requiredCheckpointId?: string;
  readonly preRollTicks: number;
  readonly postRollTicks: number;
}

export type TearPortableContractV1 =
  | TearObservationV1
  | TearCausalEventV1
  | TearScenarioV1
  | TearSnapshotV1
  | TearFailureArtifactV1
  | GhostRangeV1;

export interface TearContractValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type TearContractValidationResult =
  | Readonly<{ ok: true; value: TearPortableContractV1 }>
  | Readonly<{ ok: false; issues: readonly TearContractValidationIssue[] }>;
