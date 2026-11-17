// The parts of the scene size rule that need decoded pixels (docs/BACKGROUND_WORKFLOW.md,
// "Size rule"): no alpha plane without transparency, no layer stored larger than
// its detail needs, and no part of the painting stored twice. Used by
// `pnpm scene validate` and tests/unit/scene-packages.test.ts.
import { join } from "node:path";
import sharp from "sharp";
import { hiddenDetail, hiddenMask, layersOver } from "./hidden-paint.mjs";

/** A layer this alike to its own half-size copy holds nothing a half-size file would lose. */
export const SOFT_LAYER_LIKENESS = 0.985;
/** A file already smaller than this is not worth shrinking further. */
export const SOFT_LAYER_FLOOR_BYTES = 16 * 1024;
/**
 * Most detail (mean change per channel, 0..255, that softening would still
 * make) a layer may keep where nearer layers always cover it.
 */
export const HIDDEN_DETAIL_LIMIT = 3;
/** A hidden area smaller than this share of the image is not worth a failure. */
const HIDDEN_SHARE_FLOOR = 0.01;

async function decode(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { hasAlpha } = await sharp(path).metadata();
  return { data, width: info.width, height: info.height, hasAlpha: hasAlpha === true };
}

/** Luma over mid grey, so a difference in alpha counts as a visible difference. */
function flatten({ data, width, height }) {
  const out = new Float32Array(width * height);
  for (let index = 0; index < out.length; index += 1) {
    const at = index * 4;
    const alpha = data[at + 3] / 255;
    out[index] = (0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2]) * alpha + 128 * (1 - alpha);
  }
  return out;
}

/** Mean structural similarity of two luma planes (8x8 windows, stride 4); 1 is identical. */
export function likeness(a, b, width, height) {
  const C1 = 6.5025;
  const C2 = 58.5225;
  let sum = 0;
  let count = 0;
  for (let y = 0; y + 8 <= height; y += 4) {
    for (let x = 0; x + 8 <= width; x += 4) {
      let meanA = 0;
      let meanB = 0;
      for (let row = 0; row < 8; row += 1) {
        const start = (y + row) * width + x;
        for (let column = 0; column < 8; column += 1) {
          meanA += a[start + column];
          meanB += b[start + column];
        }
      }
      meanA /= 64;
      meanB /= 64;
      let varianceA = 0;
      let varianceB = 0;
      let covariance = 0;
      for (let row = 0; row < 8; row += 1) {
        const start = (y + row) * width + x;
        for (let column = 0; column < 8; column += 1) {
          const da = a[start + column] - meanA;
          const db = b[start + column] - meanB;
          varianceA += da * da;
          varianceB += db * db;
          covariance += da * db;
        }
      }
      sum +=
        ((2 * meanA * meanB + C1) * ((2 * covariance) / 63 + C2)) /
        ((meanA * meanA + meanB * meanB + C1) * ((varianceA + varianceB) / 63 + C2));
      count += 1;
    }
  }
  return count === 0 ? 1 : sum / count;
}

/** How alike an image is to itself stored at half size and drawn back at full size. */
async function halfSizeLikeness(path, image) {
  const { width, height } = image;
  if (width < 32 || height < 32) return 0; // too small for the saving to matter
  const half = await sharp(path)
    .ensureAlpha()
    .resize(Math.round(width / 2), Math.round(height / 2), { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const back = await sharp(half).resize(width, height, { kernel: "cubic", fit: "fill" }).raw().toBuffer();
  return likeness(flatten(image), flatten({ data: back, width, height }), width, height);
}

/**
 * Runs the pixel checks over one validated package. Returns the measurements
 * and a problem line for each breach.
 */
export async function pixelChecks(directory, scene) {
  const problems = [];
  const images = new Map();
  const report = { images: [], hidden: [], problems };
  for (const image of scene.images) {
    const path = join(directory, image.file);
    const decoded = await decode(path);
    images.set(image.id, decoded);
    let seeThrough = 0;
    for (let at = 3; at < decoded.data.length; at += 4) if (decoded.data[at] < 255) seeThrough += 1;
    const seeThroughShare = seeThrough / (decoded.width * decoded.height);
    if (image.alpha && seeThrough === 0)
      problems.push(`${image.file}: stores an alpha plane but every pixel is opaque; set "alpha": false`);
    if (!image.alpha && decoded.hasAlpha)
      problems.push(`${image.file}: the manifest says opaque but the file stores an alpha plane`);
    const soft = await halfSizeLikeness(path, decoded);
    if (soft >= SOFT_LAYER_LIKENESS && image.bytes >= SOFT_LAYER_FLOOR_BYTES)
      problems.push(
        `${image.file}: ${soft.toFixed(3)} alike to its own half-size copy (limit ${String(SOFT_LAYER_LIKENESS)}); it is flat or soft, so store it at half size (a "resize" step) or draw it in code`,
      );
    report.images.push({ id: image.id, seeThroughShare, halfSizeLikeness: soft });
  }
  // Nothing painted twice: no detail left where nearer layers always cover a layer.
  for (const layer of scene.layers) {
    if (scene.layers.filter((item) => item.image === layer.image).length !== 1) continue;
    const uppers = layersOver(scene, layer).map((item) => ({
      ...images.get(item.image),
      rect: item.rect,
      depth: item.depth,
    }));
    if (uppers.length === 0) continue;
    const lower = images.get(layer.image);
    const { share, detail } = await hiddenDetail(
      lower,
      hiddenMask(scene, { ...lower, rect: layer.rect, depth: layer.depth }, uppers),
    );
    report.hidden.push({ layer: layer.id, share, detail });
    if (share >= HIDDEN_SHARE_FLOOR && detail > HIDDEN_DETAIL_LIMIT)
      problems.push(
        `layer ${layer.id}: ${(share * 100).toFixed(0)}% of it is always behind nearer layers and still holds detail (${detail.toFixed(1)}, limit ${String(HIDDEN_DETAIL_LIMIT)}); rebuild the package with pnpm scene build so it is not stored twice`,
      );
  }
  return report;
}
