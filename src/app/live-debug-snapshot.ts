import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen } from "./legacy-state-controller";

interface DebugCinemaSnapshot {
  readonly id: string | undefined;
  readonly beatId: string | undefined;
  readonly active: boolean;
  readonly elapsed: number;
}

interface DebugRewardSnapshot {
  readonly rerolls: number;
  readonly choices: readonly unknown[];
  readonly reserveChoices: readonly unknown[];
  readonly reservedChoice: Readonly<{ id: string }> | null;
}

interface DebugRenameSnapshot { readonly active: boolean; readonly previous: string }

interface DebugSettingsSnapshot {
  readonly cinematics: string;
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly interfaceVolume: number;
  readonly masterMuted: boolean;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  readonly interfaceMuted: boolean;
}

export interface LiveDebugSnapshotOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly height: number;
  readonly screen: LegacyAppScreen;
  readonly cinema: DebugCinemaSnapshot;
  readonly settings: DebugSettingsSnapshot;
  readonly selected: Readonly<{ mode: string; difficulty: string; weapon: string; boss: string }>;
  readonly chapterBrief: boolean;
  readonly finale: Readonly<{ phase: string; severed: number; landed: boolean; restoring?: unknown }> | null;
  readonly reward: DebugRewardSnapshot | null;
  readonly rename: DebugRenameSnapshot;
  readonly replay: object | null;
  readonly authoritative: Readonly<{ tick: number; stateHash: string }> | null;
}

export function auditLiveEffects(
  dependencies: GameRuntimeDependencies,
  width: number,
  height: number,
): Readonly<{ high: number; low: number; offscreenAdded: number }> {
  const { FX, GFX } = dependencies;
  const priorLow = GFX.low;
  FX.reset(); FX.setViewRect({ left: 0, top: 0, right: width, bottom: height }); GFX.low = false;
  for (let index = 0; index < 1000; index++) FX.spark(width * 0.5, height * 0.5, 1, 0, "#fff");
  const high = FX.list.length;
  FX.reset(); GFX.low = true; FX.setViewRect({ left: 0, top: 0, right: width, bottom: height });
  for (let index = 0; index < 1000; index++) FX.spark(width * 0.5, height * 0.5, 1, 0, "#fff");
  const low = FX.list.length, before = FX.list.length;
  for (let index = 0; index < 50; index++) FX.spark(width * 4, height * 4, 1, 0, "#fff");
  const offscreenAdded = FX.list.length - before;
  FX.reset(); GFX.low = priorLow;
  return Object.freeze({ high, low, offscreenAdded });
}

export function createLiveDebugSnapshot(options: LiveDebugSnapshotOptions): object {
  const { dependencies: d, state } = options;
  const input = document.getElementById("nameInput");
  const nameValue = input instanceof HTMLInputElement ? input.value.trim() : "";
  const renameValid = nameValue.length >= 3 && nameValue.length <= 16 && /^[a-zA-Z0-9 _-]+$/.test(nameValue);
  const run = state.run(), player = state.player(), blade = state.blade(), reward = options.reward, rename = options.rename;
  return {
    game: options.screen, cinema: options.cinema.id, beat: options.cinema.beatId,
    active: options.cinema.active, cinemaElapsed: options.cinema.elapsed, touch: d.Input.touchActive(),
    pad: typeof d.PAD === "undefined" ? null : { connected: d.PAD.connected, active: d.PAD.active,
      movingRight: d.Input.held.has("KeyD"), aiming: Boolean(d.Input.stickAim) },
    audio: { ready: Boolean(d.SFX.ctx), running: d.SFX.ctx?.state === "running", filter: Boolean(d.SFX.musicFilter),
      duck: d.SFX._musicDuck, voidMix: d.SFX._voidMix },
    mode: run?.mode, difficulty: run?.diff, weapon: run?.weaponId,
    chapterBrief: options.chapterBrief,
    attract: { ready: d.Attract.ready, biome: d.Attract.ready ? d.Attract.stage().name : null },
    setup: options.selected,
    draft: run && reward ? { rerolls: reward.rerolls, choiceCount: reward.choices.length,
      reserveCount: reward.reserveChoices.length, reservedId: reward.reservedChoice?.id } : null,
    replay: options.replay,
    rename: rename.active ? { value: nameValue, length: nameValue.length, valid: renameValid, returnTo: rename.previous } : null,
    reducedMotion: d.A11Y.reducedMotion, highContrast: d.A11Y.highContrast, lowEffects: d.GFX.low,
    settings: options.settings, playerHp: player?.hp, enemyCount: state.enemies().length,
    bladeAim: blade ? { x: blade.aimX, y: blade.aimY, reticleX: blade.reticleX, reticleY: blade.reticleY } : null,
    authoritative: options.authoritative,
    finale: options.finale && { phase: options.finale.phase, severed: options.finale.severed,
      landed: options.finale.landed, restoring: Boolean(options.finale.restoring) },
  };
}
