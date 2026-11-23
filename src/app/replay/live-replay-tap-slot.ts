/**
 * The live replay tap's slot: the one place the live composition calls at each replay seam. It imports
 * types only, so live startup carries no replay code. Nothing happens while the slot is empty. Test builds
 * fill it on request (`replayTap` in the test-build hooks); replay PR 5c fills it in production behind a
 * lazily loaded slot. The tap that fills it is in live-replay-tap.ts.
 */
import type { CommandEnvelope } from "../../domain/envelopes";
import type { RewardDecision } from "../../gameplay/run/reward-runtime";
import type { RunStartChoices } from "../../gameplay/run/run-start-choices";
import type { SceneConfirm } from "../../gameplay/runtime/cinematic-director";
import type { TearGameplayEvent } from "../../gameplay/runtime/gameplay-events";
import type { GameAction } from "../../input/game-action";
import type { ReplayRecord } from "../../replay/record";
import type { ReplayRunEnd } from "../../replay/recorder";
import type { rewardDecisionAction } from "../world/detached/action-routing";

/** The reward shown when a decision is made, as the reward runtime holds it. */
export type ReplayTapRewardChoices = Parameters<typeof rewardDecisionAction>[1];

/** The live seams a tap listens to. */
export interface LiveReplayTapSeams {
  /** A run's start is resolved, before its world initializes. */
  readonly runStarted: (choices: RunStartChoices) => void;
  /** An application frame began on the playing screen after `tick`; `scene` is whether a scene was active. */
  readonly frame: (tick: number, seconds: number, confirm: SceneConfirm, scene: boolean) => void;
  /** A reward decision, before the reward runtime applies it to the reward shown. */
  readonly decision: (decision: RewardDecision, before: ReplayTapRewardChoices) => void;
  /** The actions sealed for `tick`, before it is simulated. */
  readonly sealed: (tick: number, actions: readonly CommandEnvelope<GameAction>[]) => void;
  /** `tick` was simulated; its state hash on demand. */
  readonly stepped: (tick: number, hash: () => string) => void;
  readonly observe: (event: TearGameplayEvent) => void;
}

export interface LiveReplayTap extends LiveReplayTapSeams {
  /**
   * The run being recorded ended. `done` gets its record, or null when no recorded run is open, once the
   * tick the run ended in has been simulated: at once between ticks, after `stepped` inside one. `run` is
   * read then, so the totals are the ones that tick left.
   */
  readonly finish: (run: () => ReplayRunEnd["run"], done: (record: ReplayRecord | null) => void) => void;
}

export interface LiveReplayTapSlot extends LiveReplayTapSeams {
  readonly install: (tap: LiveReplayTap | null) => void;
  readonly current: () => LiveReplayTap | null;
}

/** The one slot the live composition calls at each seam. */
export function createLiveReplayTapSlot(): LiveReplayTapSlot {
  let tap: LiveReplayTap | null = null;
  return Object.freeze({
    install: (next: LiveReplayTap | null) => {
      tap = next;
    },
    current: () => tap,
    runStarted: (choices: RunStartChoices) => tap?.runStarted(choices),
    frame: (tick: number, seconds: number, confirm: SceneConfirm, scene: boolean) =>
      tap?.frame(tick, seconds, confirm, scene),
    decision: (decision: RewardDecision, before: ReplayTapRewardChoices) => tap?.decision(decision, before),
    sealed: (tick: number, actions: readonly CommandEnvelope<GameAction>[]) => tap?.sealed(tick, actions),
    stepped: (tick: number, hash: () => string) => tap?.stepped(tick, hash),
    observe: (event: TearGameplayEvent) => tap?.observe(event),
  });
}

/** The coordinator's application-frame recording (RuntimeFrameCoordinator), which also tells the slot. */
export interface LiveApplicationFrameRecording {
  begin(seconds: number, confirm: SceneConfirm, cinemaActive: boolean): void;
  preludeApplied(): void;
  end(steps: number): void;
}

/** Adds the tap to the frame recording the coordinator already has; `tick` is the last simulated tick. */
export function withReplayTapFrames(
  inner: LiveApplicationFrameRecording,
  slot: Pick<LiveReplayTapSeams, "frame">,
  tick: () => number,
): LiveApplicationFrameRecording {
  return Object.freeze({
    begin(seconds: number, confirm: SceneConfirm, cinemaActive: boolean): void {
      slot.frame(tick(), seconds, confirm, cinemaActive);
      inner.begin(seconds, confirm, cinemaActive);
    },
    preludeApplied: () => {
      inner.preludeApplied();
    },
    end: (steps: number) => {
      inner.end(steps);
    },
  });
}
