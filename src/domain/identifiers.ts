/**
 * The shared shapes for ids used by cosmetics and unlock conditions. Every shape also refuses the names a
 * plain object inherits (`isSafeKey`), because these ids become keys of saved maps.
 */
import { isSafeKey } from "./records";

/** The longest id of any shape, in characters; the saved-record size budget is worked out from it. */
export const MAX_ID_LENGTH = 64;

/** An id shape: one or more characters of `characters`, at most MAX_ID_LENGTH, never an inherited name. */
const idShape = (characters: string) => {
  const pattern = new RegExp(`^[${characters}]{1,${String(MAX_ID_LENGTH)}}$`, "u");
  return (value: unknown): value is string => typeof value === "string" && pattern.test(value) && isSafeKey(value);
};

/** Ids of cosmetic items, slots, tiers, collections and loadouts: lowercase letters, digits and underscores. */
export const isItemId = idShape("a-z0-9_");
/** Ids that name things defined elsewhere (a look family). */
export const isReferenceId = idShape("A-Za-z0-9_\\-");
/**
 * Names of things the profile records, as the profile spells them: a boss id, a biome display name
 * ("The Grounds"), a stat key ("encounterEnemy:charger"), an achievement id.
 */
export const isProfileName = idShape("A-Za-z0-9 _:.'\\-");
