/**
 * The three ghost workers (career archive, coach history, live reference) are not
 * precached: the service worker caches each script the first time it is fetched.
 * Starting each worker once, on an idle main menu, makes an ordinary first session
 * end with all three cached, so the features still work if the player goes offline
 * before ever opening them. Vite gives no URL for a worker chunk except through
 * `new Worker(new URL(...))`, so the warm-up starts one worker at a time and stops it.
 */
export interface WarmableWorker {
  terminate(): void;
}

export interface WorkerCacheWarmupPorts {
  /** A service worker controls this page, so its CacheFirst route will store the scripts. */
  readonly controlled: () => boolean;
  readonly online: () => boolean;
  /** Data saver or a metered (cellular) connection. */
  readonly metered: () => boolean;
  /** The player is on the plain main menu. */
  readonly idle: () => boolean;
  readonly workers: readonly (() => WarmableWorker)[];
  readonly pause: (ms: number) => Promise<void>;
}

const WARM_GAP_MS = 4000;

/** Returns how many workers were started. Stops as soon as the player leaves the menu. */
export async function warmWorkerCache(ports: WorkerCacheWarmupPorts): Promise<number> {
  if (!ports.controlled() || !ports.online() || ports.metered()) return 0;
  let started = 0;
  for (const create of ports.workers) {
    if (!ports.idle() || !ports.online()) break;
    const worker = create();
    started += 1;
    await ports.pause(WARM_GAP_MS);
    worker.terminate();
  }
  return started;
}

/** Warms once per page load, after the menu has been idle for a few seconds. */
export function startWorkerCacheWarmup(idle: () => boolean, workers: WorkerCacheWarmupPorts["workers"]): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
  let quietPolls = 0;
  const handle = window.setInterval(() => {
    quietPolls = idle() ? quietPolls + 1 : 0;
    if (quietPolls < 3) return;
    window.clearInterval(handle);
    void warmWorkerCache({
      controlled: () => navigator.serviceWorker.controller !== null,
      online: () => navigator.onLine,
      metered: () => connection?.saveData === true || connection?.type === "cellular",
      idle,
      workers,
      pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
    });
  }, 2000);
}
