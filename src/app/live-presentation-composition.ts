import { TearWipe, type TearWipeOptions } from "../presentation/tear-wipe";
import { createLegacyWorldRenderers, type LegacyWorldRenderContext,
  type LegacyWorldRendererRegistry } from "../presentation/world";
import type { ScreenRectangle } from "../presentation/render-pipeline";
import type { WorldCamera } from "../presentation/world/legacy-world-frame";
import type { CinematicUiPort } from "../presentation/cinematics";
import type { ButtonLayerUiPort, CanvasUiButton } from "../presentation/screens/button-layer";
import type { InteractiveUiButton, UiRuntimeInput } from "./ui-runtime-controller";
import { createLivePresentationHost, type LivePresentationHost } from "./live-presentation-host";

export interface LivePresentationSurface {
  readonly wipe: TearWipe;
  readonly world: LegacyWorldRendererRegistry;
}

/** Owns device-space transition effects and the legacy draw-only renderer registry. */
export function createLivePresentationSurface(options: Readonly<{
  wipe: TearWipeOptions;
  world: LegacyWorldRenderContext;
}>): LivePresentationSurface {
  return Object.freeze({
    wipe: new TearWipe(options.wipe),
    world: createLegacyWorldRenderers(options.world),
  });
}

interface FlashingEnemy { readonly flash: number; readonly whiteFlash?: number }
interface BossBeat { readonly text: string; readonly color: string; readonly t: number; readonly dur: number }
interface StagePresentationState<Stage extends Readonly<{ readonly bg: string }>> {
  readonly current: Stage;
  readonly bannerSeconds: number;
}
interface CinematicPresentationState {
  readonly active: boolean;
  readonly hideHud: boolean;
  readonly playerMode?: string;
  draw(context: CanvasRenderingContext2D, ui: PresentationUi, rectangle: ScreenRectangle, reducedMotion: boolean): void;
}
interface PresentationUi extends ButtonLayerUiPort, CinematicUiPort {
  ink: string;
  readonly t: CinematicUiPort["t"] & Readonly<{ color: Readonly<{ paper: string; accent: string }> }>;
  font(size: number, bold?: boolean): string;
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }>;
  sheet(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, hue?: string): void;
  bossPhaseBanner(context: CanvasRenderingContext2D, model: Readonly<{ text: string; color: string; alpha: number }>): void;
  cursor(context: CanvasRenderingContext2D, x: number, y: number): void;
  badge(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string,
    alignment: CanvasTextAlign, size: number): void;
  rotateGate(context: CanvasRenderingContext2D, rectangle: ScreenRectangle, seconds: number): void;
}

type PresentationControl = InteractiveUiButton & CanvasUiButton;

export interface LivePresentationFrameState<Screen extends string> {
  readonly screen: () => Screen;
  readonly previousScreen: () => Screen;
  readonly setPreviousScreen: (screen: Screen) => void;
  readonly uiZoom: () => number;
  readonly setUiZoom: (value: number) => void;
  readonly deltaSeconds: () => number;
  readonly enterSeconds: () => number;
  readonly setEnterSeconds: (value: number) => void;
  readonly enterAmount: () => number;
  readonly setEnterAmount: (value: number) => void;
  readonly scroll: () => number;
  readonly setScroll: (value: number) => void;
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

export interface LivePresentationFrameServices<Screen extends string,
  Stage extends Readonly<{ readonly bg: string }>> {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly overscan: () => Readonly<{ x: number; y: number }>;
  readonly safeTop: () => number;
  readonly viewportScale: () => number;
  readonly resize: () => void;
  readonly input: UiRuntimeInput;
  readonly ui: PresentationUi;
  readonly stage: StagePresentationState<Stage>;
  readonly cinema: CinematicPresentationState;
  readonly wipe: TearWipe;
  readonly reducedMotion: () => boolean;
  readonly flashScale: () => number;
  readonly touchActive: () => boolean;
  readonly controller: () => Readonly<{ active: boolean; toastSeconds: number; toastText: string }> | null;
  readonly pointerLocked: () => boolean;
  readonly lockHint: HTMLElement | null;
  readonly inputHint: HTMLElement | null;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly ease: (amount: number) => number;
  readonly blendColor: (from: string, to: string, amount: number) => string;
  readonly setTheme: (background: string, playLike: boolean) => void;
  readonly themeInk: () => string;
  readonly backdropPost: (context: CanvasRenderingContext2D, stage: Stage, camera: WorldCamera) => void;
  readonly renderWorld: () => WorldCamera;
  readonly drawHud: () => void;
  readonly drawBossIntro: () => void;
  readonly drawTouchControls: () => void;
  readonly drawWaveBanner: () => void;
  readonly drawStageBanner: () => void;
  readonly drawReticle: () => void;
  readonly drawAchievementToast: (deltaSeconds: number) => void;
  readonly drawMenuAttract: (context: CanvasRenderingContext2D) => void;
  readonly screenHue: (screen: Screen) => string | undefined;
  readonly renderScreen: (screen: Screen) => void;
  readonly isMenuScreen: (screen: Screen) => boolean;
  readonly playInterfaceSound: () => void;
  readonly chooseUpgrade: (index: number) => void;
  readonly chooseReserve: (index: number) => void;
  readonly rerollDraft: () => void;
  readonly hoverAnimation: Record<string, number>;
  readonly trickColor: (multiplier: number) => string;
}

/** Composes the complete canvas frame and non-gameplay input host from narrow live ports. */
export function createLivePresentationFrameHost<Screen extends string,
  Stage extends Readonly<{ readonly bg: string }>>(
  state: LivePresentationFrameState<Screen>,
  services: LivePresentationFrameServices<Screen, Stage>,
): LivePresentationHost {
  const { context, ui } = services;
  return createLivePresentationHost<Screen>({
    dimensions: { width: services.width, height: services.height, overscan: services.overscan },
    framePorts: (host) => ({
      canvas: services.canvas, context, logicalWidth: services.width, logicalHeight: services.height,
      overscan: services.overscan, screen: state.screen, previousScreen: state.previousScreen,
      setPreviousScreen: state.setPreviousScreen, resize: services.resize,
      screenRectangle: host.screenRectangle, touchActive: services.touchActive,
      cssPerLogicalPixel: services.viewportScale, uiZoom: state.uiZoom, setUiZoom: state.setUiZoom,
      deltaSeconds: state.deltaSeconds, clamp: services.clamp, resetControls: state.resetControls,
      background: (playLike) => {
        let color = playLike && state.biomeMode() ? services.stage.current.bg : "#fff";
        const flashing = playLike ? state.enemies().find((enemy) => (enemy.whiteFlash ?? 0) > 0) : undefined;
        if (flashing?.whiteFlash !== undefined) color = services.blendColor(color, "#ffffff", flashing.whiteFlash * services.flashScale());
        return color;
      },
      setTheme: services.setTheme,
      renderWorldLayers: (rectangle) => {
        const camera = services.renderWorld();
        if (state.biomeMode()) services.backdropPost(context, services.stage.current, camera);
        if (state.flash() > 0) {
          context.save(); context.globalCompositeOperation = "difference";
          context.globalAlpha = services.clamp(state.flash(), 0, 1); context.fillStyle = "#fff";
          context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h); context.restore();
        }
        if (!services.cinema.hideHud) services.drawHud();
        const beat = state.bossBeat();
        if (beat !== null && state.screen() === "playing" && !state.bossIntroActive() && !services.cinema.active) {
          const progress = services.clamp(beat.t / beat.dur, 0, 1);
          ui.bossPhaseBanner(context, { text: beat.text, color: beat.color,
            alpha: Math.min(1, (1 - progress) * 6, progress * 5) });
        }
        if (state.bossIntroActive() && state.screen() === "playing") services.drawBossIntro();
        if (services.cinema.active) services.cinema.draw(context, ui, host.screenRectangle(), services.reducedMotion());
        if (services.touchActive() && state.screen() === "playing" &&
          (!services.cinema.active || services.cinema.playerMode === "finalBlade") && !services.controller()?.active) {
          services.drawTouchControls();
        }
        if (state.screen() === "playing" && state.bannerSeconds() > 0 && !services.cinema.active) services.drawWaveBanner();
        if (state.screen() === "playing" && services.stage.bannerSeconds > 0 && !services.cinema.active) services.drawStageBanner();
        const rank = state.rankPopup();
        if (state.screen() === "playing" && rank.seconds > 0) {
          context.save(); context.globalAlpha = services.clamp(rank.seconds, 0, 1);
          context.fillStyle = services.trickColor(rank.multiplier); context.textAlign = "center";
          context.font = ui.font(42 + (1 - services.clamp(rank.seconds, 0, 1)) * 18, true);
          context.fillText(rank.text, services.width / 2, services.height / 2 - 140); context.restore();
        }
        ui.ink = "#000";
      },
      renderReticle: () => {
        if (!services.cinema.active || services.cinema.playerMode === "landing" || services.cinema.playerMode === "finalBlade") {
          services.drawReticle();
        }
      },
      isMenuScreen: services.isMenuScreen, enterSeconds: state.enterSeconds,
      setEnterSeconds: state.setEnterSeconds, enterAmount: state.enterAmount, setEnterAmount: state.setEnterAmount,
      ease: services.ease, resetScroll: () => { state.setScroll(0); },
      renderMenuBackdrop: (rectangle, screen) => {
        services.drawMenuAttract(context);
        if (screen === "menu") return;
        context.fillStyle = ui.t.color.paper; context.globalAlpha = 0.58;
        context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h); context.globalAlpha = 1;
        const vignette = context.createRadialGradient(services.width / 2, services.height / 2, services.height * 0.42,
          services.width / 2, services.height / 2, services.width * 0.62);
        vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.14)");
        context.fillStyle = vignette; context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
        if (screen !== "rename") {
          const sheet = ui.sheetRect();
          ui.sheet(context, sheet.x, sheet.y, sheet.w, sheet.h, services.screenHue(screen));
        }
      },
      renderScreen: services.renderScreen, drawButtons: host.drawButtons,
      drawPostLayers: () => { services.wipe.draw(state.deltaSeconds()); services.drawAchievementToast(state.deltaSeconds()); },
      drawCursor: () => { ui.cursor(context, services.input.mouseX, services.input.mouseY); },
      drawControllerToast: () => {
        const controller = services.controller();
        if (controller === null || controller.toastSeconds <= 0 || !controller.toastText) return;
        context.save(); context.globalAlpha = services.clamp(controller.toastSeconds / 0.6, 0, 1);
        ui.badge(context, `◎ ${controller.toastText}`, services.width / 2, 34 + services.safeTop(),
          ui.t.color.accent, "center", 13); context.restore(); context.globalAlpha = 1;
      },
      drawRotationGate: () => { ui.rotateGate(context, host.screenRectangle(), state.timeSeconds()); },
      firstEnabledButton: host.firstEnabledButton, setFocus: state.setFocus,
      updateDomHints: (screen) => {
        if (services.lockHint !== null) services.lockHint.style.display = screen === "playing" &&
          !services.pointerLocked() && !services.touchActive() ? "block" : "none";
        if (services.inputHint !== null) services.inputHint.style.display = screen === "playing" &&
          !services.touchActive() ? "block" : "none";
      },
    }),
    uiPorts: () => ({ screen: state.screen, buttons: state.controls, focus: state.focus, setFocus: state.setFocus,
      scroll: state.scroll, setScroll: state.setScroll, input: services.input,
      playInterfaceSound: services.playInterfaceSound, chooseUpgrade: services.chooseUpgrade,
      chooseReserve: services.chooseReserve, rerollDraft: services.rerollDraft }),
    buttonLayer: () => ({ context, buttons: state.controls(), focus: state.focus(),
      pointerX: services.input.mouseX, pointerY: services.input.mouseY, deltaSeconds: state.deltaSeconds(),
      enterSeconds: state.enterSeconds(), hoverAnimation: services.hoverAnimation, ui,
      entranceEase: services.ease }),
  });
}
