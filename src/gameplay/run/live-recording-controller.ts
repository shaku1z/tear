import { leaderboardId, type LeaderboardRef } from "../../domain/leaderboards";
import {
  buildRecordingSummary,
  runLeaderboardEntries,
  type OutcomeRunState,
  type RecordingLoadoutEntry,
  type RecordingSummary,
} from "./outcome-planner";
import { readGhostRunAssistance } from "./ghost-assistance";

export interface RecordedReplay {
  readonly thumb?: unknown;
}

export interface StoredRecordingSummary extends RecordingSummary {
  readonly thumb: unknown;
}

export interface LiveRecordingPort<TReplay extends RecordedReplay> {
  readonly snapshot: () => OutcomeRunState;
  readonly displayName: () => string;
  readonly stageIndex: () => number;
  readonly loadout: () => readonly RecordingLoadoutEntry[];
  readonly authoritativeResult: () => Readonly<{ tick: number; stateHash: string }> | null;
  readonly stopRecording: (summary: RecordingSummary) => TReplay | null;
  readonly storeReplay: (replay: TReplay, summary: StoredRecordingSummary) => string | null;
  readonly recordingStopped: (replay: TReplay | null) => void;
  readonly replayStored: (vaultId: string | null) => void;
  readonly submitScore: (
    board: LeaderboardRef,
    score: Readonly<{ score: number; wave: number; time: number }>,
  ) => Promise<boolean>;
  readonly publishReplay: (replay: TReplay, board: string) => Promise<string | null>;
  readonly linkReplay: (board: LeaderboardRef, shareId: string) => void;
  readonly attachShareId: (vaultId: string, shareId: string) => void;
}

export class LiveRecordingController<TReplay extends RecordedReplay> {
  readonly #port: LiveRecordingPort<TReplay>;

  constructor(port: LiveRecordingPort<TReplay>) {
    this.#port = port;
  }

  finish(won: boolean): TReplay | null {
    const run = this.#port.snapshot();
    const authority = this.#port.authoritativeResult();
    const summary = buildRecordingSummary(run, {
      won,
      displayName: this.#port.displayName(),
      stageIndex: this.#port.stageIndex(),
      loadout: this.#port.loadout(),
      authoritativeTick: authority?.tick ?? 0,
      authoritativeStateHash: authority?.stateHash ?? "",
    });
    const replay = this.#port.stopRecording(summary);
    this.#port.recordingStopped(replay);
    let vaultId: string | null = null;
    if (replay !== null) {
      vaultId = this.#port.storeReplay(replay, Object.freeze({ ...summary, thumb: replay.thumb ?? null }));
      this.#port.replayStored(vaultId);
    }

    // Validate the captured run, not current visibility or a later replacement.
    if (
      run.beatThisRun !== undefined ||
      run.seedRace !== undefined ||
      readGhostRunAssistance(run.ghostAssistance) !== undefined
    )
      return replay;
    // Each board the run beats gets its own published replay (one per board per player), so a
    // later best on one board never swaps the replay another board links to.
    for (const { board, entry, vaultShare } of runLeaderboardEntries(run))
      void this.#port.submitScore(board, entry).then((accepted) => {
        if (!accepted || replay === null) return;
        void this.#port.publishReplay(replay, `lb_${leaderboardId(board)}`).then((shareId) => {
          if (shareId === null || shareId === "") return;
          this.#port.linkReplay(board, shareId);
          // Only the run's own board names the vault copy's share id, not whichever publish ends last.
          if (vaultShare && vaultId !== null && vaultId !== "") this.#port.attachShareId(vaultId, shareId);
        });
      });
    return replay;
  }
}
