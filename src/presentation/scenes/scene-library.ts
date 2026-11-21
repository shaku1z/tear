import type { SceneCamera, SceneWorld } from "./scene-contract";
import {
  drawSceneBack,
  drawSceneFront,
  type LoadedScene,
  type SceneBitmap,
  type SceneCanvas,
  type SceneView,
} from "./scene-renderer";

/** What a drawn stage's painter is given: canvases, the world and a way to yield the thread. */
export interface ScenePaintPorts {
  readonly world: SceneWorld;
  readonly createCanvas: (width: number, height: number) => SceneCanvas & SceneBitmap;
  readonly now: () => number;
  /** Resolves once the browser has had the thread back. */
  readonly nextSlice: () => Promise<void>;
  /** Longest stretch, in ms, the painter may run before yielding. */
  readonly sliceMs: number;
  /** Canvas resolution multiplier (below 1 on low graphics). */
  readonly detail: number;
}

/** A stage drawn from data at load: it paints its own layers. */
export interface PaintedStage {
  paint(ports: ScenePaintPorts): Promise<LoadedScene>;
}

/** Stage id -> lazy loader of the stage's painter and recipe. */
export type PaintedStageLoaders = Readonly<Record<string, () => Promise<PaintedStage>>>;

export type SceneStatus = "none" | "loading" | "ready" | "failed";

export interface SceneLibraryPorts {
  readonly stages: PaintedStageLoaders;
  readonly world: SceneWorld;
  /** Resolves once the browser has had the thread back (stages paint in slices). */
  readonly nextSlice: () => Promise<void>;
  /** A canvas for a stage to paint a layer into. */
  readonly createCanvas: (width: number, height: number) => SceneCanvas & SceneBitmap;
  /** Frees a painted layer the library has finished with. */
  readonly releaseImage?: (image: SceneBitmap) => void;
  readonly now: () => number;
  readonly lowGraphics: () => boolean;
  readonly reducedMotion: () => boolean;
  readonly onError?: (stageId: string, error: unknown) => void;
}

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
 * Owns every drawn stage: lazy import of its painter and recipe, painting,
 * drawing and release. A stage that is not ready draws nothing, so the caller
 * keeps its procedural art; nothing here touches simulation state.
 *
 * Only `show` and `prefetch` start a load. Every other call reads what has
 * already been painted, so a menu that merely draws a stage never loads or
 * paints that stage's art.
 *
 * Painted layers are held for two stages at most: the one a run is showing and
 * the one it reaches next. Every other stage's layers are released, so memory
 * does not grow with the number of biomes a run has passed through.
 */
export interface SceneLibrary {
  status(stageId: string): SceneStatus;
  /**
   * The world is drawing this stage: paints it if it has a recipe, and
   * releases every other stage except the one prefetched as next. Call it every
   * frame the stage is drawn, never from a menu.
   */
  show(stageId: string): void;
  /**
   * The stage a run reaches next: paints it ahead of time and keeps it
   * alongside the shown stage. Call it when the run is about to need the stage.
   */
  prefetch(stageId: string): void;
  /** No run is showing a stage (the main menu): releases every stage's painted layers. */
  leave(): void;
  /** The paper colour the theme should derive ink from, while the scene shows. */
  paper(stageId: string): string | undefined;
  /** True once the stage's scene fully covers the view (painted and faded in). */
  opaque(stageId: string): boolean;
  /** Draws over whatever the caller painted; while fading in, the caller draws its own art first. */
  drawBack(context: CanvasRenderingContext2D, input: SceneDrawInput): void;
  drawFront(context: CanvasRenderingContext2D, input: SceneDrawInput): void;
  /** Test and evidence hook: the painted stage, if ready. */
  loaded(stageId: string): LoadedScene | undefined;
}

const FADE_SECONDS = 0.6;
/** A drawn stage hands the thread back after this long, so painting never becomes a long task. */
const PAINT_SLICE_MS = 4;
/** Canvas resolution of drawn stages on low graphics. */
const LOW_GRAPHICS_DETAIL = 0.6;

interface Entry {
  status: SceneStatus;
  loaded?: LoadedScene;
  readyAt: number;
  /** Set when the stage was released while it was still painting. */
  released: boolean;
}

function releaseImages(loaded: LoadedScene, ports: SceneLibraryPorts): void {
  if (ports.releaseImage === undefined) return;
  for (const image of loaded.images.values()) ports.releaseImage(image);
}

function paintScene(stage: PaintedStage, ports: SceneLibraryPorts): Promise<LoadedScene> {
  return stage.paint({
    world: ports.world,
    createCanvas: ports.createCanvas,
    now: ports.now,
    nextSlice: ports.nextSlice,
    sliceMs: PAINT_SLICE_MS,
    detail: ports.lowGraphics() ? LOW_GRAPHICS_DETAIL : 1,
  });
}

export function createSceneLibrary(ports: SceneLibraryPorts): SceneLibrary {
  const entries = new Map<string, Entry>();
  const entry = (stageId: string): Entry | undefined => entries.get(stageId);
  const request = (stageId: string): void => {
    if (entries.has(stageId)) return;
    const loader = Object.hasOwn(ports.stages, stageId) ? ports.stages[stageId] : undefined;
    if (loader === undefined) return;
    const created: Entry = { status: "loading", readyAt: 0, released: false };
    entries.set(stageId, created);
    loader()
      .then((stage) => paintScene(stage, ports))
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
  // The two stages whose painted layers may stay: the shown one and the next one.
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
  };
}
