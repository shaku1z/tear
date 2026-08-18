import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearPolicyDecisionJournal } from "./policy-decision-journal";
import { TearActivePolicyRuntime } from "./policy-runtime";
import { TearPolicyArtifactRegistry, parseTearPolicyActivation, parseTearPolicyArtifact, type TearPolicyRuntimeCompatibility } from "./policy-artifact-registry";
import { TearC32CanonicalActivePolicyRuntime } from "./c32-canonical-active-policy-runtime";
import { TearFoundryV3PostPromotionMonitor } from "./foundry-job-v3-post-promotion-monitor";
import { TEAR_C34_V3_C32_POLICY_FORMAT_V1 } from "./c34-v3-c32-policy-adapter";

export const DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({
  runtime: "tear-policy-runtime.v1",
  observationClass: "structured-state",
  actionSchema: "tear-game-action-command-envelope.v1",
  modelFormats: Object.freeze(["table-policy-v1", "linear-policy-v1", "temporal-window-linear-policy-v1"]),
});

export interface BrowserActivePolicyRuntimeComposition {
  /** Legacy standard artifacts retain their historical structured-observation route. */
  readonly runtime?: TearActivePolicyRuntime;
  /** Strict V3 candidates execute only through the exact canonical C30 state route. */
  readonly canonicalRuntime?: TearC32CanonicalActivePolicyRuntime;
  /** Strict V3 runs may retain aggregate terminal health evidence only. */
  readonly postPromotionMonitor?: TearFoundryV3PostPromotionMonitor;
  readonly decisionJournal: TearPolicyDecisionJournal;
}

/** Browser composition only: open the local Vault and reset the policy before a controller can consume it. */
export async function createBrowserActivePolicyRuntime(factory: IDBFactory | undefined): Promise<BrowserActivePolicyRuntimeComposition | undefined> {
  if (factory === undefined) return undefined;
  const backend = await createIndexedDbGhostVaultBackend(factory);
  // Inspect only enough durable metadata to select the execution boundary.
  // A V3-looking active record must never silently fall through to legacy
  // structured inference if its candidate provenance is invalid.
  const activeRaw = await backend.get("analysis", "policy-active:v1");
  let strictV3 = false, artifactRaw: string | undefined;
  try {
    const activation = activeRaw === undefined ? undefined : parseTearPolicyActivation(JSON.parse(activeRaw));
    artifactRaw = activation === undefined ? undefined : await backend.get("analysis", `policy-artifact:v1:${activation.artifactId}`);
    if (artifactRaw !== undefined) {
      const artifact = parseTearPolicyArtifact(JSON.parse(artifactRaw));
      strictV3 = artifact.model.format === TEAR_C34_V3_C32_POLICY_FORMAT_V1;
    }
  } catch {
    // Do not guess legacy compatibility from corrupt bytes.  The normal
    // legacy registry will quarantine them; only an identifiable V3 record
    // below selects the strict refusal path.
    strictV3 = artifactRaw?.includes(TEAR_C34_V3_C32_POLICY_FORMAT_V1) === true
      || activeRaw?.includes(TEAR_C34_V3_C32_POLICY_FORMAT_V1) === true;
  }
  if (strictV3) {
    const runtime = new TearC32CanonicalActivePolicyRuntime(backend, () => [], true);
    await runtime.reset();
    return Object.freeze({ canonicalRuntime: runtime, decisionJournal: new TearPolicyDecisionJournal(backend), postPromotionMonitor: new TearFoundryV3PostPromotionMonitor(backend) });
  }
  const registry = new TearPolicyArtifactRegistry(backend, DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY);
  const runtime = new TearActivePolicyRuntime(registry);
  await runtime.reset();
  return Object.freeze({ runtime, decisionJournal: new TearPolicyDecisionJournal(backend) });
}
