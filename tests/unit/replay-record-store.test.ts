/**
 * The replay record store (src/replay/record-store.ts): the count and byte caps drop the oldest
 * records, an oversized record is not stored, and a quota error, a blocked upgrade or a missing
 * IndexedDB resolves to a plain result instead of throwing, so recording never fails a run.
 */
import { describe, expect, it } from "vitest";

import type { ReplayRecord } from "../../src/replay/record";
import {
  openReplayRecordStore,
  planReplayRecordWrite,
  REPLAY_RECORD_DATABASE,
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

const record = (recordedAt: string, seed: number, padding = 0) =>
  ({
    run: { seed, padding: "x".repeat(padding) },
    look: { recordedAt },
  }) as unknown as ReplayRecord;

async function open(mode: Mode, limits = { count: 3, bytes: 10_000 }) {
  const idb = fakeIndexedDb(mode);
  const store = await openReplayRecordStore(idb.factory, limits);
  return { ...idb, store };
}

describe("the replay record store", () => {
  it("drops the oldest records past the count cap and past the byte cap", () => {
    const index = [
      { key: "a", bytes: 4, recordedAt: "1" },
      { key: "b", bytes: 4, recordedAt: "2" },
    ];
    expect(planReplayRecordWrite(index, { key: "c", bytes: 4, recordedAt: "3" }, { count: 2, bytes: 100 })).toEqual({
      store: true,
      evict: ["a"],
      index: [index[1], { key: "c", bytes: 4, recordedAt: "3" }],
    });
    expect(planReplayRecordWrite(index, { key: "c", bytes: 7, recordedAt: "3" }, { count: 9, bytes: 10 })).toEqual({
      store: true,
      evict: ["a", "b"],
      index: [{ key: "c", bytes: 7, recordedAt: "3" }],
    });
    expect(planReplayRecordWrite(index, { key: "c", bytes: 11, recordedAt: "3" }, { count: 9, bytes: 10 })).toEqual({
      store: false,
    });
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
