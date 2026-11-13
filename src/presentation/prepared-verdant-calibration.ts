import { validateVerdantScenePackage, type VerdantAssetKey, type VerdantSceneAsset, type VerdantSceneLayer } from "./verdant-scene-package";
import { VERDANT_FOREGROUND_CONTOURS } from "./verdant-foreground-occlusion";
import { VERDANT_POOL_CONTOURS } from "./verdant-pool-receiver";
import { createVerdantWaterFlow, drawVerdantInletFalls } from "./verdant-water-flow";

/** App-owned IN1 control / IN2 layer resources. No gameplay or camera authority. */
export interface CalibrationBitmap {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly encodedBytes: number;
  readonly close: () => void;
}
export type CalibrationLoader = (url: string, signal: AbortSignal, asset: VerdantSceneAsset) => Promise<CalibrationBitmap>;
export type VerdantSceneView = "composite" | "support-only" | "tail-only" | "foliage-only";
export type VerdantMotionView = "live" | "neutral" | "minimum" | "maximum";
/** Shared presentation phase; reset/seek has no retained animation state. */
export function verdantTailFrame(seconds: number): number {
  return Math.round(4 + 4 * Math.sin(seconds * 1.1));
}
/** Source-space attachment profile shared by each bounded foliage strip. */
export function verdantFoliageOffset(row: number, seconds: number, group: number, view: VerdantMotionView): number {
  const weight = Math.min(1, Math.max(0, (row - 80) / 400)) ** 2;
  return view === "neutral" || weight === 0 ? 0 : 12 * weight * (view === "minimum" ? -1 : view === "maximum" ? 1
    : Math.sin(seconds * Math.PI / 2 + group * 1.4));
}
function prepareSceneClip(contours: readonly (readonly (readonly [number, number])[])[]): Path2D {
  const path = new Path2D();
  for (const contour of contours) {
    contour.forEach(([x, y], index) => {
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
  }
  return path;
}
export interface PreparedVerdantCalibration {
  prepare(): Promise<void>;
  dispose(): void;
  status(): "idle" | "loading" | "ready" | "failed" | "disposed";
  draw(context: CanvasRenderingContext2D, width: number, seconds?: number, motionAllowed?: boolean, flashScale?: number): boolean;
  setDiagnosticView(view: unknown): void;
  setDiagnosticMotion(view: unknown): void;
  report(): Readonly<{
    packageId: string; status: ReturnType<PreparedVerdantCalibration["status"]>; fallbackActive: boolean;
    view: VerdantSceneView; motionView: VerdantMotionView; decodedResources: number; decodedBytes: number; encodedBytes: number; failure: string | null;
  }>;
}

/** App-scoped owner: no loading, allocation, or mutable game state during draw. */
export function createPreparedVerdantCalibration(
  input: unknown, urls: Readonly<Partial<Record<VerdantAssetKey, string>>>, load: CalibrationLoader,
): PreparedVerdantCalibration {
  const manifest = validateVerdantScenePackage(input);
  const requests = manifest.assets.map((asset) => {
    const url = urls[asset.key];
    if (!url) throw new Error(`Missing registered asset URL: ${asset.key}`);
    return { asset, url };
  });
  let state: ReturnType<PreparedVerdantCalibration["status"]> = "idle";
  let pending: Promise<void> | undefined;
  let tiles: CalibrationBitmap[] = [];
  let layers: readonly Readonly<{ bitmap: CalibrationBitmap; layer: VerdantSceneLayer }>[] = [];
  let foregroundClip: Path2D | undefined;
  let poolClip: Path2D | undefined;
  let poolBitmap: CalibrationBitmap | undefined;
  let waterFlow: ReturnType<typeof createVerdantWaterFlow> | undefined;
  let diagnosticView: VerdantSceneView = "composite";
  let motionView: VerdantMotionView = "live";
  let failure: string | null = null;
  const abort = new AbortController();
  return {
    status: () => state,
    prepare() {
      if (pending) return pending;
      if (state === "disposed") return Promise.resolve();
      state = "loading";
      pending = (async () => {
        const prepared: CalibrationBitmap[] = [];
        try {
          for (const { asset, url } of requests) {
            const tile = await load(url, abort.signal, asset);
            prepared.push(tile);
            if (abort.signal.aborted) throw new Error("Calibration preparation cancelled");
            if (tile.width !== asset.width || tile.height !== asset.height) {
              throw new Error("Calibration tile dimensions do not match source receipt");
            }
          }
          const ordered = manifest.layers.map((layer) => {
            const index = manifest.assets.findIndex((asset) => asset.id === layer.assetId);
            const bitmap = prepared[index];
            if (!bitmap) throw new Error("Missing prepared layer");
            return Object.freeze({ bitmap, layer });
          });
          if (manifest.id === "verdant-living-stage-prototype") {
            foregroundClip = prepareSceneClip(VERDANT_FOREGROUND_CONTOURS);
          }
          if (manifest.poolRefraction) {
            poolClip = prepareSceneClip(VERDANT_POOL_CONTOURS);
            poolBitmap = prepared[manifest.assets.findIndex((asset) => asset.key === "structure-bottom")];
            if (!poolBitmap) throw new Error("Pool backing is unavailable");
            waterFlow = createVerdantWaterFlow();
          }
          tiles = prepared;
          layers = ordered;
          state = "ready";
        } catch (error) {
          for (const tile of prepared) tile.close();
          foregroundClip = undefined; poolClip = undefined; poolBitmap = undefined; waterFlow = undefined;
          if (!abort.signal.aborted) { state = "failed"; failure = error instanceof Error ? error.message : "Scene preparation failed"; }
        }
      })();
      return pending;
    },
    dispose() {
      abort.abort();
      for (const tile of tiles) tile.close();
      tiles = [];
      layers = [];
      foregroundClip = undefined;
      poolClip = undefined;
      poolBitmap = undefined;
      waterFlow = undefined;
      state = "disposed";
    },
    draw(context, width, seconds = 0, motionAllowed = false, flashScale = 1) {
      if (state !== "ready" || !Number.isFinite(width) || width <= 0 || !Number.isFinite(seconds)) return false;
      // Authored world placement. Never cover-fit to the inverse-camera bounds.
      const scale = width / 1672;
      const moving = motionAllowed && motionView !== "neutral";
      const flash = Number.isFinite(flashScale) ? Math.max(0, Math.min(1, flashScale)) : 0;
      const frame = !moving ? 4 : motionView === "minimum" ? 0 : motionView === "maximum" ? 8 : verdantTailFrame(seconds);
      context.save();
      for (const { bitmap, layer } of layers) {
        if (diagnosticView === "support-only" && layer.purpose !== "support") continue;
        if (diagnosticView === "tail-only" && layer.purpose !== "tail") continue;
        if (diagnosticView === "foliage-only" && layer.purpose !== "foliage") continue;
        const [x, y, w, h] = layer.rect;
        if (layer.motion === "anchored-foliage" && moving) {
          // Piecewise-affine approximation of the offline quadratic bend. No
          // scratch canvas, texture allocation, or deformation of rigid backing.
          context.drawImage(bitmap.image, 0, 0, w, 80, x * scale, y * scale, w * scale, 80 * scale);
          for (let group = 0; group < 2; group += 1) {
            for (let row = 80; row < h; row += 16) {
              const height = Math.min(16, h - row);
              const start = verdantFoliageOffset(row, seconds, group, motionView);
              const end = verdantFoliageOffset(row + height, seconds, group, motionView);
              context.save();
              context.transform(scale, 0, (end - start) / height * scale, scale,
                (x + group * w / 2 + start) * scale, (y + row) * scale);
              context.drawImage(bitmap.image, group * w / 2, row, w / 2, height, 0, 0, w / 2, height);
              context.restore();
            }
          }
        } else if (layer.motion === "anchored-sequence") {
          context.drawImage(bitmap.image, frame * 54 + 2, 2, 50, 50, x * scale, y * scale, w * scale, h * scale);
        } else context.drawImage(bitmap.image, x * scale, y * scale, w * scale, h * scale);
      }
      if (moving && flash > 0 && poolClip && poolBitmap && waterFlow && diagnosticView === "composite") {
        context.save(); context.scale(scale, scale); context.clip(poolClip, "evenodd");
        waterFlow.draw(context, poolBitmap.image, seconds, motionView, flash);
        context.restore();
        context.save(); context.scale(scale, scale);
        drawVerdantInletFalls(context, motionView === "live" ? seconds : motionView === "minimum" ? .45 : 2.35, flash);
        context.restore();
      }
      if (foregroundClip && diagnosticView === "composite") {
        context.save();
        context.scale(scale, scale);
        context.clip(foregroundClip, "evenodd");
        for (const { bitmap, layer } of layers) {
          if (layer.purpose !== "support" || layer.rect[0] !== 0) continue;
          const [x, y, w, h] = layer.rect;
          context.drawImage(bitmap.image, x, y, w, h);
        }
        context.restore();
      }
      // An authored water-only receiver, behind every gameplay draw. No reflected
      // actors, dry ruin distortion, full-scene pulse, or persistent effect cache.
      if (moving && flash > 0 && diagnosticView === "composite" && manifest.water) {
        const water = manifest.water;
        const phase = seconds * .55;
        const opacity = motionView === "live" ? Math.sin(phase) ** 2 : 1;
        const shift = water.maxDisplacement * (motionView === "minimum" ? -1 : motionView === "maximum" ? 1 : Math.sin(phase));
        context.save(); context.scale(scale, scale);
        context.beginPath();
        water.receiver.forEach(([x, y], index) => { if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
        context.closePath(); context.clip();
        context.strokeStyle = "#c9e5b3"; context.lineWidth = 1;
        for (let index = 0; index < 3; index += 1) {
          const x = 750 + index * 53 + shift, y = 809 + index * 8;
          context.globalAlpha = water.maxOpacity * opacity * flash * (1 - index * .2);
          context.beginPath(); context.moveTo(x, y);
          context.quadraticCurveTo(x + 18, y - 1, x + 39, y);
          context.stroke();
        }
        context.restore();
      }
      context.restore();
      return true;
    },
    setDiagnosticView(view) {
      if (view !== "composite" && view !== "support-only" && view !== "tail-only" && view !== "foliage-only") throw new Error("Unknown scene diagnostic view");
      diagnosticView = view;
    },
    setDiagnosticMotion(view) {
      if (view !== "live" && view !== "neutral" && view !== "minimum" && view !== "maximum") throw new Error("Unknown scene motion view");
      motionView = view;
    },
    report: () => Object.freeze({ packageId: manifest.id, status: state, fallbackActive: state !== "ready", view: diagnosticView, motionView,
      decodedResources: tiles.length, decodedBytes: tiles.reduce((sum, tile) => sum + tile.width * tile.height * 4, 0),
      encodedBytes: tiles.reduce((sum, tile) => sum + tile.encodedBytes, 0), failure }),
  };
}

export async function loadVerifiedPresentationBitmap(
  url: string, signal: AbortSignal, asset: Pick<VerdantSceneAsset, "sha256">,
  resize?: Readonly<{ width: number; height: number }>,
): Promise<CalibrationBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Calibration request failed: ${String(response.status)}`);
  const blob = await response.blob();
  if (blob.size > 2 * 1024 * 1024) throw new Error("Calibration tile exceeds existing cache limit");
  const contentHash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const actualHash = Array.from(new Uint8Array(contentHash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== asset.sha256) throw new Error("Scene asset content digest mismatch");
  signal.throwIfAborted();
  const bitmap = resize
    ? await createImageBitmap(blob, { resizeWidth: resize.width, resizeHeight: resize.height, resizeQuality: "high" })
    : await createImageBitmap(blob);
  if (signal.aborted) { bitmap.close(); throw new Error("Calibration decode cancelled"); }
  return { image: bitmap, width: bitmap.width, height: bitmap.height, encodedBytes: blob.size, close: () => { bitmap.close(); } };
}

/** Prototype material lighting is prepared once, never applied as a per-frame
 * filter. Source-atop keeps leaf coverage while reducing peripheral prominence.
 * The decoded input is released before this app owner publishes its replacement. */
export const loadCalibrationBitmap: CalibrationLoader = async (url, signal, asset) => {
  const original = await loadVerifiedPresentationBitmap(url, signal, asset);
  if (asset.key !== "foliage") return original;
  let surface: OffscreenCanvas | undefined;
  let shaded: ImageBitmap | undefined;
  try {
    surface = new OffscreenCanvas(original.width, original.height);
    const context = surface.getContext("2d");
    if (!context) throw new Error("Foliage lighting context unavailable");
    context.drawImage(original.image, 0, 0);
    const shade = context.createLinearGradient(0, 0, original.width, 0);
    shade.addColorStop(0, "rgba(0,0,0,0.28)");
    shade.addColorStop(.24, "rgba(0,0,0,0.24)");
    shade.addColorStop(.5, "rgba(0,0,0,0.06)");
    shade.addColorStop(.72, "rgba(0,0,0,0.18)");
    shade.addColorStop(1, "rgba(0,0,0,0.28)");
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = shade;
    context.fillRect(0, 0, original.width, original.height);
    shaded = surface.transferToImageBitmap();
    signal.throwIfAborted();
    const image = shaded;
    return { image, width: original.width, height: original.height, encodedBytes: original.encodedBytes,
      close: () => { image.close(); } };
  } catch (error) {
    shaded?.close();
    throw error;
  } finally {
    original.close();
    if (surface) { surface.width = 1; surface.height = 1; }
  }
};
