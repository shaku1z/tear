/**
 * The live replay tap: records a live run as a replay record (src/replay/record.ts) from the live game's
 * own seams, through the one recorder (src/replay/recorder.ts).
 *
 * - **Start:** the run's start choices as the live run start resolved them (LiveRunStartController).
 * - **Ticks:** the actions sealed for a tick, then the tick's state hash once it is simulated.
 * - **Reward decisions:** at the reward runtime's decision seam, as the GameActions
 *   `rewardDecisionAction` maps them to, carried by the next simulated tick. No tick runs while a reward
 *   screen is shown, and the detached step routes them before it simulates that tick.
 * - **Scene frames:** the application frames that start on the playing screen while a scene is active
 *   (the record's one frame-clock exception, ReplayFrame).
 * - **Events:** the run's gameplay events, for the summary.
 * - **End:** a run can end inside a tick (a death or a win, in that tick's combat) or between ticks (a quit,
 *   a give-up). The record ends with the last tick the run simulated, so one that ends inside a tick is
 *   finished once that tick has been simulated, with its actions, its hash and the run's totals then.
 *
 * The tap numbers the actions it records in the order they apply: a tick's reward actions first, then
 * its sealed actions.
 *
 * The live composition holds one slot (live-replay-tap-slot.ts) and calls it at each seam; a tap from
 * here fills it. This module is not part of live startup: it carries the recorder and the record.
 */
import type { CommandEnvelope } from "../../domain/envelopes";
import type { RewardDecision } from "../../gameplay/run/reward-runtime";
import { CURRENT_RULESET_VERSION } from "../../gameplay/run/ruleset-version";
import type { RunStartChoices } from "../../gameplay/run/run-start-choices";
import type { SceneConfirm } from "../../gameplay/runtime/cinematic-director";
import type { TearGameplayEvent } from "../../gameplay/runtime/gameplay-events";
import type { GameAction } from "../../input/game-action";
import {
  replayStartOf,
  type ReplayAction,
  type ReplayBuild,
  type ReplayLook,
  type ReplayRecord,
} from "../../replay/record";
import { createReplayRecorder, type ReplayRecorder, type ReplayRunEnd } from "../../replay/recorder";
import { rewardDecisionAction } from "../world/detached/action-routing";
import type { LiveReplayTap, ReplayTapRewardChoices } from "./live-replay-tap-slot";

interface OpenRun {
  readonly recorder: ReplayRecorder;
  readonly pending: GameAction[];
  tickActions: ReplayAction[];
  lastId: number;
  lastTick: number;
  lastHash: () => string;
  /** The tick sealed and not yet simulated, if any. */
  inFlight: number | null;
  ending: Readonly<{ run: () => ReplayRunEnd["run"]; done: (record: ReplayRecord | null) => void }> | null;
}

/** A tap that records each run started after it is installed, until it finishes one. */
export function createLiveReplayTap(header: Readonly<{ build: ReplayBuild; look: ReplayLook }>): LiveReplayTap {
  let open: OpenRun | null = null;
  const close = (run: OpenRun, end: NonNullable<OpenRun["ending"]>): void => {
    open = null;
    end.done(
      run.lastTick === 0 ? null : run.recorder.finish({ tick: run.lastTick, hash: run.lastHash(), run: end.run() }),
    );
  };
  return Object.freeze({
    runStarted(choices: RunStartChoices): void {
      // A run still ending when another starts never simulated the tick it ended in.
      open?.ending?.done(null);
      const start = replayStartOf(choices);
      open =
        start === null
          ? null
          : {
              recorder: createReplayRecorder({ ruleset: CURRENT_RULESET_VERSION, ...header, ...start }),
              pending: [],
              tickActions: [],
              lastId: 0,
              lastTick: 0,
              lastHash: () => "",
              inFlight: null,
              ending: null,
            };
    },
    frame(tick: number, seconds: number, confirm: SceneConfirm, scene: boolean): void {
      if (open !== null && scene && tick === open.lastTick) open.recorder.frame(tick, seconds, confirm);
    },
    decision(decision: RewardDecision, before: ReplayTapRewardChoices): void {
      const action = rewardDecisionAction(decision, before);
      if (open !== null && action !== undefined) open.pending.push(action);
    },
    sealed(tick: number, actions: readonly CommandEnvelope<GameAction>[]): void {
      if (open === null) return;
      const run = open;
      run.inFlight = tick;
      const commands = [...run.pending.splice(0), ...actions.map((action) => action.command)];
      run.tickActions = commands.map((command) => Object.freeze({ kind: "command", id: ++run.lastId, tick, command }));
    },
    stepped(tick: number, hash: () => string): void {
      if (open === null) return;
      open.recorder.step(tick, open.tickActions, hash);
      open.tickActions = [];
      open.lastTick = tick;
      open.lastHash = hash;
      open.inFlight = null;
      if (open.ending !== null) close(open, open.ending);
    },
    observe(event: TearGameplayEvent): void {
      open?.recorder.observe(event);
    },
    finish(run: () => ReplayRunEnd["run"], done: (record: ReplayRecord | null) => void): void {
      if (open === null) done(null);
      else if (open.inFlight === null) close(open, { run, done });
      else open.ending = { run, done };
    },
  });
}
