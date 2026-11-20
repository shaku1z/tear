/**
 * Semantic screen-control protocol shared by presentation and outward runtime
 * adapters. It names commands only; it has no Canvas, DOM, or renderer
 * dependency, so automation contracts can refer to a control without importing
 * the presentation layer that drew it.
 */
import type { AppScreen } from "./screen-catalog";
import type { PracticeTab } from "./practice-tab";

/** Where a run is left for once it has ended; the main menu unless named. */
export type RunExitScreen = "menu" | "setup";

export type ScreenAction =
  | { readonly type: "chase.control"; readonly command: "toggle" | "stop" }
  | { readonly type: "navigate"; readonly to: AppScreen; readonly resetScroll?: boolean; readonly tab?: string }
  /** Return to the screen this one was opened from, at the control the player left (the main menu if none). */
  | { readonly type: "navigate.back" }
  | { readonly type: "menu.resumeFinale" }
  | { readonly type: "menu.claimFinale" }
  | { readonly type: "setup.selectMode"; readonly id: string }
  | { readonly type: "setup.selectDifficulty"; readonly id: string }
  | { readonly type: "setup.selectWeapon"; readonly id: string }
  | { readonly type: "setup.selectBoss"; readonly id: string }
  | { readonly type: "setup.start"; readonly race?: true }
  | { readonly type: "codex.selectTab"; readonly id: string }
  | { readonly type: "codex.selectFilter"; readonly id: string }
  | { readonly type: "codex.cycleSort" }
  | { readonly type: "codex.inspect"; readonly id: string }
  | { readonly type: "shop.buy"; readonly id: string }
  | { readonly type: "shop.selectTab"; readonly id: string }
  | { readonly type: "shards.buy"; readonly id: string }
  /** Equip an owned cosmetic in its slot; a null id puts the game look back. */
  | { readonly type: "shards.equip"; readonly slot: string; readonly id: string | null }
  | { readonly type: "career.control"; readonly command: string; readonly id?: string }
  | { readonly type: "profile.selectTab"; readonly id: string }
  | { readonly type: "profile.watchReplay"; readonly id: string }
  | { readonly type: "profile.watchGhostCapsule"; readonly id: string }
  | { readonly type: "profile.repairGhostCapsule"; readonly id: string }
  | { readonly type: "profile.pickGhostArchive" }
  | { readonly type: "profile.reselectGhostArchive"; readonly id: string }
  | { readonly type: "profile.restoreGhostArchive"; readonly id: string; readonly revision: number }
  | { readonly type: "profile.cancelGhostRestore"; readonly id: string; readonly revision: number }
  | { readonly type: "profile.cancelGhostArchiveSelection" }
  | { readonly type: "profile.downloadGhostArchive"; readonly id: string }
  | { readonly type: "profile.signIn" }
  | { readonly type: "profile.signOut" }
  | { readonly type: "profile.rename" }
  | { readonly type: "profile.openAchievements" }
  | { readonly type: "profile.play" }
  | { readonly type: "profile.pinReplay"; readonly id: string; readonly pinned: boolean }
  | { readonly type: "profile.publishReplay"; readonly id: string }
  | { readonly type: "profile.deleteReplay"; readonly id: string }
  | { readonly type: "achievements.selectCategory"; readonly id: string }
  | { readonly type: "achievements.inspect"; readonly id: string }
  | { readonly type: "leaderboards.selectTab"; readonly id: string }
  | { readonly type: "leaderboards.selectBoard"; readonly id: string }
  | { readonly type: "leaderboards.watchReplay"; readonly id: string }
  | { readonly type: "replay.togglePause" }
  | { readonly type: "replay.seek"; readonly delta: number }
  | { readonly type: "replay.seekTo"; readonly fraction: number }
  | { readonly type: "replay.jumpChapter"; readonly direction: -1 | 1 }
  | { readonly type: "replay.restart" }
  | { readonly type: "replay.practice" }
  | { readonly type: "replay.editor.toggle" }
  | { readonly type: "replay.editor.appendClip" }
  | { readonly type: "replay.editor.media"; readonly command: "markIn" | "clear" | "export" | "cancel" | "download" }
  | { readonly type: "replay.toggleInfo" }
  | { readonly type: "replay.speed"; readonly value: number }
  | { readonly type: "replay.exit" }
  | { readonly type: "settings.selectTab"; readonly id: string }
  | { readonly type: "settings.step"; readonly key: string; readonly delta: number }
  | { readonly type: "settings.toggle"; readonly key: string }
  | { readonly type: "settings.activate"; readonly key: string }
  | { readonly type: "settings.reset" }
  /** Preview one song; `queue` is the collection it was started from, for ◀◀/▶▶. */
  | { readonly type: "music.preview"; readonly id: string; readonly queue?: readonly string[] }
  | { readonly type: "music.step"; readonly delta: 1 | -1 }
  | { readonly type: "music.stopPreview" }
  /** Make this the music pick (`default`, a song id or `channel:<id>`), as the Settings row would. */
  | { readonly type: "music.pick"; readonly value: string }
  /** On a Radio channel: move on to its next song. */
  | { readonly type: "music.next" }
  | { readonly type: "rename.submit" }
  | { readonly type: "rename.cancel" }
  | { readonly type: "draft.choose"; readonly index: number }
  | { readonly type: "draft.reroll" }
  | { readonly type: "reserve.choose"; readonly index: number }
  | { readonly type: "tierup.choose"; readonly index: number }
  | { readonly type: "run.resume" }
  | { readonly type: "run.restart" }
  /** `next: "setup"` leaves the run for the run setup (Adventure selected) instead of the main menu. */
  | { readonly type: "run.quit"; readonly next?: RunExitScreen }
  /** Tutorial-first PLAY: starts the tutorial course at the profile's next unfinished lesson. */
  | { readonly type: "tutorial.continue" }
  /** Leaves the tutorial on purpose for run setup; PLAY no longer leads into it. */
  | { readonly type: "tutorial.skip" }
  | { readonly type: "continue.revive" }
  | { readonly type: "continue.giveUp" }
  | { readonly type: "results.retry" }
  | { readonly type: "results.watchReplay" }
  | { readonly type: "results.descendAgain" }
  | { readonly type: "playground.action"; readonly id: string }
  | { readonly type: "tutorial.action"; readonly command: "tab"; readonly tab: PracticeTab }
  | {
      readonly type: "tutorial.action";
      readonly command:
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
        | "select-annex"
        | "select-enemy"
        | "select-boss";
      readonly lessonId?: string;
    };
