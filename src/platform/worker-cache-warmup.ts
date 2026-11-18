/**
 * The two ghost workers (career archive, live reference) are not
 * precached: the service worker caches each script the first time it is fetched.
 * Fetching the missing ones once, on an idle main menu, makes an ordinary first session
 * end with both cached, so the features still work if the player goes offline
 * before ever opening them. Nothing starts or parses a worker.
 */
export interface WorkerCacheWarmupPorts {
  /** A service worker controls this page, so its CacheFirst route will store the scripts. */
  readonly controlled: () => boolean;
  readonly online: () => boolean;
  /** Data saver or a metered (cellular) connection. */
  readonly metered: () => boolean;
  /** The player is on the plain main menu. */
  readonly idle: () => boolean;
  /** The worker script URLs that are not in the cache yet. */
  readonly missing: () => Promise<readonly string[]>;
  readonly fetchScript: (url: string) => Promise<unknown>;
}

/** Returns how many scripts were fetched. Stops as soon as the player leaves the menu. */
export async function warmWorkerCache(ports: WorkerCacheWarmupPorts): Promise<number> {
  if (!ports.controlled() || !ports.online() || ports.metered()) return 0;
  const missing = await ports.missing();
  let fetched = 0;
  for (const url of missing) {
    if (!ports.idle() || !ports.online()) break;
    await ports.fetchScript(url);
    fetched += 1;
  }
  return fetched;
}

const WORKER_CACHE = "tear-workers";

/** Warms once per page load, after the menu has been idle for a few seconds. */
export function startWorkerCacheWarmup(idle: () => boolean, urls: readonly string[]): void {
  // No service worker API (insecure context) or no Cache API: never warm.
  if (!("serviceWorker" in navigator) || !("caches" in window)) return;
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
      missing: async () => {
        const cache = await window.caches.open(WORKER_CACHE);
        const cached = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
        return urls.filter((url) => !cached.has(new URL(url, window.location.href).pathname));
      },
      fetchScript: (url) => fetch(url, { priority: "low" }),
    }).catch(() => undefined);
  }, 2000);
}

/** Whether the browser reports a network connection (messages say "needs one online visit" when it does not). */
export function browserOnline(): boolean {
  return navigator.onLine;
}

/**
 * Runs `task` once per page load after the plain main menu has been quiet for a few seconds, unless the
 * connection is metered. Used to fetch code a feature loads on first use (such as the replay engine) while
 * the player is not waiting, so the first use finds it already there.
 */
export function startIdleTask(idle: () => boolean, task: () => Promise<unknown>): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }).connection;
  let quietPolls = 0;
  const handle = window.setInterval(() => {
    quietPolls = idle() ? quietPolls + 1 : 0;
    if (quietPolls < 3) return;
    window.clearInterval(handle);
    if (!navigator.onLine || connection?.saveData === true || connection?.type === "cellular") return;
    void task().catch(() => undefined);
  }, 2000);
}
