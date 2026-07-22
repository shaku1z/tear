import type { ChapterIntent, CampaignChapterState } from "../gameplay/campaign/chapter-controller";
import type { FinaleIntent } from "../gameplay/campaign/finale-controller";

export interface ChapterIntentPorts {
  activatePreparedWave(): void;
  setChapterState(state: CampaignChapterState, page?: number): void;
  clearProjectiles(): void;
  musicDuck(amount: number, duration: number): void;
  resetStageBanner(): void;
  sound(): void;
}

export function dispatchChapterIntents(intents: readonly ChapterIntent[], ports: ChapterIntentPorts): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "activate-prepared-wave": ports.activatePreparedWave(); break;
      case "chapter-state": ports.setChapterState(intent.state, intent.page); break;
      case "clear-projectiles": ports.clearProjectiles(); break;
      case "music-duck": ports.musicDuck(intent.amount, intent.duration); break;
      case "reset-stage-banner": ports.resetStageBanner(); break;
      case "sound": ports.sound(); break;
    }
  }
}

export interface FinaleIntentPorts {
  beginLifecycle(): void;
  clearCombat(): void;
  freezeVoid(): void;
  worldZoom(value: number): void;
  finalBlade(active: boolean, restoredTrail: boolean): void;
  ring(x: number, y: number, radius: number, color: string): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  flash(amount: number): void;
  shake(amount: number): void;
  vibrate(pattern: readonly number[]): void;
  sound(cue: "final-cut" | "final-relic" | "final-restore" | "final-silence", index: number): void;
  restoreStageZero(): void;
  restorePlayer(xMin: number, xMax: number, yMax: number, vy: number): void;
  voidMix(amount: number, duration: number): void;
  musicDuck(amount: number, duration: number): void;
  win(campaign: boolean): void;
}

export function dispatchFinaleIntents(intents: readonly FinaleIntent[], ports: FinaleIntentPorts): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "begin-finale-lifecycle": ports.beginLifecycle(); break;
      case "clear-combat": ports.clearCombat(); break;
      case "freeze-void": ports.freezeVoid(); break;
      case "world-zoom": ports.worldZoom(intent.value); break;
      case "final-blade": ports.finalBlade(intent.active, intent.restoredTrail === true); break;
      case "ring": ports.ring(intent.x, intent.y, intent.radius, intent.color); break;
      case "burst": ports.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color); break;
      case "flash": ports.flash(intent.amount); break;
      case "shake": ports.shake(intent.amount); break;
      case "vibrate": ports.vibrate(intent.pattern); break;
      case "sound": ports.sound(intent.cue, intent.index ?? 0); break;
      case "restore-stage-zero": ports.restoreStageZero(); break;
      case "set-player-restoration": ports.restorePlayer(intent.xMin, intent.xMax, intent.yMax, intent.vy); break;
      case "void-mix": ports.voidMix(intent.amount, intent.duration); break;
      case "music-duck": ports.musicDuck(intent.amount, intent.duration); break;
      case "win-run": ports.win(intent.campaign); break;
    }
  }
}
