/**
 * The REPLAYS list's state and row actions (src/app/replay/replay-list.ts builds the rows).
 *
 * Kept records come from the `tear-replays` store, opened through `openStore` (the store's code is in the
 * lazily loaded replay recorder chunk, so startup carries none of it). Older recordings come from the
 * Ghost 2 index until replay PR 8 removes it. Every action resolves to a plain message on the list; none
 * throws.
 */
import { EARLIER_VERSION_MESSAGE, MALFORMED_MESSAGE, readReplayRecord, type ReplayRecord } from "../../replay/record";
import type { ReplayRecordChange, ReplayRecordEntry, ReplayRecordStore } from "../../replay/record-store";
import type { ReplayFile, ReplayFilePort } from "./browser-replay-files";
import { keptRecordSeed } from "./kept-record-lookup";
import { replayList, type OlderRecording, type ReplayListFilter, type ReplayListItem } from "./replay-list";

type Failed = Readonly<{ failed: unknown }>;

/** The Ghost 2 index, as much of it as the list uses. */
export interface OlderRecordings {
  index(): readonly Readonly<{
    id: string;
    ts: number;
    pin: boolean;
    shareId: string | null;
    sum: Readonly<Record<string, unknown>>;
  }>[];
  get(id: string): unknown;
  pin(id: string, on: boolean): boolean;
  remove(id: string): void;
}

export interface ReplayListPorts {
  readonly openStore: () => Promise<ReplayRecordStore | Failed>;
  readonly older: OlderRecordings;
  readonly files: ReplayFilePort | undefined;
  readonly playableRuleset: (ruleset: string) => boolean;
  /** Opens a kept record on the replay screen; false when it cannot be read or played. */
  readonly watchRecord: (key: string) => Promise<boolean>;
  /** Plays an older recording through the old path. */
  readonly watchOlder: (id: string) => void;
  /** Publishes an older recording to the feed (the feed plays only those until replay PR 8). */
  readonly shareOlder: (id: string) => void;
}

export interface ReplayListSnapshot {
  readonly status: "idle" | "loading" | "ready" | "unavailable";
  readonly filter: ReplayListFilter;
  readonly items: readonly ReplayListItem[];
  readonly canImport: boolean;
  readonly message: string;
}

const MESSAGES = Object.freeze({
  pinLimit: "Pin limit reached (10). Unpin a replay first.",
  failed: "Replays on this device couldn't be read.",
  watchFailed: "That replay couldn't be opened.",
  noShare: "Only replays with a recording for the feed can be shared.",
  downloaded: "Download started.",
  downloadFailed: "That replay couldn't be saved.",
  importing: "Reading the file…",
  imported: "Replay added.",
  present: "That replay is already in your list.",
  importFailed: "That file couldn't be added.",
  oversized: "That replay is too large to keep on this device.",
  noFiles: "Importing replay files isn't available in this browser.",
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
  /** Run seeds read from older recordings, by id; a recording's seed never changes. */
  const seeds = new Map<string, number | undefined>();

  const olderRecordings = (): readonly OlderRecording[] =>
    ports.older.index().map((entry) => {
      if (!seeds.has(entry.id)) {
        const seed = keptRecordSeed(ports.older.get(entry.id));
        seeds.set(entry.id, seed === undefined ? undefined : Number(seed));
      }
      const seed = seeds.get(entry.id);
      const { mode, diff, score, wave, won, thumb } = entry.sum;
      return Object.freeze({
        id: entry.id,
        recordedAt: entry.ts,
        pinned: entry.pin,
        shared: entry.shareId !== null,
        ...(seed === undefined ? {} : { seed }),
        ...(typeof mode === "string" ? { mode } : {}),
        ...(typeof diff === "string" ? { difficulty: diff } : {}),
        ...(typeof score === "number" ? { score } : {}),
        ...(typeof wave === "number" ? { wave } : {}),
        victory: won === true,
        ...(typeof thumb === "string" ? { thumb } : {}),
      });
    });
  const items = (): readonly ReplayListItem[] => replayList(records, olderRecordings(), filter, ports.playableRuleset);
  const item = (id: string): ReplayListItem | undefined =>
    replayList(records, olderRecordings(), "all", ports.playableRuleset).find((candidate) => candidate.id === id);

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
      Object.freeze({ status, filter, items: items(), canImport: ports.files !== undefined, message }),
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
      if (found.kind === "older") {
        ports.watchOlder(found.id);
        return;
      }
      void ports.watchRecord(found.id).then((opened) => {
        if (!opened) message = MESSAGES.watchFailed;
      });
    },
    share: (id: string): void => {
      const found = item(id);
      const older = found?.kind === "older" ? found.id : found?.olderId;
      if (older === undefined) message = MESSAGES.noShare;
      else ports.shareOlder(older);
    },
    pin: (id: string, pinned: boolean): void => {
      const found = item(id);
      if (found === undefined) return;
      const older = found.kind === "older" ? found.id : found.olderId;
      if (found.kind === "older") {
        if (!ports.older.pin(found.id, pinned)) message = MESSAGES.pinLimit;
        return;
      }
      void change((store) => store.pin(found.id, pinned)).then((done) => {
        if (done && older !== undefined) ports.older.pin(older, pinned);
      });
    },
    remove: (id: string): void => {
      const found = item(id);
      if (found === undefined) return;
      const older = found.kind === "older" ? found.id : found.olderId;
      if (older !== undefined) {
        ports.older.remove(older);
        seeds.delete(older);
      }
      if (found.kind === "record") void change((store) => store.remove(found.id));
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
