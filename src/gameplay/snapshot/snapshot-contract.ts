import type { RunRandomStreamsSnapshot } from "../../simulation/run-random";
import type { EnvironmentObjectKind } from "../environment/environment-object-kinds";

/**
 * The portable snapshot contract: one tick of game state with its codec versions, hashes and provenance,
 * plus the environment observation the codecs project. TearBench, replays and the playtest tool share it.
 */

export const TEAR_CONTRACT_FORMAT = "tear-contract";
export const TEAR_CONTRACT_VERSION = 1;

export type TearExecutionClass = "training" | "engineering" | "black-box";
export type TearStateClass =
  | "recorded-canonical"
  | "reconstructed-reachable"
  | "plausible-population"
  | "surgical-valid"
  | "adversarial-impossible";
export type TearObservationClass = "human-equivalent" | "structured-state" | "privileged-diagnostic" | "pixel-only";

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
  readonly trainingConsent:
    "no-training" | "private-personalization-only" | "anonymous-improvement" | "public-training";
}

export interface TearLineageV1 {
  readonly parentId: string;
  readonly relation:
    | "migrated-from"
    | "repaired-from"
    | "clipped-from"
    | "forked-at"
    | "corrected-by"
    | "minimized-from"
    | "scenario-from"
    | "recorded-from-scenario";
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

export interface TearObservedBoundsV1 {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface TearObservedEnvironmentFieldV1 {
  readonly [authoredDetail: string]: unknown;
  readonly id: string;
  readonly kind: EnvironmentObjectKind;
  readonly bounds: TearObservedBoundsV1;
  readonly state: string;
  readonly active: boolean;
  readonly ownerId?: string;
  readonly eligibility?: Readonly<{ player: boolean; enemies: boolean; bosses: boolean }>;
}

export interface TearObservedEnvironmentCombatObjectV1 {
  readonly [authoredDetail: string]: unknown;
  readonly id: string;
  readonly kind: EnvironmentObjectKind;
  readonly ownerId?: string;
  readonly targetId?: string;
  readonly bounds: TearObservedBoundsV1;
  readonly integrityRatio: number;
  readonly state: string;
  readonly counterplayTags: readonly string[];
  readonly procEligible: boolean;
}

export interface TearObservedEnvironmentRouteV1 {
  readonly [authoredDetail: string]: unknown;
  readonly id: string;
  readonly kind: EnvironmentObjectKind;
  readonly points: readonly Readonly<{ x: number; y: number }>[];
  readonly state: string;
  readonly ownerId?: string;
}

export interface TearEnvironmentObservationV1 {
  readonly fields: readonly TearObservedEnvironmentFieldV1[];
  readonly combatObjects: readonly TearObservedEnvironmentCombatObjectV1[];
  readonly routes: readonly TearObservedEnvironmentRouteV1[];
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

/** Immutable run-start facts captured before natural opening content consumes RNG. */
export interface ProductionReplayBootstrap {
  readonly build: TearBuildIdentityV1;
  readonly rng: RunRandomStreamsSnapshot;
  readonly applicationFramePolicy?: Readonly<{ version: 1; kind: "generated-step-intro"; secondsPerStep: number }>;
}
