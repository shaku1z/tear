/**
 * The REPLAYS list's actions (src/app/replay/replay-list-controller.ts) over an in-memory store and older
 * index: pin and delete reach a run's older copy too, SHARE publishes that copy, WATCH picks the right
 * player, DOWNLOAD names the file by date and seed, IMPORT adds a record file, and each says what happened.
 */
import { describe, expect, it, vi } from "vitest";

import { createReplayListController, type OlderRecordings } from "../../src/app/replay/replay-list-controller";
import type { ReplayFile } from "../../src/app/replay/browser-replay-files";
import type { ReplayRecord } from "../../src/replay/record";
import type { ReplayRecordEntry, ReplayRecordStore } from "../../src/replay/record-store";
import type * as RecordModule from "../../src/replay/record";

const read = vi.hoisted(() => vi.fn());
vi.mock("../../src/replay/record", async (original) => ({
  ...(await original<typeof RecordModule>()),
  readReplayRecord: read,
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { pinLimit?: boolean; storeFails?: boolean; dropped?: number } = {}) {
  let dropped = options.dropped ?? 0;
  const entries: ReplayRecordEntry[] = [
    {
      key: "kept",
      bytes: 10,
      recordedAt: "2026-11-20T10:00:00.000Z",
      pinned: false,
      row: {
        seed: 42,
        ruleset: "today",
        mode: "endless",
        difficulty: "normal",
        weapon: "sword",
        stage: 1,
        score: 300,
        wave: 3,
        time: 60,
        outcome: "defeat",
      },
    },
  ];
  const kept = { look: { recordedAt: "2026-11-20T10:00:00.000Z" }, run: { seed: 42 } } as unknown as ReplayRecord;
  const store = {
    entries: vi.fn(() => Promise.resolve(entries)),
    pin: vi.fn((key: string, pinned: boolean) => {
      if (options.pinLimit === true) return Promise.resolve("pin-limit" as const);
      for (const [index, entry] of entries.entries()) if (entry.key === key) entries[index] = { ...entry, pinned };
      return Promise.resolve("done" as const);
    }),
    remove: vi.fn((key: string) => {
      entries.splice(
        entries.findIndex((entry) => entry.key === key),
        1,
      );
      return Promise.resolve("done" as const);
    }),
    put: vi.fn(() => Promise.resolve({ status: "stored" as const, key: "new", evicted: [] })),
    read: vi.fn(() => Promise.resolve({ ok: true as const, record: kept })),
    takeDropped: vi.fn(() => {
      const count = dropped;
      dropped = 0;
      return Promise.resolve(count);
    }),
    close: vi.fn(),
  } as unknown as ReplayRecordStore;
  const olderIndex = [
    { id: "copy", ts: 1, pin: false, shareId: null, sum: { mode: "endless", diff: "normal", score: 300 } },
    { id: "before", ts: 2, pin: false, shareId: "shared", sum: { mode: "endless", diff: "hard", score: 5 } },
  ];
  // A Ghost 2 packet keeps its run seed as a digit string.
  const olderRecords: Record<string, unknown> = { copy: { run: { seed: "42" } }, before: { run: { seed: "7" } } };
  const older = {
    index: () => olderIndex,
    get: (id: string) => olderRecords[id],
    pin: vi.fn(() => true),
    remove: vi.fn((id: string) => {
      olderIndex.splice(
        olderIndex.findIndex((entry) => entry.id === id),
        1,
      );
    }),
  } satisfies OlderRecordings;
  const picked: ((file: ReplayFile) => void)[] = [];
  const files = {
    pick: vi.fn((choose: (file: ReplayFile) => void) => {
      picked.push(choose);
    }),
    download: vi.fn(),
  };
  const ports = {
    openStore: vi.fn(() => Promise.resolve(options.storeFails === true ? { failed: "blocked" } : store)),
    older,
    files,
    playableRuleset: (ruleset: string) => ruleset === "today",
    watchRecord: vi.fn(() => Promise.resolve(true)),
    watchOlder: vi.fn(),
    shareOlder: vi.fn(),
  };
  const list = createReplayListController(ports as never);
  return { list, ports, store, older, files, picked, entries };
}

describe("the REPLAYS list controller", () => {
  it("lists kept records and older recordings without a record, and says when the store cannot be read", async () => {
    const { list } = setup();
    expect(list.snapshot().status).toBe("idle");
    list.refresh();
    expect(list.snapshot().status).toBe("loading");
    await settle();
    expect(list.snapshot().items.map((item) => [item.id, item.kind, item.olderId])).toEqual([
      ["kept", "record", "copy"],
      ["before", "older", undefined],
    ]);
    const failing = setup({ storeFails: true });
    failing.list.refresh();
    await settle();
    // Without the store, the run's older copy is listed on its own.
    expect(failing.list.snapshot()).toMatchObject({
      status: "unavailable",
      items: [{ id: "before" }, { id: "copy", kind: "older" }],
    });
  });

  it("says once, when the list opens, how many older runs the store dropped to make room", async () => {
    const { list } = setup({ dropped: 2 });
    list.refresh();
    await settle();
    expect(list.snapshot().message).toBe("2 older runs were removed to make room. PIN a run to keep it.");
    list.setMessage("");
    list.refresh();
    await settle();
    expect(list.snapshot().message).toBe("");
    const one = setup({ dropped: 1 });
    one.list.refresh();
    await settle();
    expect(one.list.snapshot().message).toBe("An older run was removed to make room. PIN a run to keep it.");
  });

  it("watches a record on the replay screen and an older recording through the old player", async () => {
    const { list, ports } = setup();
    list.refresh();
    await settle();
    list.watch("kept");
    list.watch("before");
    expect(ports.watchRecord).toHaveBeenCalledExactlyOnceWith("kept");
    expect(ports.watchOlder).toHaveBeenCalledExactlyOnceWith("before");
    ports.watchRecord.mockResolvedValueOnce(false);
    list.watch("kept");
    await settle();
    expect(list.snapshot().message).toBe("That replay couldn't be opened.");
  });

  it("pins and deletes a run together with its older copy, and shares the copy", async () => {
    const { list, ports, older, store } = setup();
    list.refresh();
    await settle();
    list.pin("kept", true);
    await settle();
    expect(store.pin).toHaveBeenCalledWith("kept", true);
    expect(older.pin).toHaveBeenCalledWith("copy", true);
    expect(list.snapshot().items[0]?.pinned).toBe(true);
    list.share("kept");
    expect(ports.shareOlder).toHaveBeenCalledExactlyOnceWith("copy");
    list.remove("kept");
    await settle();
    expect(older.remove).toHaveBeenCalledWith("copy");
    expect(store.remove).toHaveBeenCalledWith("kept");
    expect(list.snapshot().items.map((item) => item.id)).toEqual(["before"]);
  });

  it("says the pin limit was reached and leaves the older copy as it was", async () => {
    const { list, older } = setup({ pinLimit: true });
    list.refresh();
    await settle();
    list.pin("kept", true);
    await settle();
    expect(list.snapshot().message).toBe("Pin limit reached (10). Unpin a replay first.");
    expect(older.pin).not.toHaveBeenCalled();
  });

  it("downloads a record as a JSON file named by its date and seed", async () => {
    const { list, files } = setup();
    list.download("kept");
    await settle();
    expect(files.download).toHaveBeenCalledOnce();
    expect(files.download.mock.calls[0]?.[1]).toBe("tear-replay-2026-11-20-42.json");
    expect(list.snapshot().message).toBe("Download started.");
  });

  it("imports a record file, and refuses a file that is not one with the plain reason", async () => {
    const { list, store, picked } = setup();
    const file = (text: string): ReplayFile => ({
      size: text.length,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer),
    });
    read.mockReturnValueOnce({ ok: true, record: {} });
    list.importFile();
    picked[0]?.(file("{}"));
    await settle();
    expect(store.put).toHaveBeenCalledOnce();
    expect(list.snapshot().message).toBe("Replay added.");
    read.mockReturnValueOnce({ ok: false, reason: "earlier-version" });
    list.importFile();
    picked[1]?.(file("{}"));
    await settle();
    expect(list.snapshot().message).toMatch(/earlier version/iu);
    list.importFile();
    picked[2]?.(file("not json"));
    await settle();
    expect(list.snapshot().message).not.toBe("Replay added.");
    expect(store.put).toHaveBeenCalledOnce();
  });
});
