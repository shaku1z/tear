import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { TearC34V3C32CandidateRegistry, TearC34V3C32PolicyRuntime, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY } from "./c34-v3-c32-policy-adapter";
import { TearPolicyArtifactRegistry, type TearPolicyArtifactV1 } from "./policy-artifact-registry";

export interface TearC32CanonicalActiveDecisionV1 { readonly actions: readonly GameAction[]; readonly source: "artifact" | "scripted-fallback"; readonly reason?: "no-active-artifact" | "invalid-active-artifact" | "no-legal-action"; readonly stateHash: string; readonly artifactId?: string; readonly artifactHash?: string; }

/** Dedicated C32 route for the V3 canonical envelope. It accepts the exact production canonical state, never a reconstructed Agent observation. */
export class TearC32CanonicalActivePolicyRuntime {
  readonly #backend: GhostVaultBackend; readonly #fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[]; #artifact: TearPolicyArtifactV1 | undefined;
  constructor(backend: GhostVaultBackend, fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[] = () => []) { this.#backend = backend; this.#fallback = fallback; }
  async reset(): Promise<void> { const registry = new TearPolicyArtifactRegistry(this.#backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY), active = await registry.active(); this.#artifact = active === undefined ? undefined : await new TearC34V3C32CandidateRegistry(this.#backend).get(active.artifactId); }
  decide(state: CanonicalGameplayState, available: readonly GameAction["type"][]): TearC32CanonicalActiveDecisionV1 { const stateHash = stableVerificationHash(state), artifact = this.#artifact, fallback = (reason: "no-active-artifact" | "invalid-active-artifact" | "no-legal-action") => Object.freeze({ actions: Object.freeze([...this.#fallback(state, available)]), source: "scripted-fallback" as const, reason, stateHash, ...(artifact === undefined ? {} : { artifactId: artifact.id, artifactHash: artifact.artifactHash }) }); if (artifact === undefined) return fallback("no-active-artifact"); try { const decision = new TearC34V3C32PolicyRuntime(artifact, () => this.#fallback(state, available)).decide({ format: "tear-c32-canonical-source-observation", schemaVersion: 1, state, availableActions: available, stateHash }); return Object.freeze({ actions: decision.actions, source: decision.source, ...(decision.reason === undefined ? {} : { reason: decision.reason === "no-candidate" ? "invalid-active-artifact" : "no-legal-action" }), stateHash, artifactId: artifact.id, artifactHash: artifact.artifactHash }); } catch { return fallback("invalid-active-artifact"); } }
}
