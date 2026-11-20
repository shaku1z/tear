import { launchResolvedLiveState } from "./live-state-setup-scenario-launch";
import { forgeRootbinderNetworkState } from "./state-setup-factories";
import { resolveTearSdl, type TearSdlDocumentV1 } from "./tearsdl";
import type { TearLiveRestoreResult } from "./live-state-snapshot";
import type { LiveRuntimeSnapshotController } from "./live-runtime-snapshots";
import type { LiveTearRuntimeEnvironmentContext, TearStructuredRuntimeEnvironment } from "./live-runtime-contracts";

/** Restores the C6 relationship fixture through the same live State Setup path as other surgical states. */
export function forgeRootbinderNetworkEnvironment(
  environment: TearStructuredRuntimeEnvironment,
  snapshots: LiveRuntimeSnapshotController,
  context: LiveTearRuntimeEnvironmentContext,
): TearLiveRestoreResult {
  const base: TearSdlDocumentV1 = {
    format: "tearsdl",
    schemaVersion: 1,
    id: "verdant-root-network-sever",
    stateClass: "surgical-valid",
    seed: "verdant-root-network-sever",
    start: { mode: "campaign", difficulty: "normal", weapon: "sword" },
  };
  return launchResolvedLiveState(resolveTearSdl(forgeRootbinderNetworkState(base)), environment, snapshots, context);
}
