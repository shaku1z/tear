import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type {
  TearDifficultyId,
  TearBossId,
  TearEntityKindId,
  TearEventId,
  TearInvariantId,
  TearRunModeId,
  TearWeaponId,
  TearWithinTickPhase,
} from "./registries";
import type {
  TEAR_CONTRACT_FORMAT,
  TEAR_CONTRACT_VERSION,
  TearBuildIdentityV1,
  TearEnvironmentObservationV1,
  TearExecutionClass,
  TearHashSetV1,
  TearObservationClass,
  TearObservedBoundsV1,
  TearSnapshotV1,
  TearStateClass,
} from "../gameplay/snapshot/snapshot-contract";

export interface TearObservedActorV1 {
  readonly id: string;
  readonly kind: TearEntityKindId;
  /** Public-safe authored identity; executable variant callbacks never cross this boundary. */
  readonly variantId?: string;
  readonly variantName?: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hpRatio?: number;
  readonly state?: string;
  readonly behaviorMode?: string;
  readonly halfWidth?: number;
  readonly halfHeight?: number;
  readonly contactReach?: number;
  readonly contactDamage?: number;
  readonly chargeMult?: number;
  readonly auraDmg?: number;
  readonly stun?: number;
  readonly bound?: number;
  readonly contactEnabled?: boolean;
  readonly radius?: number;
  readonly damage?: number;
  readonly counterplay?: string;
  readonly unparryable?: boolean;
  readonly threat?: number;
  readonly ownerId?: string;
}

export interface TearObservedSurfaceV1 {
  readonly id: string;
  readonly bounds: TearObservedBoundsV1;
  readonly oneWay: boolean;
  readonly collidable: boolean;
  readonly materializationState: string;
  readonly lane?: "lower" | "upper";
  readonly role?: string;
  readonly transferNode?: boolean;
  readonly connectionIds: readonly string[];
}

export interface TearObservedHazardV1 {
  readonly id: string;
  readonly surfaceId: string;
  readonly type: "fire" | "crumble" | "cage";
  readonly state: string;
  readonly active: boolean;
  readonly bounds: TearObservedBoundsV1;
}

export interface TearNavigationObservationV1 {
  readonly surfaces: readonly TearObservedSurfaceV1[];
  readonly hazards: readonly TearObservedHazardV1[];
}

export interface TearObservationV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "observation";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly tick: number;
  readonly observationClass: TearObservationClass;
  readonly player: Readonly<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    maxHp: number;
    facing: -1 | 1;
    grounded: boolean;
    dashCharges: number;
    halfWidth?: number;
    halfHeight?: number;
    dashTimer?: number;
    dashCooldown?: number;
    iframe?: number;
    maxCharges?: number;
  }>;
  readonly blade: Readonly<{
    handX: number;
    handY: number;
    tipX: number;
    tipY: number;
    vx: number;
    vy: number;
    tipSpeed: number;
    state: string;
    chambers?: number;
    chamberCooldown?: number;
    fireCooldown?: number;
    wheelSpin?: number;
    reversalCount?: number;
  }>;
  readonly entities: readonly TearObservedActorV1[];
  /** Structured world geometry available to Class A and Class B observers; never a Class C affordance. */
  readonly navigation?: TearNavigationObservationV1;
  /** Additive gameplay environment facts; unavailable to Class-C pixel observers. */
  readonly environment?: TearEnvironmentObservationV1;
  readonly run: Readonly<{
    mode: TearRunModeId;
    difficulty: TearDifficultyId;
    weapon: TearWeaponId;
    stage: string;
    wave: number;
    score: number;
    elapsedTicks: number;
  }>;
  readonly diagnostics?: Readonly<{
    worldBounds?: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>;
    waveComplete?: boolean;
    livingWaveEnemies?: number;
    waveOwnership?: "source-events" | "unavailable";
    boss?: Readonly<{ id: string; phase: string; validPhases: readonly string[]; homeStage: string }>;
    ui?: Readonly<{ focusedId?: string; focusableIds: readonly string[] }>;
    paused?: boolean;
    lifecyclePhase?: string;
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

export type TearScenarioBackendV1 = "live" | "headless";

export type TearScenarioSubjectV1 = Readonly<
  | { kind: "gameplay"; id: string }
  | { kind: "weapon"; id: TearWeaponId }
  | { kind: "boss"; id: TearBossId }
  | { kind: "environment-field"; id: string }
  | { kind: "environment-combat-object"; id: string }
>;

export interface TearScenarioV1 {
  readonly format: typeof TEAR_CONTRACT_FORMAT;
  readonly kind: "scenario";
  readonly schemaVersion: typeof TEAR_CONTRACT_VERSION;
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly stateClass: TearStateClass;
  readonly executionClass: TearExecutionClass;
  /** Optional for existing V1 recordings; required on current canonical scenarios. */
  readonly subject?: TearScenarioSubjectV1;
  /** Optional for existing V1 recordings; declared current backends must be enforced. */
  readonly backends?: readonly TearScenarioBackendV1[];
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

/** Current catalog scenarios retain authority that historical V1 recordings never declared. */
export interface TearCanonicalScenarioV1 extends TearScenarioV1 {
  readonly subject: TearScenarioSubjectV1;
  readonly backends: readonly [TearScenarioBackendV1, ...TearScenarioBackendV1[]];
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
  TearObservationV1 | TearCausalEventV1 | TearScenarioV1 | TearSnapshotV1 | TearFailureArtifactV1 | GhostRangeV1;

export interface TearContractValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type TearContractValidationResult =
  | Readonly<{ ok: true; value: TearPortableContractV1 }>
  | Readonly<{ ok: false; issues: readonly TearContractValidationIssue[] }>;
