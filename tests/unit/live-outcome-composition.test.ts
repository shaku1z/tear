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
  it("passes every pending-finale operation through the composition-owned adapter", () => {
    const persist = vi.fn();
    const saveProfile = vi.fn();
    const clear = vi.fn();
    const pending = vi.fn(() => null);
    createLiveOutcomeComposition({ dependencies: { GAMEPLAY_EVENTS: {}, pendingFinalePersistence: { persist, saveProfile, clear, pending } } as never } as never);

    const context = captured.context as unknown as {
      readonly persistPendingFinale: (record: object) => void;
      readonly saveProfile: () => void;
      readonly clearPendingFinale: () => void;
      readonly pendingFinale: () => unknown;
    };
    const record = { weapon: "sword" };
    context.persistPendingFinale(record);
    context.saveProfile();
    context.clearPendingFinale();

    expect(persist).toHaveBeenCalledWith(record);
    expect(saveProfile).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
    expect(context.pendingFinale()).toBeNull();
    expect(pending).toHaveBeenCalledOnce();
  });
});
