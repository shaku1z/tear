// The State Setup snapshot controller: capture and restore on the live runtime environment.
import { stableVerificationHash } from "../domain/hash";
import type { TearSnapshotV1, TearStateClass } from "../gameplay/snapshot/snapshot-contract";
import { ENTITY_KIND_REGISTRY } from "../gameplay/snapshot/codec-ids";
import {
  captureLiveStateSetupSnapshot,
  createLiveStateSetupRestoreFactory,
  injectedBuildIdentity,
} from "../gameplay/snapshot/live-capture";
import { restoreSnapshotIntoLiveWorld, type TearLiveRestoreResult } from "../gameplay/snapshot/live-restore";
import { createDefaultStateCodecRegistry } from "../gameplay/snapshot/state-codec";
import type { LiveTearRuntimeEnvironmentContext, TearRuntimeAccessClass } from "./live-runtime-contracts";

export interface LiveRuntimeSnapshotController {
  capture(id: string, stateClass?: TearStateClass, seed?: string): TearSnapshotV1;
  restore(snapshot: TearSnapshotV1): TearLiveRestoreResult;
}

export function createLiveRuntimeSnapshotController(
  context: LiveTearRuntimeEnvironmentContext,
  accessClass: Exclude<TearRuntimeAccessClass, "C">,
  onRestored: (snapshot: TearSnapshotV1, result: Extract<TearLiveRestoreResult, { ok: true }>) => void,
): LiveRuntimeSnapshotController {
  const registry = createDefaultStateCodecRegistry();
  const factory = createLiveStateSetupRestoreFactory(registry);
  const controller: LiveRuntimeSnapshotController = {
    capture(id: string, stateClass: TearStateClass = "recorded-canonical", seed?: string) {
      const tick = context.authoritative()?.tick ?? 0;
      const world = context.stateSetup.capture();
      const contentHash = stableVerificationHash(ENTITY_KIND_REGISTRY.ids);
      const runtimeBuild = injectedBuildIdentity("test-standalone", contentHash);
      return captureLiveStateSetupSnapshot({
        id,
        tick,
        stateClass,
        stateSetup: context.stateSetup,
        world,
        rng: context.random(),
        registry,
        seed: seed ?? String(context.state.run()?.runSeed ?? "unknown"),
        observationClass: accessClass === "A" ? "privileged-diagnostic" : "structured-state",
        producer: "live-tear-runtime",
        target: runtimeBuild?.target ?? "test-standalone",
        contentHash: runtimeBuild?.contentHash ?? contentHash,
        // Context readback is observational; rendering belongs to public policy capture.
        visualHash: stableVerificationHash(context.screenshot()),
      });
    },
    restore(snapshot: TearSnapshotV1) {
      const result = restoreSnapshotIntoLiveWorld(snapshot, registry, factory, context.stateSetup);
      if (result.ok) onRestored(snapshot, result);
      return result;
    },
  };
  return Object.freeze(controller);
}
