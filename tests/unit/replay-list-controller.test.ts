/**
 * The REPLAYS list's actions (src/app/replay/replay-list-controller.ts) over an in-memory store: WATCH opens
 * the replay screen, PIN and DELETE change the store, SHARE publishes the kept record and names its share,
 * DOWNLOAD names the file by date and seed, IMPORT adds a record file, the earlier-replays notice saves and
 * removes recordings made before this update, and each says what happened.
 */
import { describe, expect, it, vi } from "vitest";

import { EARLIER_BEST_PREFIX, EARLIER_INDEX_KEY, EARLIER_RECORDING_PREFIX } from "../../src/app/replay/earlier-replays";
import { createReplayListController } from "../../src/app/replay/replay-list-controller";
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

function setup(
  options: {
    pinLimit?: boolean;
    storeFails?: boolean;
    dropped?: number;
    canShare?: boolean;
    earlier?: Record<string, string>;
  } = {},
) {
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
    shared: vi.fn((key: string, shareId: string) => {
      for (const [index, entry] of entries.entries()) if (entry.key === key) entries[index] = { ...entry, shareId };
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
  const saved = new Map(Object.entries(options.earlier ?? {}));
  const earlier = {
    get: (key: string) => saved.get(key) ?? null,
    set: vi.fn((key: string, value: string) => {
      saved.set(key, value);
    }),
  };
  const picked: ((file: ReplayFile) => void)[] = [];
  const files = {
    pick: vi.fn((choose: (file: ReplayFile) => void) => {
      picked.push(choose);
    }),
    download: vi.fn(),
  };
  const ports = {
    openStore: vi.fn(() => Promise.resolve(options.storeFails === true ? { failed: "blocked" } : store)),
    files,
    playableRuleset: (ruleset: string) => ruleset === "today",
    watchRecord: vi.fn(() => Promise.resolve(true)),
    canShare: () => options.canShare ?? true,
    share: vi.fn<(record: ReplayRecord) => Promise<string | null>>(() => Promise.resolve("share-1")),
    earlier,
  };
  const list = createReplayListController(ports as never);
  return { list, ports, store, files, picked, entries, saved, earlier };
}

describe("the REPLAYS list controller", () => {
  it("lists kept records, and says when the store cannot be read", async () => {
    const { list } = setup();
    expect(list.snapshot().status).toBe("idle");
    list.refresh();
    expect(list.snapshot().status).toBe("loading");
    await settle();
    expect(list.snapshot().items.map((item) => [item.id, item.shared])).toEqual([["kept", false]]);
    const failing = setup({ storeFails: true });
    failing.list.refresh();
    await settle();
    expect(failing.list.snapshot()).toMatchObject({ status: "unavailable", items: [] });
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

  it("watches a record on the replay screen and says when it could not be opened", async () => {
    const { list, ports } = setup();
    list.refresh();
    await settle();
    list.watch("kept");
    expect(ports.watchRecord).toHaveBeenCalledExactlyOnceWith("kept");
    ports.watchRecord.mockResolvedValueOnce(false);
    list.watch("kept");
    await settle();
    expect(list.snapshot().message).toBe("That replay couldn't be opened.");
  });

  it("pins and deletes a kept record", async () => {
    const { list, store } = setup();
    list.refresh();
    await settle();
    list.pin("kept", true);
    await settle();
    expect(store.pin).toHaveBeenCalledWith("kept", true);
    expect(list.snapshot().items[0]?.pinned).toBe(true);
    list.remove("kept");
    await settle();
    expect(store.remove).toHaveBeenCalledWith("kept");
    expect(list.snapshot().items).toEqual([]);
  });

  it("says the pin limit was reached", async () => {
    const { list } = setup({ pinLimit: true });
    list.refresh();
    await settle();
    list.pin("kept", true);
    await settle();
    expect(list.snapshot().message).toBe("Pin limit reached (10). Unpin a replay first.");
  });

  it("shares the kept record once, names its share on the row, and refuses a second share", async () => {
    const { list, ports, store } = setup();
    list.refresh();
    await settle();
    list.share("kept");
    list.share("kept");
    expect(list.snapshot().message).toBe("Publishing…");
    await settle();
    await settle();
    expect(ports.share).toHaveBeenCalledOnce();
    expect(store.shared).toHaveBeenCalledExactlyOnceWith("kept", "share-1");
    expect(list.snapshot().message).toBe("Published to the global feed ✓");
    expect(list.snapshot().items[0]?.shared).toBe(true);
    list.share("kept");
    expect(list.snapshot().message).toBe("Already on the global feed.");
    expect(ports.share).toHaveBeenCalledOnce();
  });

  it("says why a share did not happen: no online layer, or the publish failed", async () => {
    const offline = setup({ canShare: false });
    offline.list.refresh();
    await settle();
    offline.list.share("kept");
    expect(offline.list.snapshot().message).toBe("Sharing needs the online layer.");
    expect(offline.ports.share).not.toHaveBeenCalled();
    const failing = setup();
    failing.ports.share.mockResolvedValueOnce(null);
    failing.list.refresh();
    await settle();
    failing.list.share("kept");
    await settle();
    await settle();
    expect(failing.list.snapshot().message).toBe("Publish failed — try again.");
    expect(failing.store.shared).not.toHaveBeenCalled();
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

  it("counts recordings made before this update, saves them to one file, then removes only them", async () => {
    const recording = `${EARLIER_RECORDING_PREFIX}a`;
    const best = `${EARLIER_BEST_PREFIX}endless_hard`;
    const { list, files, saved } = setup({
      earlier: {
        [EARLIER_INDEX_KEY]: JSON.stringify([{ id: "a" }]),
        [recording]: JSON.stringify({ v: 2 }),
        [best]: "packet",
        tear_settings: "kept",
      },
    });
    list.refresh();
    await settle();
    expect(list.snapshot().earlier).toBe(2);
    list.downloadEarlier();
    expect(files.download).toHaveBeenCalledOnce();
    expect(files.download.mock.calls[0]?.[1]).toBe("tear-earlier-replays.json");
    const file = JSON.parse(new TextDecoder().decode(files.download.mock.calls[0]?.[0] as Uint8Array)) as unknown;
    expect(file).toEqual({
      format: "tear-earlier-replays",
      recordings: { [recording]: { v: 2 }, [best]: "packet" },
    });
    list.clearEarlier();
    expect(list.snapshot()).toMatchObject({ earlier: 0, message: "Earlier replays removed." });
    expect(saved.get(recording)).toBe("");
    expect(saved.get(EARLIER_INDEX_KEY)).toBe("");
    expect(saved.get("tear_settings")).toBe("kept");
  });
});
