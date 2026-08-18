import type { CommandEnvelope } from "../domain/envelopes";
import type { ScreenAction } from "../domain/screen-actions";
import type { GameAction } from "../input/game-action";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { TearSemanticEngineEventV1 } from "./gameplay-causal-events";
import type { RunRandomStreamsSnapshot } from "../simulation/run-random";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { TearCausalEventV1, TearObservationV1, TearScenarioV1 } from "./contracts";
import type { TearSnapshotV1, TearStateClass } from "./contracts";
import type { TearScenarioTransition } from "./runner";
import type { TearLiveRestoreResult, TearLiveWorldAdapter } from "./live-state-snapshot";
import type { StateForgeExitLaunch } from "./state-forge-exit-gate";
import type { TearProgressionLedger } from "./progression-ledger";
import type { TearProgressionReplayResult } from "./progression-replay";
import type { TearSdlResolved } from "./tearsdl";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";
import type { FinaleIntent } from "../gameplay/campaign/finale-controller";
import type { FinaleOutwardCall } from "../gameplay/campaign/finale-outward-call";
import type { AudioDispatchReceipt } from "../audio/audio-dispatch-receipts";
import type { OutcomeChronologyEntry } from "../gameplay/run/outcome-chronology-journal";
import type {
  TearSimulationEnemyView,
  TearSimulationWorldView,
} from "../simulation/runtime-world-port";

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
  /**
   * Advances the real application-frame path for privileged cinematic evidence.
   * This is deliberately separate from fixed-step and render-profile stepping:
   * application code may advance zero or several authoritative simulation ticks.
   */
  advanceApplicationFrame(
    deltaSeconds: number,
    options?: Readonly<{ skipCinematic?: boolean }>,
  ): Readonly<{ beforeTick: number; afterTick: number; fixedTickDelta: number }>;
  /**
   * Advances exactly one authored cinematic beat through the live director.
   * This Class-A test-build capability is deliberately semantic: it never
   * drives a renderer clock or substitutes a simulation tick.
   */
  advanceStateForgeCinematicBeat(): Readonly<{ advanced: boolean; tick: number }>;
  /**
   * The authoritative canonical verification state of the last executed tick.
   * Class A is privileged diagnostics: this observes what the production step
   * already hashed, and is never an alternative source of truth for it.
   */
  canonicalState(): unknown;
  /** Native-only, post-origin semantic facts with a host-independent local ordering. */
  engineEventProjection(): readonly TearSemanticEngineEventV1[];
  /** Exact immutable portable finale intent batches emitted since reset. */
  finaleIntentProjection(): readonly (readonly FinaleIntent[])[];
  /** Successful outward finale adapter calls emitted since reset, in dispatch order. */
  finaleOutwardProjection(): readonly FinaleOutwardCall[];
  /** Diagnostic software scheduling receipts since reset; never evidence of audible output. */
  audioDispatchProjection(): readonly AudioDispatchReceipt[];
  /** Immutable terminal-outcome and finale outward receipts since reset. */
  outcomeChronologyProjection(): readonly OutcomeChronologyEntry[];
  setTimeEffectsForTest(effects: Readonly<{ hitStop?: number; slowMotion?: number; timeScale?: number }>): void;
  captureSnapshot(id: string, stateClass?: TearStateClass): TearSnapshotV1;
  restoreSnapshot(snapshot: TearSnapshotV1): TearLiveRestoreResult;
  forgeExitLaunch(launch: StateForgeExitLaunch): TearLiveRestoreResult;
  forgeWave99Hammer(): TearLiveRestoreResult;
  /** Resumes a certified wave-49 campaign frontier through the production wave controller. */
  forgeCampaignFinalWave(): TearLiveRestoreResult;
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
  readonly state: TearSimulationWorldView;
  readonly platforms: () => readonly LiveObservationPlatform[];
  /** World-owned stage geometry used by the certified State Forge frontier. */
  readonly platformsForStage: (index: number) => readonly unknown[];
  readonly actorId: (enemy: TearSimulationEnemyView) => string;
  readonly stage: () => Readonly<{ name: string; index: number }>;
  readonly lifecycle: () => Readonly<{ phase: string; wave?: number | null; bossWave?: boolean; reward?: string | null }>;
  readonly bossIntroActive: () => boolean;
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
  /** Test-build/Class-A bridge to one real cinematic-director transition. */
  readonly advanceStateForgeCinematicBeat: () => boolean;
  readonly resetSemanticInput: () => void;
  /** Restores test-host entity identity allocation before a disposable scenario begins. */
  readonly resetEntityIdentities: () => void;
  readonly advanceFixedTick: () => number;
  readonly advanceApplicationFrame: (deltaSeconds: number) => void;
  readonly advanceRenderFrame: (deltaSeconds: number) => number;
  readonly authoritative: () => Readonly<{ tick: number; stateHash: string; state?: unknown }> | null;
  /**
   * Exact post-step state from the C30/C27A authoritative composition.  This
   * is deliberately separate from TearBench's projected observation: a C32
   * V3 policy must never reconstruct its model input from an observation.
   */
  readonly canonicalGameplayState: () => CanonicalGameplayState | null;
  /** Legal semantic action kinds advertised by the same live world/router. */
  readonly availableGameActions: () => readonly GameAction["type"][];
  readonly random: () => RunRandomStreamsSnapshot;
  readonly render: () => void;
  readonly screenshot: () => string;
  readonly subscribeEngineEvent: (listener: (event: TearGameplayEvent) => void) => () => void;
  readonly drainConsumedActions: () => readonly CommandEnvelope<GameAction>[];
  readonly emitPhysicalInput: (input: TearPhysicalInput) => void;
  readonly setTimeEffectsForTest: (
    effects: Readonly<{ hitStop?: number; slowMotion?: number; timeScale?: number }>,
  ) => void;
  readonly stateForge: TearLiveWorldAdapter<unknown>;
  readonly replayProgression: (ledger: TearProgressionLedger) => TearProgressionReplayResult;
  /** Narrow privileged bridge used to resume a certified State Forge wave frontier. */
  readonly loadStage: (index: number) => void;
  /** Dispatches the production wave controller rather than restating wave planning in TearBench. */
  readonly startNextWave: () => void;
  /** Commits the two validated health fields of a surgical boss-finisher child in place. */
  readonly applyBossFinisher: (bossId: string, remainingHp: 1) => void;
  /** Keeps production-installed upgrade closures across a data-only codec reconstruction. */
  readonly captureProgressionRuntime: () => unknown;
  readonly restoreProgressionRuntime: (runtime: unknown) => void;
  readonly finaleIntents: () => readonly (readonly FinaleIntent[])[];
  readonly finaleOutwardCalls: () => readonly FinaleOutwardCall[];
  /** Test-build-only software scheduling receipts; absent from ordinary runtime fixtures. */
  readonly audioDispatchReceipts?: () => readonly AudioDispatchReceipt[];
  /** Test-build-only in-memory outcome receipts; absent in ordinary runtime fixtures. */
  readonly outcomeChronology?: () => readonly OutcomeChronologyEntry[];
}

export interface TearRuntimeBridgeFactory {
  create(accessClass: "A"): TearClassARuntimeEnvironment;
  create(accessClass: "B"): TearClassBRuntimeEnvironment;
  create(accessClass: "C"): TearClassCRuntimeEnvironment;
}
