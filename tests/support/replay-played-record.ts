/**
 * Records a whole run as the playtest plays it (src/playtest/run-play.ts `playRun`: drafts, chapter skips, the
 * closing scene), with the stage the playing world was in after every tick, for the replay tests.
 */
import { stableVerificationHash } from "../../src/domain/hash";
import { CURRENT_RULESET_VERSION } from "../../src/gameplay/run/ruleset-version";
import { scenarioRunSeed, type SavedRunStart } from "../../src/gameplay/run/run-start-choices";
import { canonicalReplayTotals, type CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { normalizeGameAction, type GameAction } from "../../src/input/game-action";
import type { ProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";
import { playRun, type RunRequest, type RunResult } from "../../src/playtest/run-play";
import type { ReplayAction, ReplayRecord, ReplayStart } from "../../src/replay/record";
import { createReplayRecorder } from "../../src/replay/recorder";

const BUILD = Object.freeze({ version: "0.1.0", revision: "played-run", target: "test" });
const LOOK = Object.freeze({ playerName: "Player", cosmetics: {}, music: null, recordedAt: "2026-11-24T00:00:00Z" });
const SCREEN_ACTIONS: ReadonlySet<GameAction["type"]> = new Set([
  "draft-choice",
  "draft-reroll",
  "reserve-choice",
  "tier-up-choice",
]);

export interface PlayedRecord {
  readonly record: ReplayRecord;
  readonly result: RunResult;
  /** The stage id the playing world showed after each tick, from tick 0. */
  readonly stageAt: readonly string[];
}

/**
 * Plays `request` with `saved` progress and records it as the live tap would: each tick's actions and hash,
 * every application frame after the tick it follows, and a reward pick made while a screen held the world on the
 * tick that follows the hold (src/app/replay/live-replay-tap.ts).
 */
export function recordPlayedRun(request: RunRequest, saved: SavedRunStart = {}): PlayedRecord {
  const start: ReplayStart = {
    mode: request.mode as ReplayStart["mode"],
    difficulty: request.difficulty,
    weapon: request.weapon,
    metaRanks: saved.metaRanks ?? {},
    variantDiscovery: saved.variantDiscovery ?? [],
    achievementSnapshot: saved.achievementSnapshot ?? [],
    restoredTrail: saved.restoredTrail ?? false,
    cinematics: saved.cinematics ?? "full",
    playedChapters: saved.playedChapters ?? [],
  };
  const recorder = createReplayRecorder({
    ruleset: CURRENT_RULESET_VERSION,
    build: BUILD,
    seed: scenarioRunSeed(request.seed),
    start,
    look: LOOK,
  });
  const stageAt: string[] = [];
  let tick = 0;
  let id = 0;
  let pending: GameAction[] = [];
  let last: CanonicalGameplayState | undefined;
  let events: ReturnType<ProductionHeadlessEnvironment["sourceTracks"]>["nativeEvents"] | undefined;
  const confirmOf = (confirm: Readonly<{ key?: boolean; touch?: boolean; pad?: boolean; click?: boolean }> = {}) => ({
    key: confirm.key ?? false,
    touch: confirm.touch ?? false,
    pad: confirm.pad ?? false,
    click: confirm.click ?? false,
  });
  const through = (environment: ProductionHeadlessEnvironment): ProductionHeadlessEnvironment =>
    Object.freeze<ProductionHeadlessEnvironment>({
      ...environment,
      dispose() {
        events = environment.sourceTracks().nativeEvents;
        environment.dispose();
      },
      advanceApplicationFrame(seconds, confirm) {
        recorder.frame(tick, seconds, confirmOf(confirm));
        environment.advanceApplicationFrame(seconds, confirm);
      },
      step(actions) {
        if (stageAt.length === 0) stageAt.push(environment.policyObservation().run.stage);
        for (const frame of environment.sceneFrames()) recorder.frame(tick, frame.seconds, frame.confirm);
        const transition = environment.step(actions);
        const reached = transition.metrics?.tick ?? Number.NaN;
        if (reached === tick) {
          // A screen held the world: only its own actions count, and they ride on the tick that follows.
          const stray = actions.filter((action) => !SCREEN_ACTIONS.has(action.type));
          if (stray.length > 0) throw new Error(`the player acted during a held screen: ${JSON.stringify(stray)}`);
          pending.push(...actions);
          return transition;
        }
        if (reached !== tick + 1) throw new Error(`a step moved from tick ${String(tick)} to ${String(reached)}`);
        tick = reached;
        const applied: ReplayAction[] = [...pending, ...actions].map((action) => {
          const normalized = normalizeGameAction(action);
          if (!normalized.ok) throw new TypeError(normalized.reason);
          return Object.freeze({ kind: "command" as const, id: ++id, tick, command: normalized.action });
        });
        pending = [];
        const observation = transition.observation;
        recorder.step(tick, applied, () => stableVerificationHash(observation));
        last = observation;
        stageAt.push(environment.policyObservation().run.stage);
        return transition;
      },
    });
  const result = playRun(request, undefined, {
    environment: {
      captureSourceTracks: true,
      saved: {
        metaRanks: start.metaRanks,
        variantDiscovery: start.variantDiscovery,
        achievementSnapshot: start.achievementSnapshot,
        restoredTrail: start.restoredTrail,
        cinematics: start.cinematics,
        playedChapters: start.playedChapters,
      },
    },
    through,
  });
  if (events === undefined || last === undefined) throw new Error("the run recorded no tick");
  for (const event of events) recorder.observe(event);
  const record = recorder.finish({ tick, hash: stableVerificationHash(last), run: canonicalReplayTotals(last.run) });
  return { record, result, stageAt };
}
