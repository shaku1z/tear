import type { GhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import { TearC34V3C32CandidateRegistry, TearC34V3C32PolicyRuntime, TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY, type TearC34V3C32Decision } from "./c34-v3-c32-policy-adapter";
import { TearPolicyArtifactRegistry, type TearPolicyActivationV1, type TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { FACTORIZED_POLICY_FORMAT, FactorizedPolicyCandidateRegistry, FactorizedReturnPolicyRuntime, parseFactorizedPolicyCandidate, type FactorizedRuntimeCheckpoint } from "./c34-factorized-policy-runtime";
import type { FactorizedReturnTransition } from "./c34-causal-action-features";
import type { FactorizedQSupport } from "./c34-factorized-action-q";

export interface TearC32CanonicalActiveDecisionV1 { readonly actions: readonly GameAction[]; readonly source: "artifact" | "model-default" | "scripted-fallback" | "refused"; readonly reason?: "no-active-artifact" | "invalid-active-artifact" | "no-legal-action" | "decision-budget-exceeded"; readonly stateHash: string; readonly artifactId?: string; readonly artifactHash?: string; readonly activationHash?: string;
  readonly support?: NonNullable<TearC34V3C32Decision["support"]>; readonly factorizedSupport?: FactorizedQSupport; readonly factorizedVersion?: 4; readonly decisionMilliseconds?: number }

/** Dedicated C32 route for the V3 canonical envelope. It accepts the exact production canonical state, never a reconstructed Agent observation. */
export class TearC32CanonicalActivePolicyRuntime {
  readonly #backend: GhostVaultBackend; readonly #fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[]; #artifact: TearPolicyArtifactV1 | undefined; #activation: TearPolicyActivationV1 | undefined; #refused = false;
  readonly #strictActiveCandidate: boolean;
  #runtime: TearC34V3C32PolicyRuntime | undefined;
  #factorized: FactorizedReturnPolicyRuntime | undefined;
  get requiresCausalContext(): boolean { return this.#factorized !== undefined; }
  readonly #options: Readonly<{ now?: () => number }>;
  constructor(backend: GhostVaultBackend, fallback: (state: CanonicalGameplayState, available: readonly GameAction["type"][]) => readonly GameAction[] = () => [], strictActiveCandidate = false, options: Readonly<{ now?: () => number }> = {}) { this.#backend = backend; this.#fallback = fallback; this.#strictActiveCandidate = strictActiveCandidate; this.#options = options; }
  async reset(): Promise<void> {
    this.#artifact = undefined; this.#activation = undefined; this.#refused = false; this.#runtime = undefined; this.#factorized = undefined;
    const registry = new TearPolicyArtifactRegistry(this.#backend, { ...TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY,
      modelFormats: [...TEAR_C34_CANONICAL_POLICY_RUNTIME_COMPATIBILITY.modelFormats, FACTORIZED_POLICY_FORMAT] });
    const active = await registry.active();
    if (active === undefined) { this.#refused = this.#strictActiveCandidate; return; }
    this.#activation = active;
    const raw = await registry.get(active.artifactId);
    this.#artifact = raw?.model.format === FACTORIZED_POLICY_FORMAT
      ? await new FactorizedPolicyCandidateRegistry(this.#backend).get(active.artifactId)
      : await new TearC34V3C32CandidateRegistry(this.#backend).get(active.artifactId);
    // An active pointer that passed generic integrity but cannot pass the
    // C34-V3 candidate boundary is not permission to route through legacy
    // inference or scripted fallback.  It is quarantined by the registry and
    // remains explicitly refused by this C32-only runtime.
    this.#refused = this.#artifact === undefined || this.#artifact.artifactHash !== active.artifactHash;
    if (!this.#refused && this.#artifact?.model.format === FACTORIZED_POLICY_FORMAT) this.#factorized = new FactorizedReturnPolicyRuntime(parseFactorizedPolicyCandidate(this.#artifact).model, this.#options);
    else if (!this.#refused) this.#runtime = new TearC34V3C32PolicyRuntime(this.#artifact,
      source => this.#fallback(source.state, source.availableActions), this.#options);
  }
  beginCausalOrigin(state: CanonicalGameplayState, runId: string): void { if (!this.#factorized) throw new TypeError("active policy is not V4"); this.#factorized.begin(state, runId); }
  clearCausalContext(): void { this.#factorized?.clearContext(); }
  observeCommitted(transition: FactorizedReturnTransition, runId: string): void { this.#factorized?.observeCommitted(transition, runId); }
  captureCausalContext(): FactorizedRuntimeCheckpoint | undefined { return this.#factorized?.captureContext(); }
  restoreCausalContext(state: CanonicalGameplayState, checkpoint: FactorizedRuntimeCheckpoint, authority: Readonly<{ expectedCheckpointHash: string; runId: string }>): void {
    if (!this.#factorized) throw new TypeError("active policy is not V4"); this.#factorized.restoreContext(state, checkpoint, authority);
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
      if (this.#factorized !== undefined) {
        const decision = this.#factorized.decide(state, available);
        return Object.freeze({ actions: decision.actions, source: decision.source, stateHash, ...provenance, factorizedVersion: 4 as const,
          ...(decision.reason === undefined ? {} : { reason: decision.reason === "decision-budget-exceeded" ? "decision-budget-exceeded" as const : "invalid-active-artifact" as const }),
          ...(decision.selection === undefined ? {} : { factorizedSupport: decision.selection.support }), decisionMilliseconds: decision.decisionMilliseconds });
      }
      if (this.#runtime === undefined) throw new TypeError("active candidate runtime was not initialized");
      const decision = this.#runtime.decide({ format: "tear-c32-canonical-source-observation", schemaVersion: 1, state, availableActions: available, stateHash });
      if (decision.source === "diagnostic-model") throw new TypeError("diagnostic model cannot act as an active artifact");
      return Object.freeze({ actions: decision.actions, source: decision.source,
        ...(decision.reason === undefined ? {} : { reason: decision.reason === "decision-budget-exceeded" ? "decision-budget-exceeded" as const : "no-legal-action" as const }), stateHash,
        ...(decision.support === undefined ? {} : { support: decision.support }),
        ...(decision.decisionMilliseconds === undefined ? {} : { decisionMilliseconds: decision.decisionMilliseconds }),
        artifactId: artifact.id, artifactHash: artifact.artifactHash,
        ...(this.#activation === undefined ? {} : { activationHash: this.#activation.activationHash }),
      });
    } catch {
      return Object.freeze({ actions: Object.freeze([]), source: "refused" as const,
        reason: "invalid-active-artifact" as const, stateHash, ...provenance });
    }
  }
}
