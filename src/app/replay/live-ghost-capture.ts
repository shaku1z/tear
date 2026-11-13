import { createGhostAuthoritativeReceipt } from "../../ghost/authoritative-receipt";
import { ghostLiveBootstrapEventId } from "../../ghost/live-causal-events";
import { stableVerificationHash } from "../../replay/hash";
import type { TearSnapshotV1 } from "../../tearbench/contracts";
import { captureLiveStateForgeSnapshot } from "../../tearbench/live-runtime-snapshots";
import type { TearLiveWorldAdapter } from "../../tearbench/live-state-snapshot";
import { createDefaultStateCodecRegistry } from "../../tearbench/state-codecs";
import type { LiveCampaignTraining } from "../campaign/campaign-training-composition";
import type { LiveCanonicalCombatHost, LiveCanonicalStateCapture } from "../combat/live-canonical-state";
import type { LiveScreenNavigation } from "../interface/live-screen-navigation";
import type { GameBlade, GamePlayer, GameRun } from "../shell/game-runtime-state";
import type { LiveWorldComposition } from "../world/world-composition";
import { createLiveGhostFinaleCompanion } from "./ghost-finale-companion";
import type { LiveGhostRecording } from "./live-ghost-recording";

export interface LiveGhostCaptureOptions {
  readonly recording: Pick<LiveGhostRecording, "session" | "recorder" | "frames">;
  readonly stateForge: TearLiveWorldAdapter<unknown>;
  readonly world: Pick<LiveWorldComposition, "state" | "lifecycle" | "context">;
  readonly combat: Pick<LiveCanonicalCombatHost, "authoritativeStep" | "simulationRuntime">;
  readonly canonicalState: LiveCanonicalStateCapture;
  readonly campaign: Pick<LiveCampaignTraining["campaign"], "story" | "runtime" | "stage">;
  readonly navigation: Pick<LiveScreenNavigation, "screen">;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
}

/**
 * Ghost V3 authoritative capture: result receipts, State Forge keyframes,
 * presentation keyframes, and the finale companion witness.
 */
export function createLiveGhostCapture(options: LiveGhostCaptureOptions) {
  const { recording, stateForge, combat, canonicalState, run: liveRun, player: livePlayer, blade: liveBlade } = options;
  const { session: ghostV3Session, recorder: ghostV3, frames: ghostFrames } = recording;
  const { state: hostState, lifecycle: RUN_LIFECYCLE } = options.world;
  const { services } = options.world.context;
  const CINEMA = options.world.context.cinema;
  const { authoritativeStep, simulationRuntime } = combat;
  const { story, runtime: campaignRuntime, stage: stageRuntime } = options.campaign;
  const registry = createDefaultStateCodecRegistry();
  const captureSnapshot = (tick: number): TearSnapshotV1 | undefined => {
    const recorder = ghostV3;
    if (recorder?.active !== true) return;
    const replayContext = ghostV3Session.replayContext();
    if (replayContext === undefined) {
      // Missing bootstrap identity is explicit degradation, never a replayable keyframe.
      recorder.record("events", tick, {
        type: "ghost.snapshot-degraded",
        reason: "immutable Ghost V3 replay bootstrap context is unavailable",
      });
      return;
    }
    try {
      const snapshot = captureLiveStateForgeSnapshot({
        id: `ghost-v3-${String(liveRun().runSeed)}-keyframe-${String(tick)}`, tick, stateClass: "recorded-canonical",
        seed: String(liveRun().runSeed), stateForge, rng: services.random.snapshot(), registry,
        observationClass: "structured-state", producer: "ghost-v3-live-recorder", target: replayContext.build.target,
        contentHash: replayContext.build.contentHash, staticBuild: replayContext.build,
        sourceId: ghostLiveBootstrapEventId(recorder.activeSessionId),
        visualHash: stableVerificationHash({ tick, player: { x: livePlayer().x, y: livePlayer().y, facing: livePlayer().facing },
          blade: { x: liveBlade().x, y: liveBlade().y, state: liveBlade().state } }),
        actor: "human", executionClass: "engineering", trainingConsent: "no-training",
      });
      recorder.record("keyframes", tick, snapshot);
      return snapshot;
    } catch (error) {
      recorder.record("events", tick, { type: "ghost.snapshot-degraded", reason: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  };
  const captureReceipt = (tick: number): TearSnapshotV1 | undefined => {
    if (ghostV3?.active !== true) return;
    const result = authoritativeStep.lastResult;
    const stateHash = result?.tick === tick ? result.stateHash : stableVerificationHash(canonicalState(tick, simulationRuntime.input).state);
    const snapshot = captureSnapshot(tick);
    const receipt = createGhostAuthoritativeReceipt(tick, stateHash, simulationRuntime.input.snapshot(),
      ghostFrames.receipt(snapshot === undefined ? undefined : { id: snapshot.id, exactHash: snapshot.hashes.exact }));
    ghostV3.record("results", tick, receipt);
    finale.observed(snapshot, receipt);
    return snapshot;
  };
  /** At each recorder keyframe cadence: the presentation sample, the RNG anchor, then the authoritative receipt. */
  const recordKeyframe = (tick: number): void => {
    if (ghostV3?.active === true && tick % ghostV3.keyframeIntervalTicks === 0) {
      const random = services.random.snapshot();
      ghostV3.record("presentation", tick, {
        player: { x: livePlayer().x, y: livePlayer().y, vx: livePlayer().vx, vy: livePlayer().vy, hp: livePlayer().hp, facing: livePlayer().facing },
        blade: { x: liveBlade().x, y: liveBlade().y, vx: liveBlade().vx, vy: liveBlade().vy, state: liveBlade().state },
        enemies: hostState.enemies().filter((enemy) => !enemy.dead).map((enemy) => ({
          ...(typeof enemy._gid === "number" ? { id: enemy._gid } : {}), kind: enemy.kind, x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp,
        })),
        random,
      });
      ghostV3.record("rng", tick, random);
      captureReceipt(tick);
    }
  };
  const finale = createLiveGhostFinaleCompanion({
    session: ghostV3Session, frames: ghostFrames, tick: () => simulationRuntime.scheduler.tick, run: liveRun,
    finaleActive: () => story.finale !== null && RUN_LIFECYCLE.snapshot().phase === "finale",
    completed: () => options.navigation.screen() === "win" && RUN_LIFECYCLE.snapshot().phase === "terminated",
    captureReceipt,
    witness: () => ({
      canonical: canonicalState(simulationRuntime.scheduler.tick, simulationRuntime.input).state,
      finale: campaignRuntime.captureFinaleBinding(), cinema: CINEMA.captureState(), cinemaInput: CINEMA.captureRecordedInput(),
      lifecycle: RUN_LIFECYCLE.snapshot(), rng: services.random.snapshot(), seconds: services.clock.seconds(), stage: stageRuntime.index,
    }),
  });
  return Object.freeze({ registry, captureReceipt, recordKeyframe, finale });
}

export type LiveGhostCapture = ReturnType<typeof createLiveGhostCapture>;
