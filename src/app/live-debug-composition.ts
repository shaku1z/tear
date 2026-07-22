import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GamePlayer, GameRun } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen, LegacyTransitionContext } from "./legacy-state-controller";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { UpgradeDefinition } from "../gameplay/upgrades";
import { installLiveDebugHarness } from "./live-debug-harness";
import { auditLiveEffects, createLiveDebugSnapshot } from "./live-debug-snapshot";

export interface LiveDebugCompositionOptions {
  readonly enabled: boolean;
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly lifecycle: Parameters<typeof installLiveDebugHarness>[0]["lifecycle"];
  readonly cinema: Parameters<typeof installLiveDebugHarness>[0]["cinema"] &
    Readonly<{ id: string | undefined; beatId: string | undefined; elapsed: number }>;
  readonly stage: Parameters<typeof installLiveDebugHarness>[0]["stage"];
  readonly width: number;
  readonly height: number;
  readonly startRun: (mode: RunMode, difficulty: RunDifficulty) => void;
  readonly setScreen: (screen: LegacyAppScreen, detail?: LegacyTransitionContext) => void;
  readonly screen: () => LegacyAppScreen;
  readonly setContinueSeconds: (value: number) => void;
  readonly openDraft: () => void;
  readonly openTier: (choices: readonly UpgradeDefinition[]) => void;
  readonly run: () => GameRun;
  readonly player: () => GamePlayer;
  readonly blade: () => GameBlade;
  readonly applyUpgrade: GameRuntimeDependencies["applyUpgrade"];
  readonly enterReplay: (record: object, from: "menu") => void;
  readonly beginRename: () => void;
  readonly renameSnapshot: () => Readonly<{ active: boolean; previous: string }>;
  readonly selectSettingsTab: (tab: string) => void;
  readonly replayStatus: () => object | null;
  readonly applyOptions: (options: object) => void;
  readonly settings: Parameters<typeof createLiveDebugSnapshot>[0]["settings"];
  readonly selected: () => Parameters<typeof createLiveDebugSnapshot>[0]["selected"];
  readonly chapterBrief: () => boolean;
  readonly finale: () => Parameters<typeof createLiveDebugSnapshot>[0]["finale"];
  readonly rewardSnapshot: () => Parameters<typeof createLiveDebugSnapshot>[0]["reward"];
  readonly authoritative: () => Parameters<typeof createLiveDebugSnapshot>[0]["authoritative"];
  readonly startFinale: Parameters<typeof installLiveDebugHarness>[0]["startFinale"];
  readonly severFinale: () => unknown;
}

/** Installs the development-only journey API and its typed diagnostic snapshot. */
export function installLiveGameDebug(options: LiveDebugCompositionOptions): void {
  const d = options.dependencies;
  installLiveDebugHarness({
    enabled: options.enabled, dependencies: d, state: options.state, lifecycle: options.lifecycle,
    cinema: options.cinema, stage: options.stage, width: options.width, height: options.height,
    startRun: options.startRun, setScreen: options.setScreen, screen: options.screen,
    setContinueSeconds: options.setContinueSeconds, openDraft: options.openDraft, openTier: options.openTier,
    applyUpgrade: (upgrade) => { options.applyUpgrade(upgrade, {
      player: options.player(), blade: options.blade(), mods: options.run().mods,
    }); },
    enterReplay: options.enterReplay, beginRename: options.beginRename, applyOptions: options.applyOptions,
    startFinale: options.startFinale, severFinale: options.severFinale,
    selectSettingsTab: options.selectSettingsTab,
    stopRecording: () => { if (d.GHOST.recording()) d.GHOST.stopRec({ debugFinale: true }); },
    install: (api) => { Object.defineProperty(window, "__PANTHEON_TEST", { configurable: true, value: api }); },
    auditEffects: () => auditLiveEffects(d, options.width, options.height),
    snapshot: () => createLiveDebugSnapshot({
      dependencies: d, state: options.state, width: options.width, height: options.height,
      screen: options.screen(), cinema: options.cinema, settings: {
        cinematics: options.settings.cinematics,
        masterVolume: options.settings.masterVolume, musicVolume: options.settings.musicVolume,
        sfxVolume: options.settings.sfxVolume, interfaceVolume: options.settings.interfaceVolume,
        masterMuted: options.settings.masterMuted, musicMuted: options.settings.musicMuted,
        sfxMuted: options.settings.sfxMuted, interfaceMuted: options.settings.interfaceMuted,
      },
      selected: options.selected(), chapterBrief: options.chapterBrief(), finale: options.finale(),
      reward: options.rewardSnapshot(), rename: options.renameSnapshot(),
      replay: options.replayStatus(), authoritative: options.authoritative(),
    }),
  });
}
