import { stableVerificationHash } from "../replay/hash";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { createGhostProductionReplaySession } from "./production-replay-session";
import { analyzeGhostCoaching, type GhostCoachFinding } from "./coach";

export interface GhostCoachPracticeProjection {
  readonly targetId: string;
  readonly baselineId: string;
  readonly buildId: string;
  readonly findings: readonly GhostCoachFinding[];
  readonly unavailable: readonly string[];
  readonly provenanceHash: string;
}

function buildId(capsule: GhostReadCapsule): string {
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  const snapshots = mapped.ghost.snapshots;
  const builds = snapshots.map((snapshot) => snapshot.provenance.build);
  if (builds.length === 0 || new Set(builds.map((build) => stableVerificationHash(build))).size !== 1) {
    throw new TypeError("Coach requires one verified same-build recorded snapshot provenance");
  }
  return stableVerificationHash(builds[0]);
}

/**
 * C37's deliberately small coach projection.  It accepts only two individually
 * production-verified V3 sources, never chooses a peer automatically, and
 * derives its scalar observations solely from their sealed causal bytes.
 */
export function projectGhostCoachPractice(target: GhostReadCapsule, baseline: GhostReadCapsule): GhostCoachPracticeProjection {
  if (target.manifest.id === baseline.manifest.id) throw new RangeError("Coach baseline must be a distinct capsule");
  const targetSession = createGhostProductionReplaySession(target);
  const baselineSession = createGhostProductionReplaySession(baseline);
  const targetBuild = buildId(target), baselineBuild = buildId(baseline);
  if (targetBuild !== baselineBuild) throw new RangeError("Coach baseline must use the target's verified build");
  const targetMapped = mapGhostCapsuleToReplayEnvelope(target), baselineMapped = mapGhostCapsuleToReplayEnvelope(baseline);
  const metric = (events: readonly { readonly type: string }[], prefix: string, ticks: number): number =>
    events.filter((event) => event.type.startsWith(prefix)).length / Math.max(1, ticks);
  const metrics = Object.freeze({
    "movement.idleRatio": metric(targetMapped.ghost.events, "player.fell", target.maxTick),
    "blade.missRatio": metric(targetMapped.ghost.events, "blade.", target.maxTick),
    "defense.damagePerMinute": metric(targetMapped.ghost.events, "player.damaged", target.maxTick),
    "targeting.badSwitchRatio": metric(targetMapped.ghost.events, "agent.target", target.maxTick),
    "boss.missedPunishRatio": metric(targetMapped.ghost.events, "boss.", target.maxTick),
  });
  const baselineMetrics = Object.entries(metrics).map(([name]) => Object.freeze({ kind: "same-build" as const, id: baseline.manifest.id,
    metric: name, value: metric(baselineMapped.ghost.events, name === "movement.idleRatio" ? "player.fell" : name === "blade.missRatio" ? "blade." : name === "defense.damagePerMinute" ? "player.damaged" : name === "targeting.badSwitchRatio" ? "agent.target" : "boss.", baseline.maxTick), sampleCount: 1 }));
  const findings = analyzeGhostCoaching({ ghost: targetMapped.ghost, metrics, buildId: targetBuild, finalTick: target.maxTick }, baselineMetrics);
  const provenanceHash = stableVerificationHash({ target: { id: target.manifest.id, root: targetSession.sourceRootHash }, baseline: { id: baseline.manifest.id, root: baselineSession.sourceRootHash }, buildId: targetBuild, metrics, baselineMetrics });
  return Object.freeze({ targetId: target.manifest.id, baselineId: baseline.manifest.id, buildId: targetBuild, findings,
    unavailable: Object.freeze(["draft: no verified counterfactual measurement", "run-management: no verified aggregate measurement"]), provenanceHash });
}
