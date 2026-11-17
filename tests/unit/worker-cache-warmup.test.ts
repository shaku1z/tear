import { describe, expect, it, vi } from "vitest";
import { warmWorkerCache, type WorkerCacheWarmupPorts } from "../../src/platform/worker-cache-warmup";

const URLS = ["/assets/a-worker-1.js", "/assets/b-worker-2.js", "/assets/c-worker-3.js"];

function ports(overrides: Partial<WorkerCacheWarmupPorts> = {}) {
  const fetchScript = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve());
  const missing = vi.fn(() => Promise.resolve(URLS));
  const base: WorkerCacheWarmupPorts = {
    controlled: () => true,
    online: () => true,
    metered: () => false,
    idle: () => true,
    missing,
    fetchScript,
    ...overrides,
  };
  return { base, fetchScript, missing };
}

describe("worker cache warm-up", () => {
  it("fetches each script that is not cached yet", async () => {
    const { base, fetchScript } = ports();
    expect(await warmWorkerCache(base)).toBe(3);
    expect(fetchScript.mock.calls.map((call) => call[0])).toEqual(URLS);
  });

  it("fetches only the missing scripts, and nothing when all three are cached", async () => {
    const partial = ports({ missing: () => Promise.resolve(URLS.slice(2)) });
    expect(await warmWorkerCache(partial.base)).toBe(1);
    expect(partial.fetchScript).toHaveBeenCalledWith(URLS[2]);
    const none = ports({ missing: () => Promise.resolve([]) });
    expect(await warmWorkerCache(none.base)).toBe(0);
    expect(none.fetchScript).not.toHaveBeenCalled();
  });

  it.each([
    ["no service worker controls the page", { controlled: () => false }],
    ["the browser is offline", { online: () => false }],
    ["data saver or a metered connection", { metered: () => true }],
  ] as const)("looks at nothing and fetches nothing when %s", async (_name, override) => {
    const { base, fetchScript, missing } = ports(override);
    expect(await warmWorkerCache(base)).toBe(0);
    expect(missing).not.toHaveBeenCalled();
    expect(fetchScript).not.toHaveBeenCalled();
  });

  it("stops when the player leaves the menu", async () => {
    let idle = true;
    const fetchScript = vi.fn(() => {
      idle = false;
      return Promise.resolve();
    });
    const { base } = ports({ idle: () => idle, fetchScript });
    expect(await warmWorkerCache(base)).toBe(1);
  });
});
