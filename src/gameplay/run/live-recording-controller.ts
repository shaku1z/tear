import { leaderboardId, type LeaderboardRef } from "../../domain/leaderboards";
import { runLeaderboardEntries, type OutcomeRunState } from "./outcome-planner";
import { readGhostRunAssistance } from "./ghost-assistance";

export interface LiveRecordingPort<TKept> {
  readonly snapshot: () => OutcomeRunState;
  /** Ends the run's record; resolves with the kept record, or null when the run is not kept. */
  readonly endRecord: (won: boolean) => Promise<TKept | null>;
  /** The finished run's kept record, for the results screen's WATCH. */
  readonly recordEnded: (kept: Promise<TKept | null>) => void;
  readonly submitScore: (
    board: LeaderboardRef,
    score: Readonly<{ score: number; wave: number; time: number }>,
  ) => Promise<boolean>;
  /** Publishes the kept record as a leaderboard's replay; the share id, or null when it failed. */
  readonly publishReplay: (kept: TKept, board: string) => Promise<string | null>;
  readonly linkReplay: (board: LeaderboardRef, shareId: string) => void;
  /** Names the published copy of the kept record. */
  readonly markShared: (kept: TKept, shareId: string) => void;
}

/** A run's end: its record, its leaderboard entries and the replay each board links to. */
export class LiveRecordingController<TKept> {
  readonly #port: LiveRecordingPort<TKept>;

  constructor(port: LiveRecordingPort<TKept>) {
    this.#port = port;
  }

  finish(won: boolean): Promise<TKept | null> {
    const run = this.#port.snapshot();
    const kept = this.#port.endRecord(won);
    this.#port.recordEnded(kept);

    // Validate the captured run, not current visibility or a later replacement.
    if (
      run.beatThisRun !== undefined ||
      run.seedRace !== undefined ||
      readGhostRunAssistance(run.ghostAssistance) !== undefined
    )
      return kept;
    // Each board the run beats gets its own published replay (one per board per player), so a
    // later best on one board never swaps the replay another board links to.
    for (const { board, entry, keptShare } of runLeaderboardEntries(run))
      void this.#port.submitScore(board, entry).then(async (accepted) => {
        const record = accepted ? await kept : null;
        if (record === null) return;
        const shareId = await this.#port.publishReplay(record, `lb_${leaderboardId(board)}`);
        if (shareId === null || shareId === "") return;
        this.#port.linkReplay(board, shareId);
        // Only the run's own board names the kept record's share id, not whichever publish ends last.
        if (keptShare) this.#port.markShared(record, shareId);
      });
    return kept;
  }
}
