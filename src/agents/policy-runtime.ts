import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearAgentDecision, TearAgentObservation, TearAgentProfileId } from "./contracts";
import type { TearPolicyArtifactRegistry, TearPolicyArtifactV1 } from "./policy-artifact-registry";
import { TearAgentOrchestrator } from "./scripted-policy";

interface TablePolicyModel {
  readonly format: "tear-table-policy-model";
  readonly schemaVersion: 1;
  readonly actionsByObservationHash: Readonly<Record<string, readonly unknown[]>>;
}

export interface TearPolicyDecisionReceipt {
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly observationHash: string;
  readonly source: "artifact" | "scripted-fallback";
  readonly reason?: "no-active-artifact" | "invalid-model" | "missing-decision" | "invalid-action";
}

export interface TearActivePolicyDecision extends TearAgentDecision {
  readonly receipt: TearPolicyDecisionReceipt;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stable structured feature identity. It contains only typed simulation/UI observations, never DOM or device state. */
export function encodeTearPolicyObservation(observation: TearAgentObservation): string {
  const state = observation.state;
  return stableVerificationHash({
    observationClass: state.observationClass, screen: observation.ui?.screen ?? "playing", tick: state.tick,
    player: { x: Math.round(state.player.x), y: Math.round(state.player.y), hp: Math.round(state.player.hp), maxHp: Math.round(state.player.maxHp), grounded: state.player.grounded, dashCharges: state.player.dashCharges },
    blade: { state: state.blade.state, tipSpeed: Math.round(state.blade.tipSpeed) },
    run: { mode: state.run.mode, difficulty: state.run.difficulty, weapon: state.run.weapon, wave: state.run.wave },
    entities: state.entities.map((entity) => ({ kind: entity.kind, state: entity.state ?? "", ...(entity.hpRatio === undefined ? {} : { hpRatio: Math.round(entity.hpRatio * 100) }) })).sort((left, right) => `${left.kind}:${left.state}`.localeCompare(`${right.kind}:${right.state}`)),
    availableActions: [...state.availableActions].sort(), ...(observation.boss === undefined ? {} : { boss: observation.boss }),
  });
}

function parseTableModel(artifact: TearPolicyArtifactV1): TablePolicyModel | undefined {
  if (artifact.model.format !== "table-policy-v1") return undefined;
  try {
    const parsed: unknown = JSON.parse(artifact.model.payload);
    if (!record(parsed) || parsed.format !== "tear-table-policy-model" || parsed.schemaVersion !== 1 || !record(parsed.actionsByObservationHash)
      || !Object.values(parsed.actionsByObservationHash).every(Array.isArray)) return undefined;
    return Object.freeze({ format: "tear-table-policy-model", schemaVersion: 1,
      actionsByObservationHash: Object.freeze(Object.fromEntries(Object.entries(parsed.actionsByObservationHash).map(([key, value]) => [key, Object.freeze(Array.isArray(value) ? Array.from(value, (entry): unknown => entry) : [])]))),
    });
  } catch { return undefined; }
}

/**
 * Typed C32 execution boundary for the active local artifact. Table models are
 * data, not executable code; any unavailable, malformed, or illegal result
 * delegates to the proven scripted policy.
 */
export class TearActivePolicyRuntime {
  readonly #registry: TearPolicyArtifactRegistry;
  readonly #fallback: TearAgentOrchestrator;
  #artifact: TearPolicyArtifactV1 | undefined;
  #model: TablePolicyModel | undefined;

  constructor(registry: TearPolicyArtifactRegistry, profile: TearAgentProfileId = "competent") {
    this.#registry = registry; this.#fallback = new TearAgentOrchestrator(profile);
  }

  async reset(): Promise<void> {
    this.#artifact = undefined; this.#model = undefined;
    const active = await this.#registry.active();
    if (active === undefined) return;
    const artifact = await this.#registry.get(active.artifactId);
    if (artifact?.artifactHash !== active.artifactHash) return;
    this.#artifact = artifact; this.#model = parseTableModel(artifact);
  }

  decide(observation: TearAgentObservation): TearActivePolicyDecision {
    const observationHash = encodeTearPolicyObservation(observation);
    const fallback = (reason: NonNullable<TearPolicyDecisionReceipt["reason"]>): TearActivePolicyDecision => {
      const decision = this.#fallback.decide(observation);
      return Object.freeze({ ...decision, receipt: Object.freeze({ observationHash, source: "scripted-fallback", reason,
        ...(this.#artifact === undefined ? {} : { artifactId: this.#artifact.id, artifactHash: this.#artifact.artifactHash }) }) });
    };
    if (this.#artifact === undefined) return fallback("no-active-artifact");
    if (this.#model === undefined) return fallback("invalid-model");
    const candidate = this.#model.actionsByObservationHash[observationHash];
    if (candidate === undefined) return fallback("missing-decision");
    if (candidate.length > 16) return fallback("invalid-action");
    const actions: GameAction[] = [];
    for (const value of candidate) {
      const normalized = normalizeGameAction(value);
      if (!normalized.ok) return fallback("invalid-action");
      actions.push(normalized.action);
    }
    const fallbackTrace = this.#fallback.decide(observation).trace;
    return Object.freeze({ actions: Object.freeze(actions), trace: fallbackTrace,
      receipt: Object.freeze({ artifactId: this.#artifact.id, artifactHash: this.#artifact.artifactHash, observationHash, source: "artifact" }) });
  }
}
