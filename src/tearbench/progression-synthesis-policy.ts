import {
  UPGRADES,
  type UpgradeCategory,
  type UpgradeDefinition,
} from "../gameplay/upgrades";
import { stableVerificationHash } from "../replay/hash";
import type {
  TearBuildSelection,
  TearProgressionRequest,
} from "./progression-ledger";

export interface ProgressionMutableBuild {
  readonly owned: Record<string, number>;
  readonly tiers: Record<string, number>;
  readonly ownedOrder: string[];
}

export interface ProgressionDesiredBuild {
  readonly counts: Readonly<Record<string, number>>;
  readonly tiers: Readonly<Record<string, number>>;
  readonly accepted: readonly TearBuildSelection[];
  readonly issues: readonly string[];
}

export function maximumUpgradeTier(upgrade: UpgradeDefinition): number {
  return upgrade.tiers === undefined ? 1 : upgrade.tiers.length + 1;
}

export const PRODUCTION_UPGRADE_BY_ID = new Map(
  UPGRADES.map((upgrade) => [upgrade.id, upgrade] as const),
);

export const PRODUCTION_CONFIGURATION_REVISION = stableVerificationHash(
  UPGRADES.map((upgrade) => ({
    id: upgrade.id,
    unique: upgrade.unique,
    category: upgrade.cat,
    maximumTier: maximumUpgradeTier(upgrade),
    maximumStacks: upgrade.maxStacks ?? null,
  })),
);

const CATEGORIES: readonly UpgradeCategory[] = Object.freeze([
  "offense", "throw", "parry", "mobility", "resilience", "utility",
]);

function categoryCounts(build: ProgressionMutableBuild): Record<UpgradeCategory, number> {
  const counts = Object.fromEntries(
    CATEGORIES.map((category) => [category, 0]),
  ) as Record<UpgradeCategory, number>;
  for (const [id, owned] of Object.entries(build.owned)) {
    const category = PRODUCTION_UPGRADE_BY_ID.get(id)?.cat;
    if (category !== undefined) counts[category] += owned;
  }
  return counts;
}

function weaponCategories(
  weapon: TearProgressionRequest["weapon"],
): readonly UpgradeCategory[] {
  if (weapon === "hammer") return ["offense", "resilience", "mobility"];
  if (weapon === "greatsword") return ["throw", "offense", "mobility"];
  if (weapon === "chainblade") return ["throw", "utility", "mobility"];
  if (weapon === "riftlock") return ["throw", "parry", "offense"];
  return ["parry", "offense", "mobility"];
}

function policyScore(
  upgrade: UpgradeDefinition,
  request: TearProgressionRequest,
  build: ProgressionMutableBuild,
  desired: ProgressionDesiredBuild,
  categoryUse: number,
): number {
  const owned = build.owned[upgrade.id] ?? 0;
  const remainingDesired = Math.max(0, (desired.counts[upgrade.id] ?? 0) - owned);
  if (remainingDesired > 0) return 100_000 + remainingDesired * 1_000;
  const preferred = weaponCategories(request.weapon);
  const affinity = Math.max(0, preferred.length - preferred.indexOf(upgrade.cat));
  const special = upgrade.tiers === undefined ? 0 : 12;
  const rare = upgrade.rare === true ? 2 : 0;
  switch (request.policy) {
    case "optimized": return affinity * 20 + special + rare - owned * 4;
    case "archetype": return affinity * 30 + special - owned * 3;
    case "low-roll": return (upgrade.unique ? -20 : 10) - special - affinity * 3 + owned * 2;
    case "anti-synergy": return (preferred.includes(upgrade.cat) ? -30 : 20) - special - categoryUse * 2;
    case "coverage-seeking": return 80 - categoryUse * 15 + (owned === 0 ? 10 : 0) + special;
    case "human-population": return affinity * 10 + (upgrade.unique ? 8 : 12) + special - owned * 5;
    case "agent-population": return affinity * 14 + special + rare - owned * 5;
    case "replay-derived": return affinity * 8 + special - owned * 2;
    case "corruption": return -owned * 4 - special;
    case "exact-ledger": return affinity * 5 + special - owned * 2;
  }
}

function compareCandidates(
  left: UpgradeDefinition,
  right: UpgradeDefinition,
  scores: ReadonlyMap<string, number>,
  wave: number,
): number {
  const score = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
  if (score !== 0) return score;
  const leftRotation = (UPGRADES.indexOf(left) + wave) % UPGRADES.length;
  const rightRotation = (UPGRADES.indexOf(right) + wave) % UPGRADES.length;
  if (leftRotation !== rightRotation) return leftRotation - rightRotation;
  return left.id.localeCompare(right.id);
}

export function draftCandidates(
  request: TearProgressionRequest,
  build: ProgressionMutableBuild,
  desired: ProgressionDesiredBuild,
  wave: number,
): readonly UpgradeDefinition[] {
  const candidates = [...UPGRADES
    .filter((upgrade) => !(upgrade.unique && (build.owned[upgrade.id] ?? 0) > 0))
    .filter((upgrade) => upgrade.maxStacks === undefined
      || (build.owned[upgrade.id] ?? 0) < upgrade.maxStacks)];
  const counts = categoryCounts(build);
  const scores = new Map(candidates.map((upgrade) => [
    upgrade.id,
    policyScore(upgrade, request, build, desired, counts[upgrade.cat]),
  ] as const));
  return candidates.sort((left, right) => compareCandidates(left, right, scores, wave));
}

export function tierCandidates(
  build: ProgressionMutableBuild,
  desired: ProgressionDesiredBuild,
): readonly UpgradeDefinition[] {
  return build.ownedOrder
    .map((id) => PRODUCTION_UPGRADE_BY_ID.get(id))
    .filter((upgrade): upgrade is UpgradeDefinition => upgrade?.tiers !== undefined)
    .filter((upgrade) => (build.tiers[upgrade.id] ?? 1) < maximumUpgradeTier(upgrade))
    .sort((left, right) => {
      const leftNeeded = Math.max(0, (desired.tiers[left.id] ?? 1) - (build.tiers[left.id] ?? 1));
      const rightNeeded = Math.max(0, (desired.tiers[right.id] ?? 1) - (build.tiers[right.id] ?? 1));
      return rightNeeded - leftNeeded || left.id.localeCompare(right.id);
    });
}
