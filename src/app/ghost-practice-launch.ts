import type { GhostPracticeChild } from "../ghost/replay-world";
import { createLiveStateForgeRestoreFactory } from "../tearbench/live-runtime-snapshots";
import { restoreSnapshotIntoLiveWorld, type TearLiveWorldAdapter } from "../tearbench/live-state-snapshot";
import type { TearStateCodecRegistry } from "../tearbench/state-codecs";
import type { LiveGhostPracticeSessionState } from "./live-ghost-practice-session-state";

export interface GhostPracticeLaunchPort {
  readonly registry: TearStateCodecRegistry;
  readonly stateForge: TearLiveWorldAdapter<unknown>;
  readonly hasLiveWorld: () => boolean;
  readonly practice: LiveGhostPracticeSessionState;
  /** Clears the captured Ghost 2 recorder after State Forge restoration. */
  readonly clearRestoredRecording: () => void;
  readonly setPlaying: () => void;
  readonly requestPointer: () => void;
}

export type GhostPracticeLaunchResult =
  | Readonly<{ ok: true; child: GhostPracticeChild; semanticHash: string }>
  | Readonly<{ ok: false; message: string }>;

function validPracticeChild(child: GhostPracticeChild): boolean {
  const raw = child as unknown as Readonly<Record<string, unknown>>;
  const lineage = child.lineage as unknown as Readonly<Record<string, unknown>>;
  return raw.rankedEligible === false
    && raw.leaderboardEligible === false
    && child.inputLatchPolicy === "release-all"
    && child.snapshot.tick === child.forkTick
    && lineage.relation === "forked-at"
    && lineage.parentId === child.sourceGhostId
    && lineage.parentRootHash === child.sourceRootHash
    && lineage.forkTick === child.forkTick;
}

/**
 * Moves a verified immutable practice child into the real live world. The
 * State Forge transaction preserves rollback, then the application installs
 * an outward-effect policy before exposing ordinary player controls.
 */
export function launchGhostPracticeChild(
  child: GhostPracticeChild,
  port: GhostPracticeLaunchPort,
): GhostPracticeLaunchResult {
  if (!validPracticeChild(child)) return Object.freeze({ ok: false, message: "Practice child failed custody validation." });
  const stateForge: TearLiveWorldAdapter<unknown> = {
    capture: () => port.stateForge.capture(),
    stage: (world, context) => port.stateForge.stage(world, context),
    validate: (candidate) => port.stateForge.validate(candidate),
    commit(candidate) {
      port.stateForge.commit(candidate);
      // A recorded keyframe contains Ghost 2's in-memory recorder. It is
      // historical source data, not a recording session for this child.
      port.clearRestoredRecording();
    },
  };
  port.practice.activate(child);
  const restored = restoreSnapshotIntoLiveWorld(
    child.snapshot, port.registry, createLiveStateForgeRestoreFactory(port.registry), stateForge,
    { capturePrevious: port.hasLiveWorld() },
  );
  if (!restored.ok) {
    port.practice.clear();
    return Object.freeze({ ok: false,
      message: `Practice restore failed during ${restored.phase}: ${restored.issues.map((issue) => issue.message).join("; ")}` });
  }
  port.setPlaying();
  port.requestPointer();
  return Object.freeze({ ok: true, child, semanticHash: restored.semanticHash });
}
