export interface PointerLockTarget {
  requestPointerLock?: () => Promise<void> | void;
}

/** Browser capability adapter; callers never need to catch unsupported or rejected pointer-lock requests. */
export class BrowserPointerLock {
  readonly api = Object.freeze({
    request: (): void => { this.request(); },
    release: (): void => { this.release(); },
  });

  constructor(
    private readonly target: PointerLockTarget,
    private readonly document: Pick<Document, "exitPointerLock">,
  ) {}

  request(): void {
    try {
      const result = this.target.requestPointerLock?.();
      if (result instanceof Promise) void result.catch(() => undefined);
    } catch { /* Unsupported or gesture-gated requests safely degrade. */ }
  }

  release(): void {
    try { this.document.exitPointerLock(); } catch { /* Pointer lock may already be absent. */ }
  }
}
