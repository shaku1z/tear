import { layerTransform, type Rect, type SceneCamera, type SceneLayer, type SceneLayout } from "./scene-contract";

/** An image the renderer can draw; canvases and ImageBitmap qualify. */
export type SceneBitmap = CanvasImageSource & { readonly width: number; readonly height: number };

export interface LoadedScene {
  readonly scene: SceneLayout;
  readonly images: ReadonlyMap<string, SceneBitmap>;
}

/** A canvas a stage paints into; HTMLCanvasElement and OffscreenCanvas qualify. */
export interface SceneCanvas {
  readonly width: number;
  readonly height: number;
  getContext(id: "2d"): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

export interface SceneView {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface SceneFrame {
  readonly camera: SceneCamera;
  /** Painted world bounds of this frame (camera view plus bleed). */
  readonly view: SceneView;
  readonly timeSeconds: number;
  readonly lowGraphics: boolean;
  readonly reducedMotion: boolean;
  /** 0..1 fade-in after the stage became ready (1 = fully shown). */
  readonly opacity: number;
}

function layerSpaceView(frame: SceneFrame, k: number, tx: number, ty: number): SceneView {
  return {
    left: (frame.view.left - tx) / k,
    top: (frame.view.top - ty) / k,
    right: (frame.view.right - tx) / k,
    bottom: (frame.view.bottom - ty) / k,
  };
}

/** Soft transition from the art into the scene's edge colour where a camera outruns the art. */
function featherEdges(context: CanvasRenderingContext2D, scene: SceneLayout, rect: Rect, view: SceneView): void {
  const [x, y, w, h] = rect;
  const feather = Math.min(scene.edge.feather, w / 4, h / 4);
  if (feather <= 0) return;
  const edge = scene.edge.color;
  const sides: readonly (readonly [boolean, number, number, number, number, Rect])[] = [
    [view.left < x, x, 0, x + feather, 0, [x, y, feather, h]],
    [view.right > x + w, x + w, 0, x + w - feather, 0, [x + w - feather, y, feather, h]],
    [view.top < y, 0, y, 0, y + feather, [x, y, w, feather]],
    [view.bottom > y + h, 0, y + h, 0, y + h - feather, [x, y + h - feather, w, feather]],
  ];
  for (const [exposed, x0, y0, x1, y1, area] of sides) {
    if (!exposed) continue;
    const gradient = context.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, edge);
    gradient.addColorStop(1, `${edge}00`);
    context.fillStyle = gradient;
    context.fillRect(area[0], area[1], area[2], area[3]);
  }
}

function drawLayer(context: CanvasRenderingContext2D, loaded: LoadedScene, layer: SceneLayer, frame: SceneFrame): void {
  const bitmap = loaded.images.get(layer.image);
  if (bitmap === undefined) return;
  const [k, tx, ty] = layerTransform(frame.camera, layer.depth, loaded.scene.camera.playerShift);
  const [x, y, w, h] = layer.rect;
  context.save();
  context.translate(tx, ty);
  context.scale(k, k);
  context.globalAlpha = layer.opacity * frame.opacity;
  context.drawImage(bitmap, x, y, w, h);
  if (layer.covers) featherEdges(context, loaded.scene, layer.rect, layerSpaceView(frame, k, tx, ty));
  context.restore();
}

/** Back plane: everything behind platforms and actors. Fills the whole view. */
export function drawSceneBack(context: CanvasRenderingContext2D, loaded: LoadedScene, frame: SceneFrame): void {
  context.save();
  // Default (low) smoothing: "high" costs a frame or more per large layer in
  // software rasterisers, for no visible gain at the game's scale factors.
  context.imageSmoothingEnabled = true;
  if (frame.opacity >= 1) {
    context.fillStyle = loaded.scene.edge.color;
    context.fillRect(
      frame.view.left,
      frame.view.top,
      frame.view.right - frame.view.left,
      frame.view.bottom - frame.view.top,
    );
  }
  for (const layer of loaded.scene.layers) if (layer.plane === "back") drawLayer(context, loaded, layer, frame);
  context.restore();
}

/** Front plane: drawn over platforms; the painter keeps it below the floor surface. */
export function drawSceneFront(context: CanvasRenderingContext2D, loaded: LoadedScene, frame: SceneFrame): void {
  context.save();
  context.imageSmoothingEnabled = true;
  for (const layer of loaded.scene.layers) if (layer.plane === "front") drawLayer(context, loaded, layer, frame);
  context.restore();
}

export interface SurfaceTarget {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const patterns = new WeakMap<SceneBitmap, { context: CanvasRenderingContext2D; pattern: CanvasPattern }>();

function stripPattern(context: CanvasRenderingContext2D, bitmap: SceneBitmap): CanvasPattern | null {
  const cached = patterns.get(bitmap);
  if (cached?.context === context) return cached.pattern;
  const pattern = context.createPattern(bitmap, "repeat-x");
  if (pattern !== null) patterns.set(bitmap, { context, pattern });
  return pattern;
}

/**
 * Fills a platform or the floor with the stage's surface strip: anchored to
 * the surface top, repeated horizontally from world x = 0, solid fill below.
 * Returns false (the material keeps its own fill) until the texture is ready.
 */
export function drawPlatformTexture(
  context: CanvasRenderingContext2D,
  loaded: LoadedScene,
  target: SurfaceTarget,
): boolean {
  const binding = loaded.scene.platforms;
  const bitmap = loaded.images.get(binding.texture);
  if (bitmap === undefined || !(target.w > 0 && target.h > 0)) return false;
  const pattern = stripPattern(context, bitmap);
  if (pattern === null) return false;
  const strip = Math.min(target.h, bitmap.height * binding.scale);
  context.save();
  if (strip < target.h) {
    context.fillStyle = binding.fill;
    context.fillRect(target.x, target.y + strip - 0.5, target.w, target.h - strip + 0.5);
  }
  pattern.setTransform({ a: binding.scale, b: 0, c: 0, d: binding.scale, e: 0, f: target.y });
  context.fillStyle = pattern;
  context.fillRect(target.x, target.y, target.w, strip);
  context.restore();
  return true;
}

/** Soft shadows each platform casts onto the back plane, separating it from painted scenery. */
export function drawPlatformShadows(
  context: CanvasRenderingContext2D,
  loaded: LoadedScene,
  platforms: readonly SurfaceTarget[],
): void {
  const { color, opacity, length } = loaded.scene.platforms.shadow;
  if (opacity <= 0 || length <= 0) return;
  context.save();
  context.globalAlpha *= opacity;
  for (const platform of platforms) {
    const top = platform.y + platform.h;
    const shadow = context.createLinearGradient(0, top, 0, top + length);
    shadow.addColorStop(0, color);
    shadow.addColorStop(1, `${color}00`);
    context.fillStyle = shadow;
    context.fillRect(platform.x + 6, top, Math.max(0, platform.w - 12), length);
  }
  context.restore();
}
