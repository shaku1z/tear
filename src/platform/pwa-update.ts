export interface PwaUpdateSnapshot {
  readonly available: boolean;
  readonly ready: boolean;
  readonly applying: boolean;
}

export type PwaUpdateListener = (snapshot: PwaUpdateSnapshot) => void;

export interface PwaUpdateCapability {
  snapshot(): PwaUpdateSnapshot;
  subscribe(listener: PwaUpdateListener): () => void;
  apply(): Promise<boolean>;
}

export class PwaUpdateController implements PwaUpdateCapability {
  readonly #listeners = new Set<PwaUpdateListener>();
  #applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
  #ready = false;
  #applying = false;

  snapshot(): PwaUpdateSnapshot {
    return Object.freeze({ available: true, ready: this.#ready, applying: this.#applying });
  }

  subscribe(listener: PwaUpdateListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => { this.#listeners.delete(listener); };
  }

  install(applyUpdate: (reloadPage?: boolean) => Promise<void>): void {
    this.#applyUpdate = applyUpdate;
  }

  markReady(): void {
    this.#ready = true;
    this.#emit();
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
    return () => { /* immutable capability has no retained listener */ };
  },
  apply: () => Promise.resolve(false),
});
