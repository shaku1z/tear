import { createBrowserPlatformServices } from "./browser";
import type { CrazyGamesPlatformOptions, CrazyGamesPlatformServices, CrazyGamesSdkShape } from "./crazygames";
import type { AcknowledgedStorage, PlatformServices, StorageAcknowledgement, Unsubscribe } from "./contracts";
import type { SyncStringStorage } from "./storage";

export interface LegacyPlatformCompatibilityOptions {
  readonly target: "standalone" | "crazygames";
  readonly sdk?: CrazyGamesSdkShape;
  readonly createCrazyGamesServices?: (options: CrazyGamesPlatformOptions) => Promise<CrazyGamesPlatformServices>;
  readonly storage?: SyncStringStorage;
  readonly services?: PlatformServices;
  readonly now?: () => number;
}

export interface LegacyCrazyGamesFacade {
  ready: boolean;
  on: boolean;
  live: boolean;
  env: string;
  init(): Promise<boolean>;
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  setHooks(suspend: () => void, resume: () => void, mute?: (muted: boolean) => void): void;
  adsAvailable(): boolean;
  midgame(onDone?: () => void): void;
  rewarded(onReward?: () => void, onDone?: (success: boolean) => void): void;
  readonly store: {
    readonly acknowledged?: AcknowledgedStorage;
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
}

export interface LegacyPlatformCompatibility {
  readonly CG: LegacyCrazyGamesFacade;
  readonly services: PlatformServices;
}

function defaultStorage(): SyncStringStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

/** Synchronous bridge retained only while classic callers cannot await the storage port. */
function legacyStore(storage: SyncStringStorage | undefined, sdk: CrazyGamesSdkShape | undefined, isLive: () => boolean) {
  const memory = new Map<string, string>();
  const tails = new Map<string, Promise<unknown>>();
  const readBacking = async (key: string, portal = isLive()): Promise<string | null> => {
    if (!storage && !(portal && sdk?.data)) throw new Error("Persistent storage is unavailable");
    const value = portal && sdk?.data ? await sdk.data.getItem(key) : storage?.getItem(key);
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw new TypeError("Invalid persistent storage value");
    return value;
  };
  const writeBacking = async (key: string, value: string, portal: boolean): Promise<void> => {
    if (portal && sdk?.data) await sdk.data.setItem(key, value);
    else if (storage) storage.setItem(key, value);
    else throw new Error("Persistent storage is unavailable");
    memory.set(key, value);
  };
  const acknowledged: AcknowledgedStorage = {
    async read(key) {
      await tails.get(key);
      try { return { status: "committed", value: await readBacking(key) }; }
      catch { return { status: storage || (isLive() && sdk?.data) ? "unknown" : "unavailable", reason: "Backing storage could not be read" }; }
    },
    update(key, change) {
      const operation = (tails.get(key) ?? Promise.resolve()).then(async (): Promise<StorageAcknowledgement<string>> => {
        const portal = isLive();
        if (!storage && !(isLive() && sdk?.data)) return { status: "unavailable", reason: "Persistent storage is unavailable" };
        let value: string;
        try { value = change(await readBacking(key, portal)); }
        catch { return { status: "unknown", reason: "Backing state could not be read or validated" }; }
        try { await writeBacking(key, value, portal); return { status: "committed", value }; }
        catch {
          try { if (await readBacking(key, portal) === value) return { status: "committed", value }; } catch { /* retain uncertainty */ }
          return { status: "unknown", reason: "Write acknowledgement is indeterminate" };
        }
      });
      tails.set(key, operation.then(() => undefined)); return operation;
    },
  };
  return {
    acknowledged,
    get(key: string): string | null {
      if (isLive() && sdk?.data) {
        try {
          const value = sdk.data.getItem(key);
          if (typeof value === "string") return value;
          if (value instanceof Promise) void value.catch(() => undefined);
        } catch { /* use local mirror */ }
      }
      try {
        const value = storage?.getItem(key);
        if (value !== null && value !== undefined) return value;
      } catch { /* use memory mirror */ }
      return memory.get(key) ?? null;
    },
    set(key: string, value: string): void {
      memory.set(key, value);
      if (isLive() && sdk?.data) {
        try {
          const result = sdk.data.setItem(key, value);
          if (result instanceof Promise) void result.catch(() => undefined);
        } catch { /* local mirror still receives the write */ }
      }
      try { storage?.setItem(key, value); } catch { /* memory mirror still receives the write */ }
    },
  };
}

export function createLegacyPlatformCompatibility(options: LegacyPlatformCompatibilityOptions): LegacyPlatformCompatibility {
  const storage = options.storage ?? defaultStorage();
  let services = options.services ?? createBrowserPlatformServices(storage === undefined ? {} : { storage });
  let unsubscribe: Unsubscribe | undefined;
  let suspendHook: () => void = () => { return; };
  let resumeHook: () => void = () => { return; };
  let muteHook: (muted: boolean) => void = () => { return; };
  let loadingRequested = false;
  const now = options.now ?? (() => performance.now());
  let lastAdMs = Number.NEGATIVE_INFINITY;

  const bindLifecycle = () => {
    unsubscribe?.();
    unsubscribe = services.lifecycle.subscribe((event) => {
      if (event.type === "suspend-requested") suspendHook();
      else if (event.type === "resume-requested") resumeHook();
      else if (event.type === "temporary-mute-changed" && event.reason === "portal") muteHook(event.muted);
    });
  };
  bindLifecycle();

  const facade: LegacyCrazyGamesFacade = {
    ready: false,
    on: false,
    live: false,
    env: "disabled",
    async init() {
      if (options.services !== undefined) return false;
      if (options.target !== "crazygames" || !options.sdk || !options.createCrazyGamesServices) return false;
      try {
        const crazyGamesServices = await options.createCrazyGamesServices({
          sdk: options.sdk,
          ...(storage === undefined ? {} : { localStorage: storage }),
        });
        services = crazyGamesServices;
        this.env = crazyGamesServices.environment;
        this.on = crazyGamesServices.active;
        this.live = crazyGamesServices.live;
        this.ready = true;
        bindLifecycle();
        muteHook(options.sdk.game?.settings?.muteAudio === true);
        if (this.on && loadingRequested) services.lifecycle.loadingStarted();
        return this.on;
      } catch {
        this.env = "disabled";
        this.on = false;
        this.live = false;
        return false;
      }
    },
    loadingStart() {
      loadingRequested = true;
      if (this.on) services.lifecycle.loadingStarted();
    },
    loadingStop() {
      loadingRequested = false;
      if (this.on) services.lifecycle.loadingFinished();
    },
    gameplayStart() { if (this.on) services.lifecycle.gameplayStarted(); },
    gameplayStop() { if (this.on) services.lifecycle.gameplayFinished(); },
    happytime() { if (this.on) services.lifecycle.happyMoment(); },
    setHooks(suspend, resume, mute) {
      suspendHook = suspend;
      resumeHook = resume;
      muteHook = mute ?? muteHook;
    },
    adsAvailable() { return services.ads.available; },
    midgame(onDone) {
      if (!services.ads.available || now() - lastAdMs < 45_000) { onDone?.(); return; }
      lastAdMs = now();
      void services.ads.service.showInterstitial().finally(() => { onDone?.(); });
    },
    rewarded(onReward, onDone) {
      if (!services.ads.available) { onDone?.(false); return; }
      void services.ads.service.showRewardedContinue().then((outcome) => {
        const success = outcome === "completed";
        if (success) onReward?.();
        onDone?.(success);
      }, () => { onDone?.(false); });
    },
    store: legacyStore(storage, options.sdk, () => facade.live),
  };

  return {
    CG: facade,
    get services() { return services; },
  };
}
