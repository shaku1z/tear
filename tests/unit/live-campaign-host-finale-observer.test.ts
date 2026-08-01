import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import type { LiveGameHostState } from "../../src/app/live-game-host-state";

const forwarding = vi.hoisted((): { port: unknown } => ({ port: undefined }));

vi.mock("../../src/app/live-campaign-runtime", () => ({
  createLiveCampaignRuntime: (port: unknown) => {
    forwarding.port = port;
    return Object.freeze({});
  },
}));

import { createLiveCampaignHost } from "../../src/app/live-campaign-host";

describe("live campaign host finale observation", () => {
  it("passes the observer callback directly to the campaign runtime port", () => {
    const observer = vi.fn();
    const dependencies = {
      CONFIG,
      UI: { t: { motion: {
        loreReveal: 0.1, chapterIn: 0.1, loreExit: 0.1,
        biomeRevealBrief: 0.1, biomeRevealFull: 0.2, readyBrief: 0.1, readyFull: 0.2,
      } } },
      stageAt: () => ({ name: "Ash" }),
      stagePlatforms: () => [],
    } as unknown as GameRuntimeDependencies;
    const state = {} as LiveGameHostState;

    createLiveCampaignHost({
      dependencies, state, cinema: {} as never, installStage: vi.fn(),
      lifecycle: {} as never, activatePreparedWave: vi.fn(),
      prepareVictory: () => ({ isNew: false, earned: 0, coins: 0 }), win: vi.fn(),
      achievementsEnabled: () => false, checkAchievements: vi.fn(), resetStageAchievements: vi.fn(),
      rememberBiome: vi.fn(), cinematicPreference: () => "full", addFlash: vi.fn(), addShake: vi.fn(),
      formatTime: () => "0:00", setWorldZoom: vi.fn(), width: 1600, height: 900,
      observeFinaleIntents: observer,
    });

    expect((forwarding.port as { observeFinaleIntents?: unknown }).observeFinaleIntents).toBe(observer);
  });
});
