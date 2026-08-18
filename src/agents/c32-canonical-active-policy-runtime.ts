import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { TearC34V3C32CandidateRegistry, TearC34V3C32PolicyRuntime, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY } from "./c34-v3-c32-policy-adapter";
import { TearPolicyArtifactRegistry, type TearPolicyActivationV1, type TearPolicyArtifactV1 } from "./policy-artifact-registry";

export interface TearC32CanonicalActiveDecisionV1 { readonly actions: readonly GameAction[]; readonly source: "artifact" | "scripted-fallback" | "refused"; readonly reason?: "no-active-artifact" | "invalid-active-artifact" | "no-legal-action"; readonly stateHash: string; readonly artifactId?: string; readonly artifactHash?: string; readonly activationHash?: string; }

/** Dedicated C32 route for the V3 canonical envelope. It accepts the exact production canonical state, never a reconstructed Agent observation. */
export class TearC32CanonicalActivePolicyRuntime {
  readonly #backend: GhostVaultBackend; readonly #fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[]; #artifact: TearPolicyArtifactV1 | undefined; #activation: TearPolicyActivationV1 | undefined; #refused = false;
  readonly #strictActiveCandidate: boolean;
  constructor(backend: GhostVaultBackend, fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[] = () => [], strictActiveCandidate = false) { this.#backend = backend; this.#fallback = fallback; this.#strictActiveCandidate = strictActiveCandidate; }
  async reset(): Promise<void> {
    this.#artifact = undefined; this.#activation = undefined; this.#refused = false;
    const registry = new TearPolicyArtifactRegistry(this.#backend, TEAR_C34_V3_C32_POLICY_RUNTIME_COMPATIBILITY);
    const active = await registry.active();
    if (active === undefined) { this.#refused = this.#strictActiveCandidate; return; }
    this.#activation = active;
    this.#artifact = await new TearC34V3C32CandidateRegistry(this.#backend).get(active.artifactId);
    // An active pointer that passed generic integrity but cannot pass the
    // C34-V3 candidate boundary is not permission to route through legacy
    // inference or scripted fallback.  It is quarantined by the registry and
    // remains explicitly refused by this C32-only runtime.
    this.#refused = this.#artifact === undefined || this.#artifact.artifactHash !== active.artifactHash;
  }
  decide(state: CanonicalGameplayState, available: readonly GameAction["type"][]): TearC32CanonicalActiveDecisionV1 {
    const stateHash = stableVerificationHash(state), artifact = this.#artifact;
    const provenance = this.#activation === undefined ? {} : {
      artifactId: this.#activation.artifactId, artifactHash: this.#activation.artifactHash,
      activationHash: this.#activation.activationHash,
    };
    if (this.#refused) return Object.freeze({ actions: Object.freeze([]), source: "refused" as const,
      reason: "invalid-active-artifact" as const, stateHash, ...provenance });
    const fallback = (reason: "no-active-artifact" | "no-legal-action") => Object.freeze({
      actions: Object.freeze([...this.#fallback(state, available)]), source: "scripted-fallback" as const,
      reason, stateHash, ...(artifact === undefined ? {} : { artifactId: artifact.id, artifactHash: artifact.artifactHash }),
      ...(this.#activation === undefined ? {} : { activationHash: this.#activation.activationHash }),
    });
    if (artifact === undefined) return fallback("no-active-artifact");
    try {
      const decision = new TearC34V3C32PolicyRuntime(artifact, () => this.#fallback(state, available)).decide({ format: "tear-c32-canonical-source-observation", schemaVersion: 1, state, availableActions: available, stateHash });
      return Object.freeze({ actions: decision.actions, source: decision.source,
        ...(decision.reason === undefined ? {} : { reason: "no-legal-action" as const }), stateHash,
        artifactId: artifact.id, artifactHash: artifact.artifactHash,
        ...(this.#activation === undefined ? {} : { activationHash: this.#activation.activationHash }),
      });
    } catch {
      return Object.freeze({ actions: Object.freeze([]), source: "refused" as const,
        reason: "invalid-active-artifact" as const, stateHash, ...provenance });
    }
  }
}
