import type {
  LiveTearRuntimeEnvironmentContext,
  TearClassARuntimeEnvironment,
  TearClassBRuntimeEnvironment,
  TearClassCRuntimeEnvironment,
  TearPhysicalInput,
  TearRuntimeBridgeFactory,
  TearRuntimeEnvironment,
} from "../live-runtime-contracts";
import { createLiveTearRuntimeEnvironment } from "../live-runtime-environment";
import { installGhostLabPanel } from "./ghost-lab-panel";
import { installLiveStateForgeStudio } from "./live-state-forge-studio-host";
import type { TearGhostManifest } from "../../ghost/capsule-vault";
import type { GhostReadCapsule } from "../../ghost/capsule-reader";
import type { GhostCapsuleReplayMapping } from "../../ghost/capsule-replay-envelope";
import type { GhostReplayAdmission } from "../../ghost/replay-admission";
import type { GhostProductionReplayVerification } from "../../ghost/production-replay-verification";
import type { GhostPracticeChild, GhostPracticeMode } from "../../ghost/replay-world";
import type { GhostSeekResult } from "../../ghost/replay-world";
import { createIndexedDbGhostVaultBackend } from "../../ghost/indexeddb-vault-backend";

type LiveRuntimeBridgeWindow = Window & { __TEAR_RUNTIME_ENVIRONMENT__?: TearRuntimeBridgeFactory };

/** Narrow test-build probe for the generic Vault conditional-write primitive. */
export function installGhostVaultConditionalCommitInspector(target: Window): void {
  Object.defineProperty(target, "__TEAR_GHOST_VAULT_CONDITIONAL__", { configurable: true, value: Object.freeze({
    exercise: async (databaseName: string) => {
      const backend = await createIndexedDbGhostVaultBackend(target.indexedDB, databaseName);
      await backend.put("analysis", "guard", "before");
      await backend.commitIfMatches([{ store: "analysis", key: "missing" }], [{ store: "analysis", key: "first", value: "one" }, { store: "indexes", key: "second", value: "two" }]);
      await backend.put("analysis", "guard", "after"); let staleRefused = false;
      try { await backend.commitIfMatches([{ store: "analysis", key: "guard", expected: "before" }], [{ store: "analysis", key: "first", value: "overwritten" }, { store: "indexes", key: "stale", value: "must-not-write" }]); } catch { staleRefused = true; }
      const refreshed = await createIndexedDbGhostVaultBackend(target.indexedDB, databaseName);
      return Object.freeze({ staleRefused, guard: await refreshed.get("analysis", "guard"), first: await refreshed.get("analysis", "first"), second: await refreshed.get("indexes", "second"), stale: await refreshed.get("indexes", "stale") });
    },
  }) });
}

/** Test-build inspection callbacks supplied by the real live Ghost V3 recorder. */
export interface GhostV3BrowserInspectorSource {
  readonly manifest: () => TearGhostManifest | null;
  readonly manifests: () => Promise<readonly TearGhostManifest[]>;
  readonly read: (id: string) => Promise<GhostReadCapsule | undefined>;
  readonly replay: (id: string) => Promise<GhostCapsuleReplayMapping | undefined>;
  readonly admission: (id: string) => Promise<GhostReplayAdmission | undefined>;
  readonly verify: (id: string) => Promise<GhostProductionReplayVerification | undefined>;
  readonly seek: (id: string, tick: number) => Promise<GhostSeekResult | undefined>;
  readonly practice: (id: string, tick: number, mode: GhostPracticeMode) => Promise<GhostPracticeChild | undefined>;
  readonly active: () => boolean;
  /** Read-only test evidence for the player-visible C29 launch path. */
  readonly activePractice: () => GhostPracticeChild | null;
  readonly failure: () => string | null;
}

/** Browser-only installation for the stable Ghost V3 evidence inspector. */
export function installGhostV3BrowserInspector(target: Window, source: GhostV3BrowserInspectorSource): void {
  Object.defineProperty(target, "__TEAR_GHOST_V3__", {
    configurable: true,
    value: Object.freeze({
      manifest: source.manifest,
      manifests: source.manifests,
      read: source.read,
      replay: source.replay,
      admission: source.admission,
      verify: source.verify,
      seek: source.seek,
      practice: source.practice,
      active: source.active,
      activePractice: source.activePractice,
      failure: source.failure,
    }),
  });
}

/** Browser/test-build installer for the otherwise DOM-free live environment. */
export function installLiveTearRuntimeBridge(
  context: LiveTearRuntimeEnvironmentContext,
  target: LiveRuntimeBridgeWindow,
): void {
  function createAdapter(accessClass: "A"): TearClassARuntimeEnvironment;
  function createAdapter(accessClass: "B"): TearClassBRuntimeEnvironment;
  function createAdapter(accessClass: "C"): TearClassCRuntimeEnvironment;
  function createAdapter(accessClass: string): TearRuntimeEnvironment {
    if (accessClass === "A") return createLiveTearRuntimeEnvironment(context, "A");
    if (accessClass === "B") return createLiveTearRuntimeEnvironment(context, "B");
    if (accessClass === "C") {
      return Object.freeze({
        accessClass: "C" as const,
        screenshot: () => { context.render(); return context.screenshot(); },
        physicalInput: (input: TearPhysicalInput) => { context.emitPhysicalInput(input); },
      });
    }
    throw new RangeError(`unknown Tear runtime access class: ${accessClass}`);
  }
  const factory: TearRuntimeBridgeFactory = Object.freeze({ create: createAdapter });
  Object.defineProperty(target, "__TEAR_RUNTIME_ENVIRONMENT__", {
    configurable: false,
    writable: false,
    value: factory,
  });
  installGhostLabPanel(factory);
  installLiveStateForgeStudio(factory);
  if (new URLSearchParams(target.location.search).get("watchagent") === "1") {
    void Promise.all([
      import("../../agents/live-watch-agent-host"),
      import("../../agents/browser-active-policy-runtime"),
    ]).then(async ([{ installLiveWatchAgentHost }, { createBrowserActivePolicyRuntime }]) => {
      const policy = await createBrowserActivePolicyRuntime(target.indexedDB);
      installLiveWatchAgentHost(context, target, policy?.runtime, policy?.decisionJournal, policy?.canonicalRuntime, policy?.postPromotionMonitor);
    });
  }
}
