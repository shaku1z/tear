import type { IdentityService, PlatformServices, Unsubscribe } from "./contracts";

export type CloudStatus = "local" | "guest" | "signedin";

export interface CloudUser {
  readonly id: string;
  readonly name: string;
  readonly guest: boolean;
  readonly avatar?: string;
}

export interface LegacyProfilePort {
  readonly data: Record<string, unknown>;
  username(): string;
  usernameSetAt(): number;
  setUsername(name: string): void;
  merge(remote: unknown): void;
  save(): void;
}

export interface LegacyMetaPort {
  readonly data: Record<string, unknown>;
  merge(remote: unknown): void;
  save(): void;
}

export interface CloudSavePayload {
  readonly profile: Record<string, unknown>;
  readonly meta: Record<string, unknown>;
}

export interface AccountContext {
  setUser(user: CloudUser, status: CloudStatus, silent?: boolean): void;
  sync(): Promise<void>;
}

export type SignInResult = boolean | Readonly<{ status: "needsRetry"; code: string }>;

export interface AccountProvider {
  readonly kind: "local" | "crazygames" | "firebase";
  readonly signInLabel?: string;
  init(context: AccountContext): Promise<void>;
  signIn?(context: AccountContext): Promise<SignInResult>;
  signOut?(context: AccountContext): Promise<void>;
  load?(context: AccountContext): Promise<CloudSavePayload | null>;
  save?(context: AccountContext, payload: CloudSavePayload): Promise<void>;
  dispose?(): void;
}

export interface ScoreEntry extends Record<string, unknown> {
  name?: string;
  score: number;
  wave?: number;
  time?: number;
}

export interface SharedCloudService {
  readonly available: boolean;
  submitScore(mode: string, difficulty: string, entry: ScoreEntry): Promise<boolean>;
  topScores(mode: string, difficulty: string, limit: number): Promise<readonly Record<string, unknown>[] | null>;
  logEvent(name: string, data: Record<string, unknown>): void;
  publishReplay(recording: Record<string, unknown>, summary: Record<string, unknown> | null, fixedIdPrefix?: string): Promise<string | null>;
  loadReplay(shareId: string): Promise<Record<string, unknown> | null>;
  replayFeed(limit: number): Promise<readonly Record<string, unknown>[] | null>;
  linkReplay(mode: string, difficulty: string, shareId: string): Promise<boolean>;
  loadGhost(mode: string, difficulty: string): Promise<Record<string, unknown> | null>;
}

export interface CloudCompatibilityOptions {
  readonly target: "standalone" | "crazygames";
  readonly getPlatform: () => PlatformServices;
  readonly getProfile: () => LegacyProfilePort;
  readonly getMeta: () => LegacyMetaPort;
  readonly firebaseAccount?: AccountProvider;
  readonly shared: SharedCloudService;
  readonly now?: () => number;
}

export interface LegacyCloudFacade {
  provider: AccountProvider | null;
  user: CloudUser | null;
  status: CloudStatus;
  ready: boolean;
  authRetryPrompt: boolean;
  init(): Promise<CloudStatus>;
  onChange(listener: (user: CloudUser | null, status: CloudStatus) => void): void;
  loggedIn(): boolean;
  displayName(): string;
  hasCustomName(): boolean;
  canRename(): boolean;
  renameCooldownDays(): number;
  canSignIn(): boolean;
  signInLabel(): string;
  signIn(): Promise<SignInResult>;
  signOut(): Promise<void>;
  setCustomUsername(name: string): Promise<void>;
  sync(): Promise<void>;
  push(): Promise<void>;
  hasLeaderboards(): boolean;
  submitScore(mode: string, difficulty: string, entry: ScoreEntry): Promise<boolean>;
  topScores(mode: string, difficulty: string, limit: number): Promise<readonly Record<string, unknown>[] | null>;
  logEvent(name: string, data?: Record<string, unknown>): void;
  publishReplay(recording: Record<string, unknown>, summary: Record<string, unknown> | null, fixedIdPrefix?: string): Promise<string | null>;
  loadReplay(shareId: string): Promise<Record<string, unknown> | null>;
  replayFeed(limit: number): Promise<readonly Record<string, unknown>[] | null>;
  linkReplay(mode: string, difficulty: string, shareId: string): Promise<boolean>;
  submitGhost(mode: string, difficulty: string, data: unknown): Promise<boolean>;
  loadGhost(mode: string, difficulty: string): Promise<Record<string, unknown> | null>;
}

export interface CloudCompatibility {
  readonly Cloud: LegacyCloudFacade;
  readonly LocalProvider: AccountProvider;
  readonly CrazyProvider: AccountProvider;
  readonly FirebaseProvider: AccountProvider;
  readonly Passport: SharedCloudService;
}

interface CloudController extends LegacyCloudFacade, AccountContext {
  emit(): void;
}

function toCloudUser(identity: Awaited<ReturnType<IdentityService["current"]>>): CloudUser | null {
  if (!identity) return null;
  return {
    id: identity.id,
    name: identity.displayName,
    guest: false,
    ...(identity.avatarUrl === undefined ? {} : { avatar: identity.avatarUrl }),
  };
}

function createLocalProvider(): AccountProvider {
  return {
    kind: "local",
    init(context) { context.setUser({ id: "local", name: "Guest", guest: true }, "guest"); return Promise.resolve(); },
  };
}

function createCrazyProvider(getPlatform: () => PlatformServices): AccountProvider {
  let unsubscribe: Unsubscribe | undefined;
  const identity = (): IdentityService | null => {
    const capability = getPlatform().identity;
    return capability.available ? capability.service : null;
  };
  return {
    kind: "crazygames",
    signInLabel: "Log in with CrazyGames",
    async init(context) {
      const service = identity();
      const user = service ? toCloudUser(await service.current()) : null;
      context.setUser(user ?? { id: "cg", name: "Guest", guest: true }, user ? "signedin" : "guest");
      unsubscribe?.();
      unsubscribe = service?.subscribe?.((nextIdentity) => {
        const next = toCloudUser(nextIdentity);
        context.setUser(next ?? { id: "cg", name: "Guest", guest: true }, next ? "signedin" : "guest");
        if (next) void context.sync();
      });
    },
    async signIn(context) {
      const service = identity();
      if (!service) return false;
      const user = toCloudUser(await service.signIn());
      if (!user) return false;
      context.setUser(user, "signedin");
      return true;
    },
    async signOut() { await identity()?.signOut(); },
    load() { return Promise.resolve(null); },
    save() { return Promise.resolve(); },
    dispose() { unsubscribe?.(); unsubscribe = undefined; },
  };
}

export function createCloudCompatibility(options: CloudCompatibilityOptions): CloudCompatibility {
  const localProvider = createLocalProvider();
  const crazyProvider = createCrazyProvider(options.getPlatform);
  const firebaseProvider = options.firebaseAccount ?? localProvider;
  const now = options.now ?? Date.now;
  const listeners = new Set<(user: CloudUser | null, status: CloudStatus) => void>();
  let initialization: Promise<CloudStatus> | undefined;

  const facade: CloudController = {
    provider: null,
    user: null,
    status: "local",
    ready: false,
    authRetryPrompt: false,
    init() {
      if (initialization) return initialization;
      initialization = (async () => {
        const platform = options.getPlatform();
        const provider = options.target === "crazygames"
          ? (platform.identity.available ? crazyProvider : localProvider)
          : (options.firebaseAccount ?? localProvider);
        this.provider = provider;
        try { await provider.init(this); }
        catch {
          provider.dispose?.();
          this.provider = localProvider;
          await localProvider.init(this);
        }
        this.ready = true;
        this.emit();
        return this.status;
      })();
      return initialization;
    },
    onChange(listener) { listeners.add(listener); },
    emit() {
      for (const listener of [...listeners]) {
        try { listener(this.user, this.status); } catch { /* listener isolation */ }
      }
    },
    setUser(user, status, silent = false) {
      this.user = user;
      this.status = status;
      if (!silent) this.emit();
    },
    loggedIn() { return this.status === "signedin"; },
    displayName() {
      const custom = options.getProfile().username();
      if (custom) return custom;
      if (this.provider === crazyProvider) return this.user?.name ?? "Guest";
      return this.status === "signedin" ? "Player" : "Guest";
    },
    hasCustomName() { return options.getProfile().username().length > 0; },
    canRename() {
      if (!this.loggedIn()) return false;
      const at = options.getProfile().usernameSetAt();
      return at === 0 || now() - at >= 7 * 24 * 60 * 60 * 1000;
    },
    renameCooldownDays() {
      const at = options.getProfile().usernameSetAt();
      return at === 0 ? 0 : Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - (now() - at)) / (24 * 60 * 60 * 1000)));
    },
    canSignIn() { return this.provider?.signIn !== undefined && !this.loggedIn(); },
    signInLabel() { return this.provider?.signInLabel ?? "Sign In"; },
    async signIn() {
      if (!this.provider?.signIn) return false;
      try {
        const result = await this.provider.signIn(this);
        if (typeof result === "object") { this.authRetryPrompt = true; return result; }
        this.authRetryPrompt = false;
        if (result) await this.sync();
        return result;
      } catch { return false; }
    },
    async signOut() {
      try { await this.provider?.signOut?.(this); } catch { /* offline fallback remains usable */ }
    },
    async setCustomUsername(name) {
      options.getProfile().setUsername(name);
      this.emit();
      await this.push();
    },
    async sync() {
      if (!this.provider?.load) return;
      try {
        const remote = await this.provider.load(this);
        if (remote) {
          options.getProfile().merge(remote.profile);
          options.getMeta().merge(remote.meta);
          options.getProfile().save();
          options.getMeta().save();
        }
        this.emit();
        await this.push();
      } catch { /* merge failures never block local play */ }
    },
    async push() {
      if (!this.provider?.save) return;
      try {
        await this.provider.save(this, {
          profile: options.getProfile().data,
          meta: options.getMeta().data,
        });
      } catch { /* local save is already authoritative */ }
    },
    hasLeaderboards() { return options.shared.available; },
    async submitScore(mode, difficulty, entry) {
      entry.name = this.displayName();
      try { return await options.shared.submitScore(mode, difficulty, entry); } catch { return false; }
    },
    async topScores(mode, difficulty, limit) {
      try { return await options.shared.topScores(mode, difficulty, limit); } catch { return null; }
    },
    logEvent(name, data = {}) { try { options.shared.logEvent(name, data); } catch { /* optional telemetry */ } },
    async publishReplay(recording, summary, fixedIdPrefix) {
      try { return await options.shared.publishReplay(recording, summary, fixedIdPrefix); } catch { return null; }
    },
    async loadReplay(shareId) { try { return await options.shared.loadReplay(shareId); } catch { return null; } },
    async replayFeed(limit) { try { return await options.shared.replayFeed(limit); } catch { return null; } },
    async linkReplay(mode, difficulty, shareId) {
      try { return await options.shared.linkReplay(mode, difficulty, shareId); } catch { return false; }
    },
    submitGhost() { return Promise.resolve(false); },
    async loadGhost(mode, difficulty) {
      try { return await options.shared.loadGhost(mode, difficulty); } catch { return null; }
    },
  };

  return Object.freeze({
    Cloud: facade,
    LocalProvider: localProvider,
    CrazyProvider: crazyProvider,
    FirebaseProvider: firebaseProvider,
    Passport: options.shared,
  });
}
