/**
 * The replay record's one frame-clock exception (ReplayFrame in src/replay/record.ts). A scene plays on
 * application frames and confirm presses, not on ticks, and holds the fight, so the tick it ends on is
 * gameplay. Live play runs about one frame of 1/60 s per two ticks and the player may hold confirm to skip a
 * scene; a
 * detached world with no frame clock plays one tick-length frame per tick. A record therefore holds the
 * frames that started during a scene, and verify plays exactly those.
 *
 * This test plays a campaign run's opening chapter the way live play does (1/60 s frames, confirm held
 * from a frame part-way: HOLD TO SKIP CHAPTER, as src/playtest/headless/chapter.ts skips one), records it,
 * and verifies it from its seed. The same record without its frames, or with the hold starting on
 * another frame, does not verify. Without frames the chapter never hands over: ticks neither time nor
 * confirm its pages.
 */
import { describe, expect, it } from "vitest";

import { createDetachedReplayWorld } from "../../src/app/replay/detached-replay-world";
import { stepDetachedWorld, type DetachedSceneFrame } from "../../src/app/world/detached/detached-step";
import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import { CURRENT_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { replayStartChoices, type ReplayRecord, type ReplayStart } from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";
import { verifyReplay } from "../../src/replay/verify";

const START: ReplayStart = Object.freeze({
  mode: "campaign",
  difficulty: "normal",
  weapon: "sword",
  metaRanks: {},
  variantDiscovery: [],
  achievementSnapshot: [],
  restoredTrail: false,
  cinematics: "full",
  playedChapters: [],
});
const SEED = scenarioRunSeed("replay-frame-clock:chapter");
const TICKS = 1_440;
const LIVE_FRAME_SECONDS = 1 / 60;
const RELEASED = Object.freeze({ key: false, touch: false, pad: false, click: false });
const PRESSED = Object.freeze({ ...RELEASED, key: true });

/** Plays the run as live play would: one 1/60 s frame every second tick while a scene plays. */
function recordLiveLike(holdFromFrame: number): Readonly<{ record: ReplayRecord; sceneTicks: number }> {
  const events = new TearGameplayEventBus();
  const recorder = createReplayRecorder({
    ruleset: CURRENT_RULESET_VERSION,
    build: { version: "0.1.0", revision: "frame-clock", target: "test" },
    seed: SEED,
    start: START,
    look: { playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21T00:00:00Z" },
  });
  events.subscribe(recorder.observe);
  const choices = replayStartChoices({ seed: SEED, start: START });
  const session = createProductionGhostReplayComposition({
    runSeed: choices.runSeed,
    mode: choices.mode,
    weaponId: choices.weapon,
    difficulty: choices.difficulty,
    saved: choices,
    gameplayEvents: events,
  }).create(undefined);
  events.setTickSource(() => session.simulation.scheduler.tick);
  let sceneFrames = 0;
  let sceneTicks = 0;
  let last = stepDetachedWorld(session, [], []);
  recorder.step(1, [], () => last.stateHash);
  for (let tick = 2; tick <= TICKS; tick += 1) {
    const frames: DetachedSceneFrame[] = [];
    if (session.replay.world.context.cinema.active) {
      sceneTicks += 1;
      if (tick % 2 === 0) {
        sceneFrames += 1;
        frames.push({ seconds: LIVE_FRAME_SECONDS, confirm: sceneFrames >= holdFromFrame ? PRESSED : RELEASED });
      }
    }
    for (const frame of frames) recorder.frame(tick - 1, frame.seconds, frame.confirm);
    last = stepDetachedWorld(session, [], frames);
    const result = last;
    recorder.step(tick, [], () => result.stateHash);
  }
  const run = last.state.run;
  const record = recorder.finish({
    tick: last.tick,
    hash: last.stateHash,
    run: { score: run?.score ?? 0, wave: run?.wave ?? 0, time: run?.time ?? 0 },
  });
  return { record, sceneTicks };
}

describe("the replay frame clock: scene frames are recorded and played as they ran", () => {
  const pressed = recordLiveLike(20);

  it("a campaign opening plays a chapter scene that live play skips by holding confirm", () => {
    expect(pressed.record.run.frames.length).toBeGreaterThan(0);
    expect(pressed.record.run.frames.some((frame) => frame.confirm.key)).toBe(true);
    expect(pressed.sceneTicks).toBeGreaterThan(40);
    expect(pressed.sceneTicks).toBeLessThan(TICKS - 240);
  });

  it("verifies from its seed with the frames it holds", () => {
    expect(verifyReplay(pressed.record, createDetachedReplayWorld())).toEqual({ status: "verified", tick: TICKS });
  });

  it("does not verify without its frames", () => {
    const stripped: ReplayRecord = { ...pressed.record, run: { ...pressed.record.run, frames: [] } };
    expect(verifyReplay(stripped, createDetachedReplayWorld()).status).toBe("differs");
  });

  it("does not verify when the hold starts on another frame", () => {
    const later = recordLiveLike(60).record;
    expect(later.run.checkpoints).not.toEqual(pressed.record.run.checkpoints);
    const moved: ReplayRecord = { ...pressed.record, run: { ...pressed.record.run, frames: later.run.frames } };
    expect(verifyReplay(moved, createDetachedReplayWorld()).status).toBe("differs");
  });
});
