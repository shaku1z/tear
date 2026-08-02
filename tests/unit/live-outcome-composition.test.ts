import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ context: null as Record<string, unknown> | null }));

vi.mock("../../src/app/live-run-outcome-host", () => ({
  createLiveRunOutcomeHost: (context: Record<string, unknown>) => { captured.context = context; },
}));
vi.mock("../../src/gameplay/runtime/gameplay-event-publishers", () => ({
  createTearTerminalRunFactPublisher: () => vi.fn(),
}));

import { createLiveOutcomeComposition } from "../../src/app/live-outcome-composition";

describe("live outcome composition pending-finale persistence", () => {
  it("passes every outcome persistence operation through composition-owned adapters", () => {
    const persist = vi.fn();
    const saveProfile = vi.fn();
    const clear = vi.fn();
    const pending = vi.fn(() => null);
    const recordDefeatProgress = vi.fn();
    const dailyBump = vi.fn();
    const achievementCheck = vi.fn();
    const push = vi.fn();
    const logEvent = vi.fn();
    const finishRecording = vi.fn();
    createLiveOutcomeComposition({ dependencies: {
      GAMEPLAY_EVENTS: {}, pendingFinalePersistence: { persist, saveProfile, clear, pending },
      outcomeDefeatProgressPersistence: { record: recordDefeatProgress },
      DAILY: { bump: dailyBump }, Cloud: { push, logEvent },
    } as never, achievementCheck, economyTelemetry: () => ({}), finishRecording } as never);

    const context = captured.context as unknown as {
      readonly persistPendingFinale: (record: object) => void;
      readonly saveProfile: () => void;
      readonly clearPendingFinale: () => void;
      readonly pendingFinale: () => unknown;
      readonly recordDefeatProgress: (run: object, earned: number) => void;
    };
    const record = { weapon: "sword" };
    context.persistPendingFinale(record);
    context.saveProfile();
    context.clearPendingFinale();
    context.recordDefeatProgress({ runTime: 19.8 }, 12);

    expect(persist).toHaveBeenCalledWith(record);
    expect(saveProfile).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(context.pendingFinale()).toBeNull();
    expect(pending).toHaveBeenCalledOnce();
    expect(recordDefeatProgress).toHaveBeenCalledWith({ runTime: 19.8 });
    expect(dailyBump).toHaveBeenCalledWith("runs", 1);
    expect(achievementCheck).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
    expect(logEvent).toHaveBeenCalledOnce();
    expect(finishRecording).toHaveBeenCalledWith(false);
  });
});
