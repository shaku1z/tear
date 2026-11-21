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
}

/** A tap that records each run started after it is installed, until it finishes one. */
export function createLiveReplayTap(header: Readonly<{ build: ReplayBuild; look: ReplayLook }>): LiveReplayTap {
  let open: OpenRun | null = null;
  return Object.freeze({
    runStarted(choices: RunStartChoices): void {
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
      const commands = [...run.pending.splice(0), ...actions.map((action) => action.command)];
      run.tickActions = commands.map((command) => Object.freeze({ kind: "command", id: ++run.lastId, tick, command }));
    },
    stepped(tick: number, hash: () => string): void {
      if (open === null) return;
      open.recorder.step(tick, open.tickActions, hash);
      open.tickActions = [];
      open.lastTick = tick;
      open.lastHash = hash;
    },
    observe(event: TearGameplayEvent): void {
      open?.recorder.observe(event);
    },
    finish(run: ReplayRunEnd["run"]): ReplayRecord | null {
      if (open === null || open.lastTick === 0) return null;
      const { recorder, lastTick, lastHash } = open;
      open = null;
      return recorder.finish({ tick: lastTick, hash: lastHash(), run });
    },
  });
}
