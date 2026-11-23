import { afterEach, describe, expect, it, vi } from "vitest";

import * as engineModule from "../../src/app/world/detached/replay-composition";
import { createRecordWatchSession } from "../../src/app/replay/record-watch-session";
import { keptRecordKeyFor } from "../../src/app/replay/kept-record-lookup";
import { REPLAY_CHECKPOINT_TICKS } from "../../src/replay/record";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { createCosmeticWardrobe } from "../../src/presentation/cosmetic-styles";

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
    // A seek backwards starts the run again from its seed and reaches the same state.
    const [first] = checkpoints;
    if (first === undefined) throw new Error("no checkpoint");
    expect(session.seek(first.tick).semanticHash).toBe(first.hash);
    expect(session.seek(record.run.result.tick).semanticHash).toBe(record.run.result.hash);
    expect(session.stage()).toBe(0);
    expect(() => session.seek(record.run.result.tick + 1)).toThrow(RangeError);
  });

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

  it("dresses the runner's blade in the recorded look, an unknown id in the default, and changes no hash", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const recorded = recordCorpusStream(spec);
    const record = {
      ...recorded,
      look: { ...recorded.look, cosmetics: { trail: "trail_dusk", spark: "no_such_item" } },
    };
    // The blade of each world the session starts: a seek backwards starts a new one.
    const blades: object[] = [];
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
            const blade = session.replay.world.state.blade();
            if (blade !== undefined) blades.push(blade);
            return session;
          },
        };
      },
    };
    const wardrobe = createCosmeticWardrobe(COSMETIC_CATALOG, () => false);
    const session = createRecordWatchSession(record, "record:test:1", engine, { wardrobe });
    const [first] = record.run.checkpoints;
    if (first === undefined) throw new Error("no checkpoint");
    expect(session.seek(REPLAY_CHECKPOINT_TICKS).semanticHash).toBe(first.hash);
    expect(session.seek(record.run.result.tick).semanticHash).toBe(record.run.result.hash);
    expect(session.seek(REPLAY_CHECKPOINT_TICKS).semanticHash).toBe(first.hash);
    expect(blades.length).toBe(2);
    const dusk = COSMETIC_CATALOG.items.find((item) => item.id === "trail_dusk");
    for (const blade of blades) {
      const worn = wardrobe.of(blade);
      expect(worn.trail.worn).toBe(true);
      expect(worn.trail.colors).toEqual(dusk?.look.colors);
      expect(worn.spark).toEqual(wardrobe.defaults.spark);
    }
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
