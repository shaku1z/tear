import { createScreenActionRouter } from "./screen-action-router";
import type { AppScreen } from "../../domain/screen-catalog";
import type { LibraryScreenAdapters } from "../library/library-screen-adapters";
import type { ReplayScreenAdapter } from "../replay/replay-screen-adapter";
import type { SettingsRenameAdapters } from "../screens/settings-rename-adapters";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import type { GhostVaultLibraryPort } from "../library/ghost-vault-library-controller";
import { screenActionAvailable, type SurfaceAvailability } from "../../domain/surface-availability";
import type { ScreenAction } from "../../presentation/screens/contracts";
import { setMusicPreview, stepMusicPreview } from "../../audio/music/preview";

export interface ScreenActionBindingPorts {
  readonly controlChase?: (command: "toggle" | "stop") => void;
  readonly ghostFiles: Pick<
    GhostVaultLibraryPort,
    "pickArchive" | "restoreArchive" | "cancelArchive" | "downloadArchive"
  >;
  readonly setScreen: (screen: AppScreen) => void;
  readonly resetScroll: () => void;
  readonly setSetupSelection: (kind: "mode" | "difficulty" | "weapon" | "boss", id: string) => void;
  readonly startSelectedRace?: () => void;
  readonly startSelectedRun: () => void;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly currentRun: () => Readonly<{ mode: RunMode; diff: RunDifficulty }>;
  readonly resumeFinale: () => void;
  readonly claimFinale: () => void;
  readonly chooseDraft: (index: number) => void;
  readonly rerollDraft: () => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTier: (index: number) => void;
  readonly requestPointer: () => void;
  readonly quitRun: () => void;
  readonly revive: () => void;
  readonly endRun: () => void;
  readonly retryRun: () => void;
  readonly lastReplay: () => unknown;
  readonly campaignDifficulty: () => RunDifficulty;
  readonly resetSettings: () => void;
  readonly buyShopItem: (id: string) => void;
  readonly signIn: () => void;
  readonly signOut: () => void;
  readonly pinReplay: (id: string, pinned: boolean) => boolean;
  readonly deleteReplay: (id: string) => void;
  readonly dispatchPlayground: (id: string) => void;
  readonly tutorialAction?: (
    command:
      | "open-practice"
      | "restart"
      | "select"
      | "help"
      | "demo"
      | "coach-rate"
      | "coach-compare"
      | "coach-diagnostic"
      | "skip"
      | "assist"
      | "annexes"
      | "select-annex"
      | "catalog"
      | "select-enemy"
      | "bosses"
      | "select-boss",
    lessonId?: string,
  ) => void;
  readonly library: LibraryScreenAdapters;
  readonly replay: ReplayScreenAdapter;
  readonly settings: SettingsRenameAdapters;
}

export function createLiveScreenActionBindings(ports: ScreenActionBindingPorts) {
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
      ports.quitRun();
      if (action.next === "setup") {
        ports.setSetupSelection("mode", "campaign");
        ports.setScreen("setup");
      }
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
    "shop.buy": (action) => {
      ports.buyShopItem(action.id);
    },
    "profile.selectTab": (action) => {
      ports.library.selectProfileTab(action.id);
    },
    "profile.watchReplay": (action) => {
      ports.library.watchReplay(action.id, "profile");
    },
    "profile.watchGhostCapsule": (action) => {
      ports.library.watchGhostCapsule(action.id);
    },
    "profile.compareGhostCapsule": (action) => {
      ports.library.compareGhostCapsule(action.id);
    },
    "profile.openGhostComparison": () => {
      ports.library.openGhostComparison();
    },
    "profile.repairGhostCapsule": (action) => {
      ports.library.repairGhostCapsule(action.id);
    },
    "career.control": (action) => {
      ports.library.careerAction(action.command, action.id);
    },
    "chase.control": (action) => {
      ports.controlChase?.(action.command);
    },
    "profile.pickGhostArchive": () => {
      ports.ghostFiles.pickArchive();
    },
    "profile.reselectGhostArchive": (action) => {
      ports.ghostFiles.pickArchive(action.id);
    },
    "profile.restoreGhostArchive": (action) => {
      ports.ghostFiles.restoreArchive(action.id, action.revision);
    },
    "profile.cancelGhostRestore": (action) => {
      ports.ghostFiles.cancelArchive(action.id, action.revision);
    },
    "profile.cancelGhostArchiveSelection": () => {
      ports.ghostFiles.cancelArchive();
    },
    "profile.downloadGhostArchive": (action) => {
      if (action.paired === true) ports.ghostFiles.downloadArchive(action.id, true);
      else ports.ghostFiles.downloadArchive(action.id);
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
      if (!ports.pinReplay(action.id, action.pinned)) ports.library.setProfileMessage("pin limit reached (10)");
    },
    "profile.publishReplay": (action) => {
      ports.library.publishReplay(action.id);
    },
    "profile.deleteReplay": (action) => {
      ports.deleteReplay(action.id);
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
    "replay.coach.viewMoment": (action) => {
      ports.replay.viewCoachMoment(action.id);
    },
    "replay.coach.control": (action) => {
      ports.replay.controlCoach(action.command, action.delta);
    },
    "replay.challenge.open": () => {
      ports.replay.openChallenges();
    },
    "replay.challenge.start": (action) => {
      ports.replay.startChallenge(action.id);
    },
    "replay.coach.open": () => {
      ports.replay.openCoach();
    },
    "replay.coach.selectBaseline": (action) => {
      ports.replay.selectCoachBaseline(action.id);
    },
    "replay.coach.practice": (action) => {
      ports.replay.practiceCoachFinding(action.findingId);
    },
    "replay.runDna.toggle": () => {
      ports.replay.toggleRunDna();
    },
    "replay.editor.toggle": () => {
      ports.replay.toggleStudio();
    },
    "replay.editor.createCutList": () => {
      ports.replay.createStudioCutList();
    },
    "replay.editor.media": (action) => {
      const actions = {
        markIn: ports.replay.markStudioIn,
        clear: ports.replay.clearStudioCuts,
        export: ports.replay.exportStudio,
        cancel: ports.replay.cancelStudio,
        download: ports.replay.downloadStudio,
      };
      actions[action.command]();
    },
    "replay.studio.toggle": () => {
      ports.replay.toggleStudio();
    },
    "replay.studio.createCutList": () => {
      ports.replay.createStudioCutList();
    },
    "replay.toggleInfo": () => {
      ports.replay.toggleInfo();
    },
    "replay.speed": (action) => {
      ports.replay.setSpeed(action.value);
    },
    "replay.finale": () => {
      ports.replay.openFinale?.();
    },
    "replay.exit": () => {
      ports.replay.exit();
    },
    "playground.action": (action) => {
      ports.dispatchPlayground(action.id);
    },
    "tutorial.action": (action) => {
      ports.tutorialAction?.(action.command, action.lessonId);
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
