import type { ReplayReadResult, ReplayRecord } from "../../replay/record";

type From = "profile" | "leaderboards";

export interface ReplayLibraryPorts {
  /** A published replay, read (src/replay/share.ts `loadSharedReplay`); null when it could not be loaded. */
  readonly loadShared: (shareId: string) => Promise<ReplayReadResult | null>;
  /** Opens a record on the replay screen under `key`; false when it cannot be played. */
  readonly watch: (record: ReplayRecord, key: string, from: From) => Promise<boolean>;
  readonly setProfileMessage: (message: string) => void;
  readonly setLeaderboardMessage: (message: string) => void;
}

/** The replay screen's key for a published replay, so it never meets a kept record's key. */
export function sharedReplayKey(shareId: string): string {
  return `shared:${shareId}`;
}

/** Watches a published replay: a leaderboard row's or a feed row's. */
export class ReplayLibraryController {
  readonly #ports: ReplayLibraryPorts;
  #watchSequence = 0;
  constructor(ports: ReplayLibraryPorts) {
    this.#ports = ports;
  }

  watch(shareId: string, from: From = "profile"): void {
    const sequence = ++this.#watchSequence;
    this.#setMessage(from, "loading replay…");
    void this.#ports
      .loadShared(shareId)
      .then(async (read) => {
        if (sequence !== this.#watchSequence) return;
        if (read === null) {
          this.#setMessage(from, "couldn't load that replay");
          return;
        }
        if (!read.ok) {
          this.#setMessage(from, read.message);
          return;
        }
        this.#setMessage(from, "");
        const opened = await this.#ports.watch(read.record, sharedReplayKey(shareId), from);
        if (!opened && sequence === this.#watchSequence) this.#setMessage(from, "this replay can't be played");
      })
      .catch(() => {
        if (sequence === this.#watchSequence) this.#setMessage(from, "couldn't load that replay");
      });
  }

  #setMessage(from: From, message: string): void {
    if (from === "profile") this.#ports.setProfileMessage(message);
    else this.#ports.setLeaderboardMessage(message);
  }
}
