interface ReplayIndexEntry { readonly id: string; readonly shareId?: string | null }

export interface ReplayLibraryPorts {
  readonly vault: Readonly<{
    index(): readonly ReplayIndexEntry[];
    get(id: string): Record<string, unknown> | null;
    setShareId(id: string, shareId: string): void;
  }>;
  readonly cloud: Readonly<{
    hasLeaderboards(): boolean;
    loadGhost(mode: string, difficulty: string): Promise<Record<string, unknown> | null>;
    loadReplay(id: string): Promise<Record<string, unknown> | null>;
    publishReplay(record: Record<string, unknown>, summary: Record<string, unknown> | null): Promise<string | null | undefined>;
  }>;
  readonly enterReplay: (record: Record<string, unknown>, from: "profile" | "leaderboards") => boolean;
  readonly setProfileMessage: (message: string) => void;
  readonly setLeaderboardMessage: (message: string) => void;
}

export class ReplayLibraryController {
  readonly #ports: ReplayLibraryPorts;
  #watchSequence = 0;
  constructor(ports: ReplayLibraryPorts) { this.#ports = ports; }

  watch(id: string, from: "profile" | "leaderboards" = "profile"): void {
    const sequence = ++this.#watchSequence;
    if (id.startsWith("ghost:")) { this.#watchGhost(id); return; }
    const local = this.#ports.vault.get(id);
    if (local !== null) {
      this.#setMessage(from, "");
      if (!this.#ports.enterReplay(local, from)) this.#setMessage(from, "couldn't load that recording");
      return;
    }
    this.#setMessage(from, "loading replay…");
    void this.#ports.cloud.loadReplay(id).then((record) => {
      if (sequence !== this.#watchSequence) return;
      this.#setMessage(from, "");
      if (record === null || !this.#ports.enterReplay(record, from)) this.#setMessage(from, "couldn't load that replay");
    }).catch(() => { if (sequence === this.#watchSequence) this.#setMessage(from, "couldn't load that replay"); });
  }

  publish(id: string): void {
    const entry = this.#ports.vault.index().find((candidate) => candidate.id === id);
    if (entry === undefined) { this.#ports.setProfileMessage("couldn't load that recording"); return; }
    if (entry.shareId !== undefined && entry.shareId !== null) { this.#ports.setProfileMessage("already on the global feed"); return; }
    if (!this.#ports.cloud.hasLeaderboards()) { this.#ports.setProfileMessage("sharing needs the online layer"); return; }
    const record = this.#ports.vault.get(id);
    if (record === null) { this.#ports.setProfileMessage("couldn't load that recording"); return; }
    this.#ports.setProfileMessage("publishing…");
    void this.#ports.cloud.publishReplay(record, null).then((shareId) => {
      if (shareId !== null && shareId !== undefined && shareId !== "") {
        this.#ports.vault.setShareId(id, shareId);
        this.#ports.setProfileMessage("published to the global feed ✓");
      } else this.#ports.setProfileMessage("publish failed — try again");
    }).catch(() => { this.#ports.setProfileMessage("publish failed — try again"); });
  }

  #watchGhost(id: string): void {
    const sequence = this.#watchSequence;
    const [, mode = "", difficulty = ""] = id.split(":");
    this.#ports.setLeaderboardMessage("loading replay…");
    void this.#ports.cloud.loadGhost(mode, difficulty).then((record) => {
      if (sequence !== this.#watchSequence) return;
      this.#ports.setLeaderboardMessage("");
      if (record === null || !this.#ports.enterReplay(record, "leaderboards")) this.#ports.setLeaderboardMessage("no replay yet");
    }).catch(() => { if (sequence === this.#watchSequence) this.#ports.setLeaderboardMessage("no replay yet"); });
  }

  #setMessage(from: "profile" | "leaderboards", message: string): void {
    if (from === "profile") this.#ports.setProfileMessage(message);
    else this.#ports.setLeaderboardMessage(message);
  }
}
