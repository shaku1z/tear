/**
 * Engineering builds only: a short, real record for the journeys' `openReplay()` hook. An Endless run in
 * which the player presses nothing is re-simulated in the detached world (the world verify and watch
 * use) and recorded through the one recorder, so the replay screen opens a record the game produced,
 * without playing a live run first.
 */
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import type { ReplayBuild, ReplayRecord, ReplayRun } from "../../replay/record";
import { createReplayRecorder } from "../../replay/recorder";
import { recordReplayWorld, type RecordWorldEngine } from "../replay/record-world";

/** The idle run: a fixed seed and the baseline loadout, so every journey opens the same replay. */
const IDLE_RUN: Pick<ReplayRun, "seed" | "start"> = Object.freeze({
  seed: 0x5eed_1d1e,
  start: Object.freeze({
    mode: "endless",
    difficulty: "normal",
    weapon: "sword",
    metaRanks: Object.freeze({}),
    variantDiscovery: Object.freeze([]),
    achievementSnapshot: Object.freeze([]),
    restoredTrail: false,
    cinematics: "off",
    playedChapters: Object.freeze([]),
  }),
});

/** Records `ticks` ticks of the idle run (fewer when the run ends first) in the engine the deferred loader fetched. */
export function recordIdleReplay(engine: RecordWorldEngine, build: ReplayBuild, ticks: number): ReplayRecord {
  const recorder = createReplayRecorder({
    ruleset: CURRENT_RULESET_VERSION,
    build,
    ...IDLE_RUN,
    look: Object.freeze({
      playerName: "Journey Tester",
      cosmetics: Object.freeze({}),
      music: null,
      recordedAt: new Date(0).toISOString(),
    }),
  });
  const run = recordReplayWorld(engine).start(IDLE_RUN, recorder.observe);
  try {
    let tick = 0;
    let hash = (): string => "";
    for (let step = 0; step < ticks; step += 1) {
      const result = run.step([], []);
      recorder.step(result.tick, [], result.hash);
      tick = result.tick;
      hash = result.hash;
      if (result.terminated) break;
    }
    return recorder.finish({ tick, hash: hash(), run: run.run() });
  } finally {
    run.dispose();
  }
}
