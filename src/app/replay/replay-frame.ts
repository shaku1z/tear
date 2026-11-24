import { drawCinematicDirector } from "../../presentation/cinematics";
import { A11Y, GFX, THEME } from "../../config/game-config";
import { STAGES, stageAt } from "../../gameplay/stages";
import { clamp, len, lerp } from "../../domain/geometry";
import { isObject } from "../../domain/records";
import { createBackdrop } from "../../presentation/backdrop";
import type { SceneLibrary } from "../../presentation/scenes/scene-library";
import type { createUi } from "../../presentation/ui";
import { DEFAULT_COSMETIC_LOOKS } from "../../presentation/cosmetic-defaults";
import type { CosmeticWardrobe } from "../../presentation/cosmetic-styles";
import { createWorldRenderers } from "../../presentation/world";
import { easeOut } from "../../presentation/world/primitives";
import { createLiveWorldSimulationPresentationAdapter } from "../world/world-simulation-factories";
import type { ProductionReplayPresentationContext } from "../world/detached/world-factory";
import type { ProductionGhostReplayCompositionOptions } from "../world/detached/replay-composition";
import {
  createLiveWorldPresentationAdapters,
  type LiveWorldPresentationAdapters,
  type WorldDependencies,
  type WorldFrameLayer,
  type WorldPresentationServices,
  type WorldPresentationState,
} from "../world/world-presentation-adapters";
import { createRunOverlay, type RunOverlay, type RunOverlayFrame, type RunOverlayPainters } from "../world/run-overlay";
import { createReplayIndicatorClock } from "./replay-indicator-clock";
import { UPGRADES } from "../../gameplay/upgrades";
import { isBiomeRunMode } from "../../gameplay/run/session";
import { formatRunClock, trickColor } from "../../gameplay/scoring/style-runtime";
import type { GhostReplayRenderView } from "../../ghost/replay-world";
import type { RecordWorldPresentation } from "./record-world";

type Ui = ReturnType<typeof createUi>;
type ReplayWorld = Parameters<NonNullable<ProductionGhostReplayCompositionOptions["renderView"]>>[0];
type ViewRectangle = Readonly<{ x: number; y: number; w: number; h: number }>;
type Platforms = WorldPresentationServices["stage"]["platforms"];

/** How a replay's frames are drawn. The replay screen uses the defaults. */
export interface ReplayFrameOptions {
  /** Layers left out of the next drawn frame (the asset sheets draw each part on its own). */
  readonly hidden?: () => ReadonlySet<WorldFrameLayer>;
  /** Painted stage backgrounds, drawn as the live world draws them. */
  readonly scenes?: SceneLibrary;
  /** Who wears which cosmetics: a watched record dresses its runner's blade here. The game's own look when absent. */
  readonly wardrobe?: CosmeticWardrobe;
}

/** A replay without painted stages draws each stage's procedural backdrop, as play does before a stage paints. */
const NO_SCENES: WorldDependencies["Scenes"] = Object.freeze({
  show: () => undefined,
  opaque: () => false,
  drawBack: () => undefined,
  drawFront: () => undefined,
});
const NOTHING_HIDDEN: ReadonlySet<WorldFrameLayer> = new Set();
const CAPTURE_ALL = Object.freeze({ debug: "exclude", actors: "include" } as const);
const NO_SAFE_AREA = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

/** One replay world's own look: its theme, backdrop caches, renderers and the overlay's memory between frames. */
interface WorldLook {
  readonly theme: typeof THEME;
  readonly graphics: typeof GFX;
  readonly accessibility: typeof A11Y;
  readonly backdrop: ReturnType<typeof createBackdrop>;
  readonly clock: ReturnType<typeof createReplayIndicatorClock>;
  readonly overlay: RunOverlay;
  readonly cosmeticRandom: () => number;
  readonly drawBossTransformationWorld: WorldDependencies["drawBossTransformationWorld"];
}

/**
 * Draws a replay as play draws the run: the live world builder (`createLiveWorldPresentationAdapters`) and the
 * run's overlay (`createRunOverlay`), drawn for a watcher, so OVERLAY_LAYERS leaves the player's own layers out.
 * The replay adds only the fit: the whole arena inside the rectangle it is given, the backdrop around it, and
 * every screen-framed layer anchored to that rectangle.
 */
export function createReplayFrames(
  document: Document,
  ui: Ui,
  options: ReplayFrameOptions = {},
): RecordWorldPresentation {
  const looks = new WeakMap<object, WorldLook>();
  return {
    ...(options.wardrobe === undefined ? {} : { wardrobe: options.wardrobe }),
    presentation(context: ProductionReplayPresentationContext) {
      const theme = { ...THEME },
        graphics = { ...GFX },
        accessibility = { ...A11Y };
      const backdrop = createBackdrop({
        clock: context.clock,
        config: context.config,
        graphics,
        accessibility,
        theme,
        overscan: { x: 0, y: 0 },
        createCanvas: () => document.createElement("canvas"),
        performance,
      });
      const ports = createLiveWorldSimulationPresentationAdapter({
        clock: context.clock,
        effects: context.effects,
        ui,
        configuration: { config: context.config, theme, graphics, accessibility },
        geometry: { clamp, len, lerp },
        cosmeticRandom: context.cosmeticRandom,
        looks: options.wardrobe ?? DEFAULT_COSMETIC_LOOKS,
      });
      looks.set(context.clock, {
        theme,
        graphics,
        accessibility,
        backdrop,
        clock: createReplayIndicatorClock(context.config.juice.bannerTime),
        overlay: createRunOverlay("watcher"),
        cosmeticRandom: context.cosmeticRandom,
        drawBossTransformationWorld: ports.enemy.port.drawBossTransformationWorld,
      });
      return ports;
    },
    renderView: (replay, tick, screen) => replayView(replay, tick, screen),
  };

  function replayView(replay: ReplayWorld, tick: number, screen: string): GhostReplayRenderView {
    const look = looks.get(replay.clock);
    if (look === undefined) throw new Error("replay renderer is unavailable");
    const config = replay.configuration.value,
      state = replay.world.state,
      context = replay.world.context,
      run = state.run(),
      player = state.player();
    if (run === null || player === undefined || state.blade() === undefined)
      throw new TypeError("replay world has no drawable actors");
    const stage = stageAt(replay.stage.index);
    look.theme.set(options.scenes?.paper(stage.id) ?? stage.bg);
    look.clock.observe({
      tick,
      wave: run.wave,
      stage: replay.stage.index,
      stageBannerSeconds: replay.stage.bannerSeconds,
      hpFraction: Math.max(0, Math.min(1, player.hp / player.maxHp)),
      multiplier: run.mult,
    });
    const width = config.view.w,
      height = config.view.h,
      hidden = options.hidden?.() ?? NOTHING_HIDDEN;
    const camera = Object.freeze({
      policy: "arena" as const,
      x: width / 2,
      y: height / 2,
      scale: context.transient.feel.worldZoom,
    });
    const platforms = replayPlatforms(replay.stage.platforms);
    const worldState: WorldPresentationState = {
      run: () => run,
      player: () => state.player(),
      blade: () => state.blade(),
      enemies: () => state.enemies(),
      projectiles: () => state.projectiles(),
      floaters: () => state.floaters(),
      slowZones: () => state.slowZones(),
      temporaryWalls: () => state.temporaryWalls(),
      environment: () => context.environment.snapshot(),
      screen: () => screen,
      zoom: () => context.transient.feel.worldZoom,
      shake: () => context.transient.impact.shake,
      lastUiDelta: look.clock.deltaSeconds,
      bannerSeconds: look.clock.waveBanner,
      bossIntro: () => state.bossIntro(),
      hud: look.clock.hud,
      hudClockSeconds: look.clock.hudClockSeconds,
      // The indicator clock moves the HUD from the recorded moments it observes.
      advanceHud: () => undefined,
    };
    const dependencies: WorldDependencies = {
      A11Y: look.accessibility,
      Backdrop: look.backdrop,
      Scenes: options.scenes ?? NO_SCENES,
      CLOCK: replay.clock,
      CONFIG: config,
      FX: replay.effects,
      GFX: look.graphics,
      STAGES,
      THEME: look.theme,
      UI: ui,
      UPGRADES,
      cosmeticRandom: look.cosmeticRandom,
      drawBossTransformationWorld: look.drawBossTransformationWorld,
    };
    // The world renderers hold the canvas they draw on and the view they anchor to: one builder per both.
    const built = new WeakMap<CanvasRenderingContext2D, Map<string, LiveWorldPresentationAdapters>>();
    const worldFor = (canvas: CanvasRenderingContext2D, view: ViewRectangle): LiveWorldPresentationAdapters => {
      let views = built.get(canvas);
      if (views === undefined) built.set(canvas, (views = new Map<string, LiveWorldPresentationAdapters>()));
      const key = [view.x, view.y, view.w, view.h].join(",");
      let world = views.get(key);
      if (world === undefined) {
        world = createLiveWorldPresentationAdapters(worldState, {
          ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
          dependencies,
          canvas,
          width,
          height,
          capturePolicy: () => CAPTURE_ALL,
          screenRectangle: () => view,
          world: createWorldRenderers({
            canvas,
            ui,
            width,
            height,
            safe: NO_SAFE_AREA,
            screen: view,
            get ink() {
              return look.theme.ink;
            },
            get darkTheme() {
              return look.theme.dark;
            },
            get timeSeconds() {
              return replay.clock.sim;
            },
            lowGraphics: look.graphics.low,
            reducedMotion: look.accessibility.reducedMotion,
            highContrast: look.accessibility.highContrast,
          }),
          stage: {
            index: replay.stage.index,
            current: stage,
            platforms,
            bannerSeconds: look.clock.stageBanner(),
            name: stage.name,
          },
          finale: () => replay.finale.story.finale,
          formatTime: formatRunClock,
          trickColor: (multiplier) => trickColor(multiplier, config.colors),
          ease: easeOut,
        });
        views.set(key, world);
      }
      return world;
    };
    const overlayFrame = (canvas: CanvasRenderingContext2D, view: ViewRectangle): RunOverlayFrame => ({
      context: canvas,
      screen: view,
      playing: screen === "playing",
      interfaceShown: !hidden.has("indicators"),
      biome: !hidden.has("backdrop") && isBiomeRunMode(run.mode),
      cinema: context.cinema,
      parryFlash: context.transient.feel.flash,
      stageBeat: state.stageBeat(),
      waveBannerSeconds: look.clock.waveBanner(),
      stageBannerSeconds: look.clock.stageBanner(),
      rankPopup: {
        seconds: context.transient.feel.rankPopupSeconds,
        text: context.transient.feel.rankPopupText,
        multiplier: run.mult,
      },
      touchControls: false,
    });
    const painters = (
      canvas: CanvasRenderingContext2D,
      world: LiveWorldPresentationAdapters,
      worldCamera: Parameters<typeof look.backdrop.post>[2],
    ): RunOverlayPainters => ({
      backdropPost: () => {
        look.backdrop.post(canvas, stage, worldCamera);
      },
      hud: world.drawHud,
      beatBanner: (model) => {
        ui.beatBanner(canvas, model);
      },
      scene: (view) => {
        drawCinematicDirector(context.cinema, config, canvas, ui, view, look.accessibility.reducedMotion);
      },
      touchControls: world.drawTouchControls,
      waveBanner: world.drawWaveBanner,
      stageBanner: world.drawStageBanner,
      reticle: world.drawReticle,
      font: (size, bold) => ui.font(size, bold),
      trickColor: (multiplier) => trickColor(multiplier, config.colors),
    });
    return Object.freeze({
      tick,
      viewport: Object.freeze({ width, height }),
      clockSeconds: replay.clock.sim,
      screen,
      clockBlocked: state.bossIntro() !== null || context.cinema.active,
      camera,
      draw(canvas: CanvasRenderingContext2D, rectangle: ViewRectangle): void {
        if (
          ![rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(Number.isFinite) ||
          rectangle.w <= 0 ||
          rectangle.h <= 0
        )
          throw new RangeError("replay viewport is invalid");
        canvas.save();
        try {
          canvas.beginPath();
          canvas.rect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
          canvas.clip();
          if (!hidden.has("backdrop")) {
            canvas.fillStyle = "#090e15";
            canvas.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
          }
          // Play's camera fits the whole arena onto the screen; the replay fits it into the rectangle.
          const scale = Math.min(rectangle.w / width, rectangle.h / height),
            left = rectangle.x + (rectangle.w - width * scale) / 2,
            top = rectangle.y + (rectangle.h - height * scale) / 2;
          canvas.translate(left, top);
          canvas.scale(scale, scale);
          // The rectangle in the arena's coordinates: the arena plus the margin the fit leaves around it.
          const view = {
            x: (rectangle.x - left) / scale,
            y: (rectangle.y - top) / scale,
            w: rectangle.w / scale,
            h: rectangle.h / scale,
          };
          const world = worldFor(canvas, view);
          const worldCamera = world.renderWorld();
          const frame = overlayFrame(canvas, view),
            paint = painters(canvas, world, worldCamera);
          look.overlay.draw(frame, paint);
          look.overlay.drawReticle(frame, paint);
        } finally {
          canvas.restore();
        }
      },
    });
  }
}

/** The stage's platforms as recorded, checked: a replay world keeps them as plain records. */
function replayPlatforms(values: readonly unknown[]): Platforms {
  return values.map((value) => {
    if (!isObject(value)) throw new TypeError("replay platform is malformed");
    const number = (key: string): number => {
      const field: unknown = Reflect.get(value, key);
      if (typeof field !== "number" || !Number.isFinite(field))
        throw new TypeError(`replay platform ${key} is invalid`);
      return field;
    };
    const crack: unknown = Reflect.get(value, "crackT");
    return {
      ...value,
      x: number("x"),
      y: number("y"),
      w: number("w"),
      h: number("h"),
      crackT: typeof crack === "number" ? crack : 0,
    };
  });
}
