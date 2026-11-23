/**
 * The replay record store (src/replay/record-store.ts): the count and byte caps drop the oldest unpinned
 * records first, an oversized record is not stored, the index carries each record's list row and pin, and
 * a quota error, a blocked upgrade or a missing IndexedDB resolves to a plain result instead of throwing,
 * so recording never fails a run.
 */
import { describe, expect, it } from "vitest";

import type { ReplayRecord } from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";
import {
  openReplayRecordStore,
  planReplayRecordWrite,
  REPLAY_RECORD_DATABASE,
  type ReplayRecordEntry,
  type ReplayRecordStore,
} from "../../src/replay/record-store";

type Mode = "ok" | "blocked" | "quota";

/** The part of IndexedDB the store uses: one database, one store, string keys. */
function fakeIndexedDb(mode: Mode) {
  const data = new Map<string, unknown>();
  const opened: { closed: boolean; database?: { onversionchange: null | (() => void) } }[] = [];
  const later = (callback: () => void) => {
    queueMicrotask(callback);
  };
  const factory = {
    open(name: string, version: number) {
      expect(name).toBe(REPLAY_RECORD_DATABASE);
      expect(version).toBe(1);
      const handle = { closed: false } as (typeof opened)[number];
      opened.push(handle);
      const database = {
        onversionchange: null as null | (() => void),
        objectStoreNames: { contains: () => true },
        createObjectStore: () => undefined,
        close: () => {
          handle.closed = true;
        },
        transaction: () => {
          const transaction = {
            error: null as unknown,
            oncomplete: null as null | (() => void),
            onerror: null as null | (() => void),
            onabort: null as null | (() => void),
            objectStore: () => ({
              get: (key: string) => {
                const request = { result: data.get(key), onsuccess: null as null | (() => void), onerror: null };
                later(() => request.onsuccess?.());
                return request;
              },
              put: (value: unknown, key: string) => {
                if (mode !== "quota") data.set(key, value);
              },
              delete: (key: string) => {
                data.delete(key);
              },
            }),
          };
          later(() => {
            if (mode === "quota") {
              transaction.error = { name: "QuotaExceededError" };
              transaction.onabort?.();
            } else transaction.oncomplete?.();
          });
          return transaction;
        },
      };
      handle.database = database;
      const request = {
        result: database,
        error: null,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onblocked: null as null | (() => void),
      };
      later(() => {
        if (mode === "blocked") request.onblocked?.();
        else {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        }
      });
      return request;
    },
  };
  return { factory: factory as unknown as IDBFactory, data, opened };
}

/** Only the parts the store reads: the key, the row and the size. */
const record = (recordedAt: string, seed: number, padding = 0) =>
  ({
    run: {
      seed,
      ruleset: "rules",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      result: { outcome: "defeat" },
      padding: "x".repeat(padding),
    },
    summary: {
      score: seed * 100,
      wave: seed,
      time: 30,
      kills: 0,
      marks: [{ tick: 1, kind: "stage", value: seed % 3 }],
    },
    look: { recordedAt },
  }) as unknown as ReplayRecord;

/** A whole record, which the store reads back as valid: an Endless run that entered stage 2. */
function wholeRecord(seed: number, recordedAt: string): ReplayRecord {
  const recorder = createReplayRecorder({
    ruleset: "rules",
    build: { version: "0.1.0", revision: "abc", target: "test" },
    seed,
    start: {
      mode: "endless",
      difficulty: "easy",
      weapon: "sword",
      metaRanks: {},
      variantDiscovery: [],
      achievementSnapshot: [],
      restoredTrail: false,
      cinematics: "full",
      playedChapters: [],
    },
    look: { playerName: "Player", cosmetics: {}, music: null, recordedAt },
  });
  for (let tick = 1; tick <= 5; tick += 1) recorder.step(tick, [], () => "0123456789abcdef");
  recorder.observe({ kind: "stage", tick: 3, stage: 2 });
  return recorder.finish({ tick: 5, hash: "0123456789abcdef", run: { score: 40, wave: 2, time: 1 } });
}

const entry = (key: string, bytes: number, pinned = false): ReplayRecordEntry => ({
  key,
  bytes,
  recordedAt: key,
  pinned,
});

async function open(mode: Mode, limits = { count: 3, bytes: 10_000, pinned: 2 }) {
  const idb = fakeIndexedDb(mode);
  const store = await openReplayRecordStore(idb.factory, limits);
  return { ...idb, store };
}

describe("the replay record store", () => {
  it("drops the oldest records past the count cap and past the byte cap", () => {
    const index = [entry("a", 4), entry("b", 4)];
    expect(planReplayRecordWrite(index, entry("c", 4), { count: 2, bytes: 100 })).toEqual({
      store: true,
      evict: ["a"],
      index: [index[1], entry("c", 4)],
    });
    expect(planReplayRecordWrite(index, entry("c", 7), { count: 9, bytes: 10 })).toEqual({
      store: true,
      evict: ["a", "b"],
      index: [entry("c", 7)],
    });
    expect(planReplayRecordWrite(index, entry("c", 11), { count: 9, bytes: 10 })).toEqual({ store: false });
  });

  it("drops the oldest unpinned records first, and pinned ones only when nothing else fits", () => {
    const index = [entry("a", 4, true), entry("b", 4), entry("c", 4, true), entry("d", 4)];
    expect(planReplayRecordWrite(index, entry("e", 4), { count: 3, bytes: 100 })).toEqual({
      store: true,
      evict: ["b", "d"],
      index: [entry("a", 4, true), entry("c", 4, true), entry("e", 4)],
    });
    expect(planReplayRecordWrite(index, entry("e", 4), { count: 2, bytes: 100 })).toEqual({
      store: true,
      evict: ["a", "b", "d"],
      index: [entry("c", 4, true), entry("e", 4)],
    });
  });

  it("lists every record with its row and pin, pins up to the limit and removes a record", async () => {
    const { store, data } = await open("ok", { count: 5, bytes: 10_000, pinned: 1 });
    const opened = store as ReplayRecordStore;
    await opened.put(record("2026-11-21T00:00:01Z", 1));
    await opened.put(record("2026-11-21T00:00:02Z", 2));
    const [first, second] = ["record:2026-11-21T00:00:01Z:1", "record:2026-11-21T00:00:02Z:2"];
    expect(await opened.put(record("2026-11-21T00:00:01Z", 1))).toEqual({ status: "present", key: first });
    expect(await opened.entries()).toEqual([
      {
        key: first,
        bytes: expect.any(Number) as number,
        recordedAt: "2026-11-21T00:00:01Z",
        pinned: false,
        row: {
          seed: 1,
          ruleset: "rules",
          mode: "endless",
          difficulty: "normal",
          weapon: "sword",
          stage: 1,
          score: 100,
          wave: 1,
          time: 30,
          outcome: "defeat",
        },
      },
      expect.objectContaining({ key: second, pinned: false }) as ReplayRecordEntry,
    ]);
    expect(await opened.pin(first, true)).toBe("done");
    expect(await opened.pin(second, true)).toBe("pin-limit");
    expect(await opened.pin("record:none", true)).toBe("missing");
    expect(await opened.remove(second)).toBe("done");
    expect(data.has(second)).toBe(false);
    const entries = await opened.entries();
    expect("failed" in entries ? entries : entries.map((item) => [item.key, item.pinned])).toEqual([[first, true]]);
  });

  it("gives an index written before rows existed its rows from the records, once", async () => {
    const { store, data } = await open("ok");
    const opened = store as ReplayRecordStore;
    await opened.put(wholeRecord(4, "2026-11-21T00:00:01Z"));
    const key = "record:2026-11-21T00:00:01Z:4";
    data.set("index", [
      { key, bytes: 10, recordedAt: "2026-11-21T00:00:01Z" },
      { key: "record:gone", bytes: 1, recordedAt: "0" },
    ]);
    const entries = await opened.entries();
    expect(entries).toEqual([
      expect.objectContaining({
        key,
        pinned: false,
        row: expect.objectContaining({ seed: 4, stage: 2, score: 40 }) as object,
      }),
      { key: "record:gone", bytes: 1, recordedAt: "0", pinned: false },
    ]);
    expect(data.get("index")).toEqual(entries);
  });

  it("stores records, keeps the newest within the caps and reports an oversized one", async () => {
    const { store, data } = await open("ok");
    const opened = store as ReplayRecordStore;
    for (const [index, at] of ["2026-11-21T00:00:01Z", "2026-11-21T00:00:02Z", "2026-11-21T00:00:03Z"].entries())
      expect(await opened.put(record(at, index + 1))).toMatchObject({ status: "stored" });
    const fourth = await opened.put(record("2026-11-21T00:00:04Z", 4));
    expect(fourth).toEqual({
      status: "stored",
      key: "record:2026-11-21T00:00:04Z:4",
      evicted: ["record:2026-11-21T00:00:01Z:1"],
    });
    const entries = await opened.entries();
    expect("failed" in entries ? entries : entries.map((entry) => entry.key)).toEqual([
      "record:2026-11-21T00:00:02Z:2",
      "record:2026-11-21T00:00:03Z:3",
      "record:2026-11-21T00:00:04Z:4",
    ]);
    expect(data.has("record:2026-11-21T00:00:01Z:1")).toBe(false);
    // A stored value is read back as untrusted data; this fake record is not a whole one.
    expect(await opened.read("record:2026-11-21T00:00:02Z:2")).toMatchObject({ ok: false, reason: "malformed" });
    expect(await opened.read("record:none")).toBeNull();
    expect(await opened.read("index")).toBeNull();
    expect(await opened.put(record("2026-11-21T00:00:05Z", 5, 20_000))).toMatchObject({ status: "oversized" });
  });

  it("turns a quota error, a blocked upgrade and a missing IndexedDB into results, never throws", async () => {
    const quota = await open("quota");
    expect(await (quota.store as ReplayRecordStore).put(record("2026-11-21T00:00:01Z", 1))).toEqual({
      status: "failed",
      reason: "quota",
    });
    expect((await open("blocked")).store).toEqual({ failed: "blocked" });
    expect(await openReplayRecordStore(null)).toEqual({ failed: "unavailable" });
  });

  it("closes on versionchange so a later build's upgrade is not blocked", async () => {
    const { opened } = await open("ok");
    opened[0]?.database?.onversionchange?.();
    expect(opened[0]?.closed).toBe(true);
  });
});
