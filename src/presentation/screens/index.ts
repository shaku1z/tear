import type { LegacyScreenRendererRegistry, ScreenRenderContext } from "./contracts";
import { createCodexShopRenderers } from "./codex-shop";
import { createDraftRenderers } from "./draft-reserve-tierup";
import { createLeaderboardReplayRenderers } from "./leaderboards-replays";
import { createMenuSetupRenderers } from "./menu-setup";
import { createPauseResultRenderers } from "./pause-results";
import { createPlaygroundRenderers } from "./playground";
import { createProfileAchievementRenderers } from "./profile-achievements";
import { createSettingsRenameRenderers } from "./settings-rename";
import { createAcademyRenderers } from "./academy";
import { createFoundryRenderers } from "./foundry";
import { createGhostLabRenderers } from "./ghost-lab";

export type * from "./contracts";

/**
 * Builds the presentation-only registry consumed by the legacy state adapter.
 * Every control carries a semantic action; the registry never mutates game state.
 */
export function createLegacyScreenRenderers(context: ScreenRenderContext): LegacyScreenRendererRegistry {
  const menuSetup = createMenuSetupRenderers(context);
  const codexShop = createCodexShopRenderers(context);
  const profileAchievements = createProfileAchievementRenderers(context);
  const leaderboardsReplays = createLeaderboardReplayRenderers(context);
  const settingsRename = createSettingsRenameRenderers(context);
  const drafts = createDraftRenderers(context);
  const results = createPauseResultRenderers(context);
  const playground = createPlaygroundRenderers(context);
  const academy = createAcademyRenderers(context);
  const foundry = createFoundryRenderers(context);
  const ghostLab = createGhostLabRenderers(context);

  return {
    menu: menuSetup.menu,
    setup: menuSetup.setup,
    playing: () => { /* World rendering remains owned by the gameplay frame. */ },
    paused: results.paused,
    draft: drafts.draft,
    reserve: drafts.reserve,
    tierup: drafts.tierup,
    settings: settingsRename.settings,
    continue: results.continue,
    gameover: results.gameover,
    win: results.win,
    replay: leaderboardsReplays.replay,
    confirmquit: results.confirmquit,
    shop: codexShop.shop,
    codex: codexShop.codex,
    profile: profileAchievements.profile,
    achievements: profileAchievements.achievements,
    leaderboards: leaderboardsReplays.leaderboards,
    rename: settingsRename.rename,
    pgmenu: playground.pgmenu,
    pglab: playground.pglab,
    academy: academy.academy,
    foundry: foundry.foundry,
    ghostlab: ghostLab.ghostlab,
    botevidence: ghostLab.botevidence,
    ghostpublication: ghostLab.ghostpublication,
    ghostsupport: ghostLab.ghostsupport,
  };
}
