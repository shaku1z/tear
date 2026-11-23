import { UPGRADES, type UpgradeMods } from "../upgrades";

/** One upgrade a run holds: its tier and how many times it was taken. */
export type OwnedUpgrade = Readonly<{ id: string; tier: number; count: number }>;

/**
 * A run's upgrades in catalogue order. The run-end screen and the replay's INFO both list a loadout
 * through this, so they agree on order, tier and count.
 */
export function ownedLoadout(mods: Pick<UpgradeMods, "owned" | "tier">): readonly OwnedUpgrade[] {
  return UPGRADES.filter((upgrade) => Boolean(mods.owned[upgrade.id])).map((upgrade) =>
    Object.freeze({ id: upgrade.id, tier: mods.tier[upgrade.id] ?? 1, count: mods.owned[upgrade.id] ?? 1 }),
  );
}
