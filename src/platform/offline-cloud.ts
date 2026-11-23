/**
 * The cloud of a build that is not a release: a test build (the preview dev build included) or the dev
 * server. It reaches no production service, whatever the page's query: the player is a local guest, a
 * score, replay or statistic is never sent, and the shared boards and feed read as unavailable. A test
 * run therefore never reaches the production leaderboards, with or without `?test=1`.
 */
import { createCloudCompatibility, type SharedCloudService } from "./cloud";
import type { CloudFactory } from "./cloud-factory";
import { unavailable } from "./contracts";

const OFFLINE = "not a release build";

const OFFLINE_SHARED: SharedCloudService = Object.freeze({
  available: false,
  ranks: () => false,
  submitScore: () => Promise.resolve(false),
  topScores: () => Promise.resolve(null),
  logEvent: () => undefined,
  publishReplay: () => Promise.resolve(null),
  loadReplay: () => Promise.resolve(null),
  replayFeed: () => Promise.resolve(null),
  linkReplay: () => Promise.resolve(false),
  loadGhost: () => Promise.resolve(null),
});

/** A cloud with no account service and no shared service: progress stays on this device. */
export const createOfflineCloud: CloudFactory = (options) =>
  createCloudCompatibility({
    ...options,
    // No platform sign-in either: a portal test build plays as a local guest.
    getPlatform: () => ({ ...options.getPlatform(), identity: unavailable(OFFLINE) }),
    shared: OFFLINE_SHARED,
  });

/** The cloud a build uses: its target's cloud in a release build, the offline cloud in any other. */
export function cloudFactoryForBuild(
  release: CloudFactory,
  build: Readonly<{ testBuild: boolean; devServer: boolean }>,
): CloudFactory {
  return build.testBuild || build.devServer ? createOfflineCloud : release;
}
