import type { WaveClearIntent } from "../gameplay/run/wave-clear-planner";
import type { WavePlanIntent } from "../gameplay/run/wave-planner";

export interface WavePlanIntentPort {
  beginWipe(): void;
  loadStage(index: number): void;
  setStageBanner(name: string, duration: number): void;
  beginCampaignChapter(index: number, priorOutro: unknown): void;
  recordWave(wave: number, marker: "start" | "boss"): void;
  snapshotReplay(slot: number): void;
  prepareWave(wave: number, boss: boolean, deferred: boolean): void;
  activateWave(): void;
  showWaveBanner(): void;
  playWaveSound(): void;
}

export function dispatchWavePlanIntents(intents: readonly WavePlanIntent[], port: WavePlanIntentPort): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "begin-wipe": port.beginWipe(); break;
      case "load-stage": port.loadStage(intent.stageIndex); break;
      case "set-stage-banner": port.setStageBanner(intent.name, intent.duration); break;
      case "begin-campaign-chapter": port.beginCampaignChapter(intent.stageIndex, intent.priorBossOutro); break;
      case "ghost-wave": port.recordWave(intent.wave, intent.marker); break;
      case "ghost-snapshot": port.snapshotReplay(intent.slot); break;
      case "prepare-wave": port.prepareWave(intent.wave, intent.boss, intent.deferred); break;
      case "activate-wave": port.activateWave(); break;
      case "show-wave-banner": port.showWaveBanner(); break;
      case "play-wave-sfx": port.playWaveSound(); break;
    }
  }
}

export function bindWavePlanIntents(port: WavePlanIntentPort): (intents: readonly WavePlanIntent[]) => void {
  return (intents) => { dispatchWavePlanIntents(intents, port); };
}

export interface WaveClearIntentPort {
  clearWave(): void;
  bloom(color: string, strength: number, duration: number): void;
  recordWave(wave: number, marker: "clear"): void;
  profileMax(stat: string, value: number): void;
  profileAdd(stat: string, value: number): void;
  dailyBump(challenge: string, value: number, operation?: "max"): void;
  hordeCleared(seconds: number): void;
  achievementCheck(): void;
  stageDone(): void;
  healPlayer(amount: number): void;
  prepareReward(reward: "boss" | "draft"): void;
  startAdventureFinale(): void;
  winRun(): void;
  releasePointer(): void;
  openTierUp(): void;
  openDraft(): void;
}

export function dispatchWaveClearIntents(intents: readonly WaveClearIntent[], port: WaveClearIntentPort): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "clear-wave-lifecycle": port.clearWave(); break;
      case "backdrop-bloom": port.bloom(intent.color, intent.strength, intent.duration); break;
      case "ghost-wave": port.recordWave(intent.wave, intent.marker); break;
      case "profile-max": port.profileMax(intent.stat, intent.value); break;
      case "profile-add": port.profileAdd(intent.stat, intent.value); break;
      case "daily-bump": port.dailyBump(intent.challenge, intent.value, intent.operation); break;
      case "horde-cleared": port.hordeCleared(intent.waveTime); break;
      case "achievement-check": port.achievementCheck(); break;
      case "stage-done": port.stageDone(); break;
      case "heal-player": port.healPlayer(intent.amount); break;
      case "prepare-reward": port.prepareReward(intent.reward); break;
      case "start-adventure-finale": port.startAdventureFinale(); break;
      case "win-run": port.winRun(); break;
      case "exit-pointer-lock": port.releasePointer(); break;
      case "open-tier-up": port.openTierUp(); break;
      case "open-draft": port.openDraft(); break;
    }
  }
}

export function bindWaveClearIntents(port: WaveClearIntentPort): (intents: readonly WaveClearIntent[]) => void {
  return (intents) => { dispatchWaveClearIntents(intents, port); };
}
