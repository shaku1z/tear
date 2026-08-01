import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { CinematicTimeline, INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
  type CinematicScript } from "../../src/gameplay/runtime/cinematic-director";

const script: CinematicScript = Object.freeze({
  id: "campaign.chapter.1",
  blocksCombat: true,
  beats: Object.freeze([
    Object.freeze({ id: "brief", line: "The first line.", completion: "confirm-or-timeout" as const }),
    Object.freeze({ id: "ready", duration: 2, completion: "timed" as const }),
  ]),
});

function activeDirector() {
  const director = new CinematicTimeline.Director(CONFIG);
  director.start(script, { world: "live" });
  director.update(0.25, {});
  director.update(0.12, { key: true });
  director.update(0.18, { key: true });
  return director;
}

describe("cinematic director state", () => {
  it("canonicalizes every inactive history to one hash-stable idle state", () => {
    const director = activeDirector();
    director.update(0.8, {});
    director.cancel("unit-idle");

    expect(director.captureState()).toEqual(INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
  });

  it("round-trips every behavior-bearing field without replaying script callbacks", () => {
    const source = activeDirector();
    const captured = source.captureState();
    source.update(1.5, {});

    source.restoreState(captured);

    expect(source.captureState()).toEqual(captured);
    expect(source.id).toBe("campaign.chapter.1");
    expect(source.beatId).toBe("brief");
    expect(source.blocksCombat).toBe(true);
  });

  it("continues deterministically after restoring the same bound script", () => {
    const first = activeDirector();
    const snapshot = first.captureState();
    first.restoreState(snapshot);
    const second = activeDirector();
    second.update(0.7, {});
    second.restoreState(snapshot);

    for (const [seconds, controls] of [[0.11, {}], [0.2, { key: true }], [0.3, {}]] as const) {
      first.update(seconds, controls);
      second.update(seconds, controls);
    }

    expect(second.captureState()).toEqual(first.captureState());
  });

  it("rejects a mismatched active script without mutating the current timeline", () => {
    const source = activeDirector();
    const captured = source.captureState();
    const target = new CinematicTimeline.Director(CONFIG);
    target.start({ ...script, id: "campaign.chapter.2" }, {});
    const before = target.captureState();

    expect(() => { target.restoreState(captured); }).toThrow(/bound cinematic script/i);
    expect(target.captureState()).toEqual(before);
  });

  it("rejects malformed timing before mutating the current timeline", () => {
    const director = activeDirector();
    const before = director.captureState();

    expect(() => { director.restoreState({ ...before, totalElapsedSeconds: -1 }); }).toThrow(/non-negative/i);
    expect(director.captureState()).toEqual(before);
  });

  it("rejects empty active identities before mutating the current timeline", () => {
    const director = activeDirector();
    const before = director.captureState();

    expect(() => { director.restoreState({ ...before, scriptRevision: "" }); }).toThrow(/identity/i);
    expect(director.captureState()).toEqual(before);
  });

  it("rejects a noncanonical inactive payload before mutating the current timeline", () => {
    const director = activeDirector();
    const before = director.captureState();

    expect(() => { director.restoreState({ ...INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
      elapsedSeconds: 1, totalElapsedSeconds: 1 }); }).toThrow(/canonical idle/i);
    expect(director.captureState()).toEqual(before);
  });

  it("rejects reveal visibility inconsistent with the bound beat", () => {
    const director = activeDirector();
    const before = director.captureState();

    expect(() => { director.restoreState({ ...before, fullyVisible: false,
      fullyVisibleElapsedSeconds: 0.01 }); }).toThrow(/visibility/i);
    expect(director.captureState()).toEqual(before);
  });

  it("restores against an explicitly reconstructed script binding without firing callbacks", () => {
    const calls: string[] = [];
    const boundScript: CinematicScript = {
      ...script,
      onStart: () => { calls.push("start"); },
      beats: script.beats.map((beat) => ({ ...beat, onEnter: () => { calls.push(`enter:${beat.id}`); } })),
    };
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(boundScript, { world: "source" });
    source.update(0.4, {});
    const snapshot = source.captureState();
    calls.length = 0;
    const restored = new CinematicTimeline.Director(CONFIG);

    restored.restoreState(snapshot, { script: boundScript, context: { world: "restored" } });

    expect(restored.captureState()).toEqual(snapshot);
    expect(calls).toEqual([]);
  });

  it("re-arms physical confirmation instead of persisting a held input latch", () => {
    const director = activeDirector();
    const snapshot = director.captureState();
    director.restoreState(snapshot);
    const before = director.captureState();

    director.update(0.1, { key: true });

    expect(director.captureState().beatIndex).toBe(before.beatIndex);
    expect(director.captureState().fullyVisible).toBe(before.fullyVisible);
  });
});
