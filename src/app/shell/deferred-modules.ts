// Code that is fetched after startup instead of with it (the shared loader is src/domain/lazy-module.ts).
// To defer another module: declare a `lazySlot` beside the code that uses it, then add one row here.
// The build check (`pnpm check:bundle-budget`) fails when a row's module ends up in a startup chunk.
import { replayEngine } from "../../ghost/replay-engine";
import { liveReplayRecorder } from "../replay/live-replay-recorder-slot";
import { startIdleTask } from "../../platform/worker-cache-warmup";
import type { LazyModuleSlot } from "../../domain/lazy-module";

interface DeferredModule {
  readonly install: () => void;
  /** Fetches the module ahead of use; absent when it is only worth fetching on demand. */
  readonly fetchAhead?: () => Promise<unknown>;
}

function deferred<Module>(
  slot: LazyModuleSlot<Module>,
  load: () => Promise<Module>,
  options: Readonly<{ fetchAheadOnIdleMenu: boolean }>,
): DeferredModule {
  return {
    install: () => {
      slot.install(load);
    },
    ...(options.fetchAheadOnIdleMenu ? { fetchAhead: () => slot.ensure() } : {}),
  };
}

const DEFERRED_MODULES: readonly DeferredModule[] = [
  // Re-running a ghost (verify, Vault, Theater, linked replay): about a fifth of startup code.
  deferred(replayEngine, () => import("../world/detached/replay-composition"), {
    fetchAheadOnIdleMenu: true,
  }),
  // Recording a run (replay PR 5c-1): a run that starts before it loads is not recorded, so fetch it early.
  deferred(liveReplayRecorder, () => import("../replay/live-replay-recorder"), { fetchAheadOnIdleMenu: true }),
];

/** Names where each deferred module comes from, and fetches the ones that ask for it once the menu is idle. */
export function startDeferredModules(idleMenu: () => boolean): void {
  for (const module of DEFERRED_MODULES) {
    module.install();
    if (module.fetchAhead !== undefined) startIdleTask(idleMenu, module.fetchAhead);
  }
}
