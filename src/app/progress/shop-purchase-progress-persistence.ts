import type { createMetaProgression, ShopItem } from "../../gameplay/progression/meta";
import type { createProfileStore } from "../../persistence/profile-store";

type Meta = Pick<ReturnType<typeof createMetaProgression>["META"], "level">;
type Profile = Pick<ReturnType<typeof createProfileStore>, "addStat" | "maxStat">;
type Shop = readonly Pick<ShopItem, "id" | "maxLevel">[];

/** Composition-owned profile-stat update performed after a successful shop purchase. */
export interface ShopPurchaseProgressPersistence {
  readonly recordPurchase: () => void;
}

export function createLiveShopPurchaseProgressPersistence(
  profile: Profile,
  meta: Meta,
  shop: Shop,
): ShopPurchaseProgressPersistence {
  return Object.freeze({
    recordPurchase: () => {
      profile.addStat("shopBuys", 1);
      profile.maxStat("shopMaxed", shop.filter((item) => meta.level(item.id) >= item.maxLevel).length);
    },
  });
}
