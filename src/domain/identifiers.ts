/**
 * The shared shapes for ids used by cosmetics and unlock conditions. Every shape also refuses the names a
 * plain object inherits (`isSafeKey`), because these ids become keys of saved maps.
 */
import { isSafeKey } from "./records";

const idShape =
  (pattern: RegExp) =>
  (value: unknown): value is string =>
    typeof value === "string" && pattern.test(value) && isSafeKey(value);

/** Ids of cosmetic items, slots, tiers, collections and loadouts: lowercase letters, digits and underscores. */
export const isItemId = idShape(/^[a-z0-9_]{1,64}$/u);
/** Ids of songs and Radio channels, as tear-music publishes them: lowercase letters, digits and hyphens. */
export const isMusicId = idShape(/^[a-z0-9][a-z0-9-]{0,63}$/u);
/** Ids that name things defined elsewhere (a look family). */
export const isReferenceId = idShape(/^[A-Za-z0-9_-]{1,64}$/u);
/**
 * Names of things the profile records, as the profile spells them: a boss id, a biome display name
 * ("The Grounds"), a stat key ("encounterEnemy:charger"), an achievement id.
 */
export const isProfileName = idShape(/^[A-Za-z0-9 _:.'-]{1,64}$/u);
