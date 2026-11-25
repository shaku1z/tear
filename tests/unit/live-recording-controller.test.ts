import { describe, expect, it, vi } from "vitest";
import { LiveRecordingController, type LiveRecordingPort } from "../../src/gameplay/run/live-recording-controller";
import { readGhostRunAssistance } from "../../src/gameplay/run/ghost-assistance";

type Kept = Readonly<{ key: string }>;

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

function port(overrides: Partial<LiveRecordingPort<Kept>> = {}): LiveRecordingPort<Kept> {
  return {
    snapshot,
    endRecord: () => Promise.resolve({ key: "replay-1" }),
    recordEnded: () => undefined,
    submitScore: () => Promise.resolve(true),
    publishReplay: (_kept, board) => Promise.resolve(`share-${board}`),
    linkReplay: () => undefined,
    markShared: () => undefined,
    ...overrides,
  };
}

describe("LiveRecordingController", () => {
  it("keeps an assisted run's record without submitting or publishing it", async () => {
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
      recordEnded = vi.fn();
    const controller = new LiveRecordingController(
      port({
        snapshot: () => ({ ...snapshot(), ghostAssistance: assistance }),
        submitScore,
        publishReplay,
        recordEnded,
      }),
    );
    await expect(controller.finish(false)).resolves.toEqual({ key: "replay-1" });
    expect(recordEnded).toHaveBeenCalledOnce();
    expect(submitScore).not.toHaveBeenCalled();
    expect(publishReplay).not.toHaveBeenCalled();
  });

  it("ends the record, submits, publishes the kept record, links it and names its share", async () => {
    const events: string[] = [];
    const kept = { key: "replay-1" };
    const controller = new LiveRecordingController(
      port({
        endRecord: (won) => {
          events.push(`end:${String(won)}`);
          return Promise.resolve(kept);
        },
        recordEnded: () => events.push("ended"),
        submitScore: (_board, score) => {
          events.push(`submit:${String(score.score)}`);
          return Promise.resolve(true);
        },
        publishReplay: (record, board) => {
          events.push(`publish:${record.key}:${board}`);
          return Promise.resolve("share-1");
        },
        linkReplay: () => events.push("link"),
        markShared: (record, shareId) => events.push(`shared:${record.key}:${shareId}`),
      }),
    );

    await expect(controller.finish(true)).resolves.toBe(kept);
    await vi.waitFor(() => {
      expect(events).toContain("shared:replay-1:share-1");
    });
    expect(events).toEqual([
      "end:true",
      "ended",
      "submit:4500",
      "publish:replay-1:lb_endless_hard",
      "link",
      "shared:replay-1:share-1",
    ]);
  });

  it("enters a cleared Gauntlet on its score board and its fastest-clear board, each with its own replay", async () => {
    const submitted: string[] = [];
    const published: string[] = [];
    const linked: string[] = [];
    const markShared = vi.fn();
    const gauntlet = (trialsCleared: number) =>
      new LiveRecordingController(
        port({
          snapshot: () => ({
            ...snapshot(),
            mode: "gauntlet" as const,
            gauntlet: { trialsCleared, trialCount: 6, boss: "source", ticks: 108_000, hits: 3 },
          }),
          submitScore: (board, entry) => {
            submitted.push(`${board.kind}:${String(entry.score)}:${String(entry.wave)}`);
            return Promise.resolve(true);
          },
          publishReplay: (_kept, board) => {
            published.push(board);
            return Promise.resolve(`share-${board}`);
          },
          linkReplay: (board, shareId) => linked.push(`${board.kind}:${shareId}`),
          markShared,
        }),
      );
    void gauntlet(6).finish(true);
    await vi.waitFor(() => {
      expect(linked).toHaveLength(2);
    });
    expect(submitted).toEqual(["score:4500:12", "gauntlet-clear:108000:6"]);
    expect(published).toEqual(["lb_gauntlet_hard", "lb_gauntletclear_hard"]);
    expect(linked).toEqual(["score:share-lb_gauntlet_hard", "gauntlet-clear:share-lb_gauntletclear_hard"]);
    // The kept record names the score board's replay only, whichever publish ends last.
    expect(markShared.mock.calls).toEqual([[{ key: "replay-1" }, "share-lb_gauntlet_hard"]]);
    // A run that ends before the last boss is on the score board only.
    submitted.length = 0;
    void gauntlet(4).finish(false);
    await vi.waitFor(() => {
      expect(submitted).toEqual(["score:4500:12"]);
    });
  });

  it("submits the score but publishes nothing when the run was not kept", async () => {
    const submit = vi.fn(() => Promise.resolve(true));
    const publish = vi.fn(() => Promise.resolve("share"));
    const controller = new LiveRecordingController(
      port({ endRecord: () => Promise.resolve(null), submitScore: submit, publishReplay: publish }),
    );
    await expect(controller.finish(false)).resolves.toBeNull();
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledOnce();
    });
    expect(publish).not.toHaveBeenCalled();
  });
});
