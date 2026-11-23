/** Plays a determinism corpus stream headless and records it, for the replay tests. */
import { stableVerificationHash } from "../../src/domain/hash";
import { CURRENT_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { canonicalReplayTotals, type CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { normalizeGameAction } from "../../src/input/game-action";
import { createProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import type { ReplayRecord } from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { createCorpusPlayer, scenarioContract, type StreamSpec } from "./hash-stream-corpus";

const BUILD = Object.freeze({ version: "0.1.0", revision: "round-trip", target: "test" });
const LOOK = Object.freeze({ playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-21T00:00:00Z" });

/** Plays a corpus stream in the headless environment and records it. */
export function recordCorpusStream(spec: StreamSpec): ReplayRecord {
  const environment = createProductionHeadlessEnvironment({ captureSourceTracks: true });
  try {
    environment.reset(scenarioContract(spec));
    const recorder = createReplayRecorder({
      ruleset: CURRENT_RULESET_VERSION,
      build: BUILD,
      seed: scenarioRunSeed(spec.seed),
      start: {
        mode: spec.mode as "endless" | "bossonly",
        difficulty: spec.difficulty,
        weapon: spec.weapon,
        ...(spec.boss === undefined ? {} : { boss: spec.boss }),
        metaRanks: {},
        variantDiscovery: [],
        achievementSnapshot: [],
        restoredTrail: false,
        cinematics: "full",
        playedChapters: [],
      },
      look: LOOK,
    });
    let id = 0;
    let last: CanonicalGameplayState | undefined;
    let lastTick = 0;
    const player = createCorpusPlayer(spec);
    for (let tick = 1; tick <= spec.ticks; tick += 1) {
      for (const frame of environment.sceneFrames()) recorder.frame(tick - 1, frame.seconds, frame.confirm);
      const actions = player(environment, tick);
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
      run: canonicalReplayTotals(last.run),
    });
  } finally {
    environment.dispose();
  }
}
