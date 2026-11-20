import { TearWipe, type TearWipeOptions } from "../../presentation/tear-wipe";
import { createWorldRenderers, type WorldRenderContext, type WorldRendererRegistry } from "../../presentation/world";
import type { ScreenRectangle } from "../../presentation/render-pipeline";
import type { WorldCamera } from "../../presentation/world/world-frame";
import type { CinematicUiPort } from "../../presentation/cinematics";
import type { ButtonLayerUiPort, CanvasUiButton } from "../../presentation/screens/button-layer";
import { createUiConfirmArming, type InteractiveUiButton, type UiRuntimeInput } from "./ui-runtime-controller";
import { NO_POINTER } from "../../domain/pointer-ownership";
import { shouldDrawCanvasCursor } from "../../presentation/cursor-contract";
import { controlHintText, domChromeVisibility } from "../../presentation/dom-chrome-policy";
import { cinematicPromptForDevice } from "../../presentation/cinematic-prompts";
import { createLivePresentationHost, type LivePresentationHost } from "./presentation-host";
import { isSheetScreen, screenDensity } from "../../domain/screen-catalog";
import { controlsKeepOut, type KeepOutArea } from "../../presentation/demo-keep-out";

export interface LivePresentationSurface {
  readonly wipe: TearWipe;
  readonly world: WorldRendererRegistry;
}

/** Owns device-space transition effects and the legacy draw-only renderer registry. */
export function createLivePresentationSurface(
  options: Readonly<{
    wipe: TearWipeOptions;
    world: WorldRenderContext;
  }>,
): LivePresentationSurface {
  return Object.freeze({
    wipe: new TearWipe(options.wipe),
    world: createWorldRenderers(options.world),
  });
}

interface FlashingEnemy {
  readonly flash: number;
  readonly whiteFlash?: number;
}
interface BossBeat {
  readonly text: string;
  readonly color: string;
  readonly t: number;
  readonly dur: number;
}
interface StagePresentationState<Stage extends Readonly<{ readonly bg: string }>> {
  readonly current: Stage;
  readonly bannerSeconds: number;
}
interface CinematicPresentationState {
  readonly active: boolean;
  readonly hideHud: boolean;
  readonly playerMode?: string;
  /** The running script (a chapter is `kind: "chapter"`) and beat (`hud` returns the HUD early). */
  readonly script?: Readonly<{ kind?: string }> | null;
  readonly beat?: Readonly<{ hud?: boolean }> | undefined;
  draw(
    context: CanvasRenderingContext2D,
    ui: PresentationUi,
    rectangle: ScreenRectangle,
    reducedMotion: boolean,
    prompt?: (text: string) => string,
  ): void;
}
interface PresentationUi extends ButtonLayerUiPort, CinematicUiPort {
  ink: string;
  /** Applies the phone density floors only to screens with a compact composition. */
  useCompactLayout(ready: boolean, phoneOnly?: boolean): void;
  readonly t: CinematicUiPort["t"] &
    Readonly<{ color: Readonly<{ paper: string; accent: string }>; alpha: Readonly<{ overlay: number }> }>;
  dim(context: CanvasRenderingContext2D, width: number, height: number, alpha?: number): void;
  font(size: number, bold?: boolean): string;
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }>;
  sheet(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, hue?: string): void;
  bossPhaseBanner(
    context: CanvasRenderingContext2D,
    model: Readonly<{ text: string; color: string; alpha: number }>,
  ): void;
  cursor(context: CanvasRenderingContext2D, x: number, y: number): void;
  badge(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    alignment: CanvasTextAlign,
    size: number,
  ): void;
  rotateGate(context: CanvasRenderingContext2D, rectangle: ScreenRectangle, seconds: number): void;
}

export interface LiveCaptureLayerPolicy {
  readonly ui: "include" | "exclude";
  readonly debug: "include" | "exclude";
  readonly pointerLock: "include" | "exclude";
  readonly actors: "include" | "exclude";
}

type PresentationControl = InteractiveUiButton & CanvasUiButton;

export interface LivePresentationFrameState<Screen extends string> {
  readonly screen: () => Screen;
  readonly previousScreen: () => Screen | undefined;
  readonly setPreviousScreen: (screen: Screen) => void;
  readonly deltaSeconds: () => number;
  readonly enterSeconds: () => number;
  readonly setEnterSeconds: (value: number) => void;
  readonly enterAmount: () => number;
  readonly setEnterAmount: (value: number) => void;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
  /** Where the player was on the current screen, when the last screen change returned to it. */
  readonly arrival: () => Readonly<{ focus: number; scroll: number }> | undefined;
  readonly focus: () => number;
  readonly setFocus: (value: number) => void;
  readonly controls: () => PresentationControl[];
  readonly resetControls: () => void;
  readonly biomeMode: () => boolean;
  readonly enemies: () => readonly FlashingEnemy[];
  readonly flash: () => number;
  readonly bossBeat: () => BossBeat | null;
  readonly bossIntroActive: () => boolean;
  readonly bannerSeconds: () => number;
  readonly rankPopup: () => Readonly<{ seconds: number; text: string; multiplier: number }>;
  readonly timeSeconds: () => number;
}

export interface LivePresentationFrameServices<Screen extends string, Stage extends Readonly<{ readonly bg: string }>> {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly safeTop: () => number;
  readonly resizeIfNeeded: () => void;
  readonly input: UiRuntimeInput;
  readonly ui: PresentationUi;
  readonly stage: StagePresentationState<Stage>;
  readonly cinema: CinematicPresentationState;
  readonly wipe: TearWipe;
  readonly reducedMotion: () => boolean;
  readonly flashScale: () => number;
  readonly capturePolicy: () => LiveCaptureLayerPolicy;
  readonly touchActive: () => boolean;
  readonly controller: () => Readonly<{ active: boolean; toastSeconds: number; toastText: string }> | null;
  /** Controller confirm glyph in the connected pad's family (A / ✕). */
  readonly confirmGlyph: () => string;
  readonly pointerLocked: () => boolean;
  readonly lockHint: HTMLElement | null;
  readonly inputHint: HTMLElement | null;
  readonly fullscreenButton: HTMLElement | null;
  readonly fullscreenAvailable: () => boolean;
  /** Current run age and the profile's completed runs, for the control legend. */
  readonly controlHintContext: () => Readonly<{ runSeconds: number; completedRuns: number }>;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly ease: (amount: number) => number;
  readonly blendColor: (from: string, to: string, amount: number) => string;
  readonly setTheme: (background: string, playLike: boolean) => void;
  readonly themeInk: () => string;
  readonly backdropPost: (context: CanvasRenderingContext2D, stage: Stage, camera: WorldCamera) => void;
  /** The colour the stage paints behind play: a painted stage's paper, else the stage colour. */
  readonly stageBackground: (stage: Stage) => string;
  readonly renderWorld: () => WorldCamera;
  readonly drawHud: () => void;
  readonly drawBossIntro: () => void;
  readonly drawTouchControls: () => void;
  readonly drawWaveBanner: () => void;
  readonly drawStageBanner: () => void;
  readonly drawReticle: () => void;
  readonly drawAchievementToast: (deltaSeconds: number, held: boolean) => void;
  /** Draws the live menu demo; its play layer stays out of `keepOut`. */
  readonly drawMenuAttract: (context: CanvasRenderingContext2D, keepOut: KeepOutArea | undefined) => void;
  readonly screenHue: (screen: Screen) => string | undefined;
  readonly renderScreen: (screen: Screen) => void;
  readonly isMenuScreen: (screen: Screen) => boolean;
  readonly playInterfaceSound: () => void;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly chooseTier: (index: number) => void;
  readonly rerollDraft: () => void;
  readonly hoverAnimation: Record<string, number>;
  readonly trickColor: (multiplier: number) => string;
}

/** Writes an inline display value only when it differs, so an unchanged frame performs no DOM write. */
function setDisplay(element: HTMLElement | null, display: string): void {
  if (element !== null && element.style.display !== display) element.style.display = display;
}

/** Composes the complete canvas frame and non-gameplay input host from narrow live ports. */
export function createLivePresentationFrameHost<Screen extends string, Stage extends Readonly<{ readonly bg: string }>>(
  state: LivePresentationFrameState<Screen>,
  services: LivePresentationFrameServices<Screen, Stage>,
): LivePresentationHost {
  const { context, ui } = services;
  const confirmArming = createUiConfirmArming();
  const handoff = createChapterHandoff();
  // Where the last frame's controls were, so the next frame's menu demo keeps out of them.
  let controlsArea: Readonly<{ screen: Screen; area: KeepOutArea | undefined }> | undefined;
  return createLivePresentationHost<Screen>({
    dimensions: { width: services.width, height: services.height, overscan: services.overscan },
    framePorts: (host) => ({
      canvas: services.canvas,
      context,
      logicalWidth: services.width,
      logicalHeight: services.height,
      overscan: services.overscan,
      screen: state.screen,
      previousScreen: state.previousScreen,
      setPreviousScreen: state.setPreviousScreen,
      resizeIfNeeded: services.resizeIfNeeded,
      screenRectangle: host.screenRectangle,
      touchActive: services.touchActive,
      resetControls: state.resetControls,
      applyScreenDensity: (screen) => {
        const density = screenDensity(screen);
        ui.useCompactLayout(density === "compact", density === "phone");
      },
      background: (playLike) => {
        let color = playLike && state.biomeMode() ? services.stageBackground(services.stage.current) : "#fff";
        const flashing = playLike ? state.enemies().find((enemy) => (enemy.whiteFlash ?? 0) > 0) : undefined;
        if (flashing?.whiteFlash !== undefined)
          color = services.blendColor(color, "#ffffff", flashing.whiteFlash * services.flashScale());
        return color;
      },
      setTheme: services.setTheme,
      renderWorldLayers: (rectangle) => {
        const camera = services.renderWorld();
        if (state.biomeMode()) services.backdropPost(context, services.stage.current, camera);
        if (state.flash() > 0) {
          context.save();
          context.globalCompositeOperation = "difference";
          context.globalAlpha = services.clamp(state.flash(), 0, 1);
          context.fillStyle = "#fff";
          context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
          context.restore();
        }
        // The HUD belongs to live play; run overlays (pause, draft, results) carry their own summary.
        handoff.observe(services.cinema.active && services.cinema.script?.kind === "chapter", state.bannerSeconds());
        // The HUD returns on a chapter's READY beat (before control) and stays out of
        // the boss arrival card, whose letterbox would otherwise sit over it.
        const hudBack = !services.cinema.active || !services.cinema.hideHud || services.cinema.beat?.hud === true;
        if (
          services.capturePolicy().ui === "include" &&
          hudBack &&
          !state.bossIntroActive() &&
          state.screen() === "playing"
        )
          services.drawHud();
        const beat = state.bossBeat();
        if (
          services.capturePolicy().ui === "include" &&
          beat !== null &&
          state.screen() === "playing" &&
          !state.bossIntroActive() &&
          !services.cinema.active
        ) {
          const progress = services.clamp(beat.t / beat.dur, 0, 1);
          ui.bossPhaseBanner(context, {
            text: beat.text,
            color: beat.color,
            alpha: Math.min(1, (1 - progress) * 6, progress * 5),
          });
        }
        if (services.capturePolicy().ui === "include" && state.bossIntroActive() && state.screen() === "playing")
          services.drawBossIntro();
        if (services.capturePolicy().ui === "include" && services.cinema.active)
          services.cinema.draw(context, ui, host.screenRectangle(), services.reducedMotion(), (text) =>
            cinematicPromptForDevice(text, services.input.mode, services.confirmGlyph()),
          );
        if (
          services.capturePolicy().ui === "include" &&
          services.touchActive() &&
          state.screen() === "playing" &&
          (!services.cinema.active || services.cinema.playerMode === "finalBlade") &&
          !services.controller()?.active
        ) {
          services.drawTouchControls();
        }
        // The stage banner owns the announcement band while it shows (no duplicate WAVE title).
        // The chapter that hands off to a wave already announced it; its WAVE banner is not repeated.
        if (
          services.capturePolicy().ui === "include" &&
          state.screen() === "playing" &&
          state.bannerSeconds() > 0 &&
          services.stage.bannerSeconds <= 0 &&
          !services.cinema.active &&
          !handoff.muted()
        )
          services.drawWaveBanner();
        if (
          services.capturePolicy().ui === "include" &&
          state.screen() === "playing" &&
          services.stage.bannerSeconds > 0 &&
          !services.cinema.active
        )
          services.drawStageBanner();
        const rank = state.rankPopup();
        if (services.capturePolicy().ui === "include" && state.screen() === "playing" && rank.seconds > 0) {
          context.save();
          context.globalAlpha = services.clamp(rank.seconds, 0, 1);
          context.fillStyle = services.trickColor(rank.multiplier);
          context.textAlign = "center";
          context.font = ui.font(42 + (1 - services.clamp(rank.seconds, 0, 1)) * 18, true);
          context.fillText(rank.text, services.width / 2, services.height / 2 - 140);
          context.restore();
        }
        ui.ink = "#000";
      },
      renderOverlayBackdrop: () => {
        ui.dim(context, services.width, services.height, ui.t.alpha.overlay);
      },
      renderReticle: () => {
        if (
          services.capturePolicy().ui === "include" &&
          (!services.cinema.active ||
            services.cinema.playerMode === "landing" ||
            services.cinema.playerMode === "finalBlade")
        ) {
          services.drawReticle();
        }
      },
      isMenuScreen: services.isMenuScreen,
      enterSeconds: state.enterSeconds,
      setEnterSeconds: state.setEnterSeconds,
      enterAmount: state.enterAmount,
      setEnterAmount: state.setEnterAmount,
      ease: services.ease,
      setScroll: state.setScroll,
      arrival: state.arrival,
      resetScroll: () => {
        state.setScroll(0);
      },
      renderMenuBackdrop: (rectangle, screen) => {
        // A sheet covers the demo; an open screen (the main menu, rename) keeps it out of its controls.
        const open = !isSheetScreen(screen) && controlsArea?.screen === screen;
        services.drawMenuAttract(context, open ? controlsArea?.area : undefined);
        if (screen === "menu") return;
        context.fillStyle = ui.t.color.paper;
        context.globalAlpha = 0.58;
        context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
        context.globalAlpha = 1;
        const vignette = context.createRadialGradient(
          services.width / 2,
          services.height / 2,
          services.height * 0.42,
          services.width / 2,
          services.height / 2,
          services.width * 0.62,
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(0,0,0,0.14)");
        context.fillStyle = vignette;
        context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
        if (screen !== "rename") {
          const sheet = ui.sheetRect();
          ui.sheet(context, sheet.x, sheet.y, sheet.w, sheet.h, services.screenHue(screen));
        }
      },
      renderScreen: (screen) => {
        if (services.capturePolicy().ui === "include") services.renderScreen(screen);
      },
      drawButtons: () => {
        const shown = services.capturePolicy().ui === "include";
        controlsArea = shown ? { screen: state.screen(), area: controlsKeepOut(state.controls()) } : undefined;
        if (shown) host.drawButtons();
      },
      drawPostLayers: () => {
        if (services.capturePolicy().ui === "include") {
          services.wipe.draw(state.deltaSeconds());
          services.drawAchievementToast(state.deltaSeconds(), services.cinema.active || state.bossIntroActive());
        }
      },
      drawCursor: () => {
        const pointer = services.input.pointer();
        if (pointer !== null) ui.cursor(context, pointer.x, pointer.y);
      },
      showCanvasCursor: () =>
        services.capturePolicy().ui === "include" &&
        shouldDrawCanvasCursor(state.screen(), services.input.mode) &&
        services.input.pointer() !== null,
      drawControllerToast: () => {
        if (services.capturePolicy().ui !== "include") return;
        const controller = services.controller();
        if (controller === null || controller.toastSeconds <= 0 || !controller.toastText) return;
        context.save();
        context.globalAlpha = services.clamp(controller.toastSeconds / 0.6, 0, 1);
        ui.badge(
          context,
          `◎ ${controller.toastText}`,
          services.width / 2,
          34 + services.safeTop(),
          ui.t.color.accent,
          "center",
          13,
        );
        context.restore();
        context.globalAlpha = 1;
      },
      drawRotationGate: () => {
        if (services.capturePolicy().ui === "include")
          ui.rotateGate(context, host.screenRectangle(), state.timeSeconds());
      },
      entryFocus: host.entryFocus,
      setFocus: state.setFocus,
      updateDomHints: (screen) => {
        const capture = services.capturePolicy(),
          run = services.controlHintContext(),
          fullscreenAvailable = services.fullscreenAvailable();
        const visible = domChromeVisibility({
          screen,
          uiIncluded: capture.ui === "include",
          pointerLockIncluded: capture.pointerLock === "include",
          touch: services.touchActive(),
          fullscreenAvailable,
          inputMode: services.input.mode,
          pointerLocked: services.pointerLocked(),
          runSeconds: run.runSeconds,
          completedRuns: run.completedRuns,
          presentationBusy: services.cinema.active || state.bossIntroActive(),
        });
        setDisplay(services.lockHint, visible.lockHint ? "block" : "none");
        if (visible.controlHint && services.inputHint !== null) {
          const text = controlHintText(fullscreenAvailable);
          if (services.inputHint.textContent !== text) services.inputHint.textContent = text;
        }
        setDisplay(services.inputHint, visible.controlHint ? "block" : "none");
        // "" hands display back to the stylesheet, which also hides it on coarse pointers.
        setDisplay(services.fullscreenButton, visible.fullscreen ? "" : "none");
      },
    }),
    uiPorts: () => ({
      screen: state.screen,
      buttons: state.controls,
      focus: state.focus,
      setFocus: state.setFocus,
      scroll: state.scroll,
      setScroll: state.setScroll,
      input: services.input,
      now: state.timeSeconds,
      arming: confirmArming,
      playInterfaceSound: services.playInterfaceSound,
      chooseUpgrade: services.chooseUpgrade,
      chooseReserve: services.chooseReserve,
      chooseTier: services.chooseTier,
      rerollDraft: services.rerollDraft,
    }),
    buttonLayer: () => ({
      context,
      buttons: state.controls(),
      focus: state.focus(),
      pointerX: (services.input.pointer() ?? NO_POINTER).x,
      pointerY: (services.input.pointer() ?? NO_POINTER).y,
      deltaSeconds: state.deltaSeconds(),
      enterSeconds: state.enterSeconds(),
      hoverAnimation: services.hoverAnimation,
      ui,
      entranceEase: services.ease,
      focusVisible: services.input.mode === "keyboard" || services.input.mode === "gamepad",
    }),
  });
}

/**
 * Tracks the hand-off from a chapter cinematic to its first wave: the wave banner that
 * activation raises in the same tick is muted until it has run out.
 */
function createChapterHandoff() {
  let chapterActive = false;
  let muted = false;
  return Object.freeze({
    observe(active: boolean, bannerSeconds: number): void {
      if (chapterActive && !active) muted = bannerSeconds > 0;
      else if (bannerSeconds <= 0) muted = false;
      chapterActive = active;
    },
    muted: () => muted,
  });
}
