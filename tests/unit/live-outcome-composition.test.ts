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
  it.each([
    ["defeat", "defeat"],
    ["victory", "boss-terminal"],
  ] as const)("cleans boss-local and environment ownership before %s termination", (outcome, environmentReason) => {
    const order: string[] = [];
    createLiveOutcomeComposition({ dependencies: {
      GAMEPLAY_EVENTS: {}, pendingFinalePersistence: { pending: () => null }, Input: { stopSemanticRecording: () => { order.push("input"); } },
    } as never, cleanupBossActors: () => { order.push("boss"); }, environment: { clear: (reason: string) => { order.push(`environment:${reason}`); } },
    lifecycle: { terminate: (reason: string) => { order.push(`lifecycle:${reason}`); } },
    } as never);
    const context = captured.context as unknown as { readonly terminate: (reason: "defeat" | "victory") => void };
    context.terminate(outcome);
    expect(order).toEqual(["boss", `environment:${environmentReason}`, `lifecycle:${outcome}`, "input"]);
  });

  it("cleans the active boss before retry starts a replacement run", () => {
    const order: string[] = [];
    createLiveOutcomeComposition({ dependencies: {
      GAMEPLAY_EVENTS: {}, pendingFinalePersistence: { pending: () => null },
      CG: { midgame: (callback: () => void) => { callback(); } },
    } as never, run: () => ({ mode: "bossonly", diff: "normal" }),
    cleanupBossActors: () => { order.push("cleanup"); }, environment: { clear: () => { order.push("environment"); } },
    startRun: () => { order.push("start"); },
    } as never);
    const context = captured.context as unknown as { readonly restartCurrentRun: () => void };
    context.restartCurrentRun();
    expect(order).toEqual(["cleanup", "environment", "start"]);
  });

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

  it("turns every durable terminal effect into a no-op for an active Ghost practice child", () => {
    const persist = vi.fn(); const saveProfile = vi.fn(); const clear = vi.fn(); const push = vi.fn();
    const recordDefeatProgress = vi.fn(); const dailyBump = vi.fn(); const achievementCheck = vi.fn();
    const logEvent = vi.fn(); const finishRecording = vi.fn(); const executeVictory = vi.fn();
    createLiveOutcomeComposition({ dependencies: {
      GAMEPLAY_EVENTS: {}, pendingFinalePersistence: { persist, saveProfile, clear, pending: () => null },
      outcomeDefeatProgressPersistence: { record: recordDefeatProgress }, DAILY: { bump: dailyBump }, Cloud: { push, logEvent },
      META: { coins: () => 99 },
    } as never, achievementCheck, economyTelemetry: () => ({}), finishRecording, executeVictory,
    saveBest: vi.fn(() => true), awardCoins: vi.fn(() => 12), getBest: vi.fn(() => ({ wave: 0, score: 0, time: 0 })),
    practiceSession: { active: () => ({ id: "practice" }) },
    } as never);

    const context = captured.context as unknown as {
      readonly saveBest: (run: { mode: string; diff: string; wave: number; score: number; runTime: number }) => boolean;
      readonly awardCoins: (score: number) => number; readonly achievementTracking: () => boolean;
      readonly recordDefeatProgress: (run: object, earned: number) => void;
      readonly executeVictoryIntents: (intents: readonly object[]) => void;
      readonly persistPendingFinale: (record: object) => void; readonly saveProfile: () => void;
      readonly clearPendingFinale: () => void; readonly pushCloud: () => void;
    };
    expect(context.saveBest({ mode: "endless", diff: "normal", wave: 2, score: 100, runTime: 20 })).toBe(false);
    expect(context.awardCoins(100)).toBe(0);
    expect(context.achievementTracking()).toBe(false);
    context.recordDefeatProgress({}, 0); context.executeVictoryIntents([{}]); context.persistPendingFinale({});
    context.saveProfile(); context.clearPendingFinale(); context.pushCloud();

    for (const effect of [persist, saveProfile, clear, push, recordDefeatProgress, dailyBump,
      achievementCheck, logEvent, finishRecording, executeVictory]) expect(effect).not.toHaveBeenCalled();
  });
});
