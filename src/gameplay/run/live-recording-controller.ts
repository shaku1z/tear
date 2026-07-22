import {
  buildRecordingSummary,
  type OutcomeRunState,
  type RecordingLoadoutEntry,
  type RecordingSummary,
} from "./outcome-planner";

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
    mode: OutcomeRunState["mode"],
    difficulty: OutcomeRunState["diff"],
    score: Readonly<{ score: number; wave: number; time: number }>,
  ) => Promise<boolean>;
  readonly publishReplay: (replay: TReplay, board: string) => Promise<string | null>;
  readonly linkReplay: (mode: OutcomeRunState["mode"], difficulty: OutcomeRunState["diff"], shareId: string) => void;
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

    const board = `lb_${run.mode}_${run.diff}`;
    void this.#port.submitScore(run.mode, run.diff, {
      score: run.score,
      wave: run.wave,
      time: run.runTime,
    }).then((accepted) => {
      if (!accepted || replay === null) return;
      void this.#port.publishReplay(replay, board).then((shareId) => {
        if (shareId === null || shareId === "") return;
        this.#port.linkReplay(run.mode, run.diff, shareId);
        if (vaultId !== null && vaultId !== "") this.#port.attachShareId(vaultId, shareId);
      });
    });
    return replay;
  }
}
