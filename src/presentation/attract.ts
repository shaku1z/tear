import type { AttractDependencies, createAttract as createAttractRuntime } from "./attract-runtime";

type AttractRuntime = ReturnType<typeof createAttractRuntime>;

/** Defers the decorative menu battle until the interactive shell has rendered. */
export function createAttract(dependencies: AttractDependencies) {
  let runtime: AttractRuntime | undefined;
  let loading: Promise<void> | undefined;
  let resetPending = false;
  let biomeChange: (() => void) | undefined;

  function ensureLoaded(): void {
    loading ??= import("./attract-runtime").then((module) => {
      runtime = module.createAttract(dependencies);
      if (biomeChange !== undefined) runtime.onBiomeChange = biomeChange;
      if (resetPending) runtime.reset();
    }).catch((error: unknown) => { console.warn("Menu attract runtime failed to load", error); });
  }

  return {
    get ready() { return runtime?.ready ?? false; },
    set ready(value: boolean) { if (runtime) runtime.ready = value; else if (value) ensureLoaded(); },
    get onBiomeChange() { return runtime?.onBiomeChange ?? biomeChange; },
    set onBiomeChange(value: (() => void) | undefined) {
      biomeChange = value;
      if (runtime && value === undefined) delete runtime.onBiomeChange;
      else if (runtime && value !== undefined) runtime.onBiomeChange = value;
    },
    reset() { resetPending = true; if (runtime) runtime.reset(); else ensureLoaded(); },
    stage() {
      const fallback = dependencies.STAGES[0];
      if (runtime) return runtime.stage();
      if (fallback === undefined) throw new Error("Attract mode requires at least one stage");
      return fallback;
    },
    update(deltaSeconds: number) { if (runtime) runtime.update(deltaSeconds); else ensureLoaded(); },
    draw(context: CanvasRenderingContext2D) { runtime?.draw(context); },
  };
}
