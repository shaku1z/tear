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
import { achievementToastHeld } from "./achievement-toast-controller";
import { controlsKeepOut, type KeepOutArea } from "../../presentation/demo-keep-out";
import { drawRotateGate } from "../../presentation/rotate-gate";
import type { StageBeat } from "../../gameplay/stage-beat";
import { createRunOverlay, type RunOverlayFrame, type RunOverlayPainters } from "../world/run-overlay";

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
  beatBanner(
    context: CanvasRenderingContext2D,
    model: Readonly<{ text: string; mark: string | null; line?: string; color: string; alpha: number; reveal: number }>,
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
  readonly stageBeat: () => StageBeat | null;
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
  const overlay = createRunOverlay("player");
  const overlayFrame = (rectangle: ScreenRectangle): RunOverlayFrame => ({
    context,
    screen: rectangle,
    playing: state.screen() === "playing",
    interfaceShown: services.capturePolicy().ui === "include",
    biome: state.biomeMode(),
    cinema: services.cinema,
    parryFlash: state.flash(),
    stageBeat: state.stageBeat(),
    waveBannerSeconds: state.bannerSeconds(),
    stageBannerSeconds: services.stage.bannerSeconds,
    rankPopup: state.rankPopup(),
    touchControls: services.touchActive() && !services.controller()?.active,
  });
  const overlayPainters = (camera: WorldCamera | undefined): RunOverlayPainters => ({
    backdropPost: () => {
      if (camera !== undefined) services.backdropPost(context, services.stage.current, camera);
    },
    hud: services.drawHud,
    beatBanner: (model) => {
      ui.beatBanner(context, model);
    },
    scene: (screen) => {
      services.cinema.draw(context, ui, screen, services.reducedMotion(), (text) =>
        cinematicPromptForDevice(text, services.input.mode, services.confirmGlyph()),
      );
    },
    touchControls: services.drawTouchControls,
    waveBanner: services.drawWaveBanner,
    stageBanner: services.drawStageBanner,
    reticle: services.drawReticle,
    font: (size, bold) => ui.font(size, bold),
    trickColor: services.trickColor,
  });
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
      background: (playLike) =>
        playLike
          ? overlay.background({
              biome: state.biomeMode(),
              stageColor: services.stageBackground(services.stage.current),
              enemies: state.enemies(),
              flashScale: services.flashScale(),
              blend: services.blendColor,
            })
          : "#fff",
      setTheme: services.setTheme,
      renderWorldLayers: (rectangle) => {
        const camera = services.renderWorld();
        overlay.draw(overlayFrame(rectangle), overlayPainters(camera));
        ui.ink = "#000";
      },
      renderOverlayBackdrop: () => {
        ui.dim(context, services.width, services.height, ui.t.alpha.overlay);
      },
      renderReticle: () => {
        overlay.drawReticle(overlayFrame(host.screenRectangle()), overlayPainters(undefined));
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
          const held = achievementToastHeld({ name: state.screen(), cinematic: services.cinema.active });
          services.drawAchievementToast(state.deltaSeconds(), held);
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
        if (__TEAR_MOBILE__ && services.capturePolicy().ui === "include")
          drawRotateGate(ui, context, host.screenRectangle(), state.timeSeconds());
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
          presentationBusy: services.cinema.active,
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
