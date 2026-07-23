import { createScreenActionRouter } from "./screen-action-router";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { LibraryScreenAdapters } from "./live-library-screen-adapters";
import type { ReplayScreenAdapter } from "./live-replay-screen-adapter";
import type { SettingsRenameAdapters } from "./live-settings-rename-adapters";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";

export interface ScreenActionBindingPorts {
  readonly setScreen: (screen: LegacyAppScreen) => void; readonly resetScroll: () => void;
  readonly setSetupSelection: (kind: "mode" | "difficulty" | "weapon" | "boss", id: string) => void;
  readonly startSelectedRun: () => void; readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly currentRun: () => Readonly<{ mode: RunMode; diff: RunDifficulty }>;
  readonly resumeFinale: () => void; readonly claimFinale: () => void;
  readonly chooseDraft: (index: number) => void; readonly rerollDraft: () => void;
  readonly chooseReserve: (index: number) => void; readonly chooseTier: (index: number) => void;
  readonly requestPointer: () => void; readonly quitRun: () => void; readonly revive: () => void;
  readonly endRun: () => void; readonly retryRun: () => void; readonly lastReplay: () => unknown;
  readonly campaignDifficulty: () => RunDifficulty; readonly resetSettings: () => void; readonly buyShopItem: (id: string) => void;
  readonly signIn: () => void; readonly signOut: () => void; readonly pinReplay: (id: string, pinned: boolean) => boolean;
  readonly deleteReplay: (id: string) => void; readonly dispatchPlayground: (id: string) => void;
  readonly library: LibraryScreenAdapters; readonly replay: ReplayScreenAdapter; readonly settings: SettingsRenameAdapters;
}

export function createLiveScreenActionBindings(ports: ScreenActionBindingPorts) {
  return createScreenActionRouter({
    navigate: (action) => { ports.setScreen(action.to); if (action.resetScroll) ports.resetScroll();
      if (action.tab !== undefined) {
        if (action.to === "profile") ports.library.selectProfileTab(action.tab);
        else if (action.to === "codex") ports.library.selectCodexTab(action.tab);
        else if (action.to === "settings") ports.settings.selectSettingsTab(action.tab);
      } },
    "menu.resumeFinale": () => { ports.resumeFinale(); }, "menu.claimFinale": () => { ports.claimFinale(); },
    "setup.selectMode": (action) => { ports.setSetupSelection("mode", action.id); },
    "setup.selectDifficulty": (action) => { ports.setSetupSelection("difficulty", action.id); },
    "setup.selectWeapon": (action) => { ports.setSetupSelection("weapon", action.id); },
    "setup.selectBoss": (action) => { ports.setSetupSelection("boss", action.id); },
    "setup.start": () => { ports.startSelectedRun(); }, "draft.choose": (action) => { ports.chooseDraft(action.index); },
    "draft.reroll": () => { ports.rerollDraft(); }, "reserve.choose": (action) => { ports.chooseReserve(action.index); },
    "tierup.choose": (action) => { ports.chooseTier(action.index); }, "rename.submit": () => { ports.settings.submitRename(); },
    "rename.cancel": () => { ports.settings.cancelRename(); }, "run.resume": () => { ports.setScreen("playing"); ports.requestPointer(); },
    "run.restart": () => { const run = ports.currentRun(); ports.startRun(run.mode, run.diff); }, "run.quit": () => { ports.quitRun(); },
    "continue.revive": () => { ports.revive(); }, "continue.giveUp": () => { ports.endRun(); }, "results.retry": () => { ports.retryRun(); },
    "results.watchReplay": () => { const replay = ports.lastReplay(); if (replay !== null) ports.replay.enter(replay, "gameover"); },
    "results.descendAgain": () => { ports.startRun("campaign", ports.campaignDifficulty()); },
    "settings.selectTab": (action) => { ports.settings.selectSettingsTab(action.id); },
    "settings.step": (action) => { ports.settings.stepSetting(action.key, action.delta); },
    "settings.toggle": (action) => { ports.settings.toggleSetting(action.key); },
    "settings.activate": (action) => { ports.settings.activateSetting(action.key); }, "settings.reset": () => { ports.resetSettings(); },
    "shop.buy": (action) => { ports.buyShopItem(action.id); }, "profile.selectTab": (action) => { ports.library.selectProfileTab(action.id); },
    "profile.watchReplay": (action) => { ports.library.watchReplay(action.id, "profile"); },
    "profile.signIn": () => { ports.signIn(); }, "profile.signOut": () => { ports.signOut(); },
    "profile.rename": () => { ports.settings.beginRename(false); },
    "profile.openAchievements": () => { ports.setScreen("achievements"); ports.resetScroll(); }, "profile.play": () => { ports.setScreen("setup"); },
    "profile.pinReplay": (action) => { if (!ports.pinReplay(action.id, action.pinned)) ports.library.setProfileMessage("pin limit reached (10)"); },
    "profile.publishReplay": (action) => { ports.library.publishReplay(action.id); }, "profile.deleteReplay": (action) => { ports.deleteReplay(action.id); },
    "achievements.selectCategory": (action) => { ports.library.selectAchievementCategory(action.id); },
    "achievements.inspect": () => { /* inspection is represented by the focused card */ },
    "leaderboards.selectTab": (action) => { ports.library.selectLeaderboardTab(action.id); },
    "leaderboards.selectBoard": (action) => { ports.library.selectLeaderboardBoard(action.id); },
    "leaderboards.watchReplay": (action) => { ports.library.watchReplay(action.id, "leaderboards"); },
    "replay.togglePause": () => { ports.replay.togglePause(); }, "replay.seek": (action) => { ports.replay.seekBy(action.delta); },
    "replay.seekTo": (action) => { ports.replay.seekToFraction(action.fraction); },
    "replay.jumpChapter": (action) => { ports.replay.jumpChapter(action.direction); }, "replay.restart": () => { ports.replay.restart(); },
    "replay.toggleInfo": () => { ports.replay.toggleInfo(); }, "replay.speed": (action) => { ports.replay.setSpeed(action.value); },
    "replay.exit": () => { ports.replay.exit(); }, "playground.action": (action) => { ports.dispatchPlayground(action.id); },
    "codex.selectTab": (action) => { ports.library.selectCodexTab(action.id); },
    "codex.selectFilter": (action) => { ports.library.selectCodexFilter(action.id); },
    "codex.cycleSort": () => { ports.library.cycleCodexSort(); }, "codex.inspect": (action) => { ports.library.inspectCodexAbility(action.id); },
  });
}
