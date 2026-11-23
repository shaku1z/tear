/**
 * The live replay tap (src/app/replay/live-replay-tap.ts) turns the live seams into one record: a tick's
 * reward actions first, then its sealed actions, numbered in that order; scene frames only while a scene
 * plays and only after the last simulated tick; nothing for a run that is never recorded.
 */
import { describe, expect, it } from "vitest";

import { createLiveReplayTap } from "../../src/app/replay/live-replay-tap";
import { createLiveReplayTapSlot, type LiveReplayTap } from "../../src/app/replay/live-replay-tap-slot";
import type { RunStartChoices } from "../../src/gameplay/run/run-start-choices";
import { readReplayRecord, type ReplayRecord } from "../../src/replay/record";

const CHOICES: RunStartChoices = Object.freeze({
  mode: "endless",
  difficulty: "normal",
  weapon: "sword",
  boss: "shuffle",
  runSeed: 4242,
  metaRanks: { tough: 1 },
  variantDiscovery: [],
  achievementSnapshot: [],
  restoredTrail: false,
  cinematics: "full",
  playedChapters: [],
});
const HEADER = Object.freeze({
  build: { version: "test", revision: "test", target: "test" },
  look: { playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21T00:00:00Z" },
});
const HASH = "0123456789abcdef";
const RELEASED = Object.freeze({ key: false, touch: false, pad: false, click: false });
const REWARD = Object.freeze({ choices: [{ id: "edge" }, { id: "reach" }], reserveChoices: [] });
const NO_RUN = () => ({ score: 0, wave: 0, time: 0 });

/** The tap's record for a run ended now, or undefined while it waits for the tick in play. */
function finishNow(
  tap: Pick<LiveReplayTap, "finish"> | null | undefined,
  run = NO_RUN,
): ReplayRecord | null | undefined {
  let record: ReplayRecord | null | undefined;
  tap?.finish(run, (finished) => {
    record = finished;
  });
  return record;
}

describe("the live replay tap", () => {
  it("records reward actions before the sealed actions of the tick that carries them", () => {
    const slot = createLiveReplayTapSlot();
    slot.runStarted(CHOICES);
    slot.sealed(1, []);
    expect(slot.current()).toBeNull();
    slot.install(createLiveReplayTap(HEADER));
    slot.runStarted(CHOICES);
    slot.frame(0, 1 / 60, RELEASED, true);
    slot.frame(0, 1 / 60, RELEASED, false);
    slot.sealed(1, [{ kind: "command", id: 90, tick: 1, command: { type: "jump", phase: "pressed" } }]);
    slot.stepped(1, () => HASH);
    slot.decision({ kind: "reroll" }, REWARD);
    slot.decision({ kind: "draft", index: 1 }, REWARD);
    slot.decision({ kind: "draft", index: 9 }, REWARD);
    slot.frame(5, 1 / 60, RELEASED, true);
    slot.sealed(2, [{ kind: "command", id: 91, tick: 2, command: { type: "jump", phase: "released" } }]);
    slot.stepped(2, () => HASH);
    const record = finishNow(slot.current(), () => ({ score: 3, wave: 1, time: 0 }));
    expect(record?.run.seed).toBe(4242);
    expect(record?.run.start).not.toHaveProperty("boss");
    expect(record?.run.start.metaRanks).toEqual({ tough: 1 });
    expect(record?.run.frames).toEqual([{ tick: 0, seconds: 1 / 60, confirm: RELEASED }]);
    expect(record?.run.actions.map((action) => [action.id, action.tick, action.command.type])).toEqual([
      [1, 1, "jump"],
      [2, 2, "draft-reroll"],
      [3, 2, "draft-choice"],
      [4, 2, "jump"],
    ]);
    expect(record?.run.actions[2]?.command).toEqual({ type: "draft-choice", choiceId: "reach" });
    expect(readReplayRecord(JSON.parse(JSON.stringify(record)))).toMatchObject({ ok: true });
    expect(finishNow(slot.current())).toBeNull();
  });

  it("ends a run that ends inside a tick with that tick: its actions, its hash and its totals then", () => {
    const tap = createLiveReplayTap(HEADER);
    tap.runStarted(CHOICES);
    tap.sealed(1, []);
    tap.stepped(1, () => "first");
    tap.sealed(2, [{ kind: "command", id: 7, tick: 2, command: { type: "jump", phase: "pressed" } }]);
    let totals = { score: 1, wave: 1, time: 0 };
    let record: ReplayRecord | null | undefined;
    // The live outcome ends the run from inside tick 2's combat.
    tap.finish(
      () => totals,
      (finished) => {
        record = finished;
      },
    );
    expect(record).toBeUndefined();
    totals = { score: 5, wave: 1, time: 0 };
    tap.stepped(2, () => "second");
    expect(record?.run.result).toMatchObject({ tick: 2, hash: "second" });
    expect(record?.run.actions.map((action) => action.tick)).toEqual([2]);
    expect(record?.summary).toMatchObject({ score: 5 });
  });

  it("records no Tutorial or Playground run", () => {
    const tap = createLiveReplayTap(HEADER);
    for (const mode of ["tutorial", "playground"] as const) {
      tap.runStarted({ ...CHOICES, mode });
      tap.sealed(1, []);
      tap.stepped(1, () => HASH);
      expect(finishNow(tap)).toBeNull();
    }
  });

  it("opens no record the reader would refuse: no run on an engineering-only boss or an unknown one", () => {
    const tap = createLiveReplayTap(HEADER);
    const recordOn = (boss: string) => {
      tap.runStarted({ ...CHOICES, mode: "bossonly", boss });
      tap.sealed(1, []);
      tap.stepped(1, () => HASH);
      return finishNow(tap);
    };
    const released = recordOn("warden");
    expect(released?.run.start.boss).toBe("warden");
    expect(readReplayRecord(JSON.parse(JSON.stringify(released)))).toMatchObject({ ok: true });
    expect(recordOn("rootbound-rebuild")).toBeNull();
    expect(recordOn("no-such-boss")).toBeNull();
  });
});
