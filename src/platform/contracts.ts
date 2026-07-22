export type Unsubscribe = () => void;

export type Capability<T> =
  | Readonly<{ available: true; service: T }>
  | Readonly<{ available: false; reason: string }>;

export const available = <T>(service: T): Capability<T> => Object.freeze({ available: true, service });
export const unavailable = <T = never>(reason: string): Capability<T> => Object.freeze({ available: false, reason });

export type TemporaryPlatformMuteReason = "ad" | "portal" | "platform-suspend";

export type PlatformLifecycleEvent =
  | Readonly<{ type: "focus-changed"; focused: boolean }>
  | Readonly<{ type: "visibility-changed"; visible: boolean }>
  | Readonly<{ type: "suspend-requested"; reason: "ad" | "platform" }>
  | Readonly<{ type: "resume-requested"; reason: "ad" | "platform" }>
  | Readonly<{ type: "temporary-mute-changed"; reason: TemporaryPlatformMuteReason; muted: boolean }>;

export interface LifecycleService {
  readonly focused: boolean;
  readonly visible: boolean;
  subscribe(listener: (event: PlatformLifecycleEvent) => void): Unsubscribe;
  loadingStarted(): void;
  loadingFinished(): void;
  gameplayStarted(): void;
  gameplayFinished(): void;
  happyMoment(): void;
}

export interface PlayerIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export interface IdentityService {
  current(): Promise<PlayerIdentity | null>;
  signIn(): Promise<PlayerIdentity | null>;
  signOut(): Promise<void>;
  subscribe?(listener: (identity: PlayerIdentity | null) => void): Unsubscribe;
}

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface CloudSaveRecord {
  readonly value: string;
  readonly revision: number;
  readonly updatedAtMs: number;
  readonly conflictToken?: string;
}

export interface CloudSaveService {
  load(slot: string): Promise<CloudSaveRecord | null>;
  save(slot: string, record: CloudSaveRecord): Promise<void>;
}

export interface LeaderboardEntry {
  readonly playerId: string;
  readonly displayName: string;
  readonly score: number;
  readonly rank?: number;
  readonly replayId?: string;
}

export interface LeaderboardsService {
  submit(board: string, score: number, replayId?: string): Promise<void>;
  entries(board: string, limit: number): Promise<readonly LeaderboardEntry[]>;
  publishReplay(value: string): Promise<string>;
  loadReplay(id: string): Promise<string | null>;
}

export type AdOutcome = "completed" | "skipped" | "unavailable" | "error";

export interface AdsService {
  showInterstitial(): Promise<AdOutcome>;
  showRewardedContinue(): Promise<AdOutcome>;
}

export interface AchievementsService {
  unlock(id: string): Promise<void>;
  setProgress(id: string, current: number, target: number): Promise<void>;
}

export type AnalyticsValue = string | number | boolean | null;

export interface AnalyticsService {
  event(name: string, properties?: Readonly<Record<string, AnalyticsValue>>): void;
}

export interface FullscreenService {
  readonly active: boolean;
  enter(): Promise<boolean>;
  exit(): Promise<boolean>;
}

export interface OverlayService {
  open(url: string): Promise<boolean>;
}

/** The composition root supplies this object; domain code never probes browser or SDK globals. */
export interface PlatformServices {
  readonly id: "browser" | "crazygames" | "steam" | "console" | (string & {});
  readonly lifecycle: LifecycleService;
  readonly settingsStorage: KeyValueStorage;
  readonly profileStorage: KeyValueStorage;
  readonly identity: Capability<IdentityService>;
  readonly cloudSave: Capability<CloudSaveService>;
  readonly leaderboards: Capability<LeaderboardsService>;
  readonly ads: Capability<AdsService>;
  readonly achievements: Capability<AchievementsService>;
  readonly analytics: Capability<AnalyticsService>;
  readonly fullscreen: Capability<FullscreenService>;
  readonly overlay: Capability<OverlayService>;
}
