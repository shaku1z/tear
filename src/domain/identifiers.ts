/** The shared shapes for ids and plain JSON records used by cosmetics and unlock conditions. */

/** Ids of cosmetic items, slots, tiers, collections and loadouts: lowercase letters, digits and underscores. */
export const ITEM_ID = /^[a-z0-9_]{1,64}$/u;
/** Ids that name things defined elsewhere (a look family). */
export const REFERENCE_ID = /^[A-Za-z0-9_-]{1,64}$/u;
/**
 * Names of things the profile records, as the profile spells them: a boss id, a biome display name
 * ("The Grounds"), a stat key ("encounterEnemy:charger"), an achievement id.
 */
export const PROFILE_NAME = /^[A-Za-z0-9 _:.'-]{1,64}$/u;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
