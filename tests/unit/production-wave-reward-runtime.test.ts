import { describe, expect, it } from "vitest";

import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionWaveRewardRuntime } from "../../src/tearbench/production-wave-reward-runtime";

describe("production wave and reward runtime", () => {
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
