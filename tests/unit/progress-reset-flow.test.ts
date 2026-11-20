import { describe, expect, it } from "vitest";
import {
  createResetProgressFlow,
  RESET_ARMED_EXPIRY_MS,
  RESET_CONFIRM_DELAY_MS,
} from "../../src/app/progress/progress-reset-flow";
import type { ProgressResetOutcome } from "../../src/app/progress/progress-reset";

function harness(outcome: ProgressResetOutcome | "throws" = "erased") {
  let now = 1000;
  const calls = { reset: 0, reload: 0 };
  const flow = createResetProgressFlow({
    now: () => now,
    reset: () => {
      calls.reset += 1;
      return outcome === "throws" ? Promise.reject(new Error("boom")) : Promise.resolve(outcome);
    },
    reload: () => {
      calls.reload += 1;
    },
  });
  return {
    flow,
    calls,
    wait: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("reset progress flow", () => {
  it("does not erase on the first press: it only asks", () => {
    const { flow, calls } = harness();
    flow.press();
    expect(flow.view()).toEqual({ stage: "armed", confirmable: false, failure: null });
    expect(calls.reset).toBe(0);
  });

  it("ignores a press right after arming, so a double press cannot confirm what it just asked", () => {
    const { flow, calls, wait } = harness();
    flow.press();
    wait(RESET_CONFIRM_DELAY_MS - 1);
    flow.press();
    expect(calls.reset).toBe(0);
    expect(flow.view().stage).toBe("armed");
    wait(1);
    expect(flow.view().confirmable).toBe(true);
  });

  it("erases on a deliberate second press and restarts the game on the erased save", async () => {
    const { flow, calls, wait } = harness("erased");
    flow.press();
    wait(RESET_CONFIRM_DELAY_MS);
    flow.press();
    expect(flow.view().stage).toBe("working");
    flow.press(); // a press while working changes nothing
    await settle();
    expect(calls).toEqual({ reset: 1, reload: 1 });
  });

  it("goes back to idle with the reason when the erase changed nothing, and does not restart", async () => {
    for (const outcome of ["online-failed", "device-failed"] as const) {
      const { flow, calls, wait } = harness(outcome);
      flow.press();
      wait(RESET_CONFIRM_DELAY_MS);
      flow.press();
      await settle();
      expect(flow.view()).toEqual({ stage: "idle", confirmable: false, failure: outcome });
      expect(calls.reload).toBe(0);
      flow.press(); // trying again asks again, and the old reason is gone
      expect(flow.view()).toMatchObject({ stage: "armed", failure: null });
    }
  });

  it("treats an erase that throws as one that changed nothing on this device", async () => {
    const { flow, calls, wait } = harness("throws");
    flow.press();
    wait(RESET_CONFIRM_DELAY_MS);
    flow.press();
    await settle();
    expect(flow.view()).toMatchObject({ stage: "idle", failure: "device-failed" });
    expect(calls.reload).toBe(0);
  });

  it("cancels, and disarms by itself after the expiry so a left-open confirmation is not one press from erasing", () => {
    const first = harness();
    first.flow.press();
    first.flow.cancel();
    expect(first.flow.view().stage).toBe("idle");

    const second = harness();
    second.flow.press();
    second.wait(RESET_ARMED_EXPIRY_MS + 1);
    expect(second.flow.view().stage).toBe("idle");
    second.flow.press(); // a press after the expiry arms again instead of erasing
    expect(second.flow.view().stage).toBe("armed");
    expect(second.calls.reset).toBe(0);
  });
});
