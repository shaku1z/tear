import { describe, expect, it, vi } from "vitest";
import { PwaUpdateController, unavailablePwaUpdate } from "../../src/platform/pwa-update";

describe("PWA update capability", () => {
  it("applies a waiting worker only after it is ready", async () => {
    const apply = vi.fn(() => Promise.resolve());
    const controller = new PwaUpdateController();
    controller.install(apply);
    await expect(controller.apply()).resolves.toBe(false);
    controller.markReady();
    await expect(controller.apply()).resolves.toBe(true);
    expect(apply).toHaveBeenCalledWith(true);
  });

  it("reports an unavailable CrazyGames capability", async () => {
    expect(unavailablePwaUpdate.snapshot()).toEqual({ available: false, ready: false, applying: false });
    await expect(unavailablePwaUpdate.apply()).resolves.toBe(false);
  });
});
