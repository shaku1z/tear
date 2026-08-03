import { createIndexedDbGhostVaultBackend } from "../ghost";
import { TearActivePolicyRuntime } from "./policy-runtime";
import { TearPolicyArtifactRegistry, type TearPolicyRuntimeCompatibility } from "./policy-artifact-registry";

export const DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY: TearPolicyRuntimeCompatibility = Object.freeze({
  runtime: "tear-policy-runtime.v1",
  observationClass: "structured-state",
  actionSchema: "tear-game-action-command-envelope.v1",
  modelFormats: Object.freeze(["table-policy-v1"]),
});

/** Browser composition only: open the local Vault and reset the policy before a controller can consume it. */
export async function createBrowserActivePolicyRuntime(factory: IDBFactory | undefined): Promise<TearActivePolicyRuntime | undefined> {
  if (factory === undefined) return undefined;
  const registry = new TearPolicyArtifactRegistry(await createIndexedDbGhostVaultBackend(factory), DEFAULT_TEAR_POLICY_RUNTIME_COMPATIBILITY);
  const runtime = new TearActivePolicyRuntime(registry);
  await runtime.reset();
  return runtime;
}
