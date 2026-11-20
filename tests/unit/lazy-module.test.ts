import { describe, expect, it, vi } from "vitest";
import { LazyModuleUnavailable, lazySlot, loadOnce } from "../../src/domain/lazy-module";

describe("shared lazy loader", () => {
  it("shares one request between concurrent callers and then answers synchronously", async () => {
    const load = vi.fn(() => Promise.resolve({ answer: 42 }));
    const lazy = loadOnce(load, "needs a connection");
    expect(lazy.status()).toBe("idle");
    const [first, second] = await Promise.all([lazy.ensure(), lazy.ensure()]);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(1);
    expect(lazy.status()).toBe("ready");
    expect(lazy.loaded().answer).toBe(42);
  });

  it("reports a failed fetch once in plain words and retries on the next call", async () => {
    const load = vi
      .fn<() => Promise<{ ok: boolean }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ ok: true });
    const lazy = loadOnce(load, "Replay needs one online visit.");
    const failure = await lazy.ensure().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LazyModuleUnavailable);
    expect((failure as Error).message).toBe("Replay needs one online visit.");
    expect(lazy.status()).toBe("failed");
    expect((await lazy.ensure()).ok).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("refuses a synchronous read before the module has been awaited, instead of hanging", () => {
    const lazy = loadOnce(() => new Promise<never>(() => undefined), "unused");
    expect(() => lazy.loaded()).toThrow(LazyModuleUnavailable);
    void lazy.ensure();
    expect(lazy.status()).toBe("loading");
  });

  it("takes its source later, and refuses use before that instead of hanging", async () => {
    const slot = lazySlot<{ answer: number }>("needs a connection");
    expect(slot.status()).toBe("idle");
    expect(() => slot.loaded()).toThrow(LazyModuleUnavailable);
    await expect(Promise.resolve().then(() => slot.ensure())).rejects.toBeInstanceOf(LazyModuleUnavailable);
    slot.install(() => Promise.resolve({ answer: 7 }));
    expect((await slot.ensure()).answer).toBe(7);
    expect(slot.status()).toBe("ready");
    expect(slot.loaded().answer).toBe(7);
  });
});
