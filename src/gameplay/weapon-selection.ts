/**
 * Canonical player-selectable weapon identifiers.
 *
 * Keep retirement migration at this boundary. It deliberately does not rewrite
 * historical telemetry, replays, or profile statistics: those records describe
 * the ruleset that created them.
 */
export const WEAPON_IDS = Object.freeze([
  "sword",
  "hammer",
  "greatsword",
  "chainblade",
  "riftlock",
] as const);

export type WeaponId = typeof WEAPON_IDS[number];

/** Deterministic replay packets must name the weapon contract that produced them. */
export const FINAL_FIVE_WEAPON_SCHEMA_VERSION = "final-five-v1";

export const WEAPON_SELECTION_MIGRATION = Object.freeze({
  spear: "greatsword",
  ringblade: "riftlock",
} as const satisfies Record<string, WeaponId>);

export function isWeaponId(value: string): value is WeaponId {
  return (WEAPON_IDS as readonly string[]).includes(value);
}

/** Migrates a saved selection only; unknown/corrupt values reset to Sword. */
export function migrateWeaponSelection(value: string | undefined | null): WeaponId {
  if (typeof value !== "string") return "sword";
  if (isWeaponId(value)) return value;
  const migrated = (WEAPON_SELECTION_MIGRATION as Readonly<Record<string, WeaponId>>)[value];
  return migrated ?? "sword";
}

export function isRetiredWeaponSelection(value: string): value is keyof typeof WEAPON_SELECTION_MIGRATION {
  return Object.hasOwn(WEAPON_SELECTION_MIGRATION, value);
}
