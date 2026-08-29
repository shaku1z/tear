import { launchResolvedLiveState } from "./live-state-forge-scenario-launch";
import { forgeRootboundGraftAnchorState } from "./state-forge-factories";
import { resolveTearSdl, type TearSdlDocumentV1 } from "./tearsdl";
import type { TearLiveRestoreResult } from "./live-state-snapshot";
import type { LiveRuntimeSnapshotController } from "./live-runtime-snapshots";
import type { LiveTearRuntimeEnvironmentContext, TearStructuredRuntimeEnvironment } from "./live-runtime-contracts";

/** Restores the C12 Graft fixture through the real Rootbound boss-only composition. */
export function forgeRootboundGraftAnchorEnvironment(
  environment: TearStructuredRuntimeEnvironment,
  snapshots: LiveRuntimeSnapshotController,
  context: LiveTearRuntimeEnvironmentContext,
): TearLiveRestoreResult {
  const base: TearSdlDocumentV1 = {
    format: "tearsdl", schemaVersion: 1, id: "rootbound-graft-anchor-destruction", stateClass: "surgical-valid",
    seed: "rootbound-graft-anchor-destruction", start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" },
  };
  return launchResolvedLiveState(resolveTearSdl(forgeRootboundGraftAnchorState(base)), environment, snapshots, context);
}
