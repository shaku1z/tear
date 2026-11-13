import { validateScenePackage, type SceneCamera } from "./scene-contract";
import {
  drawSceneBack,
  drawSceneFront,
  drawPlatformShadows,
  drawPlatformTexture,
  type LoadedScene,
  type SceneBitmap,
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
 * Owns every painted stage package for the page lifetime: lazy import, decode,
 * validation and drawing. A stage without a ready package returns false from
 * each draw so the caller keeps its procedural art; nothing here touches
 * simulation state.
 */
export interface SceneLibrary {
  status(stageId: string): SceneStatus;
  /** Starts loading a stage's package if it has one; safe to call repeatedly. */
  prefetch(stageId: string): void;
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
  return Object.freeze({ scene, images: new Map(decoded) });
}

export function createSceneLibrary(ports: SceneLibraryPorts): SceneLibrary {
  const entries = new Map<string, Entry>();
  const entry = (stageId: string): Entry | undefined => {
    const current = entries.get(stageId);
    if (current !== undefined) return current;
    const loader = Object.hasOwn(ports.packages, stageId) ? ports.packages[stageId] : undefined;
    if (loader === undefined) return undefined;
    const created: Entry = { status: "loading", readyAt: 0 };
    entries.set(stageId, created);
    loader()
      .then((module) => loadScene(module, ports))
      .then((loaded) => {
        created.loaded = loaded;
        created.status = "ready";
        created.readyAt = ports.now();
      })
      .catch((error: unknown) => {
        created.status = "failed";
        ports.onError?.(stageId, error);
      });
    return created;
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
    prefetch: (stageId) => {
      entry(stageId);
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
