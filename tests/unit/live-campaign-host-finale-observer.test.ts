import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { CONFIG } from "../../src/config/game-config";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import type { LiveGameHostState } from "../../src/app/live-game-host-state";
import type { FinaleIntentPorts } from "../../src/gameplay/campaign/finale-runtime";
import type {
  FinaleOutwardCall,
  FinaleParticleEmissionReceipt,
} from "../../src/gameplay/campaign/finale-outward-call";

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

  it("journals exact immutable outward calls after each concrete adapter accepts them", () => {
    const order: string[] = [];
    const observed: FinaleOutwardCall[] = [];
    const concrete = (name: string) => () => { order.push(`concrete:${name}`); };
    let flash = 0.7, shake = 11;
    let worldZoom = 1, worldZoomTarget = 1;
    const receipt: FinaleParticleEmissionReceipt = Object.freeze({
      accepted: true, requested: 1, emitted: 1,
      rejected: Object.freeze({ culled: 0, budget: 0 }), listDelta: 1,
    });
    const particle = (name: string, result = receipt) => () => { order.push(`concrete:${name}`); return result; };
    const dependencies = {
      CONFIG,
      UI: { t: { motion: {
        loreReveal: 0.1, chapterIn: 0.1, loreExit: 0.1,
        biomeRevealBrief: 0.1, biomeRevealFull: 0.2, readyBrief: 0.1, readyFull: 0.2,
      } } },
      stageAt: () => ({ name: "Ash" }), stagePlatforms: () => [],
      FX: { ring: particle("ring"), burst: particle("burst", { ...receipt, requested: 7, emitted: 7, listDelta: 7 }) },
      Input: { buzz: concrete("vibrate") },
      SFX: {
        finalCut: concrete("final-cut"), finalRelic: concrete("final-relic"),
        finalRestore: concrete("final-restore"), finalSilence: concrete("final-silence"),
        setVoidDescent: concrete("void-mix"), setMusicDuck: concrete("music-duck"),
      },
    } as unknown as GameRuntimeDependencies;
    const services = {
      dependencies, state: {} as LiveGameHostState, cinema: {} as never, installStage: vi.fn(),
      lifecycle: {} as never, activatePreparedWave: vi.fn(),
      prepareVictory: () => ({ isNew: false, earned: 0, coins: 0 }), win: vi.fn(),
      achievementsEnabled: () => false, checkAchievements: vi.fn(), resetStageAchievements: vi.fn(),
      rememberBiome: vi.fn(), cinematicPreference: () => "full" as const,
      addFlash(amount: number) {
        order.push("concrete:flash"); const before = flash; flash = Math.max(flash, amount);
        return Object.freeze({ requested: amount, before, after: flash, aggregation: "maximum" as const });
      },
      addShake(amount: number) {
        order.push("concrete:shake"); const before = shake; shake = Math.max(shake, amount);
        return Object.freeze({ requested: amount, before, after: shake, aggregation: "maximum" as const });
      },
      formatTime: () => "0:00",
      setWorldZoom(value: number) {
        order.push("concrete:world-zoom");
        const before = Object.freeze({ current: worldZoom, target: worldZoomTarget });
        worldZoom = value; worldZoomTarget = value;
        return Object.freeze({ requested: value, immediate: true, before,
          after: Object.freeze({ current: worldZoom, target: worldZoomTarget }) });
      },
      width: 1600, height: 900,
      observeFinaleOutwardCall(call: FinaleOutwardCall) {
        order.push(`observe:${call.type}`);
        observed.push(call);
      },
    };

    createLiveCampaignHost(services);
    const ports = (forwarding.port as { finaleIntents: FinaleIntentPorts }).finaleIntents;
    ports.worldZoom(0.82);
    ports.ring(1, 2, 3, "#abc");
    ports.burst(4, 5, 0.5, -1, 7, "#def");
    ports.flash(0.6);
    ports.shake(9);
    ports.vibrate([10, 20]);
    ports.sound("final-cut", 2);
    ports.sound("final-relic", 3);
    ports.sound("final-restore", 0);
    ports.sound("final-silence", 0);
    ports.voidMix(0.25, 0.4);
    ports.musicDuck(0.1, 0.2);

    expect(observed).toEqual([
      { type: "world-zoom", value: 0.82, receipt: { requested: 0.82, immediate: true,
        before: { current: 1, target: 1 }, after: { current: 0.82, target: 0.82 } } },
      { type: "ring", x: 1, y: 2, radius: 3, color: "#abc", receipt },
      { type: "burst", x: 4, y: 5, dx: 0.5, dy: -1, count: 7, color: "#def",
        receipt: { ...receipt, requested: 7, emitted: 7, listDelta: 7 } },
      { type: "flash", amount: 0.6,
        receipt: { requested: 0.6, before: 0.7, after: 0.7, aggregation: "maximum" } },
      { type: "shake", amount: 9,
        receipt: { requested: 9, before: 11, after: 11, aggregation: "maximum" } },
      { type: "vibrate", pattern: [10, 20] },
      { type: "sound", cue: "final-cut", index: 2 },
      { type: "sound", cue: "final-relic", index: 3 },
      { type: "sound", cue: "final-restore", index: 0 },
      { type: "sound", cue: "final-silence", index: 0 },
      { type: "void-mix", amount: 0.25, duration: 0.4 },
      { type: "music-duck", amount: 0.1, duration: 0.2 },
    ]);
    expect(order).toEqual(observed.flatMap((call, index) => [
      `concrete:${call.type === "sound" ? call.cue : call.type}`,
      `observe:${observed[index]?.type ?? "missing"}`,
    ]));
    expect(observed.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(observed[5]?.type === "vibrate" ? observed[5].pattern : null)).toBe(true);
    expect(Object.isFrozen(observed[1]?.type === "ring" ? observed[1].receipt : null)).toBe(true);
    expect(Object.isFrozen(observed[1]?.type === "ring" ? observed[1].receipt.rejected : null)).toBe(true);
    expect(Object.isFrozen(observed[0]?.type === "world-zoom" ? observed[0].receipt.before : null)).toBe(true);
    expect(Object.isFrozen(observed[3]?.type === "flash" ? observed[3].receipt : null)).toBe(true);
  });

  it("does not journal an outward call rejected by its concrete adapter", () => {
    const observer = vi.fn();
    const dependencies = {
      CONFIG,
      UI: { t: { motion: {
        loreReveal: 0.1, chapterIn: 0.1, loreExit: 0.1,
        biomeRevealBrief: 0.1, biomeRevealFull: 0.2, readyBrief: 0.1, readyFull: 0.2,
      } } },
      stageAt: () => ({ name: "Ash" }), stagePlatforms: () => [],
      FX: { ring: () => { throw new Error("ring rejected"); } },
    } as unknown as GameRuntimeDependencies;
    createLiveCampaignHost({
      dependencies, state: {} as LiveGameHostState, cinema: {} as never, installStage: vi.fn(),
      lifecycle: {} as never, activatePreparedWave: vi.fn(),
      prepareVictory: () => ({ isNew: false, earned: 0, coins: 0 }), win: vi.fn(),
      achievementsEnabled: () => false, checkAchievements: vi.fn(), resetStageAchievements: vi.fn(),
      rememberBiome: vi.fn(), cinematicPreference: () => "full",
      addFlash: () => { throw new Error("flash rejected"); }, addShake: vi.fn(),
      formatTime: () => "0:00", setWorldZoom: vi.fn(), width: 1600, height: 900,
      observeFinaleOutwardCall: observer,
    });

    const ports = (forwarding.port as { finaleIntents: FinaleIntentPorts }).finaleIntents;
    expect(() => { ports.ring(1, 2, 3, "#abc"); }).toThrow("ring rejected");
    expect(() => { ports.flash(0.5); }).toThrow("flash rejected");
    expect(observer).not.toHaveBeenCalled();
  });

  it("installs the live collector only inside the test-build composition branch", () => {
    const source = readFileSync("src/app/live-game-runtime.ts", "utf8");
    const collectorLine = source.split(/\r?\n/u).find((line) => line.includes("observeFinaleOutwardCall:"));
    expect(collectorLine).toContain("__TEAR_TEST_BUILD__ ?");
    expect(source.match(/observeFinaleOutwardCall:/gu)).toHaveLength(1);
  });
});
