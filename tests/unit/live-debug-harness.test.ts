import { describe, expect, it } from "vitest";

import { clearPreparedOrActiveDebugWave, type DebugLifecycle } from "../../src/app/live-debug-harness";
import { RunLifecycleController } from "../../src/gameplay/run/lifecycle";

function debugLifecycle(controller: RunLifecycleController): DebugLifecycle {
  return {
    get phase() { return controller.phase; },
    activateWave() { controller.activateWave(); },
    clearWave() { controller.clearWave(); },
    prepareReward(reward) { controller.prepareReward(reward); },
    terminate(outcome) { controller.terminate(outcome); },
  };
}

describe("live debug journey wave preparation", () => {
  it("activates a deferred prepared wave before clearing it", () => {
    const controller = new RunLifecycleController();
    controller.start("agent-journey");
    controller.prepareWave(1, false, true);

    clearPreparedOrActiveDebugWave(debugLifecycle(controller));

    expect(controller.snapshot()).toMatchObject({
      phase: "wave-cleared",
      activationDeferred: false,
      revision: 4,
    });
  });

  it("clears an already active wave and rejects unrelated phases", () => {
    const active = new RunLifecycleController();
    active.start("active");
    active.prepareWave(1, false, false);
    active.activateWave();
    clearPreparedOrActiveDebugWave(debugLifecycle(active));
    expect(active.phase).toBe("wave-cleared");

    const preparing = new RunLifecycleController();
    preparing.start("preparing");
    expect(() => { clearPreparedOrActiveDebugWave(debugLifecycle(preparing)); }).toThrow("active or prepared");
  });
});
