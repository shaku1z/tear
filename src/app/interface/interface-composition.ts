import type { TearWipe } from "../../presentation/tear-wipe";
import type { LegacyWorldRendererRegistry } from "../../presentation/world";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { RunDifficulty, RunMode } from "../../gameplay/run/session";
import { createLivePresentationFrameHost, createLivePresentationSurface,
  type LivePresentationFrameServices, type LivePresentationFrameState } from "./presentation-composition";
import { createLiveScreenPresentationComposition, type LiveScreenPresentationComposition,
  type LiveScreenPresentationOptions } from "./screen-presentation-composition";
import { createLiveWorldPresentationAdapters, type LiveWorldPresentationAdapters,
  type WorldPresentationServices, type WorldPresentationState } from "../world/world-presentation-adapters";
import type { LivePresentationHost } from "./presentation-host";
import { AchievementToastController } from "./achievement-toast-controller";
import { TouchOnboardingController } from "../training/touch-onboarding-controller";
import { createLiveInterfacePresentationCapture, type LivePresentationCaptureSource } from "./presentation-capture";
import { isWorldScreen } from "../../presentation/render-pipeline";

// Research and diagnostic surface controllers are deliberately not re-exported
// here: composition injects them only into engineering builds
// (see ../engineering/engineering-surfaces-contract.ts).

type SurfaceOptions = Parameters<typeof createLivePresentationSurface>[0];
type SurfaceWorld = Omit<SurfaceOptions["world"], "screen">;
type ScreenOptions = Omit<LiveScreenPresentationOptions, "library" | "settings"> & Readonly<{
  library: Omit<LiveScreenPresentationOptions["library"], "stepTab">;
  settings: Omit<LiveScreenPresentationOptions["settings"], "stepTab">;
}>;
type FrameServices = Omit<LivePresentationFrameServices<LegacyAppScreen,
  WorldPresentationServices["stage"]["current"]>, "wipe" | "renderWorld" | "drawHud" |
  "drawBossIntro" | "drawTouchControls" | "drawWaveBanner" | "drawStageBanner" |
  "drawReticle" | "drawAchievementToast" | "chooseUpgrade" | "chooseReserve" | "chooseTier" | "rerollDraft" | "screenHue" | "capturePolicy">;
type WorldServices = Omit<WorldPresentationServices, "screenRectangle" | "world" |
  "achievementToast" | "touchOnboarding" | "capturePolicy">;

const SCREEN_HUES: Partial<Record<LegacyAppScreen, string>> = Object.freeze({
  shop: "#e0a326", achievements: "#13c4d6", leaderboards: "#e0a326",
  profile: "#2f9e6b", codex: "#3a3d4d", settings: "#3a3d4d",
});

export const isRunModeSelection = (value: string): value is RunMode =>
  ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"].includes(value);
export const isRunDifficultySelection = (value: string): value is RunDifficulty =>
  ["easy", "normal", "hard", "extreme", "onehit"].includes(value);

export interface LiveInterfaceCompositionOptions {
  readonly wipe: SurfaceOptions["wipe"];
  readonly worldSurface: SurfaceWorld;
  readonly screens: ScreenOptions;
  readonly frameState: LivePresentationFrameState<LegacyAppScreen>;
  readonly frameServices: FrameServices;
  readonly worldState: WorldPresentationState;
  readonly worldServices: WorldServices;
  readonly onBiomeTransition: (begin: () => void) => void;
}

export interface LiveInterfaceComposition {
  readonly renderPresentationFrame: (deltaSeconds: number) => void;
  readonly capture: ReturnType<typeof createLiveInterfacePresentationCapture>;
  readonly wipe: TearWipe;
  readonly world: LegacyWorldRendererRegistry;
  readonly screens: LiveScreenPresentationComposition;
  readonly frame: LivePresentationHost;
  readonly worldAdapters: LiveWorldPresentationAdapters;
}

/** Owns the lazy cycles between screen, frame, world, and transition presentation hosts. */
export function createLiveInterfaceComposition(
  options: LiveInterfaceCompositionOptions, captureSource?: LivePresentationCaptureSource,
): LiveInterfaceComposition {
  const capture = createLiveInterfacePresentationCapture(captureSource, options.worldSurface, options.frameServices);
  const surface = createLivePresentationSurface({
    wipe: options.wipe,
    world: { ...options.worldSurface,
      // Object spread snapshots getters; viewport-dependent HUD layout must stay live.
      get cssPerLogicalPixel() { return options.worldSurface.cssPerLogicalPixel ?? 1; },
      get safe() { return options.worldSurface.safe; },
      get screen() { return frame.screenRectangle(); } },
  });
  options.onBiomeTransition(() => { surface.wipe.begin(); });

  const screens = createLiveScreenPresentationComposition({
    ...options.screens,
    library: { ...options.screens.library,
      stepTab: (tabs, current, changed) => frame.stepTab(tabs, current, changed) },
    settings: { ...options.screens.settings,
      stepTab: (tabs, current, changed) => frame.stepTab(tabs, current, changed) },
  });
  const frame = createLivePresentationFrameHost(options.frameState, {
    ...options.frameServices, capturePolicy: capture.policy, wipe: surface.wipe, screenHue: (screen) => SCREEN_HUES[screen],
    renderWorld: () => worldAdapters.renderWorld(), drawHud: () => { worldAdapters.drawHud(); },
    drawBossIntro: () => { worldAdapters.drawBossIntro(); },
    drawTouchControls: () => { worldAdapters.drawTouchControls(); },
    drawWaveBanner: () => { worldAdapters.drawWaveBanner(); },
    drawStageBanner: () => { worldAdapters.drawStageBanner(); },
    drawReticle: () => { worldAdapters.drawReticle(); },
    drawAchievementToast: (deltaSeconds) => { worldAdapters.drawAchievementToast(deltaSeconds); },
    chooseUpgrade: screens.chooseUpgrade, chooseReserve: screens.chooseReserve, chooseTier: screens.chooseTier, rerollDraft: screens.rerollDraft,
  });
  const worldAdapters = createLiveWorldPresentationAdapters(options.worldState, {
    ...options.worldServices, capturePolicy: capture.policy, screenRectangle: frame.screenRectangle, world: surface.world,
    achievementToast: new AchievementToastController(options.worldServices.ease),
    touchOnboarding: new TouchOnboardingController(),
  });
  return Object.freeze({ capture, wipe: surface.wipe, world: surface.world, screens, frame, worldAdapters,
    renderPresentationFrame(deltaSeconds: number): void {
      const hudVisible = isWorldScreen(options.frameState.screen()) && !options.frameServices.cinema.hideHud && Boolean(options.worldState.player());
      if (hudVisible) worldAdapters.advanceHudFrame(deltaSeconds);
      frame.render();
      if (hudVisible) worldAdapters.completeHudFrame(deltaSeconds);
    },
  });
}
