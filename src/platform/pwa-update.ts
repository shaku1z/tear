export interface PwaUpdateSnapshot {
  readonly available: boolean;
  readonly ready: boolean;
  readonly applying: boolean;
}

export type PwaUpdateListener = (snapshot: PwaUpdateSnapshot) => void;

/** What the running game tells the update controller so it only reloads at a quiet moment. */
export interface PwaIdleHost {
  /** True on the main menu itself: no run, overlay, sub-screen or text entry. */
  readonly isIdle: () => boolean;
  /** Resolves when pending save writes are acknowledged. */
  readonly settle: () => Promise<unknown>;
}

export interface PwaUpdateCapability {
  snapshot(): PwaUpdateSnapshot;
  subscribe(listener: PwaUpdateListener): () => void;
  apply(): Promise<boolean>;
  /** Lets the controller apply a waiting update by itself when the player is idle. */
  setIdleHost(host: PwaIdleHost): void;
}

/** Ports for the automatic update rule, injected so tests control time, storage and input. */
export interface PwaAutoUpdateOptions {
  /** Id of the build this page is running. */
  readonly buildId: string;
  /** sessionStorage-like marker store for the loop guard. */
  readonly storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  readonly setInterval: (callback: () => void, ms: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
  /** Registers a callback for the player's first input; returns nothing. */
  readonly onFirstInput: (callback: () => void) => void;
}

const AUTO_UPDATE_MARKER = "tear-auto-update-from";
const IDLE_POLL_MS = 1000;

export class PwaUpdateController implements PwaUpdateCapability {
  readonly #listeners = new Set<PwaUpdateListener>();
  #applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
  #ready = false;
  #applying = false;
  readonly #auto: PwaAutoUpdateOptions | null;
  #host: PwaIdleHost | null = null;
  #autoDone = false;
  #poll: unknown = null;
  #interacted = false;
  #leftIdleSinceInput = false;

  constructor(auto: PwaAutoUpdateOptions | null = null) {
    this.#auto = auto;
    auto?.onFirstInput(() => {
      this.#interacted = true;
    });
  }

  setIdleHost(host: PwaIdleHost): void {
    this.#host = host;
    this.#startAutoApply();
  }

  snapshot(): PwaUpdateSnapshot {
    return Object.freeze({ available: true, ready: this.#ready, applying: this.#applying });
  }

  subscribe(listener: PwaUpdateListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.#listeners.delete(listener);
    };
  }

  install(applyUpdate: (reloadPage?: boolean) => Promise<void>): void {
    this.#applyUpdate = applyUpdate;
  }

  markReady(): void {
    this.#ready = true;
    this.#emit();
    this.#startAutoApply();
  }

  /**
   * Applies a waiting update by itself, once per page load, only on the plain main
   * menu: before the player's first input when the update was found at boot,
   * otherwise on their next return to the menu. A marker with the build id this page
   * runs stops a loop: if the page comes back on the same build, the player is left
   * to the Settings row.
   */
  #startAutoApply(): void {
    const auto = this.#auto;
    if (auto === null || this.#autoDone || this.#poll !== null || !this.#ready || this.#host === null) return;
    if (auto.storage.getItem(AUTO_UPDATE_MARKER) === auto.buildId) {
      this.#autoDone = true;
      return;
    }
    this.#poll = auto.setInterval(() => {
      void this.#autoTick();
    }, IDLE_POLL_MS);
    void this.#autoTick();
  }

  /** A separate read, because the flag can change while `settle` is awaited. */
  #finished(): boolean {
    return this.#autoDone;
  }

  async #autoTick(): Promise<void> {
    const auto = this.#auto;
    const host = this.#host;
    if (auto === null || host === null || this.#autoDone || this.#applying) return;
    if (!host.isIdle()) {
      if (this.#interacted) this.#leftIdleSinceInput = true;
      return;
    }
    // Idle after the player has started playing: wait until they leave and come back.
    if (this.#interacted && !this.#leftIdleSinceInput) return;
    await host.settle();
    if (!host.isIdle() || this.#finished()) return;
    this.#autoDone = true;
    if (this.#poll !== null) auto.clearInterval(this.#poll);
    this.#poll = null;
    auto.storage.setItem(AUTO_UPDATE_MARKER, auto.buildId);
    await this.apply();
  }

  async apply(): Promise<boolean> {
    if (!this.#ready || this.#applying || this.#applyUpdate === null) return false;
    this.#applying = true;
    this.#emit();
    try {
      await this.#applyUpdate(true);
      return true;
    } catch {
      this.#applying = false;
      this.#emit();
      return false;
    }
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}

const unavailableSnapshot = Object.freeze({ available: false, ready: false, applying: false });

export const unavailablePwaUpdate: PwaUpdateCapability = Object.freeze({
  snapshot: () => unavailableSnapshot,
  subscribe(listener: PwaUpdateListener) {
    listener(unavailableSnapshot);
    return () => {
      /* immutable capability has no retained listener */
    };
  },
  apply: () => Promise.resolve(false),
  setIdleHost() {
    /* nothing to apply on a target without a service worker */
  },
});
