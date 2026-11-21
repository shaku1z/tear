/**
 * The replay round trip over the determinism corpus: play each stream headless, record it, write it as
 * JSON, read it back and verify it in the detached world from its seed. Every checkpoint must equal the
 * pinned determinism hash at that tick, and the verdict must be "verified". A record changed in one
 * action, one summary field or its ruleset must not verify; one changed only in its look must.
 *
 * This proves the record and verify on headless runs. A live run in the browser is not covered here:
 * its seed, start choices, reward picks and frame clock differ from a headless run (see PR 5b in
 * plans/active/REPLAY_OVERHAUL_PLAN.md).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stableVerificationHash } from "../../src/domain/hash";
import { CURRENT_RULESET_VERSION, RULESET_STEPS } from "../../src/gameplay/run/ruleset-version";
import type { CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { normalizeGameAction } from "../../src/input/game-action";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { REPLAY_CHECKPOINT_TICKS, readReplayRecord, type ReplayRecord } from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";
import { verifyReplay } from "../../src/replay/verify";
import { createDetachedReplayWorld } from "../../src/app/replay/detached-replay-world";
import { SPECS, corpusActions, scenarioContract, type StreamSpec } from "../support/hash-stream-corpus";

const DETERMINISM = JSON.parse(readFileSync("tests/fixtures/canonical-hash-stream.json", "utf8")) as {
  readonly sampleEvery: number;
  readonly streams: readonly { readonly id: string; readonly hashes: readonly string[] }[];
};
const BUILD = Object.freeze({ version: "0.1.0", revision: "round-trip", target: "test" });
const LOOK = Object.freeze({ playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21T00:00:00Z" });

/** Plays a corpus stream headless and records it, as the live recorder will. */
function recordCorpusStream(spec: StreamSpec): ReplayRecord {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    environment.reset(scenarioContract(spec));
    const recorder = createReplayRecorder({
      ruleset: CURRENT_RULESET_VERSION,
      build: BUILD,
      seed: spec.seed,
      start: { mode: spec.mode as "endless" | "bossonly", difficulty: spec.difficulty, weapon: spec.weapon },
      look: LOOK,
    });
    let id = 0;
    let last: CanonicalGameplayState | undefined;
    let lastTick = 0;
    for (let tick = 1; tick <= spec.ticks; tick += 1) {
      const actions = corpusActions(environment, spec.plan, tick);
      const transition = environment.step(actions);
      const observation = transition.observation;
      const applied = actions.map((action) => {
        const normalized = normalizeGameAction(action);
        if (!normalized.ok) throw new TypeError(normalized.reason);
        return Object.freeze({ kind: "command" as const, id: ++id, tick, command: normalized.action });
      });
      recorder.step(tick, applied, () => stableVerificationHash(observation));
      last = observation;
      lastTick = tick;
      if (transition.terminated) break;
    }
    for (const event of environment.sourceTracks().nativeEvents) recorder.observe(event);
    if (last === undefined) throw new Error(`${spec.id} recorded no tick`);
    return recorder.finish({
      tick: lastTick,
      hash: stableVerificationHash(last),
      run: { score: last.run?.score ?? 0, wave: last.run?.wave ?? 0, time: last.run?.time ?? 0 },
    });
  } finally {
    environment.dispose();
  }
}

function readBack(record: ReplayRecord): ReplayRecord {
  const read = readReplayRecord(JSON.parse(JSON.stringify(record)));
  if (!read.ok) throw new Error(`${read.reason}: ${read.detail}`);
  return read.record;
}

const recorded = new Map<string, ReplayRecord>();
const world = createDetachedReplayWorld();

describe("replay round trip over the determinism corpus", () => {
  it.each(SPECS)(
    "$id records, reads back and verifies from its seed",
    (spec) => {
      const record = recordCorpusStream(spec);
      recorded.set(spec.id, record);
      const pinned = DETERMINISM.streams.find((stream) => stream.id === spec.id)?.hashes ?? [];
      const perCheckpoint = REPLAY_CHECKPOINT_TICKS / DETERMINISM.sampleEvery;
      expect(record.run.checkpoints.map((checkpoint) => checkpoint.hash)).toEqual(
        record.run.checkpoints.map((_, index) => pinned[(index + 1) * perCheckpoint - 1]),
      );
      const read = readBack(record);
      expect(read).toEqual(record);
      expect(verifyReplay(read, world)).toEqual({ status: "verified", tick: record.run.result.tick });
    },
    120_000,
  );

  const sample = (): ReplayRecord => {
    const record = recorded.get(SPECS[0]?.id ?? "");
    if (record === undefined) throw new Error("the first corpus stream was not recorded");
    return record;
  };

  it("names the first checkpoint after one changed action", () => {
    const record = sample();
    const index = record.run.actions.findIndex((action) => action.tick > 300 && action.command.type === "move");
    const changed = record.run.actions.map((action, at) =>
      at === index && action.command.type === "move"
        ? { ...action, command: { ...action.command, x: action.command.x === 0 ? 1_000 : -action.command.x } }
        : action,
    );
    const tick = record.run.actions[index]?.tick ?? 0;
    const verdict = verifyReplay(readBack({ ...record, run: { ...record.run, actions: changed } }), world);
    expect(verdict.status).toBe("differs");
    if (verdict.status === "differs") expect(verdict.tick).toBeGreaterThanOrEqual(tick);
  });

  it("refuses a record whose summary was changed", () => {
    const record = sample();
    const verdict = verifyReplay(
      readBack({ ...record, summary: { ...record.summary, score: record.summary.score + 1 } }),
      world,
    );
    expect(verdict).toMatchObject({ status: "differs", what: "summary" });
  });

  it("verifies a record whose look was changed, because the look never reaches the simulation", () => {
    const record = sample();
    const look = {
      playerName: "Someone Else",
      cosmetics: { blade: "ember" },
      music: "night-drive",
      recordedAt: "2030-01-01",
    };
    expect(verifyReplay(readBack({ ...record, look }), world)).toEqual({
      status: "verified",
      tick: record.run.result.tick,
    });
  });

  it("refuses a record from a retired ruleset with the change it missed", () => {
    const record = sample();
    const retired = RULESET_STEPS[0]?.version ?? "";
    const verdict = verifyReplay(readBack({ ...record, run: { ...record.run, ruleset: retired } }), world);
    expect(verdict).toEqual({
      status: "refused",
      message: `This replay was recorded before ${RULESET_STEPS[1]?.change ?? ""}.`,
    });
  });
});
