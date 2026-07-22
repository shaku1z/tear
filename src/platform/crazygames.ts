import {
  available,
  unavailable,
  type AchievementsService,
  type AdOutcome,
  type AdsService,
  type AnalyticsService,
  type CloudSaveRecord,
  type CloudSaveService,
  type IdentityService,
  type KeyValueStorage,
  type LeaderboardEntry,
  type LeaderboardsService,
  type LifecycleService,
  type OverlayService,
  type PlatformServices,
  type PlayerIdentity,
} from "./contracts";
import { createLifecycleController } from "./lifecycle";
import { createSafeStorage, type SyncStringStorage } from "./storage";

type MaybePromise<T> = T | Promise<T>;

export interface CrazyGamesUser {
  readonly username: string;
  readonly profilePictureUrl?: string;
  readonly userId?: string;
  readonly __dangerousUserId?: string;
}

export interface CrazyGamesSdkShape {
  init(): Promise<void>;
  readonly environment?: string;
  readonly game?: {
    readonly settings?: { readonly muteAudio?: boolean };
    addSettingsChangeListener?(listener: () => void): void;
    loadingStart?(): void;
    loadingStop?(): void;
    gameplayStart?(): void;
    gameplayStop?(): void;
    happytime?(): void;
    openOverlay?(url: string): MaybePromise<boolean | undefined>;
  };
  readonly data?: {
    getItem(key: string): MaybePromise<string | null>;
    setItem(key: string, value: string): MaybePromise<void>;
    removeItem?(key: string): MaybePromise<void>;
  };
  readonly ad?: {
    requestAd(type: "midgame" | "rewarded", callbacks: {
      adStarted(): void;
      adFinished(): void;
      adError(error?: unknown): void;
    }): void;
  };
  readonly user?: {
    getUser(): MaybePromise<CrazyGamesUser | null>;
    showAuthPrompt?(): MaybePromise<CrazyGamesUser | null>;
    signOut?(): MaybePromise<void>;
    addAuthListener?(listener: (user: CrazyGamesUser | null) => void): void;
  };
  readonly leaderboards?: {
    submit(board: string, score: number, replayId?: string): MaybePromise<void>;
    entries(board: string, limit: number): MaybePromise<readonly LeaderboardEntry[]>;
    publishReplay(value: string): MaybePromise<string>;
    loadReplay(id: string): MaybePromise<string | null>;
  };
  readonly achievements?: {
    unlock(id: string): MaybePromise<void>;
    setProgress(id: string, current: number, target: number): MaybePromise<void>;
  };
  readonly analytics?: {
    event(name: string, properties?: Readonly<Record<string, string | number | boolean | null>>): void;
  };
}

export interface CrazyGamesPlatformOptions {
  readonly sdk: CrazyGamesSdkShape;
  readonly localStorage?: SyncStringStorage;
}

export interface CrazyGamesPlatformServices extends PlatformServices {
  readonly id: "crazygames";
  readonly environment: string;
  readonly active: boolean;
  readonly live: boolean;
}

function player(value: CrazyGamesUser | null): PlayerIdentity | null {
  if (!value) return null;
  const id = value.userId ?? value.__dangerousUserId;
  if (!id) return null;
  return Object.freeze({
    id,
    displayName: value.username,
    ...(value.profilePictureUrl === undefined ? {} : { avatarUrl: value.profilePictureUrl }),
  });
}

function createSdkStorage(
  sdk: CrazyGamesSdkShape,
  active: boolean,
  local: KeyValueStorage,
  prefix: string,
): KeyValueStorage {
  const keyFor = (key: string) => `${prefix}${key}`;
  return {
    async get(key) {
      if (active && sdk.data) {
        try {
          const remote = await sdk.data.getItem(keyFor(key));
          if (remote != null) return remote;
        } catch { /* fall through to the safe local mirror */ }
      }
      return local.get(key);
    },
    async set(key, value) {
      await local.set(key, value);
      if (active && sdk.data) {
        try { await sdk.data.setItem(keyFor(key), value); } catch { /* local mirror succeeded */ }
      }
    },
    async remove(key) {
      await local.remove(key);
      if (active && sdk.data?.removeItem) {
        try { await sdk.data.removeItem(keyFor(key)); } catch { /* local mirror succeeded */ }
      }
    },
  };
}

function identityService(sdk: CrazyGamesSdkShape): IdentityService {
  return {
    async current() { return player(await sdk.user?.getUser() ?? null); },
    async signIn() { return player(await sdk.user?.showAuthPrompt?.() ?? await sdk.user?.getUser() ?? null); },
    async signOut() { await sdk.user?.signOut?.(); },
    subscribe(listener) {
      if (!sdk.user?.addAuthListener) return () => undefined;
      let active = true;
      sdk.user.addAuthListener((user) => { if (active) listener(player(user)); });
      return () => { active = false; };
    },
  };
}

function createCloudSave(storage: KeyValueStorage): CloudSaveService {
  return {
    async load(slot) {
      const raw = await storage.get(`cloud.${slot}`);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<CloudSaveRecord>;
        if (typeof parsed.value !== "string" || typeof parsed.revision !== "number"
          || !Number.isSafeInteger(parsed.revision) || typeof parsed.updatedAtMs !== "number") return null;
        return {
          value: parsed.value,
          revision: parsed.revision,
          updatedAtMs: parsed.updatedAtMs,
          ...(typeof parsed.conflictToken === "string" ? { conflictToken: parsed.conflictToken } : {}),
        };
      } catch { return null; }
    },
    async save(slot, record) { await storage.set(`cloud.${slot}`, JSON.stringify(record)); },
  };
}

function createAds(sdk: CrazyGamesSdkShape, lifecycle: ReturnType<typeof createLifecycleController>): AdsService {
  const request = (type: "midgame" | "rewarded"): Promise<AdOutcome> => new Promise((resolve) => {
    if (!sdk.ad) { resolve("unavailable"); return; }
    let settled = false;
    let started = false;
    const finish = (outcome: AdOutcome) => {
      if (settled) return;
      settled = true;
      lifecycle.emit({ type: "temporary-mute-changed", reason: "ad", muted: false });
      if (started) lifecycle.emit({ type: "resume-requested", reason: "ad" });
      resolve(outcome);
    };
    try {
      sdk.ad.requestAd(type, {
        adStarted() {
          if (started) return;
          started = true;
          lifecycle.emit({ type: "suspend-requested", reason: "ad" });
          lifecycle.emit({ type: "temporary-mute-changed", reason: "ad", muted: true });
        },
        adFinished() { finish("completed"); },
        adError() { finish("error"); },
      });
    } catch { finish("error"); }
  });
  return {
    showInterstitial: () => request("midgame"),
    showRewardedContinue: () => request("rewarded"),
  };
}

function lifecycleService(sdk: CrazyGamesSdkShape, active: boolean) {
  const controller = createLifecycleController();
  const call = (operation: (() => void) | undefined) => {
    if (!active) return;
    try { operation?.(); } catch { /* portal lifecycle calls are advisory */ }
  };
  const service: LifecycleService = {
    get focused() { return controller.focused; },
    get visible() { return controller.visible; },
    subscribe: (listener) => controller.subscribe(listener),
    loadingStarted: () => { call(sdk.game?.loadingStart?.bind(sdk.game)); },
    loadingFinished: () => { call(sdk.game?.loadingStop?.bind(sdk.game)); },
    gameplayStarted: () => { call(sdk.game?.gameplayStart?.bind(sdk.game)); },
    gameplayFinished: () => { call(sdk.game?.gameplayStop?.bind(sdk.game)); },
    happyMoment: () => { call(sdk.game?.happytime?.bind(sdk.game)); },
  };
  return { controller, service };
}

/** Initializes an injected SDK. No module-level CrazyGames global is read. */
export async function createCrazyGamesPlatformServices(options: CrazyGamesPlatformOptions): Promise<CrazyGamesPlatformServices> {
  const { sdk } = options;
  let active = false;
  let live = false;
  let environment = "disabled";
  try {
    await sdk.init();
    environment = sdk.environment ?? "disabled";
    active = environment === "crazygames" || environment === "local";
    live = environment === "crazygames";
  } catch { /* the full service object still degrades safely */ }

  const lifecycle = lifecycleService(sdk, active);
  if (active && sdk.game?.addSettingsChangeListener) {
    const applyPortalMute = () => {
      lifecycle.controller.emit({
        type: "temporary-mute-changed",
        reason: "portal",
        muted: sdk.game?.settings?.muteAudio === true,
      });
    };
    try { sdk.game.addSettingsChangeListener(applyPortalMute); applyPortalMute(); } catch { /* optional SDK setting */ }
  }

  const settingsLocal = createSafeStorage(options.localStorage);
  const profileLocal = createSafeStorage(options.localStorage);
  const settingsStorage = createSdkStorage(sdk, active, settingsLocal, "");
  const profileStorage = createSdkStorage(sdk, active, profileLocal, "");
  const leaderboardService: LeaderboardsService | undefined = sdk.leaderboards ? {
    submit: async (board, score, replayId) => { await sdk.leaderboards?.submit(board, score, replayId); },
    entries: async (board, limit) => await sdk.leaderboards?.entries(board, limit) ?? [],
    publishReplay: async (value) => await sdk.leaderboards?.publishReplay(value) ?? "",
    loadReplay: async (id) => await sdk.leaderboards?.loadReplay(id) ?? null,
  } : undefined;
  const achievementsService: AchievementsService | undefined = sdk.achievements ? {
    unlock: async (id) => { await sdk.achievements?.unlock(id); },
    setProgress: async (id, current, target) => { await sdk.achievements?.setProgress(id, current, target); },
  } : undefined;
  const analyticsService: AnalyticsService | undefined = sdk.analytics ? {
    event: (name, properties) => sdk.analytics?.event(name, properties),
  } : undefined;
  const overlayService: OverlayService | undefined = sdk.game?.openOverlay ? {
    async open(url) {
      try { return await sdk.game?.openOverlay?.(url) !== false; } catch { return false; }
    },
  } : undefined;

  return Object.freeze({
    id: "crazygames",
    environment,
    active,
    live,
    lifecycle: lifecycle.service,
    settingsStorage,
    profileStorage,
    identity: active && sdk.user ? available(identityService(sdk)) : unavailable("CrazyGames identity is unavailable."),
    cloudSave: active && sdk.data ? available(createCloudSave(profileStorage)) : unavailable("CrazyGames cloud data is unavailable."),
    leaderboards: leaderboardService ? available(leaderboardService) : unavailable("This build has no leaderboard publication provider."),
    ads: live && sdk.ad ? available(createAds(sdk, lifecycle.controller)) : unavailable("Ads are only available on the live CrazyGames portal."),
    achievements: achievementsService ? available(achievementsService) : unavailable("CrazyGames achievements are unavailable."),
    analytics: analyticsService ? available(analyticsService) : unavailable("CrazyGames analytics are unavailable."),
    fullscreen: unavailable("Fullscreen is managed by CrazyGames."),
    overlay: overlayService ? available(overlayService) : unavailable("CrazyGames overlay is unavailable."),
  });
}
