import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../replay/hash";
import type { TearAgentObservation } from "./contracts";

/** Numeric fields available in both C31 canonical tracks and C32 live observations. */
export const TEAR_POLICY_FEATURES_V1 = Object.freeze([
  "tick", "run.wave", "run.score", "run.elapsedTicks",
  "player.x", "player.y", "player.vx", "player.vy", "player.hp",
  "blade.x", "blade.y", "blade.vx", "blade.vy",
  "enemies.total", "enemies.living", "enemies.meanHpRatio", "player.primaryHeld",
] as const);

export const TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 = stableVerificationHash(TEAR_POLICY_FEATURES_V1);
export const TEAR_POLICY_FEATURE_WIDTH_V1 = TEAR_POLICY_FEATURES_V1.length;

/** V2 uses only facts exposed by both canonical tracks and structured execution.
 * Time is the authoritative tick (not run seconds); health is absolute player HP
 * (enemy max HP is absent from canonical tracks). Only living enemy actors count:
 * structured projectiles and canonical dead actors are excluded. Blade-held is
 * observed state, deliberately distinct from the unavailable structured input.
 */
export const TEAR_POLICY_FEATURES_V2 = Object.freeze([
  "tick", "run.wave", "run.score", "player.x", "player.y", "player.vx", "player.vy", "player.hp",
  "blade.x", "blade.y", "blade.vx", "blade.vy", "enemies.living", "blade.held",
] as const);
export const TEAR_POLICY_FEATURE_SCHEMA_HASH_V2 = stableVerificationHash({
  format: "tear-policy-feature-semantics", schemaVersion: 2, fields: TEAR_POLICY_FEATURES_V2,
  spatialUnits: "world-units-rounded-to-0.001", health: "absolute-player-hp-rounded-to-0.001",
  time: "authoritative-scheduler-tick", enemies: "non-dead-enemy-actors-excluding-projectiles",
  held: "blade-state-equals-held-not-primary-input", missing: "zero",
});
export const TEAR_POLICY_FEATURE_WIDTH_V2 = TEAR_POLICY_FEATURES_V2.length;

export function isTearPolicyFeatureSchema(hash: unknown): hash is string {
  return hash === TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 || hash === TEAR_POLICY_FEATURE_SCHEMA_HASH_V2;
}
export function tearPolicyFeatureWidth(hash: string): number {
  if (!isTearPolicyFeatureSchema(hash)) throw new TypeError("unknown policy feature schema");
  return hash === TEAR_POLICY_FEATURE_SCHEMA_HASH_V1 ? TEAR_POLICY_FEATURE_WIDTH_V1 : TEAR_POLICY_FEATURE_WIDTH_V2;
}

function finite(value: number | undefined): number { return value === undefined || !Number.isFinite(value) ? 0 : value; }

export function projectCanonicalPolicyFeatures(state: CanonicalGameplayState, featureSchemaHash = TEAR_POLICY_FEATURE_SCHEMA_HASH_V1): readonly number[] {
  tearPolicyFeatureWidth(featureSchemaHash);
  if (featureSchemaHash === TEAR_POLICY_FEATURE_SCHEMA_HASH_V2) return Object.freeze([
    state.tick, finite(state.run?.wave), finite(state.run?.score),
    finite(state.player?.x) / 1_000, finite(state.player?.y) / 1_000, finite(state.player?.vx) / 1_000, finite(state.player?.vy) / 1_000, finite(state.player?.hp) / 1_000,
    finite(state.blade?.x) / 1_000, finite(state.blade?.y) / 1_000, finite(state.blade?.vx) / 1_000, finite(state.blade?.vy) / 1_000,
    state.enemies.filter((enemy) => !enemy.dead).length, Number(state.blade?.state === "held"),
  ]);
  const living = state.enemies.filter((enemy) => !enemy.dead);
  return Object.freeze([
    state.tick, finite(state.run?.wave), finite(state.run?.score), finite(state.run?.time),
    finite(state.player?.x), finite(state.player?.y), finite(state.player?.vx), finite(state.player?.vy), finite(state.player?.hp),
    finite(state.blade?.x), finite(state.blade?.y), finite(state.blade?.vx), finite(state.blade?.vy),
    state.enemies.length, living.length, living.length === 0 ? 0 : living.reduce((sum, enemy) => sum + finite(enemy.hp), 0) / living.length,
    Number(state.input.primaryHeld),
  ]);
}

export function projectStructuredPolicyFeatures(observation: TearAgentObservation, featureSchemaHash = TEAR_POLICY_FEATURE_SCHEMA_HASH_V1): readonly number[] {
  tearPolicyFeatureWidth(featureSchemaHash);
  const rounded = (value: number): number => Math.round(finite(value) * 1_000) / 1_000;
  if (featureSchemaHash === TEAR_POLICY_FEATURE_SCHEMA_HASH_V2) {
    const state = observation.state;
    return Object.freeze([state.tick, state.run.wave, state.run.score,
      rounded(state.player.x), rounded(state.player.y), rounded(state.player.vx), rounded(state.player.vy), rounded(state.player.hp),
      rounded(state.blade.handX), rounded(state.blade.handY), rounded(state.blade.vx), rounded(state.blade.vy),
      state.entities.filter((entity) => entity.kind !== "projectile").length, Number(state.blade.state === "held")]);
  }
  const state = observation.state, living = state.entities.filter((entity) => (entity.hpRatio ?? 1) > 0);
  return Object.freeze([
    state.tick, state.run.wave, state.run.score, state.run.elapsedTicks,
    state.player.x, state.player.y, state.player.vx, state.player.vy, state.player.hp,
    state.blade.handX, state.blade.handY, state.blade.vx, state.blade.vy,
    state.entities.length, living.length, living.length === 0 ? 0 : living.reduce((sum, entity) => sum + (entity.hpRatio ?? 1), 0) / living.length,
    0,
  ]);
}
