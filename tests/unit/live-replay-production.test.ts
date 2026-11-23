/**
 * The production live replay recorder (src/app/replay/live-replay-production.ts): a run that starts
 * before the recorder has loaded is counted and not recorded, a tap that throws is removed for the rest
 * of the run, an unkept run is not stored, and store results and failures are counted. None of it
 * throws into the run.
 */
import { describe, expect, it } from "vitest";

import { createLiveReplayProduction } from "../../src/app/replay/live-replay-production";
import type { LiveReplayRecorderModule } from "../../src/app/replay/live-replay-recorder-slot";
import { createLiveReplayTapSlot, type LiveReplayTap } from "../../src/app/replay/live-replay-tap-slot";
import type { RunStartChoices } from "../../src/gameplay/run/run-start-choices";
import { loadOnce } from "../../src/domain/lazy-module";
import type { ReplayRecord } from "../../src/replay/record";
import type { ReplayRecordPut, ReplayRecordStore } from "../../src/replay/record-store";

const choices = {} as RunStartChoices;
const run = { score: 10, wave: 2, time: 30 };
const record = { look: { recordedAt: "2026-11-21T00:00:00Z" } } as unknown as ReplayRecord;

function harness(options: Readonly<{ put?: ReplayRecordPut; open?: "ok" | "blocked"; frameThrows?: boolean }> = {}) {
  const puts: ReplayRecord[] = [];
  const store: ReplayRecordStore = {
    put: (value) => {
      puts.push(value);
      return Promise.resolve(options.put ?? { status: "stored", key: "k", evicted: ["old"] });
    },
    entries: () => Promise.resolve([]),
    read: () => Promise.resolve(null),
    pin: () => Promise.resolve("done"),
    remove: () => Promise.resolve("done"),
    close: () => undefined,
  };
  const tap = (): LiveReplayTap => ({
    runStarted: () => undefined,
    frame: () => {
      if (options.frameThrows === true) throw new Error("tap fault");
    },
    decision: () => undefined,
    sealed: () => undefined,
    stepped: () => undefined,
    observe: () => undefined,
    finish: (_run, done) => {
      done(record);
    },
  });
  const module = {
    createLiveReplayTap: tap,
    openReplayRecordStore: () => Promise.resolve(options.open === "blocked" ? { failed: "blocked" } : store),
  } as unknown as LiveReplayRecorderModule;
  const recorder = loadOnce(() => Promise.resolve(module), "not loaded");
  const slot = createLiveReplayTapSlot();
  const production = createLiveReplayProduction({
    slot,
    recorder,
    build: { version: "0.1.0", revision: "test", target: "standalone" },
    playerName: () => "Player",
    now: () => "2026-11-21T00:00:00Z",
    indexedDb: () => null,
  });
  return { production, slot, recorder, puts };
}

describe("the production live replay recorder", () => {
  it("counts a run that starts before the recorder loads and records the next one", async () => {
    const { production, slot, recorder, puts } = harness();
    production.runStarted(choices);
    expect(slot.current()).toBeNull();
    expect(production.counters().notLoaded).toBe(1);
    await recorder.ensure();
    production.runStarted(choices);
    expect(slot.current()).not.toBeNull();
    production.runEnded(() => run, true);
    await production.settled();
    expect(slot.current()).toBeNull();
    expect(puts).toEqual([record]);
    expect(production.counters()).toMatchObject({ notLoaded: 1, recorded: 1, stored: 1, evicted: 1 });
  });

  it("removes a tap that throws and lets the run go on", async () => {
    const { production, slot, recorder, puts } = harness({ frameThrows: true });
    await recorder.ensure();
    production.runStarted(choices);
    expect(() => {
      slot.frame(1, 1 / 60, null as never, false);
    }).not.toThrow();
    expect(slot.current()).toBeNull();
    production.runEnded(() => run, true);
    await production.settled();
    expect(puts).toEqual([]);
    expect(production.counters()).toMatchObject({ tapErrors: 1, recorded: 0 });
  });

  it("stops a tap that throws even when something else wraps it in the slot", async () => {
    const { production, slot, recorder, puts } = harness({ frameThrows: true });
    await recorder.ensure();
    production.runStarted(choices);
    const guarded = slot.current();
    if (guarded === null) throw new Error("no tap installed");
    // A wrapper over the guarded tap, as the test-build timing inspector installs.
    slot.install({ ...guarded });
    slot.frame(1, 1 / 60, null as never, false);
    expect(slot.current()).not.toBeNull();
    production.runEnded(() => run, true);
    await production.settled();
    expect(slot.current()).toBeNull();
    expect(puts).toEqual([]);
    expect(production.counters()).toMatchObject({ tapErrors: 1, recorded: 0 });
    expect(production.lastTapError()).toBe("tap fault");
  });

  it("finishes but does not store a run that is not kept", async () => {
    const { production, slot, recorder, puts } = harness();
    await recorder.ensure();
    production.runStarted(choices);
    production.runEnded(() => run, false);
    await production.settled();
    expect(slot.current()).toBeNull();
    expect(puts).toEqual([]);
    expect(production.counters().recorded).toBe(0);
  });

  it("counts oversized records, failed writes and a blocked store open", async () => {
    for (const [setup, expected] of [
      [{ put: { status: "oversized", bytes: 99 } }, { oversized: 1, stored: 0 }],
      [{ put: { status: "failed", reason: "quota" } }, { storeFailures: { quota: 1 } }],
      [{ open: "blocked" }, { storeFailures: { blocked: 1 } }],
    ] as const) {
      const { production, recorder } = harness(setup);
      await recorder.ensure();
      production.runStarted(choices);
      production.runEnded(() => run, true);
      await production.settled();
      expect(production.counters()).toMatchObject({ recorded: 1, ...expected });
    }
  });
});
