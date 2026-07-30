import type { GameBlade, GameEnemy, GamePlayer, GameProjectile, GameRun } from "../app/game-runtime-state";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type { LiveGhostEngineEvent } from "../replay/legacy-compat";
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { TearCausalEventV1, TearObservationV1, TearScenarioV1 } from "./contracts";
import type { TearSnapshotV1, TearStateClass } from "./contracts";
import type { TearScenarioTransition } from "./runner";
import type { TearLiveRestoreResult, TearLiveWorldAdapter } from "./live-state-snapshot";
import type { StateForgeExitLaunch } from "./state-forge-exit-gate";
import type { TearProgressionLedger } from "./progression-ledger";
import type { TearProgressionReplayResult } from "./progression-replay";
import type { TearSdlResolved } from "./tearsdl";
import type { ScreenAction } from "../presentation/screens/contracts";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";

export type TearRuntimeAccessClass = "A" | "B" | "C";

export interface TearRuntimeEnvironmentMetrics {
  readonly resets: number;
  readonly fixedTicks: number;
  readonly acceptedActions: number;
  readonly emittedEvents: number;
  readonly screenshots: number;
}

export interface LiveObservationPlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly id?: string;
  readonly platformId?: string;
  readonly floor?: boolean;
  readonly oneway?: boolean;
  readonly collidable?: boolean;
  readonly void?: boolean;
  readonly voidLane?: "lower" | "upper";
  readonly voidType?: "plain" | "fire" | "crumble" | "cage";
  readonly voidRole?: string;
  readonly materializationState?: string;
  readonly transferNode?: boolean;
  readonly connectionIds?: readonly string[];
  readonly touchT?: number;
  readonly fireOn?: boolean;
  readonly fireState?: string;
  readonly cageRect?: Readonly<{ x: number; y: number; w: number; h: number }> | null;
}

export interface TearStructuredRuntimeEnvironment {
  readonly accessClass: "A" | "B";
  reset(scenario: TearScenarioV1): TearObservationV1;
  observe(): TearObservationV1;
  step(actions?: readonly CommandEnvelope<GameAction>[]): TearScenarioTransition;
  renderFrame(deltaSeconds: number, actions?: readonly CommandEnvelope<GameAction>[]): TearScenarioTransition;
  actionBatch(entries: readonly Readonly<{
    actions: readonly CommandEnvelope<GameAction>[];
    ticks: number;
  }>[]): readonly TearScenarioTransition[];
  pause(): void;
  resume(): void;
  terminate(): void;
  metrics(): TearRuntimeEnvironmentMetrics;
  events(): readonly TearCausalEventV1[];
  stateHash(): string;
  screenshot(): string;
}

export interface TearClassARuntimeEnvironment extends TearStructuredRuntimeEnvironment {
  readonly accessClass: "A";
  rng(): RunRandomStreamsSnapshot;
  setTimeEffectsForTest(effects: Readonly<{ hitStop?: number; slowMotion?: number; timeScale?: number }>): void;
  captureSnapshot(id: string, stateClass?: TearStateClass): TearSnapshotV1;
  restoreSnapshot(snapshot: TearSnapshotV1): TearLiveRestoreResult;
  forgeExitLaunch(launch: StateForgeExitLaunch): TearLiveRestoreResult;
  forgeWave99Hammer(): TearLiveRestoreResult;
  forgeResolvedScenario(resolved: TearSdlResolved): TearLiveRestoreResult;
}

export interface TearClassBRuntimeEnvironment extends Omit<TearStructuredRuntimeEnvironment, "accessClass" | "rng"> {
  readonly accessClass: "B";
}

export type TearPhysicalInput =
  | Readonly<{ type: "key"; code: string; phase: "pressed" | "released" }>
  | Readonly<{ type: "pointer"; x: number; y: number; button: 0 | 1 | 2; phase: "pressed" | "released" }>;

export interface TearClassCRuntimeEnvironment {
  readonly accessClass: "C";
  screenshot(): string;
  physicalInput(input: TearPhysicalInput): void;
}

export type TearRuntimeEnvironment =
  | TearClassARuntimeEnvironment
  | TearClassBRuntimeEnvironment
  | TearClassCRuntimeEnvironment;

export interface LiveTearRuntimeEnvironmentContext {
  readonly width: number;
  readonly height: number;
  readonly state: Readonly<{
    run(): GameRun | null;
    player(): GamePlayer | undefined;
    blade(): GameBlade | undefined;
    enemies(): GameEnemy[];
    projectiles(): GameProjectile[];
  }>;
  readonly platforms: () => readonly LiveObservationPlatform[];
  readonly actorId: (enemy: GameEnemy) => string;
  readonly stage: () => Readonly<{ name: string }>;
  readonly lifecycle: () => Readonly<{ phase: string }>;
  readonly choiceIds: () => readonly string[];
  readonly progression: () => Readonly<{
    wallet: number;
    lifetimeEarned: number;
    levels: Readonly<Record<string, number>>;
    shop: readonly Readonly<{
      id: string;
      level: number;
      maxLevel: number;
      cost: number;
      enabled: boolean;
    }>[];
  }>;
  readonly outcome: () => RunResultInfo | null;
  readonly screen: () => string;
  readonly setScreen: (screen: "playing" | "paused") => void;
  readonly terminateRun: () => void;
  readonly selectWeapon: (weaponId: string) => void;
  readonly selectBoss: (bossId: string) => void;
  readonly setRunSeed: (seed: number) => void;
  readonly startRun: (
    mode: TearScenarioV1["start"]["mode"],
    difficulty: TearScenarioV1["start"]["difficulty"],
  ) => void;
  readonly stopFrameLoop: () => void;
  readonly startFrameLoop: () => void;
  readonly setSemanticInputAuthority: (active: boolean) => void;
  readonly pushAction: (action: GameAction) => void;
  readonly routeAction: (action: GameAction) => boolean;
  readonly activateControl: (action: ScreenAction) => boolean;
  readonly skipCinematic: () => void;
  readonly resetSemanticInput: () => void;
  /** Restores test-host entity identity allocation before a disposable scenario begins. */
  readonly resetEntityIdentities: () => void;
  readonly advanceFixedTick: () => number;
  readonly advanceApplicationFrame: (deltaSeconds: number) => void;
  readonly advanceRenderFrame: (deltaSeconds: number) => number;
  readonly authoritative: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly random: () => RunRandomStreamsSnapshot;
  readonly render: () => void;
  readonly screenshot: () => string;
  readonly subscribeEngineEvent: (listener: (event: LiveGhostEngineEvent) => void) => () => void;
  readonly drainConsumedActions: () => readonly CommandEnvelope<GameAction>[];
  readonly emitPhysicalInput: (input: TearPhysicalInput) => void;
  readonly setTimeEffectsForTest: (
    effects: Readonly<{ hitStop?: number; slowMotion?: number; timeScale?: number }>,
  ) => void;
  readonly stateForge: TearLiveWorldAdapter<unknown>;
  readonly replayProgression: (ledger: TearProgressionLedger) => TearProgressionReplayResult;
}

export interface TearRuntimeBridgeFactory {
  create(accessClass: "A"): TearClassARuntimeEnvironment;
  create(accessClass: "B"): TearClassBRuntimeEnvironment;
  create(accessClass: "C"): TearClassCRuntimeEnvironment;
}
