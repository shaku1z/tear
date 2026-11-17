import { validateScenePackage, type SceneCamera } from "./scene-contract";
import { prepareMotion } from "./scene-motion";
import {
  bakeShading,
  drawSceneBack,
  drawSceneFront,
  drawPlatformShadows,
  drawPlatformTexture,
  type LoadedScene,
  type SceneBitmap,
  type SceneCanvas,
  type SceneView,
  type SurfaceTarget,
} from "./scene-renderer";

/** What a stage's lazily imported package module provides. */
export interface ScenePackageModule {
  readonly manifest: unknown;
  /** Built URL of every image file named in the manifest, keyed by file name. */
  readonly files: Readonly<Record<string, string>>;
}

export type ScenePackageLoaders = Readonly<Record<string, () => Promise<ScenePackageModule>>>;

export type SceneStatus = "none" | "loading" | "ready" | "failed";

export interface SceneLibraryPorts {
  readonly packages: ScenePackageLoaders;
  readonly loadImage: (url: string) => Promise<SceneBitmap>;
  /** Canvas to bake shading into at load; without it shading draws per frame. */
  readonly createCanvas?: (width: number, height: number) => SceneCanvas & SceneBitmap;
  /** Frees a decoded image the library has finished with. */
  readonly releaseImage?: (image: SceneBitmap) => void;
  readonly now: () => number;
  readonly lowGraphics: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly onError?: (stageId: string, error: unknown) => void;
}

export interface ScenePlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor?: boolean;
  readonly void?: boolean;
  readonly arenaState?: string;
}

/** Platforms that are solid now cast a shadow; broken or reforming ones do not. */
const castsShadow = (platform: ScenePlatform) =>
  platform.floor !== true &&
  platform.void !== true &&
  platform.arenaState !== "broken" &&
  platform.arenaState !== "reforming";

/** World frame inputs for one stage draw. */
export interface SceneDrawInput {
  readonly stageId: string;
  readonly camera: Omit<SceneCamera, "playerX">;
  readonly playerWorldX: number;
  readonly worldWidth: number;
  readonly view: SceneView;
  readonly timeSeconds: number;
}

/**
 * Owns every painted stage package: lazy import, decode, validation, drawing
 * and release. A stage without a ready package returns false from each draw so
 * the caller keeps its procedural art; nothing here touches simulation state.
 *
 * Only `show` and `prefetch` start a download. Every other call reads what has
 * already loaded, so a menu that merely draws a stage never fetches that
 * stage's art.
 *
 * Decoded layers are held for two stages at most: the one a run is showing and
 * the one it reaches next. Every other stage's layers are released, so memory
 * does not grow with the number of biomes a run has passed through.
 */
export interface SceneLibrary {
  status(stageId: string): SceneStatus;
  /**
   * The world is drawing this stage: loads its package if it has one, and
   * releases every other stage except the one prefetched as next. Call it every
   * frame the stage is drawn, never from a menu.
   */
  show(stageId: string): void;
  /**
   * The stage a run reaches next: loads its package ahead of time and keeps it
   * alongside the shown stage. Call it when the run is about to need the stage.
   */
  prefetch(stageId: string): void;
  /** No run is showing a stage (the main menu): releases every stage's decoded layers. */
  leave(): void;
  /** The paper colour the theme should derive ink from, while the scene shows. */
  paper(stageId: string): string | undefined;
  /** True once the stage's scene fully covers the view (loaded and faded in). */
  opaque(stageId: string): boolean;
  /** Draws over whatever the caller painted; while fading in, the caller draws its own art first. */
  drawBack(context: CanvasRenderingContext2D, input: SceneDrawInput): void;
  drawFront(context: CanvasRenderingContext2D, input: SceneDrawInput): void;
  /** Contact shadows of the stage's platforms on the back plane (call after drawBack). */
  drawShadows(context: CanvasRenderingContext2D, stageId: string, platforms: readonly ScenePlatform[]): void;
  /**
   * Texture port for the stage's platform material. The material draws every
   * platform and the floor from collision geometry, in every state; this only
   * fills the surface once the package is ready (false keeps the material's fill).
   */
  surfaceMaterial(stageId: string): {
    draw(context: CanvasRenderingContext2D, rect: SurfaceTarget, floor: boolean): boolean;
  };
  /** Test and evidence hook: the loaded package, if ready. */
  loaded(stageId: string): LoadedScene | undefined;
}

const FADE_SECONDS = 0.6;

interface Entry {
  status: SceneStatus;
  loaded?: LoadedScene;
  readyAt: number;
  /** Set when the stage was released while its package was still loading. */
  released: boolean;
}

function releaseImages(loaded: LoadedScene, ports: SceneLibraryPorts): void {
  if (ports.releaseImage === undefined) return;
  for (const image of loaded.images.values()) ports.releaseImage(image);
  for (const part of loaded.motion ?? []) ports.releaseImage(part.canvas);
}

async function loadScene(module: ScenePackageModule, ports: SceneLibraryPorts): Promise<LoadedScene> {
  const scene = validateScenePackage(module.manifest);
  const decoded = await Promise.all(
    scene.images.map(async (image) => {
      const url = module.files[image.file];
      if (url === undefined) throw new Error(`scene ${scene.id}: no built URL for ${image.file}`);
      const bitmap = await ports.loadImage(url);
      if (bitmap.width !== image.width || bitmap.height !== image.height) {
        throw new Error(`scene ${scene.id}: ${image.file} decoded as ${String(bitmap.width)}x${String(bitmap.height)}`);
      }
      return [image.id, bitmap] as const;
    }),
  );
  const images = new Map(decoded);
  if (ports.createCanvas === undefined) return Object.freeze({ scene, images, shading: scene.shading });
  const baked = bakeShading(scene, images, ports.createCanvas);
  // A layer with shading baked in replaces its decoded copy: free the copy now.
  for (const [id, image] of images) if (baked.images.get(id) !== image) ports.releaseImage?.(image);
  return Object.freeze({ ...baked, motion: prepareMotion(scene, baked.images, ports.createCanvas) });
}

export function createSceneLibrary(ports: SceneLibraryPorts): SceneLibrary {
  const entries = new Map<string, Entry>();
  const entry = (stageId: string): Entry | undefined => entries.get(stageId);
  const request = (stageId: string): void => {
    if (entries.has(stageId)) return;
    const loader = Object.hasOwn(ports.packages, stageId) ? ports.packages[stageId] : undefined;
    if (loader === undefined) return;
    const created: Entry = { status: "loading", readyAt: 0, released: false };
    entries.set(stageId, created);
    loader()
      .then((module) => loadScene(module, ports))
      .then((loaded) => {
        if (created.released) {
          releaseImages(loaded, ports);
          return;
        }
        created.loaded = loaded;
        created.status = "ready";
        created.readyAt = ports.now();
      })
      .catch((error: unknown) => {
        created.status = "failed";
        if (!created.released) ports.onError?.(stageId, error);
      });
  };
  // The two stages whose decoded layers may stay: the shown one and the next one.
  let shown: string | undefined;
  let next: string | undefined;
  const releaseOthers = (): void => {
    for (const [stageId, current] of entries) {
      if (stageId === shown || stageId === next) continue;
      entries.delete(stageId);
      current.released = true;
      if (current.loaded !== undefined) releaseImages(current.loaded, ports);
      delete current.loaded;
    }
  };
  const ready = (stageId: string): LoadedScene | undefined => {
    const current = entry(stageId);
    return current?.status === "ready" ? current.loaded : undefined;
  };
  const frame = (loaded: LoadedScene, readyAt: number, input: SceneDrawInput) => {
    const half = input.worldWidth / 2;
    const playerX = Math.max(-1, Math.min(1, (input.playerWorldX - half) / half));
    const reducedMotion = ports.reducedMotion();
    return {
      camera: { ...input.camera, playerX: reducedMotion ? 0 : playerX },
      view: input.view,
      timeSeconds: reducedMotion ? 0 : input.timeSeconds,
      lowGraphics: ports.lowGraphics(),
      reducedMotion,
      opacity: reducedMotion ? 1 : Math.min(1, Math.max(0, (ports.now() - readyAt) / 1000 / FADE_SECONDS)),
      scene: loaded.scene,
    };
  };
  const surface = (stageId: string) =>
    Object.freeze({
      draw(context: CanvasRenderingContext2D, rect: SurfaceTarget): boolean {
        const loaded = ready(stageId);
        return loaded !== undefined && drawPlatformTexture(context, loaded, rect);
      },
    });
  const materials = new Map<string, ReturnType<typeof surface>>();
  return {
    status: (stageId) => entry(stageId)?.status ?? "none",
    show(stageId) {
      if (shown !== stageId) {
        shown = stageId;
        releaseOthers();
      }
      request(stageId);
    },
    prefetch(stageId) {
      if (next !== stageId) {
        next = stageId;
        releaseOthers();
      }
      request(stageId);
    },
    leave() {
      if (shown === undefined && next === undefined) return;
      shown = undefined;
      next = undefined;
      releaseOthers();
    },
    paper: (stageId) => ready(stageId)?.scene.theme.paper,
    loaded: ready,
    opaque(stageId) {
      const current = entry(stageId);
      if (current?.status !== "ready") return false;
      return ports.reducedMotion() || ports.now() - current.readyAt >= FADE_SECONDS * 1000;
    },
    drawBack(context, input) {
      const current = entry(input.stageId);
      if (current?.status !== "ready" || current.loaded === undefined) return;
      drawSceneBack(context, current.loaded, frame(current.loaded, current.readyAt, input));
    },
    drawFront(context, input) {
      const current = entry(input.stageId);
      if (current?.status !== "ready" || current.loaded === undefined) return;
      drawSceneFront(context, current.loaded, frame(current.loaded, current.readyAt, input));
    },
    drawShadows(context, stageId, platforms) {
      const current = entry(stageId);
      if (current?.status !== "ready" || current.loaded === undefined) return;
      const standing = platforms.filter(castsShadow);
      context.save();
      context.globalAlpha = ports.reducedMotion()
        ? 1
        : Math.min(1, (ports.now() - current.readyAt) / 1000 / FADE_SECONDS);
      drawPlatformShadows(context, current.loaded, standing);
      context.restore();
    },
    surfaceMaterial(stageId) {
      let material = materials.get(stageId);
      if (material === undefined) {
        material = surface(stageId);
        materials.set(stageId, material);
      }
      return material;
    },
  };
}
