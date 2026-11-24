/**
 * Watch (src/replay/watch.ts): the one playback of a recorded run. The first blocks drive it over a counting
 * world, for the transport, chapters and the seek cache; the last over the detached production world, for
 * the recorded states at near and far ticks, forwards and back.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import * as engineModule from "../../src/app/world/detached/replay-composition";
import { watchRecord } from "../../src/app/replay/record-world";
import { keptRecordKeyFor } from "../../src/app/replay/kept-record-lookup";
import { REPLAY_CHECKPOINT_TICKS } from "../../src/replay/record";
import { createWatch, type WatchCheckpoint, type WatchWorld } from "../../src/replay/watch";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { createCosmeticWardrobe } from "../../src/presentation/cosmetic-styles";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A world whose state at tick N is "hN": watch's port with nothing behind it. */
function countingWatch(
  lastTick: number,
  options: Readonly<{ chapters?: readonly number[]; cache?: { every: number; limit: number }; failAt?: number }> = {},
) {
  const starts: (number | undefined)[] = [];
  const watch = createWatch<WatchCheckpoint, WatchWorld<WatchCheckpoint, string>>({
    run: { actions: [], frames: [], result: { tick: lastTick } },
    chapters: options.chapters ?? [],
    ...(options.cache === undefined ? {} : { cache: options.cache }),
    start: (from) => {
      starts.push(from?.tick);
      let tick = from?.tick ?? 0;
      return {
        step: (inputs) => {
          if (inputs.tick !== tick + 1) throw new Error(`inputs for tick ${String(inputs.tick)} at ${String(tick)}`);
          if (inputs.tick === options.failAt) throw new Error("the world refused the tick");
          tick = inputs.tick;
          return `h${String(tick)}`;
        },
        checkpoint: () => ({ tick, semanticHash: `h${String(tick)}` }),
        frame: () => `frame ${String(tick)}`,
        dispose: () => undefined,
      };
    },
  });
  return { watch, starts };
}

describe("watch's transport", () => {
  it("plays at a speed the replay bar offers, pauses at the end, and plays again from the start", () => {
    const { watch } = countingWatch(600);
    expect(watch.state()).toEqual({ tick: 0, hash: "", playing: false, speed: 1 });
    watch.advance(1);
    expect(watch.state().tick).toBe(0);
    watch.play();
    expect(watch.setSpeed(3)).toBe(false);
    expect(watch.setSpeed(2)).toBe(true);
    // Half a second at double speed is 120 ticks; fractions of a tick carry over to the next frame.
    watch.advance(0.5);
    expect(watch.state().tick).toBe(120);
    watch.advance(1 / 512);
    watch.advance(1 / 512);
    expect(watch.state().tick).toBe(120);
    watch.advance(1 / 512);
    expect(watch.state().tick).toBe(121);
    watch.advance(10);
    expect(watch.state()).toEqual({ tick: 600, hash: "h600", playing: false, speed: 2 });
    watch.toggle();
    expect(watch.state()).toMatchObject({ tick: 0, playing: true });
    watch.pause();
    expect(watch.state().playing).toBe(false);
  });

  it("holds seeks within the run, in seconds and fractions, and jumps between chapters", () => {
    const { watch } = countingWatch(1200, { chapters: [960, 240, 240, 2000, 600] });
    expect(watch.chapters).toEqual([240, 600, 960]);
    expect(watch.seek(-5).tick).toBe(0);
    expect(watch.seek(5000).tick).toBe(1200);
    expect(watch.seekBy(-2).tick).toBe(960);
    expect(watch.seekToFraction(0.25).tick).toBe(300);
    expect(watch.jumpChapter(1).tick).toBe(600);
    expect(watch.jumpChapter(1).tick).toBe(960);
    expect(watch.jumpChapter(1).tick).toBe(960);
    expect(watch.jumpChapter(-1).tick).toBe(600);
    expect(watch.progress()).toBe(0.5);
    expect(watch.frameAt(30)).toBe("frame 30");
  });

  it("pauses and throws on when the world refuses a tick, and seeks again afterwards", () => {
    const { watch } = countingWatch(100, { failAt: 50 });
    watch.play();
    expect(() => watch.seek(80)).toThrow("the world refused the tick");
    expect(watch.state()).toMatchObject({ tick: 49, playing: false });
    expect(watch.seek(20).tick).toBe(20);
  });
});

describe("watch's seek cache", () => {
  it("keeps checkpoints on its grid and starts a seek back at the latest one at or before it", () => {
    const { watch, starts } = countingWatch(35, { cache: { every: 10, limit: 8 } });
    watch.seek(35);
    expect(watch.cached()).toEqual({ ticks: [10, 20, 30], every: 10 });
    expect(watch.seek(29)).toMatchObject({ tick: 29, hash: "h29" });
    expect(starts.at(-1)).toBe(20);
    expect(watch.seek(9).tick).toBe(9);
    expect(starts.at(-1)).toBeUndefined();
    // Forwards from before a cached checkpoint, the world starts again at the checkpoint instead of stepping to it.
    expect(watch.seek(31).hash).toBe("h31");
    expect(starts.at(-1)).toBe(30);
  });

  it("widens its grid at the limit, so a long run keeps evenly spaced checkpoints over its whole length", () => {
    const { watch, starts } = countingWatch(200, { cache: { every: 10, limit: 4 } });
    watch.seek(200);
    const { ticks, every } = watch.cached();
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(every).toBe(80);
    expect(ticks).toEqual([80, 160]);
    // Every tick past the first checkpoint is at most one spacing from the checkpoint a seek starts at.
    for (let tick = 199; tick >= 80; tick -= 7) {
      watch.seek(tick);
      expect(tick - (starts.at(-1) ?? 0)).toBeLessThan(every);
    }
  });
});

describe("watching a kept record", () => {
  it("re-simulates the run: every checkpoint has the recorded state at near and far ticks, forwards and back", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    const watch = watchRecord(record, engineModule);
    expect(watch.lastTick).toBe(record.run.result.tick);
    const checkpoints = record.run.checkpoints.map((checkpoint, index) => ({
      tick: (index + 1) * REPLAY_CHECKPOINT_TICKS,
      hash: checkpoint.hash,
    }));
    expect(checkpoints.length).toBeGreaterThan(1);
    for (const { tick, hash } of checkpoints) expect(watch.seek(tick).hash).toBe(hash);
    // A seek backwards starts again from the seek cache and reaches the same state.
    const [first] = checkpoints;
    if (first === undefined) throw new Error("no checkpoint");
    expect(watch.seek(first.tick).hash).toBe(first.hash);
    expect(watch.seek(record.run.result.tick).hash).toBe(record.run.result.hash);
    expect(watch.world().stage()).toBe(0);
    expect(watch.seek(record.run.result.tick + 1).tick).toBe(record.run.result.tick);
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
      const watch = watchRecord(record, engine, {}, { every: REPLAY_CHECKPOINT_TICKS, limit: 64 });
      expect(watch.seek(record.run.result.tick).hash).toBe(record.run.result.hash);
      const checkpoints = record.run.checkpoints.map((checkpoint, index) => ({
        tick: (index + 1) * REPLAY_CHECKPOINT_TICKS,
        hash: checkpoint.hash,
      }));
      expect(watch.cached().ticks).toEqual(checkpoints.map((checkpoint) => checkpoint.tick));
      // Backwards, from the latest checkpoint before the end: each seek starts a world at that checkpoint.
      for (const { tick, hash } of checkpoints.filter((checkpoint) => checkpoint.tick < watch.lastTick).reverse()) {
        expect(watch.seek(tick).hash).toBe(hash);
        expect(starts.at(-1)).toBe(tick);
      }
      // A world started from a checkpoint plays on to the recorded end.
      const [first] = checkpoints;
      if (first !== undefined) {
        expect(watch.seek(first.tick + 7).tick).toBe(first.tick + 7);
        expect(starts.at(-1)).toBe(first.tick);
      }
      expect(watch.seek(record.run.result.tick).hash).toBe(record.run.result.hash);
      // Only the opening started from the seed.
      expect(starts.filter((tick) => tick === undefined)).toHaveLength(1);
    },
  );

  it("takes and restores checkpoints in a built game, which has its own build identity", () => {
    vi.stubGlobal("__TEAR_BUILD_REVISION__", "0123456789abcdef0123456789abcdef01234567");
    vi.stubGlobal("__TEAR_BUILD_TARGET__", "test-standalone");
    vi.stubGlobal("__TEAR_BUILD_SOURCE_FINGERPRINT__", "a".repeat(64));
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    const watch = watchRecord(record, engineModule, {}, { every: REPLAY_CHECKPOINT_TICKS, limit: 64 });
    watch.seek(record.run.result.tick);
    expect(watch.cached().ticks.length).toBeGreaterThan(1);
    const [first] = record.run.checkpoints;
    expect(watch.seek(REPLAY_CHECKPOINT_TICKS).hash).toBe(first?.hash);
  });

  it("re-simulates from the seed when a checkpoint cannot be taken, so a seek never fails on the cache", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const engine = {
      ...engineModule,
      captureProductionReplayCheckpoint: (): never => {
        throw new TypeError("no checkpoint");
      },
    };
    const watch = watchRecord(record, engine, {}, { every: REPLAY_CHECKPOINT_TICKS, limit: 64 });
    expect(watch.seek(record.run.result.tick).hash).toBe(record.run.result.hash);
    const [first] = record.run.checkpoints;
    expect(watch.seek(REPLAY_CHECKPOINT_TICKS).hash).toBe(first?.hash);
    expect(watch.cached().ticks).toEqual([]);
    expect(warn).toHaveBeenCalledWith("replay seek cache off: no checkpoint");
    warn.mockRestore();
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
    const watch = watchRecord(record, engine);
    watch.seek(watch.lastTick);
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
    // The blade of each world watch starts: a seek backwards starts a new one.
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
    const watch = watchRecord(record, engine, { wardrobe });
    const [first] = record.run.checkpoints;
    if (first === undefined) throw new Error("no checkpoint");
    expect(watch.seek(REPLAY_CHECKPOINT_TICKS).hash).toBe(first.hash);
    expect(watch.seek(record.run.result.tick).hash).toBe(record.run.result.hash);
    expect(watch.seek(REPLAY_CHECKPOINT_TICKS).hash).toBe(first.hash);
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
