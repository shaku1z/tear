/**
 * Semantic screen-control protocol shared by presentation and outward runtime
 * adapters. It names commands only; it has no Canvas, DOM, or renderer
 * dependency, so automation contracts can refer to a control without importing
 * the presentation layer that drew it.
 */
export type LegacyScreenId =
  | "menu" | "setup" | "playing" | "paused" | "draft" | "reserve" | "tierup"
  | "settings" | "continue" | "gameover" | "win" | "replay" | "confirmquit"
  | "shop" | "codex" | "profile" | "achievements" | "leaderboards" | "rename"
  | "pgmenu" | "pglab" | "academy" | "foundry" | "ghostlab" | "botevidence" | "ghostpublication";

export type ScreenAction =
  | { readonly type: "navigate"; readonly to: LegacyScreenId; readonly resetScroll?: boolean; readonly tab?: string }
  | { readonly type: "menu.resumeFinale" }
  | { readonly type: "menu.claimFinale" }
  | { readonly type: "setup.selectMode"; readonly id: string }
  | { readonly type: "setup.selectDifficulty"; readonly id: string }
  | { readonly type: "setup.selectWeapon"; readonly id: string }
  | { readonly type: "setup.selectBoss"; readonly id: string }
  | { readonly type: "setup.start" }
  | { readonly type: "codex.selectTab"; readonly id: string }
  | { readonly type: "codex.selectFilter"; readonly id: string }
  | { readonly type: "codex.cycleSort" }
  | { readonly type: "codex.inspect"; readonly id: string }
  | { readonly type: "shop.buy"; readonly id: string }
  | { readonly type: "profile.selectTab"; readonly id: string }
  | { readonly type: "profile.watchReplay"; readonly id: string }
  | { readonly type: "profile.watchGhostCapsule"; readonly id: string }
  | { readonly type: "profile.compareGhostCapsule"; readonly id: string }
  | { readonly type: "profile.openGhostComparison" }
  | { readonly type: "profile.repairGhostCapsule"; readonly id: string }
  | { readonly type: "profile.openGhostPublication"; readonly id: string }
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
  | { readonly type: "replay.coach.open" }
  | { readonly type: "replay.coach.selectBaseline"; readonly id: string }
  | { readonly type: "replay.coach.practice"; readonly findingId: string }
  | { readonly type: "replay.runDna.toggle" }
  | { readonly type: "replay.studio.toggle" }
  | { readonly type: "replay.studio.createCutList" }
  | { readonly type: "replay.toggleInfo" }
  | { readonly type: "replay.speed"; readonly value: number }
  | { readonly type: "replay.exit" }
  | { readonly type: "settings.selectTab"; readonly id: string }
  | { readonly type: "settings.step"; readonly key: string; readonly delta: number }
  | { readonly type: "settings.toggle"; readonly key: string }
  | { readonly type: "settings.activate"; readonly key: string }
  | { readonly type: "settings.reset" }
  | { readonly type: "academy.retry" }
  | { readonly type: "academy.dagger.advance"; readonly id: string }
  | { readonly type: "academy.dagger.review"; readonly id: string; readonly correctionHash: string; readonly disposition: "accepted" | "rejected" }
  | { readonly type: "academy.record.withdrawModelTraining"; readonly candidateHash: string }
  | { readonly type: "academy.humanCalibration.optIn"; readonly consent: "anonymous-improvement" | "public-training" }
  | { readonly type: "academy.humanCalibration.revoke" }
  | { readonly type: "foundry.refresh" }
  | { readonly type: "foundry.bootstrap"; readonly profileId: string }
  | { readonly type: "foundry.schedule.enable"; readonly scheduleHash: string }
  | { readonly type: "foundry.schedule.disable"; readonly scheduleHash: string }
  /** Ghost Lab only names already-safe normal routes; it never enables lab operations. */
  | { readonly type: "ghostlab.open"; readonly destination: "academy" | "foundry" | "vault" | "watch" | "botevidence" }
  | { readonly type: "ghostlab.watch"; readonly command: "start" | "pause" | "resume" | "stop" }
  | { readonly type: "ghostpublication.grant" }
  | { readonly type: "ghostpublication.runOnce" }
  | { readonly type: "ghostpublication.cancel" }
  | { readonly type: "rename.submit" }
  | { readonly type: "rename.cancel" }
  | { readonly type: "draft.choose"; readonly index: number }
  | { readonly type: "draft.reroll" }
  | { readonly type: "reserve.choose"; readonly index: number }
  | { readonly type: "tierup.choose"; readonly index: number }
  | { readonly type: "run.resume" }
  | { readonly type: "run.restart" }
  | { readonly type: "run.quit" }
  | { readonly type: "continue.revive" }
  | { readonly type: "continue.giveUp" }
  | { readonly type: "results.retry" }
  | { readonly type: "results.watchReplay" }
  | { readonly type: "results.descendAgain" }
  | { readonly type: "playground.action"; readonly id: string };
