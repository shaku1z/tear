import type { ShopShardsPort } from "../screens/menu-screen-adapters";
import { createScreenActionRouter } from "./screen-action-router";
import type { AppScreen } from "../../domain/screen-catalog";
import type { LibraryScreenAdapters } from "../library/library-screen-adapters";
import type { ReplayScreenAdapter } from "../replay/replay-screen";
import type { SettingsRenameAdapters } from "../screens/settings-rename-adapters";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import { screenActionAvailable, type SurfaceAvailability } from "../../domain/surface-availability";
import type { ScreenAction } from "../../presentation/screens/contracts";
import type { RunExitScreen } from "../../domain/screen-actions";
import { equipCosmetic } from "../../domain/cosmetics";
import { createLoadout, switchLoadout } from "../../domain/cosmetic-loadouts";
import { setMusicPreview, stepMusicPreview } from "../../audio/music/preview";
import { requestNextSong } from "../../audio/music/music-source";

export interface ScreenActionBindingPorts {
  readonly controlChase?: (command: "toggle" | "stop") => void;
  readonly setScreen: (screen: AppScreen) => void;
  /** Returns to the screen the current one was opened from. */
  readonly back: () => void;
  readonly resetScroll: () => void;
  readonly setSetupSelection: (kind: "mode" | "difficulty" | "weapon" | "boss", id: string) => void;
  readonly startSelectedRace?: () => void;
  readonly startSelectedRun: () => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  /** Records that the player left the tutorial on purpose. */
  readonly skipTutorial: () => void;
  readonly currentRun: () => Readonly<{ mode: RunMode; diff: RunDifficulty }>;
  readonly resumeFinale: () => void;
  readonly claimFinale: () => void;
  readonly chooseDraft: (index: number) => void;
  readonly rerollDraft: () => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTier: (index: number) => void;
  readonly requestPointer: () => void;
  /** Ends the run as QUIT does and opens `next` (the main menu unless named); see the run adapter. */
  readonly quitRun: (next?: RunExitScreen) => void;
  readonly revive: () => void;
  readonly endRun: () => void;
  readonly retryRun: () => void;
  readonly lastReplay: () => unknown;
  readonly campaignDifficulty: () => RunDifficulty;
  readonly resetSettings: () => void;
  readonly buyShopItem: (id: string) => void;
  readonly shop: ShopShardsPort;
  readonly signIn: () => void;
  readonly signOut: () => void;
  readonly dispatchPlayground: (id: string) => void;
  readonly tutorialAction?: (action: Extract<ScreenAction, { type: "tutorial.action" }>) => void;
  readonly library: LibraryScreenAdapters;
  readonly replay: ReplayScreenAdapter;
  readonly settings: SettingsRenameAdapters;
}

export function createLiveScreenActionBindings(ports: ScreenActionBindingPorts) {
  /** The one way out of a run: it ends as QUIT ends it, then `next` opens (the run setup with Adventure selected). */
  const leaveRun = (next: RunExitScreen = "menu"): void => {
    ports.quitRun(next);
    if (next === "setup") ports.setSetupSelection("mode", "campaign");
  };
  return createScreenActionRouter({
    navigate: (action) => {
      ports.setScreen(action.to);
      if (action.resetScroll) ports.resetScroll();
      if (action.tab !== undefined) {
        if (action.to === "profile") ports.library.selectProfileTab(action.tab);
        else if (action.to === "codex") ports.library.selectCodexTab(action.tab);
        else if (action.to === "settings") ports.settings.selectSettingsTab(action.tab);
      }
      // MUSIC opens on Home from outside; inside it, the tab names the page.
      if (action.to === "music") ports.settings.selectMusicPage(action.tab ?? "home");
    },
    "navigate.back": () => {
      ports.back();
    },
    "menu.resumeFinale": () => {
      ports.resumeFinale();
    },
    "menu.claimFinale": () => {
      ports.claimFinale();
    },
    "setup.selectMode": (action) => {
      ports.setSetupSelection("mode", action.id);
    },
    "setup.selectDifficulty": (action) => {
      ports.setSetupSelection("difficulty", action.id);
    },
    "setup.selectWeapon": (action) => {
      ports.setSetupSelection("weapon", action.id);
    },
    "setup.selectBoss": (action) => {
      ports.setSetupSelection("boss", action.id);
    },
    "setup.start": (action) => {
      if (action.race) ports.startSelectedRace?.();
      else ports.startSelectedRun();
    },
    "draft.choose": (action) => {
      ports.chooseDraft(action.index);
    },
    "draft.reroll": () => {
      ports.rerollDraft();
    },
    "reserve.choose": (action) => {
      ports.chooseReserve(action.index);
    },
    "tierup.choose": (action) => {
      ports.chooseTier(action.index);
    },
    "rename.submit": () => {
      ports.settings.submitRename();
    },
    "rename.cancel": () => {
      ports.settings.cancelRename();
    },
    "run.resume": () => {
      ports.setScreen("playing");
      ports.requestPointer();
    },
    "run.restart": () => {
      const run = ports.currentRun();
      ports.startRun(run.mode, run.diff);
    },
    "run.quit": (action) => {
      leaveRun(action.next);
    },
    "tutorial.continue": () => {
      ports.setSetupSelection("mode", "tutorial");
      ports.startSelectedRun();
    },
    "tutorial.skip": () => {
      ports.skipTutorial();
      leaveRun("setup");
    },
    "continue.revive": () => {
      ports.revive();
    },
    "continue.giveUp": () => {
      ports.endRun();
    },
    "results.retry": () => {
      ports.retryRun();
    },
    "results.watchReplay": () => {
      const replay = ports.lastReplay();
      if (replay !== null) ports.replay.enter(replay, "gameover");
    },
    "results.descendAgain": () => {
      ports.startRun("campaign", ports.campaignDifficulty());
    },
    "settings.selectTab": (action) => {
      ports.settings.selectSettingsTab(action.id);
    },
    "settings.step": (action) => {
      ports.settings.stepSetting(action.key, action.delta);
    },
    "settings.toggle": (action) => {
      ports.settings.toggleSetting(action.key);
    },
    "settings.activate": (action) => {
      ports.settings.activateSetting(action.key);
    },
    "settings.reset": () => {
      ports.resetSettings();
    },
    "music.preview": (action) => {
      setMusicPreview(action.id, action.queue);
    },
    "music.step": (action) => {
      stepMusicPreview(action.delta);
    },
    "music.stopPreview": () => {
      setMusicPreview(null);
    },
    "music.pick": (action) => {
      ports.settings.pickMusic(action.value);
    },
    "music.next": () => {
      requestNextSong();
    },
    "shop.buy": (action) => {
      ports.buyShopItem(action.id);
    },
    "shop.selectTab": (action) => {
      ports.shop.selectShopTab(action.id);
    },
    "shards.buy": (action) => {
      ports.shop.buyCosmetic(action.id);
    },
    "shards.equip": (action) => {
      ports.shop.changeCosmetics((catalog, state, now) => equipCosmetic(catalog, state, action.slot, action.id, now));
    },
    "shards.newLoadout": () => {
      ports.shop.changeCosmetics((_catalog, state, now) => createLoadout(state, now));
    },
    "shards.useLoadout": (action) => {
      ports.shop.changeCosmetics((_catalog, state, now) => switchLoadout(state, action.id, now));
    },
    "shards.renameLoadout": (action) => {
      const target = ports.shop.loadoutNameTarget(action.id);
      if (target) ports.settings.beginNaming(target);
    },
    "shards.deleteLoadout": (action) => {
      ports.shop.pressDeleteLoadout(action.id);
    },
    "profile.selectTab": (action) => {
      ports.library.selectProfileTab(action.id);
    },
    "profile.filterReplays": (action) => {
      ports.library.replays.filter(action.id);
    },
    "profile.watchReplay": (action) => {
      ports.library.replays.watch(action.id);
    },
    "profile.downloadReplay": (action) => {
      ports.library.replays.download(action.id);
    },
    "profile.importReplay": () => {
      ports.library.replays.importFile();
    },
    "chase.control": (action) => {
      ports.controlChase?.(action.command);
    },
    "profile.signIn": () => {
      ports.signIn();
    },
    "profile.signOut": () => {
      ports.signOut();
    },
    "profile.rename": () => {
      ports.settings.beginRename(false);
    },
    "profile.openAchievements": () => {
      ports.setScreen("achievements");
      ports.resetScroll();
    },
    "profile.play": () => {
      ports.setScreen("setup");
    },
    "profile.pinReplay": (action) => {
      ports.library.replays.pin(action.id, action.pinned);
    },
    "profile.publishReplay": (action) => {
      ports.library.replays.share(action.id);
    },
    "profile.deleteReplay": (action) => {
      ports.library.replays.remove(action.id);
    },
    "achievements.selectCategory": (action) => {
      ports.library.selectAchievementCategory(action.id);
    },
    "achievements.inspect": () => {
      /* inspection is represented by the focused card */
    },
    "leaderboards.selectTab": (action) => {
      ports.library.selectLeaderboardTab(action.id);
    },
    "leaderboards.selectBoard": (action) => {
      ports.library.selectLeaderboardBoard(action.id);
    },
    "leaderboards.watchReplay": (action) => {
      ports.library.watchReplay(action.id, "leaderboards");
    },
    "replay.togglePause": () => {
      ports.replay.togglePause();
    },
    "replay.seek": (action) => {
      ports.replay.seekBy(action.delta);
    },
    "replay.seekTo": (action) => {
      ports.replay.seekToFraction(action.fraction);
    },
    "replay.jumpChapter": (action) => {
      ports.replay.jumpChapter(action.direction);
    },
    "replay.restart": () => {
      ports.replay.restart();
    },
    "replay.practice": () => {
      ports.replay.practice();
    },
    "replay.editor.toggle": () => {
      ports.replay.toggleReplayEditor();
    },
    "replay.editor.appendClip": () => {
      ports.replay.appendClip();
    },
    "replay.editor.media": (action) => {
      const actions = {
        markIn: ports.replay.markClipIn,
        clear: ports.replay.clearClips,
        export: ports.replay.exportClips,
        cancel: ports.replay.cancelClipExport,
        download: ports.replay.downloadClip,
      };
      actions[action.command]();
    },
    "replay.toggleInfo": () => {
      ports.replay.toggleInfo();
    },
    "replay.speed": (action) => {
      ports.replay.setSpeed(action.value);
    },
    "replay.exit": () => {
      ports.replay.exit();
    },
    "playground.action": (action) => {
      ports.dispatchPlayground(action.id);
    },
    "tutorial.action": (action) => {
      ports.tutorialAction?.(action);
    },
    "codex.selectTab": (action) => {
      ports.library.selectCodexTab(action.id);
    },
    "codex.selectFilter": (action) => {
      ports.library.selectCodexFilter(action.id);
    },
    "codex.cycleSort": () => {
      ports.library.cycleCodexSort();
    },
    "codex.inspect": (action) => {
      ports.library.inspectCodexAbility(action.id);
    },
  });
}

/**
 * Surface gate in front of the exhaustive action router. An action whose
 * surface the build does not admit (an engineering screen or a hidden
 * unfinished feature) is inert, whichever path dispatched it.
 */
export function gateScreenActions(
  surfaces: SurfaceAvailability,
  dispatch: (action: ScreenAction) => void,
): (action: ScreenAction) => void {
  return (action) => {
    if (screenActionAvailable(surfaces, action)) dispatch(action);
  };
}
