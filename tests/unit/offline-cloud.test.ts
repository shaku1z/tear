/**
 * A test build or the dev server never reaches a production cloud (src/platform/offline-cloud.ts). The
 * choice is made from the build's own flags at the composition root, never from the page's query, so a
 * test run reaches no production leaderboard with or without `?test=1`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type { LeaderboardRef } from "../../src/domain/leaderboards";
import { createBrowserPlatformServices } from "../../src/platform/browser";
import type { LegacyMetaPort, LegacyProfilePort } from "../../src/platform/cloud";
import type { CloudFactory } from "../../src/platform/cloud-factory";
import type { PlatformServices, TearBuildTarget } from "../../src/platform/contracts";
import { cloudFactoryForBuild, createOfflineCloud } from "../../src/platform/offline-cloud";

const BOARD: LeaderboardRef = { kind: "score", mode: "endless", difficulty: "normal" };

/** A platform whose sign-in, leaderboards and analytics all work, and record every call. */
function livePlatform() {
  const calls: string[] = [];
  const call =
    <Result>(name: string, result: Result) =>
    () => {
      calls.push(name);
      return result;
    };
  const platform: PlatformServices = {
    ...createBrowserPlatformServices({ window: {} }),
    identity: {
      available: true,
      service: {
        current: call("identity.current", Promise.resolve({ id: "p", displayName: "Player" })),
        signIn: call("identity.signIn", Promise.resolve({ id: "p", displayName: "Player" })),
        signOut: call("identity.signOut", Promise.resolve()),
      },
    },
    leaderboards: {
      available: true,
      service: {
        ranks: ["higher", "lower"],
        submit: call("leaderboards.submit", Promise.resolve()),
        entries: call("leaderboards.entries", Promise.resolve([])),
        publishReplay: call("leaderboards.publishReplay", Promise.resolve("id")),
        loadReplay: call("leaderboards.loadReplay", Promise.resolve(null)),
      },
    },
    analytics: { available: true, service: { event: call("analytics.event", undefined) } },
  };
  return { platform, calls };
}

function offlineCloud(target: TearBuildTarget) {
  const { platform, calls } = livePlatform();
  const profile: LegacyProfilePort = {
    data: {},
    username: () => "",
    usernameSetAt: () => 0,
    setUsername: vi.fn(),
    merge: vi.fn(),
    save: vi.fn(),
  };
  const meta: LegacyMetaPort = { data: {}, merge: vi.fn(), save: vi.fn() };
  const cloud = createOfflineCloud({
    target,
    getPlatform: () => platform,
    getProfile: () => profile,
    getMeta: () => meta,
    statisticsAllowed: () => true,
  });
  return { cloud, calls };
}

describe("the cloud of a build that is not a release", () => {
  const release: CloudFactory = () => {
    throw new Error("the release cloud");
  };

  it("is the target's cloud only in a release build", () => {
    expect(cloudFactoryForBuild(release, { testBuild: false, devServer: false })).toBe(release);
    for (const build of [
      { testBuild: true, devServer: false },
      { testBuild: false, devServer: true },
      { testBuild: true, devServer: true },
    ])
      expect(cloudFactoryForBuild(release, build)).toBe(createOfflineCloud);
  });

  it.each(["standalone", "crazygames", "itch"] as const)(
    "on %s, plays as a local guest and sends nothing anywhere",
    async (target) => {
      const { cloud, calls } = offlineCloud(target);
      const { Cloud } = cloud;
      await expect(Cloud.init()).resolves.toBe("guest");
      expect(Cloud.provider).toBe(cloud.LocalProvider);
      expect(Cloud.canSignIn()).toBe(false);
      expect(Cloud.hasLeaderboards()).toBe(false);
      await expect(Cloud.submitScore(BOARD, { score: 6721, wave: 4, time: 300 })).resolves.toBe(false);
      await expect(Cloud.publishReplay({ run: {} }, null, "lb_endless_normal")).resolves.toBeNull();
      await expect(Cloud.linkReplay(BOARD, "share")).resolves.toBe(false);
      await expect(Cloud.submitGhost("endless", "normal", {})).resolves.toBe(false);
      Cloud.logEvent("run_end", { score: 1 });
      await Cloud.push();
      await Cloud.sync();
      await expect(Cloud.topScores(BOARD, 10)).resolves.toBeNull();
      await expect(Cloud.replayFeed(10)).resolves.toBeNull();
      expect(calls).toEqual([]);
    },
  );

  it("is chosen at the composition root from the build's own flags, not the page's query", () => {
    const composition = readFileSync("src/app/shell/composition.ts", "utf8");
    expect(composition).toMatch(
      /cloudFactoryForBuild\(createCloud, \{\s*testBuild: __TEAR_TEST_BUILD__,\s*devServer: import\.meta\.env\.DEV,?\s*\}\)/u,
    );
    // The target's cloud is reached only through that choice.
    expect(composition.match(/createCloud\(/gu)).toBeNull();
    expect(composition.match(/\bcreateCloud\b/gu)).toHaveLength(3);
  });
});
