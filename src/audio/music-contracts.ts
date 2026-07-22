import type {
  AudioGraphContext,
  AudioNodePort,
  TemporaryMuteReason,
} from "./mixer";

export const MUSIC_CONTEXT_SCHEMA_VERSION = 1 as const;

export type MusicScene =
  | "main-menu"
  | "preparation"
  | "combat"
  | "boss"
  | "draft"
  | "paused"
  | "victory"
  | "defeat";

export interface MusicRunSessionMetadata {
  readonly runId: string;
  readonly runSeed: string;
  readonly rulesetVersion: string;
  readonly gameVersion: string;
  readonly scoreVersion: string;
}

export type MusicReplayMetadata =
  | Readonly<{
    enabled: true;
    engineVersion: string;
    scoreVersion: string;
    seed: string;
    eventJournalHash: string;
  }>
  | Readonly<{ enabled: false; reason: "disabled" | "fallback" | "not-recorded" }>;

export interface MusicContextSnapshot {
  readonly schemaVersion: typeof MUSIC_CONTEXT_SCHEMA_VERSION;
  readonly sequence: number;
  /** Deterministic monotonic run time; never wall-clock time. */
  readonly timeMs: number;
  readonly scene: MusicScene;
  readonly modeId: string;
  readonly difficultyId: string;
  readonly biomeId: string;
  readonly stageId: string;
  readonly wave: number;
  readonly totalWaves: number;
  readonly bossActive: boolean;
  readonly bossId: string | null;
  readonly bossPhase: number | null;
  readonly playerHealthRatio: number;
  readonly comboRankId: string;
  readonly playerMoving: boolean;
  readonly waveActive?: boolean;
  readonly runPhase?: string;
  readonly liveEnemies?: number;
  readonly queuedEnemies?: number;
  readonly projectileCount?: number;
  readonly horde?: boolean;
  readonly miniBoss?: boolean;
  readonly bossHealthRatio?: number;
  readonly bossIntro?: boolean;
  readonly comboGauge?: number;
  readonly comboMultiplier?: number;
  readonly playerAirborne?: boolean;
}

interface MusicEventBase {
  readonly eventId: string;
  readonly timeMs: number;
}

export type MusicEvent =
  | (MusicEventBase & { readonly type: "scene-changed"; readonly scene: MusicScene })
  | (MusicEventBase & { readonly type: "boss-entered"; readonly bossId: string })
  | (MusicEventBase & {
      readonly type: "boss-phase-changed";
      readonly bossId: string;
      readonly phase: number;
    })
  | (MusicEventBase & { readonly type: "combo-rank-changed"; readonly rankId: string })
  | (MusicEventBase & { readonly type: "perfect-parry"; readonly weaponId: string })
  | (MusicEventBase & { readonly type: "victory" })
  | (MusicEventBase & { readonly type: "defeat" });

export interface MusicBackendHost {
  readonly context: AudioGraphContext;
  readonly output: AudioNodePort;
}

/** One implementation is active at a time; the fallback is initialized only after failure. */
export interface MusicBackend {
  readonly id: string;
  initialize(host: MusicBackendHost): Promise<void>;
  beginRun(metadata: MusicRunSessionMetadata): Promise<void>;
  updateContext(snapshot: MusicContextSnapshot): void;
  emitEvent(event: MusicEvent): void;
  endRun(): Promise<void>;
  setMuteReason(reason: TemporaryMuteReason, muted: boolean): void;
  replayMetadata(): MusicReplayMetadata;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}
