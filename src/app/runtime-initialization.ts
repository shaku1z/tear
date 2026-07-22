export interface InstallPromptEvent extends Event {
  preventDefault(): void;
  prompt(): unknown;
}

export interface InstallPromptTarget {
  addEventListener(type: "beforeinstallprompt", listener: (event: InstallPromptEvent) => void): void;
}

export class InstallPromptController {
  #pending: InstallPromptEvent | null = null;

  constructor(target: InstallPromptTarget) {
    target.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.#pending = event;
    });
  }

  get available(): boolean { return this.#pending !== null; }

  prompt(): boolean {
    const pending = this.#pending;
    this.#pending = null;
    if (pending === null) return false;
    try { void pending.prompt(); return true; } catch { return false; }
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createConfigRestorer(config: Record<string, unknown>): () => void {
  const baseline = clone(config);
  return () => {
    for (const key of Object.keys(baseline)) config[key] = clone(baseline[key]);
  };
}

interface PlatformAudioPort {
  init(): void;
  mute(muted: boolean, reason: "ad" | "cg"): void;
}

interface LoadablePort { load(): unknown }

interface PlatformPortalPort {
  setHooks(adStarted: () => void, adFinished: () => void, portalMute: (muted: boolean) => void): void;
  loadingStart(): void;
  loadingStop(): void;
  init(): Promise<unknown>;
}

interface CloudPort<User> {
  init(): Promise<unknown>;
  onChange(listener: (user: User | null, state: string) => void): void;
}

export interface PlatformInitializationOptions<User> {
  readonly audio?: PlatformAudioPort;
  readonly meta: LoadablePort;
  readonly profile: LoadablePort;
  readonly settings: { reload(): void };
  readonly portal: PlatformPortalPort;
  readonly cloud: CloudPort<User>;
  readonly backfillProgress: () => void;
  readonly onCloudChange: (user: User | null, state: string) => void;
}

export function initializePlatformServices<User>(options: PlatformInitializationOptions<User>): void {
  options.audio?.init();
  options.meta.load();
  options.profile.load();
  try { options.backfillProgress(); } catch { /* Existing saves remain usable if backfill fails. */ }
  options.portal.setHooks(
    () => options.audio?.mute(true, "ad"),
    () => options.audio?.mute(false, "ad"),
    (muted) => options.audio?.mute(muted, "cg"),
  );
  options.portal.loadingStart();
  void options.portal.init().then(() => {
    options.meta.load();
    options.profile.load();
    options.settings.reload();
    options.portal.loadingStop();
    return options.cloud.init();
  }).then(() => { options.cloud.onChange(options.onCloudChange); });
}

export interface RenamePromptContext<User extends { readonly guest?: boolean }> {
  readonly state: string;
  readonly user: User | null;
  readonly provider: unknown;
  readonly expectedProvider: unknown;
  readonly username: string;
  readonly alreadyPrompted: boolean;
  readonly screen: string;
  readonly renameActive: boolean;
}

export function shouldPromptForUsername<User extends { readonly guest?: boolean }>(context: RenamePromptContext<User>): boolean {
  return context.state === "signedin" && context.provider === context.expectedProvider && context.user !== null
    && !context.user.guest && context.username.length === 0 && !context.alreadyPrompted
    && context.screen !== "rename" && !context.renameActive;
}
