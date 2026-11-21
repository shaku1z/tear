/**
 * The production live replay recorder: it fills the live tap slot (live-replay-tap-slot.ts) for each run
 * and keeps the finished record on this device (src/replay/record-store.ts). Replay PR 5c-1.
 *
 * - **Loading:** the recorder's code is a lazy module (`liveReplayRecorder`). A run that starts before it
 *   has loaded is not recorded (`notLoaded`), and run start never waits for it.
 * - **Never fails a run:** a tap that throws is removed for the rest of that run (`tapErrors`), and every
 *   store failure is counted by reason; the run plays on.
 * - **Kept runs:** the outcome says whether a run is kept. Practice, beat-this-run, seed-race and
 *   assisted runs are recorded but not kept: their start is not the plain start a record replays.
 * - **Privacy:** records stay on this device. Nothing here uploads; publishing is replay PR 8, behind its
 *   own gate. The statistics switch governs statistics events, not this.
 */
import type { RunStartChoices } from "../../gameplay/run/run-start-choices";
import type { LazyModule } from "../../domain/lazy-module";
import type { ReplayBuild, ReplayLook } from "../../replay/record";
import type { ReplayRecordFailure, ReplayRecordStore } from "../../replay/record-store";
import type { ReplayRunEnd } from "../../replay/recorder";
import type { LiveReplayRecorderModule } from "./live-replay-recorder-slot";
import type { LiveReplayTap, LiveReplayTapSlot } from "./live-replay-tap-slot";

export interface LiveReplayProductionCounters {
  /** Runs that started before the recorder's code had loaded. */
  readonly notLoaded: number;
  /** Runs recorded to their end and kept. */
  readonly recorded: number;
  readonly stored: number;
  readonly evicted: number;
  readonly oversized: number;
  readonly tapErrors: number;
  readonly storeFailures: Readonly<Partial<Record<ReplayRecordFailure, number>>>;
}

export interface LiveReplayProductionPorts {
  readonly slot: LiveReplayTapSlot;
  readonly recorder: LazyModule<LiveReplayRecorderModule>;
  readonly build: ReplayBuild;
  readonly playerName: () => string;
  readonly now: () => string;
  readonly indexedDb: () => IDBFactory | null;
}

export interface LiveReplayProduction {
  /** A run's start is resolved, before its world initializes. */
  readonly runStarted: (choices: RunStartChoices) => void;
  /** The run reached its outcome; `keep` is false for runs a record does not replay. */
  readonly runEnded: (run: ReplayRunEnd["run"], keep: boolean) => void;
  /** Ends the open recording now and returns it, unstored (the test-build inspector). */
  readonly finishOpen: (run: ReplayRunEnd["run"]) => ReturnType<LiveReplayTap["finish"]>;
  readonly ensure: () => Promise<void>;
  readonly counters: () => LiveReplayProductionCounters;
  /** Settles once every store write started so far has finished (tests and the inspector). */
  readonly settled: () => Promise<void>;
}

/** A tap that removes itself from the slot, for the rest of the run, the first time it throws. */
function guarded(tap: LiveReplayTap, slot: LiveReplayTapSlot, failed: () => void): LiveReplayTap {
  const safe =
    <Args extends unknown[], Result>(call: (...args: Args) => Result, fallback: Result) =>
    (...args: Args): Result => {
      try {
        return call(...args);
      } catch {
        if (slot.current() === wrapped) slot.install(null);
        failed();
        return fallback;
      }
    };
  const wrapped: LiveReplayTap = Object.freeze({
    runStarted: safe(tap.runStarted, undefined),
    frame: safe(tap.frame, undefined),
    decision: safe(tap.decision, undefined),
    sealed: safe(tap.sealed, undefined),
    stepped: safe(tap.stepped, undefined),
    observe: safe(tap.observe, undefined),
    finish: safe(tap.finish, null),
  });
  return wrapped;
}

export function createLiveReplayProduction(ports: LiveReplayProductionPorts): LiveReplayProduction {
  const counts = {
    notLoaded: 0,
    recorded: 0,
    stored: 0,
    evicted: 0,
    oversized: 0,
    tapErrors: 0,
    storeFailures: {} as Partial<Record<ReplayRecordFailure, number>>,
  };
  const storeFailed = (reason: ReplayRecordFailure) => {
    counts.storeFailures[reason] = (counts.storeFailures[reason] ?? 0) + 1;
  };
  let store: Promise<ReplayRecordStore | null> | null = null;
  let writes: Promise<void> = Promise.resolve();
  const openStore = (module: LiveReplayRecorderModule): Promise<ReplayRecordStore | null> => {
    store ??= module.openReplayRecordStore(ports.indexedDb()).then((opened) => {
      if ("failed" in opened) {
        storeFailed(opened.failed);
        // A blocked or failed open is tried again for the next run.
        store = null;
        return null;
      }
      return opened;
    });
    return store;
  };
  const take = (): LiveReplayTap | null => {
    const tap = ports.slot.current();
    ports.slot.install(null);
    return tap;
  };
  return Object.freeze({
    runStarted(choices: RunStartChoices): void {
      if (ports.recorder.status() !== "ready") {
        ports.slot.install(null);
        counts.notLoaded += 1;
        void ports.recorder.ensure().catch(() => undefined);
        return;
      }
      const look: ReplayLook = { playerName: ports.playerName(), cosmetics: {}, music: null, recordedAt: ports.now() };
      const tap = ports.recorder.loaded().createLiveReplayTap({ build: ports.build, look });
      ports.slot.install(
        guarded(tap, ports.slot, () => {
          counts.tapErrors += 1;
        }),
      );
      ports.slot.runStarted(choices);
    },
    runEnded(run: ReplayRunEnd["run"], keep: boolean): void {
      const record = take()?.finish(run) ?? null;
      if (record === null || !keep) return;
      counts.recorded += 1;
      const module = ports.recorder.loaded();
      writes = writes
        .then(() => openStore(module))
        .then(async (opened) => {
          if (opened === null) return;
          const put = await opened.put(record);
          if (put.status === "stored") {
            counts.stored += 1;
            counts.evicted += put.evicted.length;
          } else if (put.status === "oversized") counts.oversized += 1;
          else storeFailed(put.reason);
        })
        .catch(() => {
          storeFailed("error");
        });
    },
    finishOpen: (run: ReplayRunEnd["run"]) => take()?.finish(run) ?? null,
    ensure: () => ports.recorder.ensure().then(() => undefined),
    counters: () => Object.freeze({ ...counts, storeFailures: Object.freeze({ ...counts.storeFailures }) }),
    settled: () => writes,
  });
}
