import { loadVerifiedPresentationBitmap, type CalibrationBitmap } from "../prepared-verdant-calibration";

/** One small shared material, within the remaining IN3 resident-image budget. */
export const VERDANT_MATERIAL_RECEIPT = Object.freeze({
  sha256: "873ff56d436584576d989fef0ec6e692e19329bc8343eeae574cb58e9fba2a5b",
  sourceWidth: 2172, sourceHeight: 724,
  width: 256, height: 85, decodedBytes: 256 * 85 * 4,
});
export interface VerdantMaterialRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface PreparedVerdantMaterial {
  prepare(): Promise<void>;
  dispose(): void;
  status(): "idle" | "loading" | "ready" | "failed" | "disposed";
  draw(context: CanvasRenderingContext2D, rectangle: VerdantMaterialRect, floor: boolean): boolean;
}
type MaterialLoader = (url: string, signal: AbortSignal) => Promise<CalibrationBitmap>;
const loadMaterial: MaterialLoader = (url, signal) =>
  loadVerifiedPresentationBitmap(url, signal, VERDANT_MATERIAL_RECEIPT, VERDANT_MATERIAL_RECEIPT);

/** App owns this handle; every world receives only the same read-only draw port. */
export function createPreparedVerdantMaterial(url: string, load: MaterialLoader = loadMaterial): PreparedVerdantMaterial {
  let state: ReturnType<PreparedVerdantMaterial["status"]> = "idle";
  let bitmap: CalibrationBitmap | undefined;
  let pending: Promise<void> | undefined;
  const abort = new AbortController();
  return {
    status: () => state,
    prepare() {
      if (pending) return pending;
      if (state === "disposed") return Promise.resolve();
      state = "loading";
      pending = (async () => {
        let loaded: CalibrationBitmap | undefined;
        try {
          loaded = await load(url, abort.signal);
          if (abort.signal.aborted || loaded.width !== VERDANT_MATERIAL_RECEIPT.width
            || loaded.height !== VERDANT_MATERIAL_RECEIPT.height) throw new Error("Material registration mismatch");
          bitmap = loaded;
          state = "ready";
        } catch {
          loaded?.close();
          if (!abort.signal.aborted) state = "failed";
        }
      })();
      return pending;
    },
    dispose() {
      abort.abort();
      bitmap?.close();
      bitmap = undefined;
      state = "disposed";
    },
    draw(context, rectangle, floor) {
      if (!bitmap || state !== "ready" || ![rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(Number.isFinite)
        || rectangle.w <= 0 || rectangle.h <= 0) return false;
      // World-anchored repeated cells do not stretch masonry to platform width.
      // Floor top keeps its authored depth even when overscan expands the bank.
      const sourceHeight = floor ? 85 : 24;
      const height = floor ? Math.min(rectangle.h, 128) : rectangle.h;
      const scale = height / sourceHeight, cellWidth = bitmap.width * scale;
      if (Math.ceil(rectangle.w / cellWidth) + 1 > 64) return false;
      context.save();
      context.beginPath(); context.rect(rectangle.x, rectangle.y, rectangle.w, rectangle.h); context.clip();
      context.fillStyle = "#091c13";
      context.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
      const first = Math.floor(rectangle.x / cellWidth) * cellWidth;
      for (let x = first; x < rectangle.x + rectangle.w; x += cellWidth) {
        context.drawImage(bitmap.image, 0, 0, bitmap.width, sourceHeight, x, rectangle.y, cellWidth, height);
      }
      context.restore();
      return true;
    },
  };
}
