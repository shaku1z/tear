import { describe, expect, it, vi } from "vitest";
import { PwaUpdateController, unavailablePwaUpdate } from "../../src/platform/pwa-update";

function setup(
  options: {
    buildId?: string;
    marker?: string | null;
    idle?: boolean;
    throwOn?: "get" | "set" | "none";
    noStorage?: boolean;
  } = {},
) {
  const store = new Map<string, string>();
  if (options.marker) store.set("tear-auto-update-from", options.marker);
  let idle = options.idle ?? true;
  let tick: (() => void) | null = null;
  let input: (() => void) | null = null;
  const apply = vi.fn(() => Promise.resolve());
  const settle = vi.fn(() => Promise.resolve());
  const controller = new PwaUpdateController({
    buildId: options.buildId ?? "build-a",
    storage: options.noStorage
      ? null
      : {
          getItem: (key) => {
            if (options.throwOn === "get") throw new Error("blocked");
            return store.get(key) ?? null;
          },
          setItem: (key, value) => {
            if (options.throwOn === "set") throw new Error("quota");
            store.set(key, value);
          },
        },
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    onFirstInput: (callback) => {
      input = callback;
    },
  });
  controller.install(apply);
  controller.setIdleHost({ isIdle: () => idle, settle });
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  return {
    controller,
    apply,
    settle,
    store,
    flush,
    setIdle: (value: boolean) => {
      idle = value;
    },
    tick: async () => {
      tick?.();
      await flush();
    },
    input: () => input?.(),
  };
}

describe("automatic update on the main menu", () => {
  it("applies a waiting update found at boot on the idle menu, once, after saves settle", async () => {
    const t = setup();
    t.controller.markReady();
    await t.flush();
    expect(t.settle).toHaveBeenCalledTimes(1);
    expect(t.apply).toHaveBeenCalledTimes(1);
    expect(t.store.get("tear-auto-update-from")).toBe("build-a");
    await t.tick();
    expect(t.apply).toHaveBeenCalledTimes(1);
  });

  it("does not apply during a run, and applies when the player is back on the menu", async () => {
    const t = setup({ idle: false });
    t.controller.markReady();
    await t.flush();
    await t.tick();
    expect(t.apply).not.toHaveBeenCalled();
    t.setIdle(true);
    await t.tick();
    expect(t.apply).toHaveBeenCalledTimes(1);
  });

  it("after the player's first input, waits for them to leave the menu and come back", async () => {
    const t = setup({ idle: true });
    t.input();
    t.controller.markReady();
    await t.flush();
    await t.tick();
    expect(t.apply).not.toHaveBeenCalled();
    t.setIdle(false);
    await t.tick();
    t.setIdle(true);
    await t.tick();
    expect(t.apply).toHaveBeenCalledTimes(1);
  });

  it("does not reload again when the page came back on the same build (loop guard)", async () => {
    const t = setup({ marker: "build-a", buildId: "build-a" });
    t.controller.markReady();
    await t.flush();
    await t.tick();
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.controller.snapshot().ready).toBe(true);
  });

  it("applies when the marker names an older build than the one running", async () => {
    const t = setup({ marker: "build-a", buildId: "build-b" });
    t.controller.markReady();
    await t.flush();
    expect(t.apply).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["storage is unavailable", { noStorage: true }],
    ["reading the marker throws", { throwOn: "get" }],
    ["writing the marker throws", { throwOn: "set" }],
  ] as const)("has no loop guard, so applies nothing, when %s", async (_name, options) => {
    const t = setup(options);
    t.controller.markReady();
    await t.flush();
    await t.tick();
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.controller.snapshot().ready).toBe(true);
  });

  it("is inert without ports, and a target without a service worker ignores the host", () => {
    const controller = new PwaUpdateController();
    controller.setIdleHost({ isIdle: () => true, settle: () => Promise.resolve() });
    controller.markReady();
    expect(controller.snapshot().applying).toBe(false);
    expect(() => {
      unavailablePwaUpdate.setIdleHost({ isIdle: () => true, settle: () => Promise.resolve() });
    }).not.toThrow();
  });
});
