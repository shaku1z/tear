/**
 * The REPLAYS list's state and row actions (src/app/replay/replay-list.ts builds the rows).
 *
 * Kept records come from the `tear-replays` store, opened through `openStore` (the store's code is in the
 * lazily loaded replay recorder chunk, so startup carries none of it). Recordings made before this update
 * (earlier-replays.ts) are counted for the list's notice, which saves them to a file or removes them. Every
 * action resolves to a plain message on the list; none throws.
 */
import { EARLIER_VERSION_MESSAGE, MALFORMED_MESSAGE, readReplayRecord, type ReplayRecord } from "../../replay/record";
import type { ReplayRecordChange, ReplayRecordEntry, ReplayRecordStore } from "../../replay/record-store";
import type { ReplayFile, ReplayFilePort } from "./browser-replay-files";
import { clearEarlierReplays, earlierReplayKeys, earlierReplaysFile, type EarlierReplayStore } from "./earlier-replays";
import { replayList, type ReplayListFilter, type ReplayListItem } from "./replay-list";

type Failed = Readonly<{ failed: unknown }>;

export interface ReplayListPorts {
  readonly openStore: () => Promise<ReplayRecordStore | Failed>;
  readonly files: ReplayFilePort | undefined;
  readonly playableRuleset: (ruleset: string) => boolean;
  /** Opens a kept record on the replay screen; false when it cannot be read or played. */
  readonly watchRecord: (key: string) => Promise<boolean>;
  /** Whether this target can publish to the feed. */
  readonly canShare: () => boolean;
  /** Publishes a record to the feed (src/replay/share.ts `shareReplay`); the share id, or null when it failed. */
  readonly share: (record: ReplayRecord) => Promise<string | null>;
  /** The save's storage, where recordings made before this update are kept. */
  readonly earlier: EarlierReplayStore;
}

export interface ReplayListSnapshot {
  readonly status: "idle" | "loading" | "ready" | "unavailable";
  readonly filter: ReplayListFilter;
  readonly items: readonly ReplayListItem[];
  readonly canImport: boolean;
  readonly message: string;
  /** How many recordings made before this update the save still holds. */
  readonly earlier: number;
}

const MESSAGES = Object.freeze({
  pinLimit: "Pin limit reached (10). Unpin a replay first.",
  failed: "Replays on this device couldn't be read.",
  watchFailed: "That replay couldn't be opened.",
  noCloud: "Sharing needs the online layer.",
  alreadyShared: "Already on the global feed.",
  sharing: "Publishing…",
  shared: "Published to the global feed ✓",
  shareFailed: "Publish failed — try again.",
  downloaded: "Download started.",
  downloadFailed: "That replay couldn't be saved.",
  importing: "Reading the file…",
  imported: "Replay added.",
  present: "That replay is already in your list.",
  importFailed: "That file couldn't be added.",
  oversized: "That replay is too large to keep on this device.",
  noFiles: "Importing replay files isn't available in this browser.",
  earlierSaved: "Download started. CONTINUE removes them from this device.",
  earlierNotSaved: "They couldn't be saved to a file.",
  earlierRemoved: "Earlier replays removed.",
  earlierNotRemoved: "They couldn't be removed. Try again.",
});

/** What the list says when the store dropped old unpinned runs to stay within its caps. */
export const droppedRunsMessage = (count: number): string =>
  count === 1
    ? "An older run was removed to make room. PIN a run to keep it."
    : `${String(count)} older runs were removed to make room. PIN a run to keep it.`;

export function createReplayListController(ports: ReplayListPorts) {
  let status: ReplayListSnapshot["status"] = "idle";
  let filter: ReplayListFilter = "all";
  let records: readonly ReplayRecordEntry[] = [];
  let message = "";
  let generation = 0;
  /** Keys being published, so a second SHARE press does not publish twice. */
  const sharing = new Set<string>();
  /** The earlier recordings' keys, read again each time the list is. */
  let earlier: readonly string[] = [];

  const items = (): readonly ReplayListItem[] => replayList(records, filter, ports.playableRuleset);
  const item = (id: string): ReplayListItem | undefined =>
    replayList(records, "all", ports.playableRuleset).find((candidate) => candidate.id === id);

  /** Runs `use` on an open store and closes it; undefined when the store cannot be opened. */
  async function withStore<T>(use: (store: ReplayRecordStore) => Promise<T>): Promise<T | undefined> {
    const store = await ports.openStore().catch(() => undefined);
    if (store === undefined || "failed" in store) return undefined;
    try {
      return await use(store);
    } catch {
      return undefined;
    } finally {
      store.close();
    }
  }
  /**
   * Lists again. The store's dropped count is taken (and so cleared) here, the one place the list opens,
   * and said once on the list's message line even when a newer listing replaces this one.
   */
  function refresh(): void {
    const ticket = ++generation;
    earlier = earlierReplayKeys(ports.earlier);
    if (status === "idle") status = "loading";
    void withStore(async (store) => {
      const listed = await store.entries();
      return { listed, dropped: "failed" in listed ? 0 : await store.takeDropped() };
    }).then((read) => {
      if (read !== undefined && typeof read.dropped === "number" && read.dropped > 0)
        message = droppedRunsMessage(read.dropped);
      const entries = read?.listed;
      if (ticket !== generation) return;
      if (entries === undefined || "failed" in entries) {
        status = "unavailable";
        records = [];
      } else {
        status = "ready";
        records = entries;
      }
    });
  }
  /** Applies a store change, says what went wrong, and lists again. */
  async function change(run: (store: ReplayRecordStore) => Promise<ReplayRecordChange>): Promise<boolean> {
    const result = await withStore(run);
    if (result === "pin-limit") message = MESSAGES.pinLimit;
    else if (result !== "done" && result !== "missing") message = MESSAGES.failed;
    refresh();
    return result === "done";
  }
  async function addFile(file: ReplayFile): Promise<void> {
    let record: ReplayRecord;
    try {
      const read = readReplayRecord(JSON.parse(new TextDecoder().decode(await file.arrayBuffer())));
      if (!read.ok) {
        message = read.reason === "earlier-version" ? EARLIER_VERSION_MESSAGE : MALFORMED_MESSAGE;
        return;
      }
      record = read.record;
    } catch {
      message = MALFORMED_MESSAGE;
      return;
    }
    const put = await withStore((store) => store.put(record));
    message =
      put === undefined || put.status === "failed"
        ? MESSAGES.importFailed
        : put.status === "oversized"
          ? MESSAGES.oversized
          : put.status === "present"
            ? MESSAGES.present
            : MESSAGES.imported;
    refresh();
  }

  return Object.freeze({
    refresh,
    snapshot: (): ReplayListSnapshot =>
      Object.freeze({
        status,
        filter,
        items: items(),
        canImport: ports.files !== undefined,
        message,
        earlier: earlier.length,
      }),
    setFilter: (next: ReplayListFilter): void => {
      filter = next;
    },
    setMessage: (next: string): void => {
      message = next;
    },
    watch: (id: string): void => {
      const found = item(id);
      if (!found?.playable) return;
      message = "";
      void ports.watchRecord(found.id).then((opened) => {
        if (!opened) message = MESSAGES.watchFailed;
      });
    },
    share: (id: string): void => {
      const found = item(id);
      if (!found?.playable || sharing.has(found.id)) return;
      if (found.shared) {
        message = MESSAGES.alreadyShared;
        return;
      }
      if (!ports.canShare()) {
        message = MESSAGES.noCloud;
        return;
      }
      sharing.add(found.id);
      message = MESSAGES.sharing;
      void withStore(async (store) => {
        const read = await store.read(found.id);
        if (read === null || "failed" in read || !read.ok) return false;
        const shareId = await ports.share(read.record);
        if (shareId === null) return false;
        await store.shared(found.id, shareId);
        return true;
      })
        .then((done) => {
          message = done === true ? MESSAGES.shared : MESSAGES.shareFailed;
        })
        .finally(() => {
          sharing.delete(found.id);
          refresh();
        });
    },
    pin: (id: string, pinned: boolean): void => {
      const found = item(id);
      if (found === undefined) return;
      void change((store) => store.pin(found.id, pinned));
    },
    remove: (id: string): void => {
      const found = item(id);
      if (found === undefined) return;
      void change((store) => store.remove(found.id));
    },
    download: (id: string): void => {
      const files = ports.files;
      if (files === undefined) return;
      void withStore((store) => store.read(id)).then((read) => {
        if (!read || "failed" in read || !read.ok) {
          message = MESSAGES.downloadFailed;
          return;
        }
        try {
          const date = read.record.look.recordedAt.slice(0, 10);
          files.download(
            new TextEncoder().encode(JSON.stringify(read.record)),
            `tear-replay-${date}-${String(read.record.run.seed)}.json`,
          );
          message = MESSAGES.downloaded;
        } catch {
          message = MESSAGES.downloadFailed;
        }
      });
    },
    downloadEarlier: (): void => {
      const files = ports.files;
      try {
        if (files === undefined || earlier.length === 0) throw new Error("nothing to save");
        files.download(earlierReplaysFile(ports.earlier, earlier), "tear-earlier-replays.json");
        message = MESSAGES.earlierSaved;
      } catch {
        message = MESSAGES.earlierNotSaved;
      }
    },
    clearEarlier: (): void => {
      message = clearEarlierReplays(ports.earlier, earlier) ? MESSAGES.earlierRemoved : MESSAGES.earlierNotRemoved;
      earlier = earlierReplayKeys(ports.earlier);
    },
    importFile: (): void => {
      const files = ports.files;
      if (files === undefined) {
        message = MESSAGES.noFiles;
        return;
      }
      try {
        files.pick(
          (file) => {
            message = MESSAGES.importing;
            void addFile(file);
          },
          () => undefined,
        );
      } catch (error) {
        message = error instanceof Error ? error.message : MESSAGES.importFailed;
      }
    },
  });
}

export type ReplayListController = ReturnType<typeof createReplayListController>;
