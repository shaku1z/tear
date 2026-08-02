import type { createAchievements } from "../gameplay/progression/achievements";
import type { createMetaProgression, ShopItem } from "../gameplay/progression/meta";
import type { createLegacyProfile } from "../persistence/legacy-profile";

type Achievements = Pick<ReturnType<typeof createAchievements>, "check">;
type Meta = Pick<ReturnType<typeof createMetaProgression>["META"], "level">;
type Profile = Pick<ReturnType<typeof createLegacyProfile>, "maxStat" | "save">;
type Shop = readonly Pick<ShopItem, "id" | "maxLevel">[];

/** Ordered persistence adapter for platform-bootstrap progression backfill. */
export interface PlatformBootstrapPersistence {
  readonly backfillShopProgress: () => void;
}

export function createLivePlatformBootstrapPersistence(
  achievements: Achievements,
  profile: Profile,
  meta: Meta,
  shop: Shop,
): PlatformBootstrapPersistence {
  return Object.freeze({
    backfillShopProgress: () => {
      profile.maxStat("shopMaxed", shop.filter((item) => meta.level(item.id) >= item.maxLevel).length);
      achievements.check();
      profile.save();
    },
  });
}
