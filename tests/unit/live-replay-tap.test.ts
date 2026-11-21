/**
 * The live replay tap (src/app/replay/live-replay-tap.ts) turns the live seams into one record: a tick's
 * reward actions first, then its sealed actions, numbered in that order; scene frames only while a scene
 * plays and only after the last simulated tick; nothing for a run that is never recorded.
 */
import { describe, expect, it } from "vitest";

import { createLiveReplayTap, createLiveReplayTapSlot } from "../../src/app/replay/live-replay-tap";
import type { RunStartChoices } from "../../src/gameplay/run/run-start-choices";
import { readReplayRecord } from "../../src/replay/record";

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
    const record = slot.current()?.finish({ score: 3, wave: 1, time: 0 });
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
    expect(slot.current()?.finish({ score: 0, wave: 0, time: 0 })).toBeNull();
  });

  it("records no Tutorial or Playground run", () => {
    const tap = createLiveReplayTap(HEADER);
    for (const mode of ["tutorial", "playground"] as const) {
      tap.runStarted({ ...CHOICES, mode });
      tap.sealed(1, []);
      tap.stepped(1, () => HASH);
      expect(tap.finish({ score: 0, wave: 0, time: 0 })).toBeNull();
    }
  });
});
