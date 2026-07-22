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
  constructor(ports: ReplayLibraryPorts) { this.#ports = ports; }

  watch(id: string): void {
    if (id.startsWith("ghost:")) { this.#watchGhost(id); return; }
    const local = this.#ports.vault.get(id);
    if (local !== null) {
      this.#ports.setProfileMessage("");
      if (!this.#ports.enterReplay(local, "profile")) this.#ports.setProfileMessage("couldn't load that recording");
      return;
    }
    this.#ports.setProfileMessage("loading replayâ€¦");
    void this.#ports.cloud.loadReplay(id).then((record) => {
      this.#ports.setProfileMessage("");
      if (record === null || !this.#ports.enterReplay(record, "leaderboards")) this.#ports.setProfileMessage("couldn't load that replay");
    }).catch(() => { this.#ports.setProfileMessage("couldn't load that replay"); });
  }

  publish(id: string): void {
    const entry = this.#ports.vault.index().find((candidate) => candidate.id === id);
    if (entry === undefined) { this.#ports.setProfileMessage("couldn't load that recording"); return; }
    if (entry.shareId !== undefined && entry.shareId !== null) { this.#ports.setProfileMessage("already on the global feed"); return; }
    if (!this.#ports.cloud.hasLeaderboards()) { this.#ports.setProfileMessage("sharing needs the online layer"); return; }
    const record = this.#ports.vault.get(id);
    if (record === null) { this.#ports.setProfileMessage("couldn't load that recording"); return; }
    this.#ports.setProfileMessage("publishingâ€¦");
    void this.#ports.cloud.publishReplay(record, null).then((shareId) => {
      if (shareId !== null && shareId !== undefined && shareId !== "") {
        this.#ports.vault.setShareId(id, shareId);
        this.#ports.setProfileMessage("published to the global feed âœ“");
      } else this.#ports.setProfileMessage("publish failed â€” try again");
    }).catch(() => { this.#ports.setProfileMessage("publish failed â€” try again"); });
  }

  #watchGhost(id: string): void {
    const [, mode = "", difficulty = ""] = id.split(":");
    this.#ports.setLeaderboardMessage("loading replayâ€¦");
    void this.#ports.cloud.loadGhost(mode, difficulty).then((record) => {
      this.#ports.setLeaderboardMessage("");
      if (record === null || !this.#ports.enterReplay(record, "leaderboards")) this.#ports.setLeaderboardMessage("no replay yet");
    }).catch(() => { this.#ports.setLeaderboardMessage("no replay yet"); });
  }
}
