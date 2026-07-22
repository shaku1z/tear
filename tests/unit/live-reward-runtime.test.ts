import { describe, expect, it, vi } from "vitest";
import { createLiveRewardRuntime } from "../../src/app/live-reward-runtime";

describe("live reward runtime", () => {
  it("owns controller replacement and persists draft transitions through its ports", () => {
    const run = { mode: "endless" as const, wave: 4, specialBlock: -1, specialsOffered: 0,
      reservedUpgrade: null, mods: { draftRerolls: 1, tier: {}, expandedDraft: false,
        reservePick: false, owned: {} } };
    const setScreen = vi.fn();
    const applyUpgrade = vi.fn();
    const runtime = createLiveRewardRuntime({
      run: () => run, roll: () => [{ id: "power" }, { id: "dash" }, { id: "storm", tiers: [{}] }],
      transitionPorts: {
        applyUpgrade, tierUp: vi.fn(), ghostLoadout: vi.fn(), ghostEvent: vi.fn(), consumeInput: vi.fn(),
        resetUi: vi.fn(), setScreen, startNextWave: vi.fn(), requestPointer: vi.fn(),
      },
    });
    expect(runtime.snapshot()).toBeNull();
    runtime.openDraft();
    expect(runtime.snapshot()).toMatchObject({ phase: "draft", wave: 4, rerolls: 1, specialsOffered: 1 });
    expect(setScreen).toHaveBeenCalledWith("draft");
    runtime.selectDraft(0);
    expect(applyUpgrade).toHaveBeenCalledWith({ id: "power" });
    expect(runtime.snapshot()?.phase).toBe("complete");
  });

  it("safely ignores selection commands before initialization", () => {
    const run = { mode: "campaign" as const, wave: 1, specialBlock: -1, specialsOffered: 0,
      reservedUpgrade: null, mods: { draftRerolls: 0, tier: {}, owned: {} } };
    const consumeInput = vi.fn();
    const runtime = createLiveRewardRuntime({
      run: () => run, roll: () => [], transitionPorts: {
        applyUpgrade: vi.fn(), tierUp: vi.fn(), ghostLoadout: vi.fn(), ghostEvent: vi.fn(), consumeInput,
        resetUi: vi.fn(), setScreen: vi.fn(), startNextWave: vi.fn(), requestPointer: vi.fn(),
      },
    });
    runtime.reroll(); runtime.selectDraft(0); runtime.selectReserve(0); runtime.selectTier(0);
    expect(consumeInput).not.toHaveBeenCalled();
  });
});
