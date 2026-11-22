import { beforeAll, describe, expect, it } from "vitest";

import * as engineModule from "../../src/app/world/detached/replay-composition";
import { createRecordTheaterSession } from "../../src/app/replay/record-theater-session";
import { keptRecordKeyFor } from "../../src/app/replay/kept-record-lookup";
import { replayEngine } from "../../src/ghost/replay-engine";
import { REPLAY_CHECKPOINT_TICKS } from "../../src/replay/record";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

beforeAll(async () => {
  replayEngine.install(() => Promise.resolve(engineModule));
  await replayEngine.ensure();
});

describe("watching a kept record", () => {
  it("re-simulates the run: every checkpoint the Theater seeks to has the recorded state, forwards and back", () => {
    const spec = SPECS[0];
    if (spec === undefined) throw new Error("no corpus stream");
    const record = recordCorpusStream(spec);
    const session = createRecordTheaterSession(record, "record:test:1");
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

  it("finds the newest kept record of a run by its seed", () => {
    const entries = [
      { key: "record:2026-11-22T10:00:00Z:515303", bytes: 1, recordedAt: "2026-11-22T10:00:00Z" },
      { key: "record:2026-11-22T11:00:00Z:515303", bytes: 1, recordedAt: "2026-11-22T11:00:00Z" },
      { key: "record:2026-11-22T12:00:00Z:15303", bytes: 1, recordedAt: "2026-11-22T12:00:00Z" },
    ];
    expect(keptRecordKeyFor(entries, "515303")).toBe("record:2026-11-22T11:00:00Z:515303");
    expect(keptRecordKeyFor(entries, "999")).toBeUndefined();
  });
});
