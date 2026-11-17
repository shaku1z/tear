import { describe, expect, it, vi } from "vitest";
import { warmWorkerCache, type WorkerCacheWarmupPorts } from "../../src/platform/worker-cache-warmup";

function ports(overrides: Partial<WorkerCacheWarmupPorts> = {}) {
  const terminate = vi.fn();
  const create = vi.fn(() => ({ terminate }));
  const pause = vi.fn(() => Promise.resolve());
  const base: WorkerCacheWarmupPorts = {
    controlled: () => true,
    online: () => true,
    metered: () => false,
    idle: () => true,
    workers: [create, create, create],
    pause,
    ...overrides,
  };
  return { base, create, terminate, pause };
}

describe("worker cache warm-up", () => {
  it("starts each worker once, one at a time with a gap, and stops it", async () => {
    const { base, create, terminate, pause } = ports();
    expect(await warmWorkerCache(base)).toBe(3);
    expect(create).toHaveBeenCalledTimes(3);
    expect(pause).toHaveBeenCalledTimes(3);
    expect(terminate).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["no service worker controls the page", { controlled: () => false }],
    ["the browser is offline", { online: () => false }],
    ["data saver or a metered connection", { metered: () => true }],
    ["the player is not on the menu", { idle: () => false }],
  ] as const)("starts nothing when %s", async (_name, override) => {
    const { base, create } = ports(override);
    expect(await warmWorkerCache(base)).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });

  it("stops after the current worker when the player leaves the menu", async () => {
    let idle = true;
    const terminate = vi.fn();
    const make = () => ({ terminate });
    const first = vi.fn(() => {
      idle = false;
      return make();
    });
    const rest = vi.fn(make);
    const { base } = ports({ idle: () => idle, workers: [first, rest, rest] });
    expect(await warmWorkerCache(base)).toBe(1);
    expect(rest).not.toHaveBeenCalled();
  });
});
