import { describe, expect, it, vi } from "vitest";
import { LiveRecordingController } from "../../src/gameplay/run/live-recording-controller";
import { readGhostRunAssistance } from "../../src/gameplay/run/ghost-assistance";
import type { RecordingSummary } from "../../src/gameplay/run/outcome-planner";

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
  it("retains sticky assisted source metadata locally without ordinary score submission or automatic publication", () => {
    const assistance = readGhostRunAssistance({
      format: "tear-ghost-chase",
      version: 1,
      sourceId: "original",
      sourceManifestHash: "a".repeat(16),
      sourceRoot: "b".repeat(16),
      actor: "unknown",
      coachEnabled: true,
      ghostVisible: true,
      competitiveEligible: false,
    });
    if (assistance === undefined) throw new Error("missing disposition");
    const submitScore = vi.fn(),
      publishReplay = vi.fn(),
      stopRecording = vi.fn<(summary: RecordingSummary) => { thumb: string }>(() => ({ thumb: "owned" }));
    const controller = new LiveRecordingController({
      snapshot: () => ({ ...snapshot(), ghostAssistance: assistance }),
      displayName: () => "",
      stageIndex: () => 0,
      loadout: () => [],
      authoritativeResult: () => null,
      stopRecording,
      storeReplay: () => "retained",
      recordingStopped: () => undefined,
      replayStored: () => undefined,
      submitScore,
      publishReplay,
      linkReplay: vi.fn(),
      attachShareId: vi.fn(),
    });
    controller.finish(false);
    expect(submitScore).not.toHaveBeenCalled();
    expect(publishReplay).not.toHaveBeenCalled();
    expect(stopRecording.mock.calls[0]?.[0]).toMatchObject({ ghostAssistance: assistance });
    expect(() => readGhostRunAssistance({ ...assistance, competitiveEligible: true })).toThrow();
    expect(readGhostRunAssistance(JSON.parse(JSON.stringify(assistance)))).toEqual(assistance);
  });
  it("packages, stores, submits, publishes, and links one replay", async () => {
    const events: string[] = [];
    const replay = { thumb: "data:image/png;base64,thumb" };
    const controller = new LiveRecordingController({
      snapshot,
      displayName: () => "Rin",
      stageIndex: () => 2,
      loadout: () => [{ id: "reach", tier: 2, count: 1 }],
      authoritativeResult: () => ({ tick: 120, stateHash: "hash" }),
      stopRecording: (summary) => {
        events.push(`stop:${String(summary.authoritativeTick)}`);
        return replay;
      },
      storeReplay: (_recording, summary) => {
        events.push(`store:${String(summary.thumb)}`);
        return "vault-1";
      },
      recordingStopped: () => events.push("stopped"),
      replayStored: () => events.push("stored"),
      submitScore: (_board, score) => {
        events.push(`submit:${String(score.score)}`);
        return Promise.resolve(true);
      },
      publishReplay: (_recording, board) => {
        events.push(`publish:${board}`);
        return Promise.resolve("share-1");
      },
      linkReplay: () => events.push("link"),
      attachShareId: () => events.push("attach"),
    });

    expect(controller.finish(true)).toBe(replay);
    await vi.waitFor(() => {
      expect(events).toContain("attach");
    });
    expect(events).toEqual([
      "stop:120",
      "stopped",
      "store:data:image/png;base64,thumb",
      "stored",
      "submit:4500",
      "publish:lb_endless_hard",
      "link",
      "attach",
    ]);
  });

  it("enters a cleared Gauntlet on its score board and its fastest-clear board, each with its own replay", async () => {
    const submitted: string[] = [];
    const published: string[] = [];
    const linked: string[] = [];
    const gauntlet = (trialsCleared: number) =>
      new LiveRecordingController({
        snapshot: () => ({
          ...snapshot(),
          mode: "gauntlet" as const,
          gauntlet: { trialsCleared, trialCount: 6, boss: "source", ticks: 108_000, hits: 3 },
        }),
        displayName: () => "Rin",
        stageIndex: () => 0,
        loadout: () => [],
        authoritativeResult: () => null,
        stopRecording: () => ({ thumb: "t" }),
        storeReplay: () => "vault-1",
        recordingStopped: () => undefined,
        replayStored: () => undefined,
        submitScore: (board, entry) => {
          submitted.push(`${board.kind}:${String(entry.score)}:${String(entry.wave)}`);
          return Promise.resolve(true);
        },
        publishReplay: (_recording, board) => {
          published.push(board);
          return Promise.resolve(`share-${board}`);
        },
        linkReplay: (board, shareId) => linked.push(`${board.kind}:${shareId}`),
        attachShareId: vi.fn(),
      });
    gauntlet(6).finish(true);
    await vi.waitFor(() => {
      expect(linked).toHaveLength(2);
    });
    expect(submitted).toEqual(["score:4500:12", "gauntlet-clear:108000:6"]);
    expect(published).toEqual(["lb_gauntlet_hard", "lb_gauntletclear_hard"]);
    expect(linked).toEqual(["score:share-lb_gauntlet_hard", "gauntlet-clear:share-lb_gauntletclear_hard"]);
    // A run that ends before the last boss is on the score board only.
    submitted.length = 0;
    gauntlet(4).finish(false);
    await vi.waitFor(() => {
      expect(submitted).toEqual(["score:4500:12"]);
    });
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
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledOnce();
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
