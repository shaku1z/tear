/**
 * Shared loader for code that is fetched on first use instead of at startup.
 *
 * One loader per module: concurrent callers share one request, a failed request
 * is forgotten so the next call retries, and a caller that needs the module
 * synchronously (`loaded`) gets a plain error if no one awaited `ensure` first.
 */
export type LazyStatus = "idle" | "loading" | "ready" | "failed";

export interface LazyModule<Module> {
  /** Starts the request if needed; rejects with `failureMessage` when it fails. */
  ensure(): Promise<Module>;
  /** The module, for synchronous code started by a caller that awaited `ensure`. */
  loaded(): Module;
  status(): LazyStatus;
}

export class LazyModuleUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LazyModuleUnavailable";
  }
}

export function loadOnce<Module>(load: () => Promise<Module>, failureMessage: string): LazyModule<Module> {
  let module: Module | undefined;
  let pending: Promise<Module> | undefined;
  let failed = false;
  return {
    ensure() {
      if (module !== undefined) return Promise.resolve(module);
      failed = false;
      pending ??= load().then(
        (value) => {
          module = value;
          pending = undefined;
          return value;
        },
        () => {
          pending = undefined;
          failed = true;
          throw new LazyModuleUnavailable(failureMessage);
        },
      );
      return pending;
    },
    loaded() {
      if (module === undefined) throw new LazyModuleUnavailable("This code has not finished loading yet.");
      return module;
    },
    status() {
      if (module !== undefined) return "ready";
      if (pending !== undefined) return "loading";
      return failed ? "failed" : "idle";
    },
  };
}
