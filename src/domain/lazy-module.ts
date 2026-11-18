/**
 * Shared loader for code that is fetched on first use instead of at startup.
 *
 * One loader per module: concurrent callers share one request, a failed request
 * is forgotten so the next call retries, and a caller that needs the module
 * synchronously (`loaded`) gets a plain error if no one awaited `ensure` first.
 *
 * To defer another module: declare a `lazySlot` next to the code that uses it, and add one
 * row for it to the table in `src/app/shell/deferred-modules.ts`, which names where it is
 * fetched from and whether it is fetched ahead on an idle menu.
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

/** A lazy module whose source is named later, by whoever owns the bundle (`install`). */
export interface LazyModuleSlot<Module> extends LazyModule<Module> {
  install(load: () => Promise<Module>): void;
}

export function lazySlot<Module>(failureMessage: string): LazyModuleSlot<Module> {
  let lazy: LazyModule<Module> | undefined;
  const installed = (): LazyModule<Module> => {
    if (lazy === undefined) throw new LazyModuleUnavailable("This code has not been set up.");
    return lazy;
  };
  return {
    install(load) {
      lazy = loadOnce(load, failureMessage);
    },
    ensure: () => installed().ensure(),
    loaded: () => installed().loaded(),
    status: () => (lazy === undefined ? "idle" : lazy.status()),
  };
}

/**
 * For a screen action that needs the module now. Answers `true` when it is there. When it is not, says
 * `waitMessage` through `announce`, waits, and answers `true`; if the fetch fails it announces the plain
 * failure message once and answers `false`, so the player can simply try again.
 */
export async function lazyModuleReady(
  module: LazyModule<unknown>,
  announce: (message: string) => void,
  waitMessage: string,
): Promise<boolean> {
  if (module.status() === "ready") return true;
  announce(waitMessage);
  try {
    await module.ensure();
    return true;
  } catch (error) {
    announce(error instanceof Error ? error.message : "This code is unavailable.");
    return false;
  }
}
