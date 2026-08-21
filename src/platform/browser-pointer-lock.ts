export interface PointerLockTarget {
  requestPointerLock?: () => Promise<void> | void;
}

/** Browser capability adapter; callers never need to catch unsupported or rejected pointer-lock requests. */
export class BrowserPointerLock {
  #requestPending = false;

  readonly api = Object.freeze({
    request: (): void => { this.request(); },
    release: (): void => { this.release(); },
  });

  constructor(
    private readonly target: PointerLockTarget,
    private readonly document: Pick<Document, "exitPointerLock">,
  ) {}

  request(): void {
    if (this.#requestPending) return;
    try {
      const result = this.target.requestPointerLock?.();
      if (result !== undefined && typeof result.then === "function") {
        this.#requestPending = true;
        void Promise.resolve(result)
          .catch(() => undefined)
          .finally(() => { this.#requestPending = false; });
      }
    } catch { /* Unsupported or gesture-gated requests safely degrade. */ }
  }

  release(): void {
    try { this.document.exitPointerLock(); } catch { /* Pointer lock may already be absent. */ }
  }
}
