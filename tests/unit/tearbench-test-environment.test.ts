import { describe, expect, it } from "vitest";
import { createTearTestEnvironment } from "../../src/tearbench";

describe("TearBench test environment", () => {
  it("provides only disposable storage and unavailable remote capabilities", async () => {
    const environment = createTearTestEnvironment("isolated");
    await environment.platform.profileStorage.set("profile", "test-only");
    expect(await environment.platform.profileStorage.get("profile")).toBe("test-only");
    expect(environment.platform.cloudSave.available).toBe(false);
    expect(environment.platform.leaderboards.available).toBe(false);
    expect(environment.platform.achievements.available).toBe(false);
    expect(environment.platform.analytics.available).toBe(false);
    expect(environment.writes).toEqual([]);
  });

  it("resets deterministic streams and clears its write journal", () => {
    const environment = createTearTestEnvironment(99);
    const first = environment.stream("draft").next();
    environment.reset(99);
    expect(environment.stream("draft").next()).toBe(first);
    expect(environment.writes).toEqual([]);
  });
});
