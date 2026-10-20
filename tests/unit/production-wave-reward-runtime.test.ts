import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { GhostTimeline, validateGhostEventPayload } from "../../src/ghost/truth-kernel";
import type { TearCausalEventV1 } from "../../src/tearbench/contracts";
import { describe, expect, it } from "vitest";

import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionWaveRewardRuntime } from "../../src/tearbench/production-wave-reward-runtime";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { ghostReferenceBoundary, type GhostReferenceBoundary } from "../../src/ghost/live-ghost-reference-data";

describe("production wave and reward runtime", () => {
  it("records two real reward selections with strict loadout payloads and separate feedback facts", () => {
    // Constructed wave clears isolate the actual reward/emission owners, not combat quality.
    const replay = createProductionReplayWorld({ seed: "two-native-reward-selections", mode: "endless" });
    const bus = new TearGameplayEventBus(), events: TearCausalEventV1[] = [];
    bus.subscribe(event => events.push(createLiveGhostCausalEvent(event, events.length + 1)));
    const runtime = createProductionWaveRewardRuntime(replay, { gameplayEvents: bus });
    runtime.startNaturalOpening();
    const selected: string[] = [];
    for (let wave = 1; wave <= 2; wave++) {
      const run = replay.world.state.run(); if (!run) throw new Error("run missing");
      run.spawnQueue = []; replay.world.state.setEnemies([]); runtime.update(1);
      const choice = runtime.reward.snapshot()?.choices[0]; if (!choice) throw new Error("draft missing");
      selected.push(choice.id); runtime.reward.selectDraft(0);
      expect(run.mods.owned[choice.id]).toBeGreaterThan(0);
    }
    expect(events.flatMap(event => validateGhostEventPayload(event))).toEqual([]);
    expect(() => new GhostTimeline(events)).not.toThrow();
    expect(events.filter(event => event.type === "draft.selected").map(event => event.payload.choiceId)).toEqual(selected);
    expect(events.filter(event => event.type === "system.checkpoint" && event.payload.effect === "pickup")).toHaveLength(2);
  });

  it("binds Chase boundaries to the stage actually loaded at emission, including native boss starts", () => {
    // Engineering transition setup; the real planner owns stage loading and native facts.
    const replay = createProductionReplayWorld({ seed: "chase-stage-boundary", mode: "gauntlet" }), bus = new TearGameplayEventBus();
    const runtime = createProductionWaveRewardRuntime(replay, { gameplayEvents: bus }), splits: GhostReferenceBoundary[] = [];
    const run = replay.world.state.run(); if (run === null) throw new Error("run missing");
    let stageFacts = 0; bus.subscribe((event) => { if (event.kind === "stage") stageFacts++; const boundary = ghostReferenceBoundary(event, { stage: replay.stage.index, time: run.runTime }); if (boundary) splits.push(boundary); });
    runtime.startNaturalOpening();
    run.wave = 10; run.runTime = 12; replay.world.lifecycle.clearWave(); replay.world.lifecycle.prepareReward("draft"); runtime.waves.startNextWave();
    expect(replay.stage.index).toBe(2); expect(stageFacts).toBe(0);
    expect(splits.at(-1)).toMatchObject({ stage: 2, wave: 11, time: 12, event: "start" });
    run.wave = 15; run.runTime = 24; replay.world.lifecycle.clearWave(); replay.world.lifecycle.prepareReward("draft"); runtime.waves.startNextWave();
    expect(run.isBossWave).toBe(true); expect(splits.at(-1)).toMatchObject({ stage: replay.stage.index, wave: 16, time: 24, event: "start" });
  });
  it("preserves restored focus until a source transition explicitly resets it", () => {
    const replay = createProductionReplayWorld({ seed: "reward-focus", mode: "endless" });
    const runtime = createProductionWaveRewardRuntime(replay); runtime.startNaturalOpening();
    Object.assign(replay.world.state.run()?.mods ?? {}, { draftRerolls: 1 });
    Object.assign(replay.world.state.run() ?? {}, { spawnQueue: [] }); replay.world.state.setEnemies([]); runtime.update(1);
    runtime.restoreUi("draft", 2); expect(runtime.focus()).toBe(2);
    runtime.reward.reroll(); expect(runtime.focus()).toBe(-1);
    runtime.restoreUi("playing", 1); runtime.routeAction({ type: "pause" });
    expect(runtime.screen()).toBe("paused"); expect(runtime.focus()).toBe(1);
    expect(() => { runtime.restoreUi("playing", Number.NaN); }).toThrow(/focus/);
  });
  it("owns a natural opening and routes its real draft transition without a host screen", () => {
    const replay = createProductionReplayWorld({ seed: "production-wave-reward", mode: "endless" });
    const runtime = createProductionWaveRewardRuntime(replay);

    runtime.startNaturalOpening();
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", wave: 1, reward: null });
    const run = replay.world.state.run() as never as { spawnQueue: unknown[] };
    run.spawnQueue = [];
    replay.world.state.setEnemies([]);
    runtime.update(1);

    expect(runtime.screen()).toBe("draft");
    const choice = runtime.reward.snapshot()?.choices[0];
    expect(choice).toBeDefined();
    expect(runtime.routeAction({ type: "draft-choice", choiceId: choice?.id ?? "missing" })).toBe(true);
    expect(runtime.screen()).toBe("playing");
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", wave: 2, reward: null });
  });
});
