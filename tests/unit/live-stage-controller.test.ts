import { describe, expect, it, vi } from "vitest";
import { LiveStageController } from "../../src/app/live-stage-controller";
import { StageRuntimeState } from "../../src/app/stage-runtime-state";

describe("live stage controller", () => {
  it("atomically clears prior-stage state and records the new biome", () => {
    const state = new StageRuntimeState(
      (index: number) => ({ name: index === 2 ? "Ash Vault" : "Origin", dark: false }),
      (index: number) => [`platform-${String(index)}`],
    );
    const run = { voidScroll: {}, bossAdds: {}, _preBossPlatforms: [], _brokenPlats: [] };
    const blade = { stolenBy: {}, hostile: true, state: "stolen" };
    const order: string[] = [];
    const controller = new LiveStageController(state, {
      cancelCinematic: () => { order.push("cancel"); },
      clearHazards: () => { order.push("hazards"); },
      run: () => run,
      blade: () => blade,
      achievementTracking: () => true,
      rememberBiome: (name) => { order.push(`biome:${name}`); },
      resetStageAchievements: () => { order.push("achievements"); },
      resetPlayerStagePassives: () => { order.push("player"); },
      recordReplayStage: (index) => { order.push(`replay:${String(index)}`); },
    });

    controller.load(2);

    expect(state).toMatchObject({ index: 2, current: { name: "Ash Vault" }, platforms: ["platform-2"] });
    expect(run).toEqual({ voidScroll: null, bossAdds: null, _preBossPlatforms: null, _brokenPlats: null });
    expect(blade).toEqual({ stolenBy: null, hostile: false, state: "returning" });
    expect(order).toEqual(["cancel", "hazards", "biome:Ash Vault", "achievements", "player", "replay:2"]);
  });

  it("does not award dark biomes and still resets replay and player state without a run", () => {
    const state = new StageRuntimeState(() => ({ name: "The Source", dark: true }), () => [] as string[]);
    const rememberBiome = vi.fn();
    const resetStageAchievements = vi.fn();
    const resetPlayerStagePassives = vi.fn();
    const recordReplayStage = vi.fn();
    const controller = new LiveStageController(state, {
      cancelCinematic: vi.fn(), clearHazards: vi.fn(), run: () => null, blade: () => null,
      achievementTracking: () => true, rememberBiome, resetStageAchievements,
      resetPlayerStagePassives, recordReplayStage,
    });

    controller.load(5);

    expect(rememberBiome).not.toHaveBeenCalled();
    expect(resetStageAchievements).not.toHaveBeenCalled();
    expect(resetPlayerStagePassives).toHaveBeenCalledOnce();
    expect(recordReplayStage).toHaveBeenCalledWith(5);
  });
});
