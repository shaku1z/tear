import { afterEach, describe, expect, it, vi } from "vitest";

import * as engineModule from "../../src/app/world/detached/replay-composition";
import { createRecordWatchSession } from "../../src/app/replay/record-watch-session";
import { keptRecordKeyFor } from "../../src/app/replay/kept-record-lookup";
import { createRecordSeekCache } from "../../src/app/replay/record-seek-cache";
import { REPLAY_CHECKPOINT_TICKS } from "../../src/replay/record";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("watching a kept record", () => {
  it("re-simulates the run: every checkpoint the replay screen seeks to has the recorded state, forwards and back", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    const session = createRecordWatchSession(record, "record:test:1", engineModule);
    expect(session.lastTick).toBe(record.run.result.tick);
    const checkpoints = record.run.checkpoints.map((checkpoint, index) => ({
      tick: (index + 1) * REPLAY_CHECKPOINT_TICKS,
      hash: checkpoint.hash,
    }));
    expect(checkpoints.length).toBeGreaterThan(1);
    for (const { tick, hash } of checkpoints) expect(session.seek(tick).semanticHash).toBe(hash);
    // A seek backwards starts again from the seek cache and reaches the same state.
    const [first] = checkpoints;
    if (first === undefined) throw new Error("no checkpoint");
    expect(session.seek(first.tick).semanticHash).toBe(first.hash);
    expect(session.seek(record.run.result.tick).semanticHash).toBe(record.run.result.hash);
    expect(session.stage()).toBe(0);
    expect(() => session.seek(record.run.result.tick + 1)).toThrow(RangeError);
  });

  it.each(SPECS.map((spec) => [spec.id, spec] as const))(
    "seeks back from the seek cache to the recorded state: %s",
    (_id, spec) => {
      const record = recordCorpusStream(spec);
      const starts: (number | undefined)[] = [];
      const engine = {
        ...engineModule,
        createProductionGhostReplayComposition: (
          options: Parameters<typeof engineModule.createProductionGhostReplayComposition>[0],
        ) => {
          const composition = engineModule.createProductionGhostReplayComposition(options);
          return {
            ...composition,
            create: (snapshot: Parameters<typeof composition.create>[0]) => {
              starts.push(snapshot?.tick);
              return composition.create(snapshot);
            },
          };
        },
      };
      const cache = createRecordSeekCache({ every: REPLAY_CHECKPOINT_TICKS, limit: 64 });
      const session = createRecordWatchSession(record, "record:test:1", engine, {}, cache);
      expect(session.seek(record.run.result.tick).semanticHash).toBe(record.run.result.hash);
      const checkpoints = record.run.checkpoints.map((checkpoint, index) => ({
        tick: (index + 1) * REPLAY_CHECKPOINT_TICKS,
        hash: checkpoint.hash,
      }));
      expect(cache.held().ticks).toEqual(checkpoints.map((checkpoint) => checkpoint.tick));
      // Backwards, from the latest checkpoint before the end: each seek starts a world at that checkpoint.
      for (const { tick, hash } of checkpoints.filter((checkpoint) => checkpoint.tick < session.lastTick).reverse()) {
        expect(session.seek(tick).semanticHash).toBe(hash);
        expect(starts.at(-1)).toBe(tick);
      }
      // A world started from a checkpoint plays on to the recorded end.
      const [first] = checkpoints;
      if (first !== undefined) {
        expect(session.seek(first.tick + 7).tick).toBe(first.tick + 7);
        expect(starts.at(-1)).toBe(first.tick);
      }
      expect(session.seek(record.run.result.tick).semanticHash).toBe(record.run.result.hash);
      // Only the opening started from the seed.
      expect(starts.filter((tick) => tick === undefined)).toHaveLength(1);
    },
  );

  it("never touches progress: a watched run that earns achievements and coins writes nothing outside its world", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    // Every write the page could make: browser storage, and the world's own outward intents.
    const writes: string[] = [];
    const storage = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: (key: string) => writes.push(`setItem:${key}`),
      removeItem: (key: string) => writes.push(`removeItem:${key}`),
      clear: () => writes.push("clear"),
    };
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("indexedDB", {
      open: (name: string) => {
        writes.push(`indexedDB:${name}`);
        throw new Error("a watched run opened a database");
      },
    });
    let outward: () => readonly string[] = () => [];
    const engine = {
      ...engineModule,
      createProductionGhostReplayComposition: (
        options: Parameters<typeof engineModule.createProductionGhostReplayComposition>[0],
      ) => {
        const composition = engineModule.createProductionGhostReplayComposition(options);
        return {
          ...composition,
          create: (input: undefined) => {
            const session = composition.create(input);
            outward = () => [...session.combat.outward, ...session.outcome.outward, ...session.waveReward.outward];
            return session;
          },
        };
      },
    };
    const session = createRecordWatchSession(record, "record:test:1", engine);
    session.seek(session.lastTick);
    // The run did earn: play's own achievement and reward steps ran and were kept as intents in the world.
    expect(outward().filter((step) => /achievement/iu.test(step)).length).toBeGreaterThan(0);
    expect(writes).toEqual([]);
  });

  it("finds the newest kept record of a run by its seed", () => {
    const entries = [
      { key: "record:2026-11-22T10:00:00Z:515303", bytes: 1, pinned: false, recordedAt: "2026-11-22T10:00:00Z" },
      { key: "record:2026-11-22T11:00:00Z:515303", bytes: 1, pinned: false, recordedAt: "2026-11-22T11:00:00Z" },
      { key: "record:2026-11-22T12:00:00Z:15303", bytes: 1, pinned: false, recordedAt: "2026-11-22T12:00:00Z" },
    ];
    expect(keptRecordKeyFor(entries, "515303")).toBe("record:2026-11-22T11:00:00Z:515303");
    expect(keptRecordKeyFor(entries, "999")).toBeUndefined();
  });
});
