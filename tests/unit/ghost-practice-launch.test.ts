import { describe, expect, it, vi } from "vitest";
import type { GhostPracticeChild } from "../../src/ghost/replay-world";
import { createLiveGhostPracticeSessionState } from "../../src/app/live-ghost-practice-session-state";

const captured = vi.hoisted(() => ({ restore: vi.fn() }));

vi.mock("../../src/tearbench/live-runtime-snapshots", () => ({
  createLiveStateForgeRestoreFactory: vi.fn(() => ({})),
}));
vi.mock("../../src/tearbench/live-state-snapshot", () => ({
  restoreSnapshotIntoLiveWorld: captured.restore,
}));

import { launchGhostPracticeChild } from "../../src/app/ghost-practice-launch";

function child(): GhostPracticeChild {
  return Object.freeze({
    id: "source:practice:120:exact-practice", sourceGhostId: "source", sourceRootHash: "root", forkTick: 120,
    mode: "exact-practice", snapshot: { tick: 120 } as GhostPracticeChild["snapshot"], inputLatchPolicy: "release-all",
    rankedEligible: false, leaderboardEligible: false,
    lineage: Object.freeze({ relation: "forked-at", parentId: "source", parentRootHash: "root", forkTick: 120 }),
  });
}

describe("Ghost player practice launch", () => {
  it("restores the child transactionally, clears inherited recording, and activates only the unranked disposition", () => {
    const committed = vi.fn();
    captured.restore.mockImplementation((_snapshot: unknown, _registry: unknown, _factory: unknown,
      stateForge: Readonly<{ commit: (candidate: unknown) => void }>) => {
      stateForge.commit({ candidate: true });
      return Object.freeze({ ok: true, exactHash: "exact", semanticHash: "semantic" });
    });
    const practice = createLiveGhostPracticeSessionState();
    const clearRestoredRecording = vi.fn();
    const setPlaying = vi.fn();
    const requestPointer = vi.fn();
    const source = child();
    const before = JSON.stringify(source);

    const result = launchGhostPracticeChild(source, {
      registry: {} as never,
      stateForge: { capture: vi.fn(), stage: vi.fn(), validate: vi.fn(() => []), commit: committed },
      hasLiveWorld: () => false,
      practice, clearRestoredRecording, setPlaying, requestPointer,
    });

    expect(result).toEqual({ ok: true, child: source, semanticHash: "semantic" });
    expect(committed).toHaveBeenCalledWith({ candidate: true });
    expect(clearRestoredRecording).toHaveBeenCalledOnce();
    expect(practice.active()).toBe(source);
    expect(setPlaying).toHaveBeenCalledOnce();
    expect(requestPointer).toHaveBeenCalledOnce();
    expect(JSON.stringify(source)).toBe(before);
  });

  it("rejects a child whose custody or unranked boundary was altered before restoring anything", () => {
    const restore = captured.restore.mockClear();
    const practice = createLiveGhostPracticeSessionState();
    const result = launchGhostPracticeChild({ ...child(), rankedEligible: true } as never, {
      registry: {} as never,
      stateForge: {} as never,
      hasLiveWorld: () => false,
      practice, clearRestoredRecording: vi.fn(), setPlaying: vi.fn(), requestPointer: vi.fn(),
    });

    expect(result).toEqual({ ok: false, message: "Practice child failed custody validation." });
    expect(restore).not.toHaveBeenCalled();
    expect(practice.active()).toBeNull();
  });
});
