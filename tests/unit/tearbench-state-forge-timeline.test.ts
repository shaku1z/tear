import { describe, expect, it } from "vitest";

import type { CommandEnvelope } from "../../src/domain/envelopes";
import type { GameAction } from "../../src/input/game-action";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";
import {
  migrateTimelineArchive,
  TearCheckpointBank,
  TearStateTimeline,
} from "../../src/tearbench";

function snapshot(): TearSnapshotV1 {
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "root", tick: 10, stateClass: "recorded-canonical", seed: "timeline",
    hashes: { exact: "e", semantic: "s", visual: "v", progression: "p", environment: "n" },
    provenance: {
      actor: "developer", producer: "test",
      build: { version: "1", revision: "r", target: "test", rulesetVersion: "1", contentHash: "c", configHash: "g" },
      executionClass: "engineering", observationClass: "privileged-diagnostic", trainingConsent: "no-training",
    },
    rng: {}, codecs: {}, state: { player: { hp: 100 }, run: { score: 0 } },
  };
}

function move(tick: number, x: number): CommandEnvelope<GameAction> {
  return { kind: "command", id: tick, tick, command: { type: "move", x, y: 0 } };
}

describe("State Forge event timeline", () => {
  it("stores action/event deltas, time-travels, and executes deterministic counterfactuals", () => {
    const timeline = new TearStateTimeline(60);
    timeline.checkpoint(snapshot());
    timeline.delta({
      id: "damaged", parentId: "root", tick: 11,
      statePatch: { player: { hp: 40 } },
      actions: [move(11, 1)],
      events: [],
    });
    let state: Readonly<Record<string, unknown>> = {};
    const runtime = {
      restore(value: Readonly<Record<string, unknown>>) { state = structuredClone(value); },
      step(actions: readonly CommandEnvelope<GameAction>[]) {
        const run = structuredClone(state.run ?? {}) as Record<string, unknown>;
        run.score = Number(run.score ?? 0) + actions.length;
        state = { ...state, run };
      },
      stateHash: () => JSON.stringify(state),
      captureState: () => state,
    };
    expect(timeline.timeTravel("damaged", runtime)).toContain("\"hp\":40");
    const first = timeline.counterfactual("damaged", [[move(12, 1)], [move(13, -1)]], runtime);
    const second = timeline.counterfactual("damaged", [[move(12, 1)], [move(13, -1)]], runtime);
    expect(first).toEqual(second);
    expect(first.ticks).toBe(2);
    expect(first.finalState).toMatchObject({ player: { hp: 40 }, run: { score: 2 } });
  });

  it("migrates v1 checkpoint archives and round-trips v2 atomically", () => {
    const legacy = new TearCheckpointBank();
    legacy.addSnapshot(snapshot());
    legacy.fork("root", "fork", 11, { player: { hp: 1 } });
    const migrated = migrateTimelineArchive(legacy.export(), 30);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.deltas[0]).toMatchObject({ actions: [], events: [] });
    const timeline = new TearStateTimeline(30);
    timeline.import(migrated);
    expect(timeline.materialize("fork")).toMatchObject({ player: { hp: 1 } });
    expect(timeline.export()).toEqual(migrated);
  });
});
