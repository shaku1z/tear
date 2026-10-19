import { describe, expect, it } from "vitest";

import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionWaveRewardRuntime } from "../../src/tearbench/production-wave-reward-runtime";

describe("production wave and reward runtime", () => {
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
