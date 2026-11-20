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
import type { ProductionReplayPresentationContext } from "../../tearbench/production-world-factory";
import type { ProductionGhostReplayCompositionOptions } from "../../tearbench/production-replay-composition";

type Ui = LiveWorldSimulationPresentationAdapterOptions["ui"] & CinematicUiPort & WorldUiPort;
/** The parts of a drawn replay frame a caller may leave out. */
export type ReplayFrameLayer =
  "backdrop" | "platforms" | "hazards" | "environment" | "enemies" | "projectiles" | "player" | "blade" | "effects";
/** How a reconstructed world is drawn. The replay viewer uses the defaults. */
export interface BrowserGhostReplayPresentationOptions {
  /** World zoom of a drawn frame. */
  readonly zoom?: number;
  /** Layers left out of the next drawn frame. Without the backdrop the frame is drawn on transparency. */
  readonly hidden?: () => ReadonlySet<ReplayFrameLayer>;
  /** Painted stage backgrounds, drawn as the live world draws them. */
  readonly scenes?: SceneLibrary;
}
const NOTHING_HIDDEN: ReadonlySet<ReplayFrameLayer> = new Set();
/** Each reconstructed world gets its own theme, backdrop caches, FX and renderer constructors. */
export function createBrowserGhostReplayPresentation(
  document: Document,
  ui: Ui,
  options: BrowserGhostReplayPresentationOptions = {},
): Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> {
  const owners = new WeakMap<
    object,
    Readonly<{
      theme: typeof THEME;
      backdrop: ReturnType<typeof createBackdrop>;
      graphics: typeof GFX;
      accessibility: typeof A11Y;
    }>
  >();
  return {
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
      owners.set(context.clock, { theme, backdrop, graphics, accessibility });
      return createLiveWorldSimulationPresentationAdapter({
        clock: context.clock,
        effects: context.effects,
        ui,
        configuration: { config: context.config, theme, graphics, accessibility },
        geometry: { clamp, len, lerp },
        cosmeticRandom: context.cosmeticRandom,
        // A replay draws the game's own look until it records the wearer's loadout (agreed with the replay rebuild).
        looks: DEFAULT_COSMETIC_LOOKS,
      });
    },
    renderView(replay, tick, screen) {
      const owner = owners.get(replay.clock);
      if (owner === undefined) throw new Error("replay renderer is unavailable");
      const { theme, backdrop, graphics, accessibility } = owner,
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
        zoom = options.zoom ?? 1.15,
        hidden = options.hidden?.() ?? NOTHING_HIDDEN,
        scenes = options.scenes;
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
      let activeCanvas: CanvasRenderingContext2D | undefined;
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
        cameraX: clamp(player.x, width / (2 * zoom), width - width / (2 * zoom)),
        cameraY: height / 2,
        transparent: hidden.has("backdrop"),
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
            drawStatus: () => undefined,
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
            if (scenes === undefined) return;
            scenes.drawBack(replayCanvas(), sceneInput(seconds, x, bounds, camera));
            if (!hidden.has("platforms")) scenes.drawShadows(replayCanvas(), stage.id, platforms);
          },
          ...(scenes === undefined
            ? {}
            : {
                drawBackdropFront: (bounds: WorldBounds, camera: WorldCamera) => {
                  scenes.drawFront(replayCanvas(), sceneInput(replay.clock.sim, player.x, bounds, camera));
                },
              }),
          drawPlatform: (platform, _stage, floor, bounds) => {
            backdrop.platform(replayCanvas(), platform, stage, floor, bounds, scenes?.surfaceMaterial(stage.id));
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
            if (replay.world.context.cinema.active) {
              const fit = Math.min(rectangle.w / width, rectangle.h / height);
              canvas.save();
              try {
                canvas.beginPath();
                canvas.rect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
                canvas.clip();
                canvas.translate(
                  rectangle.x + (rectangle.w - width * fit) / 2,
                  rectangle.y + (rectangle.h - height * fit) / 2,
                );
                canvas.scale(fit, fit);
                drawCinematicDirector(
                  replay.world.context.cinema,
                  config,
                  canvas,
                  ui,
                  { x: 0, y: 0, w: width, h: height },
                  accessibility.reducedMotion,
                );
              } finally {
                canvas.restore();
              }
            }
          } finally {
            activeCanvas = undefined;
          }
        },
      });
      function replayCanvas(): CanvasRenderingContext2D {
        if (activeCanvas === undefined) throw new Error("replay draw has no target");
        return activeCanvas;
      }
    },
  };
}
