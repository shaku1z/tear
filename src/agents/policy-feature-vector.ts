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

function finite(value: number | undefined): number { return value === undefined || !Number.isFinite(value) ? 0 : value; }

export function projectCanonicalPolicyFeatures(state: CanonicalGameplayState): readonly number[] {
  const living = state.enemies.filter((enemy) => !enemy.dead);
  return Object.freeze([
    state.tick, finite(state.run?.wave), finite(state.run?.score), finite(state.run?.time),
    finite(state.player?.x), finite(state.player?.y), finite(state.player?.vx), finite(state.player?.vy), finite(state.player?.hp),
    finite(state.blade?.x), finite(state.blade?.y), finite(state.blade?.vx), finite(state.blade?.vy),
    state.enemies.length, living.length, living.length === 0 ? 0 : living.reduce((sum, enemy) => sum + finite(enemy.hp), 0) / living.length,
    Number(state.input.primaryHeld),
  ]);
}

export function projectStructuredPolicyFeatures(observation: TearAgentObservation): readonly number[] {
  const state = observation.state, living = state.entities.filter((entity) => (entity.hpRatio ?? 1) > 0);
  return Object.freeze([
    state.tick, state.run.wave, state.run.score, state.run.elapsedTicks,
    state.player.x, state.player.y, state.player.vx, state.player.vy, state.player.hp,
    state.blade.handX, state.blade.handY, state.blade.vx, state.blade.vy,
    state.entities.length, living.length, living.length === 0 ? 0 : living.reduce((sum, entity) => sum + (entity.hpRatio ?? 1), 0) / living.length,
    0,
  ]);
}
