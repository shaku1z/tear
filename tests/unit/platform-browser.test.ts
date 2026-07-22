import { describe, expect, it } from "vitest";
import { createBrowserPlatformServices } from "../../src/platform/browser";
import type { SyncStringStorage } from "../../src/platform/storage";

describe("browser platform fallback", () => {
  it("reports optional online capabilities as unavailable", () => {
    const platform = createBrowserPlatformServices({ window: {} });
    expect(platform.identity.available).toBe(false);
    expect(platform.cloudSave.available).toBe(false);
    expect(platform.leaderboards.available).toBe(false);
    expect(platform.ads.available).toBe(false);
    expect(platform.fullscreen.available).toBe(false);
  });

  it("continues in memory when browser storage throws", async () => {
    const broken: SyncStringStorage = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("quota"); },
      removeItem() { throw new Error("blocked"); },
    };
    const platform = createBrowserPlatformServices({ storage: broken, window: {} });
    await platform.profileStorage.set("save", "safe");
    expect(await platform.profileStorage.get("save")).toBe("safe");
    await platform.profileStorage.remove("save");
    expect(await platform.profileStorage.get("save")).toBeNull();
  });
});
