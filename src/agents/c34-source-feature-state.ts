import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";

export type TearReturnVariant = "return-exact.v2" | "return-features.v2" | "return-exact.v3" | "return-features.v3";
export const TEAR_RETURN_PLAYING_MASK = Object.freeze(["aim", "move", "weapon"] as const);
const policy = Object.freeze({ schemaVersion: 2, stateSchema: "tear-canonical-gameplay-state.v1",
  units: "canonical-position-velocity-hp-times1000", decision: "empty-or-one-command.v2",
  vocabulary: "at-most15-commands-plus-one-empty", mask: "declared-playing-return-subset.v1",
  declaredMask: TEAR_RETURN_PLAYING_MASK, trainingMaskEvidence: "curriculum-declaration-not-historical-observation",
  selection: "highest-q-then-semantic-batch-hash.v2", missingQ: 0,
  nearestThreatTie: "distance-then-complete-feature-tuple.v1",
  quantization: Object.freeze({ playerPosition: 64000, bladeRelativePosition: 8000, velocity: 64000, threatRelativePosition: 32000,
    hp: 20000, aimTurn: 62500, move: 0.25, signedBinLimit: 64, waveLimit: 16 }),
});
export const TEAR_RETURN_ADAPTERS = Object.freeze({
  "return-exact.v2": Object.freeze({ ...policy, id: "tear-return-exact-source.v2", key: "complete-canonical-state-and-declared-mask" }),
  "return-features.v2": Object.freeze({ ...policy, id: "tear-return-source-features.v2", key: "quantized-player-blade-nearest-living-threat-input-mode-wave-mask" }),
  "return-exact.v3": Object.freeze({ ...policy, schemaVersion: 3, selection: "highest-q-then-present-support-then-semantic-batch-hash.v3",
    id: "tear-return-exact-source.v3", key: "complete-canonical-state-and-declared-mask" }),
  "return-features.v3": Object.freeze({ ...policy, schemaVersion: 3, selection: "highest-q-then-present-support-then-semantic-batch-hash.v3",
    id: "tear-return-source-features.v3", key: "quantized-player-blade-nearest-living-threat-input-mode-wave-mask" }),
});
export function tearReturnUsesSupportedTies(variant: TearReturnVariant | undefined): boolean {
  return variant === "return-exact.v3" || variant === "return-features.v3";
}
export function tearReturnAdapter(variant: TearReturnVariant): Readonly<{ id: string; adapterHash: string }> {
  if (!Object.hasOwn(TEAR_RETURN_ADAPTERS, variant)) throw new TypeError("unknown return variant");
  const adapter = TEAR_RETURN_ADAPTERS[variant];
  return Object.freeze({ id: adapter.id, adapterHash: stableVerificationHash(adapter) });
}
export function readTearReturnVariant(adapter: Readonly<{ id: string; adapterHash: string }>): TearReturnVariant | undefined {
  for (const variant of Object.keys(TEAR_RETURN_ADAPTERS) as TearReturnVariant[]) {
    const expected = tearReturnAdapter(variant);
    if (adapter.id === expected.id) {
      if (adapter.adapterHash !== expected.adapterHash) throw new TypeError("return feature adapter identity mismatch");
      return variant;
    }
  }
  return undefined;
}
function bin(value: number, width: number): number {
  if (!Number.isFinite(value)) throw new TypeError("return features require finite canonical source values");
  return Math.max(-64, Math.min(64, Math.floor(value / width)));
}
/** Offline mask is an explicit playing-only curriculum assumption. Runtime passes its real legal mask. */
export function encodeTearReturnSourceState(state: CanonicalGameplayState, variant: TearReturnVariant,
  available: readonly GameAction["type"][] = TEAR_RETURN_PLAYING_MASK): Readonly<{ stateHash: string; canonicalHash: string }> {
  tearReturnAdapter(variant);
  const { run, player, blade, input } = state;
  if (run === null || player === null || blade === null || !["endless", "campaign", "bossonly", "gauntlet"].includes(run.mode)) {
    throw new RangeError("return features require an active ordinary source world");
  }
  const mask = TEAR_RETURN_PLAYING_MASK.filter(type => available.includes(type));
  const canonicalHash = stableVerificationHash(state);
  if (variant === "return-exact.v2" || variant === "return-exact.v3") return Object.freeze({ canonicalHash, stateHash: stableVerificationHash({ state, mask }) });
  const candidates = state.enemies.filter(enemy => !enemy.dead && enemy.hp > 0).map(enemy => {
    const tuple = [enemy.kind, enemy.bossId, bin(enemy.x - player.x, 32000), bin(enemy.y - player.y, 32000),
      bin(enemy.vx, 64000), bin(enemy.vy, 64000), bin(enemy.hp, 20000), enemy.rimehound?.atk ?? enemy.whiteHart?.atk ?? ""];
    return { tuple, order: JSON.stringify(tuple), distance: (enemy.x - player.x) ** 2 + (enemy.y - player.y) ** 2 };
  });
  candidates.sort((a, b) => a.distance - b.distance || a.order.localeCompare(b.order));
  const features = { mode: run.mode, wave: bin(run.wave, 1) > 16 ? 16 : bin(run.wave, 1), mask,
    player: [bin(player.x, 64000), bin(player.y, 64000), bin(player.vx, 64000), bin(player.vy, 64000), bin(player.hp, 20000)],
    blade: [blade.state, bin(blade.x - player.x, 8000), bin(blade.y - player.y, 8000), bin(blade.vx, 64000), bin(blade.vy, 64000)],
    input: [bin(input.moveX, 0.25), bin(input.moveY, 0.25), bin(input.aimTurn, 62500), bin(input.aimMagnitude ?? 1000, 250), input.primaryHeld],
    threat: candidates[0]?.tuple ?? null,
  };
  return Object.freeze({ canonicalHash, stateHash: stableVerificationHash(features) });
}
