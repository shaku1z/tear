import { createFinaleRenderer } from "../../presentation/world/finale";
import { drawCinematicDirector } from "../../presentation/cinematics";
import type { CinematicUiPort } from "../../presentation/cinematics";
import type { WorldUiPort } from "../../presentation/world/contracts";
import { isDrawableEnemy, projectPresentationEnemy, projectSceneBoss } from "../world/world-presentation-adapters";
import { A11Y, GFX, THEME } from "../../config/game-config";
import { STAGES, stageAt } from "../../gameplay/stages";
import { clamp, len, lerp } from "../../domain/geometry";
import { isObject } from "../../domain/records";
import { createBackdrop } from "../../presentation/backdrop";
import { createProductionReplayFrame } from "../../presentation/world/production-replay-frame";
import type { WorldBounds, WorldCamera } from "../../presentation/world/world-frame";
import type { SceneDrawInput, SceneLibrary } from "../../presentation/scenes/scene-library";
import {
  buildFinaleWorldSnapshot,
  buildEntityLayerSnapshot,
  buildSceneEffectsSnapshot,
} from "../../presentation/world/runtime-snapshots";
import { formatEnemyLabel } from "../../presentation/world/entity-layer";
import { isEnvironmentDrawnEnemy, renderEnvironmentLayer } from "../world/environment-layer";
import { DEFAULT_COSMETIC_LOOKS } from "../../presentation/cosmetic-defaults";
import {
  createLiveWorldSimulationPresentationAdapter,
  type LiveWorldSimulationPresentationAdapterOptions,
} from "../world/world-simulation-factories";
import type { ProductionReplayPresentationContext } from "../world/detached/world-factory";
import type { ProductionGhostReplayCompositionOptions } from "../world/detached/replay-composition";
import { createWorldRenderers } from "../../presentation/world";
import { easeOut } from "../../presentation/world/primitives";
import { createWorldIndicators, type WorldIndicators } from "../world/world-indicators";
import { shownTo } from "../world/overlay-audience";
import { createReplayIndicatorClock } from "./replay-indicator-clock";
import { UPGRADES } from "../../gameplay/upgrades";
import { formatRunClock, trickColor } from "../../gameplay/scoring/style-runtime";
import type { GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { CosmeticWardrobe } from "../../presentation/cosmetic-styles";
import type { RecordWorldPresentation } from "./record-world";

type Ui = LiveWorldSimulationPresentationAdapterOptions["ui"] & CinematicUiPort & WorldUiPort;
/** The parts of a drawn replay frame a caller may leave out. */
export type ReplayFrameLayer =
  | "backdrop"
  | "platforms"
  | "hazards"
  | "environment"
  | "enemies"
  | "projectiles"
  | "player"
  | "blade"
  | "effects"
  /** What play shows over the world: the HUD, the wave and stage banners and the aim mark. */
  | "indicators";
/** How a reconstructed world is drawn. The replay viewer uses the defaults. */
export interface BrowserGhostReplayPresentationOptions {
  /** Layers left out of the next drawn frame. Without the backdrop the frame is drawn on transparency. */
  readonly hidden?: () => ReadonlySet<ReplayFrameLayer>;
  /** Painted stage backgrounds, drawn as the live world draws them. */
  readonly scenes?: SceneLibrary;
  /** Who wears which cosmetics: a watched record dresses its runner's blade here. The game's own look when absent. */
  readonly wardrobe?: CosmeticWardrobe;
}
const NOTHING_HIDDEN: ReadonlySet<ReplayFrameLayer> = new Set();
/** Each reconstructed world gets its own theme, backdrop caches, FX and renderer constructors. */
export function createBrowserGhostReplayPresentation(
  document: Document,
  ui: Ui,
  options: BrowserGhostReplayPresentationOptions = {},
): RecordWorldPresentation {
  const owners = new WeakMap<
    object,
    Readonly<{
      theme: typeof THEME;
      backdrop: ReturnType<typeof createBackdrop>;
      graphics: typeof GFX;
      accessibility: typeof A11Y;
      clock: ReturnType<typeof createReplayIndicatorClock>;
    }>
  >();
  /** The canvas a frame is being drawn on; the indicator renderers draw there. */
  let activeCanvas: CanvasRenderingContext2D | undefined;
  const replayCanvas = (): CanvasRenderingContext2D => {
    if (activeCanvas === undefined) throw new Error("replay draw has no target");
    return activeCanvas;
  };
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
      owners.set(context.clock, {
        theme,
        backdrop,
        graphics,
        accessibility,
        clock: createReplayIndicatorClock(context.config.juice.bannerTime),
      });
      return createLiveWorldSimulationPresentationAdapter({
        clock: context.clock,
        effects: context.effects,
        ui,
        configuration: { config: context.config, theme, graphics, accessibility },
        geometry: { clamp, len, lerp },
        cosmeticRandom: context.cosmeticRandom,
        looks: options.wardrobe ?? DEFAULT_COSMETIC_LOOKS,
      });
    },
    renderView(replay, tick, screen) {
      const owner = owners.get(replay.clock);
      if (owner === undefined) throw new Error("replay renderer is unavailable");
      const { theme, backdrop, graphics, accessibility, clock } = owner,
        config = replay.configuration.value;
      const state = replay.world.state,
        run = state.run(),
        player = state.player(),
        blade = state.blade(),
        stage = stageAt(replay.stage.index);
      if (run === null || player === undefined || blade === undefined)
        throw new TypeError("replay world has no drawable actors");
      theme.set(options.scenes?.paper(stage.id) ?? stage.bg);
      const width = config.view.w,
        height = config.view.h,
        // The live camera's zoom: the scene's world zoom (the finale and the void run change it).
        zoom = replay.world.context.transient.feel.worldZoom,
        hidden = options.hidden?.() ?? NOTHING_HIDDEN,
        scenes = options.scenes;
      clock.observe({
        tick,
        wave: run.wave,
        stage: replay.stage.index,
        stageBannerSeconds: replay.stage.bannerSeconds,
        hpFraction: Math.max(0, Math.min(1, player.hp / player.maxHp)),
        multiplier: run.mult,
      });
      // The world renderers hold the canvas they draw on, so the indicators are built for each canvas drawn.
      const builtIndicators = new WeakMap<CanvasRenderingContext2D, WorldIndicators>();
      const indicators = (): WorldIndicators => {
        const canvas = replayCanvas();
        let built = builtIndicators.get(canvas);
        if (built === undefined) {
          built = replayIndicators(replay, clock, { canvas, theme, graphics, accessibility, width, height });
          builtIndicators.set(canvas, built);
        }
        return built;
      };
      const enemies = state.enemies(),
        environment = replay.world.context.environment.snapshot();
      const presentationOptions = {
        highContrast: accessibility.highContrast,
        reducedMotion: accessibility.reducedMotion,
        lowGraphics: graphics.low,
        flashScale: accessibility.flashScale,
        timeSeconds: replay.clock.sim,
      };
      const platforms = replay.stage.platforms.map((value) => {
        if (!isObject(value)) throw new TypeError("replay platform is malformed");
        const number = (key: string) => {
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
      // The environment layer draws its own enemy kinds, as in play; any other enemy needs a renderer.
      const drawableEnemies = (hidden.has("enemies") ? [] : enemies).flatMap((enemy) => {
        if (isDrawableEnemy(enemy)) return [projectPresentationEnemy(enemy)];
        if (isEnvironmentDrawnEnemy(enemy)) return [];
        throw new TypeError("replay enemy renderer is unavailable");
      });
      const sceneEffects = buildSceneEffectsSnapshot({
        voidActive: Boolean(run.voidScroll?.active),
        enemies: hidden.has("hazards") ? [] : enemies.map(projectSceneBoss),
        platforms: hidden.has("hazards") ? [] : platforms,
        walls: hidden.has("hazards") ? [] : state.temporaryWalls(),
        slowZones: hidden.has("hazards") ? [] : state.slowZones(),
        width,
        height,
        groundY: config.world.groundY,
        timeMilliseconds: replay.clock.sim * 1000,
        lowGraphics: graphics.low,
        highContrast: accessibility.highContrast,
        darkTheme: theme.dark,
        ink: theme.ink,
        defaultZoneWidth: config.warden.zoneW,
        colors: config.colors,
        seamLife: config.aldric.seamLife,
        trailLife: config.warden.trailLife,
      });
      const sceneInput = (
        timeSeconds: number,
        playerWorldX: number,
        view: WorldBounds,
        camera: WorldCamera,
      ): SceneDrawInput => ({ stageId: stage.id, camera, playerWorldX, worldWidth: width, view, timeSeconds });
      const frame = createProductionReplayFrame({
        tick,
        clockSeconds: replay.clock.sim,
        screen,
        clockBlocked: state.bossIntro() !== null || replay.world.context.cinema.active,
        transparent: hidden.has("backdrop"),
        drawOverlay: (canvas) => {
          if (!hidden.has("indicators"))
            drawPlayOverlay(canvas, replay, screen, indicators(), clock, ui, accessibility);
        },
        ports: {
          width,
          height,
          zoom,
          shake: 0,
          playing: false,
          random: () => 0.5,
          biome: !hidden.has("backdrop"),
          debug: false,
          timeSeconds: replay.clock.sim,
          reducedMotion: accessibility.reducedMotion,
          stage,
          playerX: player.x,
          sceneEffects,
          enemies: buildEntityLayerSnapshot({
            enemies: drawableEnemies,
            sandbox: run.mode === "sandbox",
            player,
            formatLabel: formatEnemyLabel,
            drawStatus: (enemy) => {
              indicators().enemyStatus(enemy);
            },
          }),
          player: hidden.has("player")
            ? undefined
            : { x: player.x, y: player.y, halfWidth: player.hw, halfHeight: player.hh },
          entityOptions: {
            darkTheme: theme.dark,
            sandbox: run.mode === "sandbox",
            buffColors: config.colors,
            font: (size, bold) => ui.font(size, bold),
          },
          floaters: (hidden.has("effects") ? [] : state.floaters()).map((floater) => ({
            x: floater.x,
            y: floater.y,
            text: floater.text,
            color: floater.col,
            life: floater.life,
            big: floater.big,
          })),
          brokenPlatforms: hidden.has("platforms") ? [] : (run._arenaBroken ?? []),
          platforms: hidden.has("platforms") ? [] : platforms,
          projectiles: hidden.has("projectiles") ? [] : state.projectiles(),
          setEffectView: (bounds) => {
            replay.effects.setViewRect(bounds);
          },
          drawBackdrop: (_stage, seconds, x, bounds, camera) => {
            scenes?.show(stage.id);
            if (scenes?.opaque(stage.id) !== true) backdrop.draw(replayCanvas(), stage, seconds, x, bounds);
            scenes?.drawBack(replayCanvas(), sceneInput(seconds, x, bounds, camera));
          },
          ...(scenes === undefined
            ? {}
            : {
                drawBackdropFront: (bounds: WorldBounds, camera: WorldCamera) => {
                  scenes.drawFront(replayCanvas(), sceneInput(replay.clock.sim, player.x, bounds, camera));
                },
              }),
          drawPlatform: (platform, _stage, floor, bounds) => {
            backdrop.platform(replayCanvas(), platform, stage, floor, bounds);
          },
          drawFinale: (layer) => {
            const finale = replay.finale.story.finale;
            if (finale === null) return;
            createFinaleRenderer({
              canvas: replayCanvas(),
              ui,
              width,
              height,
              safe: { top: 0, right: 0, bottom: 0, left: 0 },
              screen: { x: 0, y: 0, w: width, h: height },
              ink: theme.ink,
              darkTheme: theme.dark,
              timeSeconds: replay.clock.sim,
              lowGraphics: graphics.low,
              reducedMotion: accessibility.reducedMotion,
              highContrast: accessibility.highContrast,
            })(
              layer,
              buildFinaleWorldSnapshot(finale, {
                fragmentCap: config.finale.fragmentCap,
                stageAccents: STAGES.map((entry) => entry.accent),
                groundY: config.world.groundY,
                perfectColor: config.colors.perfect,
                relicColors: [config.colors.boss, config.colors.armoredShield, config.colors.bomber, "#b06cff"],
                blade: { x: blade.x, y: blade.y },
              }),
            );
          },
          drawTutorialGhost: () => undefined,
          tutorialActive: false,
          drawPlayer: () => {
            if (!hidden.has("player")) player.draw(replayCanvas());
          },
          drawBlade: () => {
            if (!hidden.has("blade")) blade.draw(replayCanvas(), player);
          },
          drawEffects: () => {
            if (!hidden.has("effects")) replay.effects.draw(replayCanvas());
          },
          drawDebug: () => undefined,
          drawEnvironment: () => {
            if (hidden.has("environment")) return;
            // The layer draws each Rootbinder with its links, so it gets the enemies even when theirs is hidden.
            renderEnvironmentLayer(replayCanvas(), environment, enemies, {
              ...presentationOptions,
              audioEnabled: false,
            });
          },
        },
      });
      return Object.freeze({
        ...frame,
        draw(canvas: CanvasRenderingContext2D, rectangle: Parameters<typeof frame.draw>[1]) {
          if (activeCanvas !== undefined) throw new Error("replay draw is reentrant");
          activeCanvas = canvas;
          try {
            frame.draw(canvas, rectangle);
          } finally {
            activeCanvas = undefined;
          }
        },
      });
    },
  };

  /** Play's indicators over a replay world, drawn through the live world renderers on the replay's canvas. */
  function replayIndicators(
    replay: Parameters<NonNullable<ProductionGhostReplayCompositionOptions["renderView"]>>[0],
    clock: ReturnType<typeof createReplayIndicatorClock>,
    look: Readonly<{
      canvas: CanvasRenderingContext2D;
      theme: typeof THEME;
      graphics: typeof GFX;
      accessibility: typeof A11Y;
      width: number;
      height: number;
    }>,
  ): WorldIndicators {
    const config = replay.configuration.value,
      state = replay.world.state,
      stage = replay.stage;
    const renderers = createWorldRenderers({
      canvas: look.canvas,
      ui,
      width: look.width,
      height: look.height,
      safe: { top: 0, right: 0, bottom: 0, left: 0 },
      screen: { x: 0, y: 0, w: look.width, h: look.height },
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
    });
    return createWorldIndicators(
      renderers,
      {
        run: () => state.run() as GameRun,
        player: () => state.player(),
        blade: () => state.blade(),
        enemies: () => state.enemies(),
        bossIntro: () => state.bossIntro(),
        bannerSeconds: clock.waveBanner,
        stage: () => ({
          index: stage.index,
          current: stage.current,
          name: stage.name,
          bannerSeconds: clock.stageBanner(),
        }),
        hud: clock.hud,
        hudClockSeconds: clock.hudClockSeconds,
        deltaSeconds: clock.deltaSeconds,
      },
      {
        config,
        upgrades: UPGRADES,
        flashScale: () => look.accessibility.flashScale,
        fallbackAccent: () => ui.t.color.accent,
        ink: () => look.theme.ink,
        formatTime: formatRunClock,
        trickColor: (multiplier) => trickColor(multiplier, config.colors),
        ease: easeOut,
      },
      // A replay is watched: the player's own alarms (the red low-health screen) stay out of it.
      "watcher",
    );
  }
}

/**
 * What play draws over the world, in play's order and on play's conditions (`renderWorldLayers` in
 * src/app/interface/presentation-composition.ts): the HUD, a running scene, the wave or stage banner and
 * the blade's reticle.
 */
function drawPlayOverlay(
  canvas: CanvasRenderingContext2D,
  replay: Parameters<NonNullable<ProductionGhostReplayCompositionOptions["renderView"]>>[0],
  screen: string,
  indicators: WorldIndicators,
  clock: ReturnType<typeof createReplayIndicatorClock>,
  ui: Ui,
  accessibility: typeof A11Y,
): void {
  if (screen !== "playing") return;
  const config = replay.configuration.value,
    cinema = replay.world.context.cinema,
    width = config.view.w,
    height = config.view.h;
  if (!cinema.active || !cinema.hideHud || cinema.beat?.hud === true) indicators.hud();
  if (cinema.active && shownTo("cinematic", "watcher"))
    drawCinematicDirector(cinema, config, canvas, ui, { x: 0, y: 0, w: width, h: height }, accessibility.reducedMotion);
  // The stage banner owns the announcement band while it shows.
  const stageBanner = clock.stageBanner() > 0;
  if (!cinema.active && !stageBanner && clock.waveBanner() > 0) indicators.waveBanner();
  if (!cinema.active && stageBanner) indicators.stageBanner();
  if (!cinema.active || cinema.playerMode === "landing" || cinema.playerMode === "finalBlade") indicators.reticle();
}
