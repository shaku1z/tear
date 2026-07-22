import { describe, expect, it, vi } from "vitest";
import { LiveRecordingController } from "../../src/gameplay/run/live-recording-controller";

function snapshot() {
  return {
    mode: "endless" as const,
    diff: "hard" as const,
    wave: 12,
    score: 4500,
    runTime: 91.4,
    waveTime: 5,
    waveKills: 2,
    wavePeak: 4,
    waveLog: [{ wave: 11, time: 8, kills: 7, peak: 3 }],
    weaponId: "blade",
    damagedThisRun: false,
  };
}

describe("LiveRecordingController", () => {
  it("packages, stores, submits, publishes, and links one replay", async () => {
    const events: string[] = [];
    const replay = { thumb: "data:image/png;base64,thumb" };
    const controller = new LiveRecordingController({
      snapshot,
      displayName: () => "Rin",
      stageIndex: () => 2,
      loadout: () => [{ id: "reach", tier: 2, count: 1 }],
      authoritativeResult: () => ({ tick: 120, stateHash: "hash" }),
      stopRecording: (summary) => { events.push(`stop:${String(summary.authoritativeTick)}`); return replay; },
      storeReplay: (_recording, summary) => { events.push(`store:${String(summary.thumb)}`); return "vault-1"; },
      recordingStopped: () => events.push("stopped"),
      replayStored: () => events.push("stored"),
      submitScore: (_mode, _difficulty, score) => { events.push(`submit:${String(score.score)}`); return Promise.resolve(true); },
      publishReplay: (_recording, board) => { events.push(`publish:${board}`); return Promise.resolve("share-1"); },
      linkReplay: () => events.push("link"),
      attachShareId: () => events.push("attach"),
    });

    expect(controller.finish(true)).toBe(replay);
    await vi.waitFor(() => { expect(events).toContain("attach"); });
    expect(events).toEqual([
      "stop:120", "stopped", "store:data:image/png;base64,thumb", "stored", "submit:4500",
      "publish:lb_endless_hard", "link", "attach",
    ]);
  });

  it("submits the score but does not publish when no recording exists", async () => {
    const submit = vi.fn(() => Promise.resolve(true));
    const publish = vi.fn(() => Promise.resolve("share"));
    const controller = new LiveRecordingController({
      snapshot,
      displayName: () => "",
      stageIndex: () => 0,
      loadout: () => [],
      authoritativeResult: () => null,
      stopRecording: () => null,
      storeReplay: () => null,
      recordingStopped: () => undefined,
      replayStored: () => undefined,
      submitScore: submit,
      publishReplay: publish,
      linkReplay: () => undefined,
      attachShareId: () => undefined,
    });
    expect(controller.finish(false)).toBeNull();
    await vi.waitFor(() => { expect(submit).toHaveBeenCalledOnce(); });
    expect(publish).not.toHaveBeenCalled();
  });
});
