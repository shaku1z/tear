import { createCodexShopRenderers } from "./codex-shop";
import type { ScreenRenderContext } from "./contracts";
import { createLeaderboardReplayRenderers } from "./leaderboards-replays";
import { createPlaygroundRenderers } from "./playground";
import { createProfileAchievementRenderers } from "./profile-achievements";
import { createSettingsRenameRenderers } from "./settings-rename";
import { createAcademyRenderers } from "./academy";
import { createFoundryRenderers } from "./foundry";

/** Cold canvas screens kept outside the startup bundle. */
export function createColdScreenRenderers(context: ScreenRenderContext) {
  return Object.freeze({
    ...createCodexShopRenderers(context),
    ...createProfileAchievementRenderers(context),
    ...createLeaderboardReplayRenderers(context),
    ...createPlaygroundRenderers(context),
    ...createSettingsRenameRenderers(context),
    ...createAcademyRenderers(context),
    ...createFoundryRenderers(context),
  });
}
