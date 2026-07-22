import { describe, expect, it, vi } from "vitest";
import { dispatchWaveClearIntents, dispatchWavePlanIntents } from "../../src/app/live-wave-intent-coordinator";
import type { WaveClearIntent } from "../../src/gameplay/run/wave-clear-planner";
import type { WavePlanIntent } from "../../src/gameplay/run/wave-planner";

describe("live wave intent coordinator", () => {
  it("dispatches every planning intent in source order", () => {
    const calls: string[] = [];
    const intents: WavePlanIntent[] = [
      { type: "begin-wipe" }, { type: "load-stage", stageIndex: 2 },
      { type: "set-stage-banner", name: "Ash", duration: 3 },
      { type: "begin-campaign-chapter", stageIndex: 2, priorBossOutro: "outro" },
      { type: "ghost-wave", wave: 11, marker: "boss" }, { type: "ghost-snapshot", slot: 4 },
      { type: "prepare-wave", wave: 11, boss: true, deferred: true }, { type: "activate-wave" },
      { type: "show-wave-banner" }, { type: "play-wave-sfx" },
    ];
    dispatchWavePlanIntents(intents, {
      beginWipe: () => { calls.push("wipe"); }, loadStage: (value) => { calls.push(`stage:${String(value)}`); },
      setStageBanner: (name, duration) => { calls.push(`banner:${name}:${String(duration)}`); },
      beginCampaignChapter: (index, outro) => { calls.push(`chapter:${String(index)}:${String(outro)}`); },
      recordWave: (wave, marker) => { calls.push(`wave:${String(wave)}:${marker}`); },
      snapshotReplay: (slot) => { calls.push(`snapshot:${String(slot)}`); },
      prepareWave: (wave, boss, deferred) => { calls.push(`prepare:${String(wave)}:${String(boss)}:${String(deferred)}`); },
      activateWave: () => { calls.push("activate"); }, showWaveBanner: () => { calls.push("show"); },
      playWaveSound: () => { calls.push("sound"); },
    });
    expect(calls).toEqual(["wipe", "stage:2", "banner:Ash:3", "chapter:2:outro", "wave:11:boss",
      "snapshot:4", "prepare:11:true:true", "activate", "show", "sound"]);
  });

  it("maps all clear intents to the application ports", () => {
    const called: string[] = [];
    const track = (name: string) => (...values: unknown[]): void => { called.push(`${name}:${values.join(":")}`); };
    const intents: WaveClearIntent[] = [
      { type: "clear-wave-lifecycle" }, { type: "backdrop-bloom", color: "red", strength: 0.2, duration: 1 },
      { type: "ghost-wave", wave: 3, marker: "clear" }, { type: "profile-max", stat: "best", value: 3 },
      { type: "profile-add", stat: "waves", value: 1 }, { type: "daily-bump", challenge: "wave", value: 3, operation: "max" },
      { type: "horde-cleared", waveTime: 9 }, { type: "achievement-check" }, { type: "stage-done" },
      { type: "heal-player", amount: 5 }, { type: "prepare-reward", reward: "draft" },
      { type: "start-adventure-finale" }, { type: "win-run" }, { type: "exit-pointer-lock" },
      { type: "open-tier-up" }, { type: "open-draft" },
    ];
    dispatchWaveClearIntents(intents, {
      clearWave: track("clear"), bloom: track("bloom"), recordWave: track("wave"),
      profileMax: track("max"), profileAdd: track("add"), dailyBump: track("daily"),
      hordeCleared: track("horde"), achievementCheck: track("check"), stageDone: track("stage"),
      healPlayer: track("heal"), prepareReward: track("reward"), startAdventureFinale: track("finale"),
      winRun: track("win"), releasePointer: track("pointer"), openTierUp: track("tier"), openDraft: track("draft"),
    });
    expect(called).toHaveLength(intents.length);
    expect(called).toEqual([
      "clear:", "bloom:red:0.2:1", "wave:3:clear", "max:best:3", "add:waves:1", "daily:wave:3:max",
      "horde:9", "check:", "stage:", "heal:5", "reward:draft", "finale:", "win:", "pointer:", "tier:", "draft:",
    ]);
  });

  it("does nothing for empty intent batches", () => {
    const beginWipe = vi.fn();
    dispatchWavePlanIntents([], {
      beginWipe, loadStage: vi.fn(), setStageBanner: vi.fn(), beginCampaignChapter: vi.fn(), recordWave: vi.fn(),
      snapshotReplay: vi.fn(), prepareWave: vi.fn(), activateWave: vi.fn(), showWaveBanner: vi.fn(), playWaveSound: vi.fn(),
    });
    expect(beginWipe).not.toHaveBeenCalled();
  });
});
