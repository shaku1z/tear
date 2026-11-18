// `pnpm scene build <stage> --sources <dir>`: deterministic preparation of a
// scene package from its recipe. Sources stay outside the repository; their
// hashes are pinned in the recipe, so a changed source fails before any pixel
// is written. Outputs: the package images (AVIF), scene.json and scene.ts.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { hiddenMask, layersOver, softenHidden } from "./hidden-paint.mjs";
import { loadContract, sha256 } from "./package-files.mjs";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * Every layer is AVIF with full-resolution colour. Quality 62 measured the same
 * against the lossless Verdant layers as WebP at 84 did, at 73% of the bytes;
 * a recipe output may lower it, with side-by-side crops for the owner.
 */
export const SCENE_IMAGE_QUALITY = 62;
const encodeLayer = (image, quality) => image.avif({ quality, effort: 7, chromaSubsampling: "4:4:4" }).toBuffer();

async function readSource(recipe, sourcesDirectory, id) {
  const source = recipe.sources.find((item) => item.id === id);
  if (source?.file === undefined) throw new Error(`recipe source "${id}" has no file`);
  const path = join(sourcesDirectory, source.file);
  if (!existsSync(path)) throw new Error(`source ${id}: ${path} is missing`);
  const buffer = readFileSync(path);
  if (sha256(buffer) !== source.sha256)
    throw new Error(`source ${id}: ${source.file} does not match its pinned sha256`);
  return buffer;
}

/**
 * Hash that pins a generated source: its generator settings, canonically
 * ordered. Placeholder plates are reproducible and pinned like paintings.
 */
export function generatorHash(spec) {
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return sha256(Buffer.from(JSON.stringify(canonical(spec))));
}

const hex = (color) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));

function gradientAt(stops, t) {
  let index = 1;
  while (index < stops.length - 1 && stops[index][0] < t) index += 1;
  const [t0, c0] = stops[index - 1];
  const [t1, c1] = stops[index];
  const k = clamp((t - t0) / Math.max(1e-6, t1 - t0), 0, 1);
  const a = hex(c0);
  const b = hex(c1);
  return a.map((value, channel) => value + (b[channel] - value) * k);
}

/**
 * A placeholder plate from settings, for a biome that has no painting yet:
 * a vertical gradient (`stops`: [position 0..1, colour]) with optional ridge
 * silhouettes (`ridges`: { y, amplitude, period, phase, color }, all in px),
 * each filling below a sum of two sines.
 */
function generate(spec) {
  const { width, height } = spec;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const [r, g, b] = gradientAt(spec.stops, y / Math.max(1, height - 1));
    for (let x = 0; x < width; x += 1) data.set([r, g, b, 255], (y * width + x) * 4);
  }
  for (const ridge of spec.ridges ?? []) {
    const color = hex(ridge.color);
    for (let x = 0; x < width; x += 1) {
      const angle = ((x + (ridge.phase ?? 0)) / ridge.period) * Math.PI * 2;
      const top = ridge.y - ridge.amplitude * (0.65 * Math.sin(angle) + 0.35 * Math.sin(angle * 2.7 + 1.3));
      for (let y = Math.max(0, Math.floor(top)); y < height; y += 1) {
        const cover = clamp(y + 1 - top, 0, 1); // antialiased top edge
        const at = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1)
          data[at + channel] += (color[channel] - data[at + channel]) * cover;
      }
    }
  }
  return { width, height, data };
}

async function loadSource(recipe, sourcesDirectory, id) {
  const source = recipe.sources.find((item) => item.id === id);
  if (source?.origin === "procedural" && source.generate !== undefined) {
    if (generatorHash(source.generate) !== source.sha256)
      throw new Error(
        `source ${id}: generator settings do not match the pinned sha256 (${generatorHash(source.generate)})`,
      );
    return generate(source.generate);
  }
  return rgba(await readSource(recipe, sourcesDirectory, id));
}

async function rgba(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
  };
}

async function blurChannel(values, width, height, sigma) {
  if (sigma <= 0) return values;
  const out = await sharp(Buffer.from(values.buffer, values.byteOffset, values.length), {
    raw: { width, height, channels: 1 },
  })
    .blur(sigma)
    .extractChannel(0) // libvips widens 1-channel raw input to sRGB; keep one channel
    .raw()
    .toBuffer();
  return new Uint8ClampedArray(out.buffer, out.byteOffset, out.length);
}

/** Named masks are single-channel 0..255 buffers in the working image's space. */
async function buildMask(step, context) {
  const [width, height] = step.canvas ?? [context.image.width, context.image.height];
  const mask = new Uint8ClampedArray(width * height).fill(step.fill ?? 0);
  for (const place of step.place ?? []) {
    const { data, info } = await sharp(await readSource(context.recipe, context.sources, place.source))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const [ax, ay] = place.at ?? [0, 0];
    const threshold = place.threshold ?? 127;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const tx = x + ax,
          ty = y + ay;
        if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
        const on = data[y * info.width + x] > threshold;
        mask[ty * width + tx] = (place.invert ? !on : on) ? 255 : 0;
      }
    }
  }
  for (const { rect, value } of step.rects ?? []) {
    const [rx, ry, rw, rh] = rect;
    for (let y = Math.max(0, ry); y < Math.min(height, ry + rh); y += 1) {
      for (let x = Math.max(0, rx); x < Math.min(width, rx + rw); x += 1) mask[y * width + x] = value;
    }
  }
  const blurred = await blurChannel(mask, width, height, step.blur ?? 0);
  // `clipAbove`: nothing above row `y`, then a linear ramp over `ramp` rows. Used
  // for front layers, which must never reach above the floor surface.
  if (step.clipAbove !== undefined) {
    const { y: cut, ramp = 0 } = step.clipAbove;
    for (let y = 0; y < height; y += 1) {
      const factor = y < cut ? 0 : ramp > 0 ? Math.min(1, (y - cut) / ramp) : 1;
      if (factor === 1) continue;
      for (let x = 0; x < width; x += 1) blurred[y * width + x] *= factor;
    }
  }
  return blurred;
}

/**
 * Replaces masked pixels with a normalized blur of the unmasked surroundings, so
 * a nearer layer can slide over it without revealing a copy of itself.
 */
async function inpaintBlur(image, mask, sigma) {
  const { width, height, data } = image;
  const weight = new Uint8ClampedArray(width * height);
  for (let index = 0; index < weight.length; index += 1) weight[index] = 255 - mask[index];
  const blurredWeight = await blurChannel(weight, width, height, sigma);
  const channels = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const weighted = new Uint8ClampedArray(width * height);
    for (let index = 0; index < weighted.length; index += 1)
      weighted[index] = (data[index * 4 + channel] * weight[index]) / 255;
    channels.push(await blurChannel(weighted, width, height, sigma));
  }
  for (let index = 0; index < width * height; index += 1) {
    const amount = mask[index] / 255;
    if (amount === 0) continue;
    const norm = Math.max(1, blurredWeight[index]);
    // Far from any unmasked pixel the blur has no support: keep the original there.
    const confidence = amount * clamp(blurredWeight[index] / 48, 0, 1);
    for (let channel = 0; channel < 3; channel += 1) {
      const fill = clamp((channels[channel][index] * 255) / norm, 0, 255);
      data[index * 4 + channel] = data[index * 4 + channel] * (1 - confidence) + fill * confidence;
    }
  }
}

/** Makes an image wrap horizontally by cross-fading its last columns onto its first. */
function tileable(image, overlap) {
  const { width, height, data } = image;
  const out = new Uint8ClampedArray((width - overlap) * height * 4);
  const newWidth = width - overlap;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < newWidth; x += 1) {
      const target = (y * newWidth + x) * 4;
      const source = (y * width + x) * 4;
      if (x < overlap) {
        const t = x / overlap;
        const tail = (y * width + newWidth + x) * 4;
        for (let channel = 0; channel < 4; channel += 1)
          out[target + channel] = data[tail + channel] * (1 - t) + data[source + channel] * t;
      } else for (let channel = 0; channel < 4; channel += 1) out[target + channel] = data[source + channel];
    }
  }
  return { width: newWidth, height, data: out };
}

function crop(image, [x, y, w, h]) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const start = ((y + row) * image.width + x) * 4;
    out.set(image.data.subarray(start, start + w * 4), row * w * 4);
  }
  return { width: w, height: h, data: out };
}

function alphaBounds(image, pad) {
  let left = image.width,
    top = image.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error("crop-alpha: image is fully transparent");
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(image.width - 1, right + pad);
  bottom = Math.min(image.height - 1, bottom + pad);
  return [left, top, right - left + 1, bottom - top + 1];
}

/** Runs one output's steps; tracks where its pixels sit in recipe space. Returns the layer unencoded. */
async function runOutput(output, context) {
  const masks = new Map();
  let placement = [0, 0, 0, 0];
  for (const step of output.steps) {
    switch (step.op) {
      case "load": {
        context.image = await loadSource(context.recipe, context.sources, step.source);
        const [x, y] = step.at ?? [0, 0];
        placement = [x, y, context.image.width, context.image.height];
        break;
      }
      case "mask":
        masks.set(step.name, await buildMask(step, context));
        break;
      case "inpaint-blur":
        await inpaintBlur(context.image, masks.get(step.mask), step.sigma);
        break;
      case "alpha": {
        const mask = masks.get(step.mask);
        for (let index = 0; index < mask.length; index += 1) context.image.data[index * 4 + 3] = mask[index];
        break;
      }
      case "crop":
      case "crop-alpha": {
        // Masks live in the pre-crop space: use them before cropping.
        const rect = step.op === "crop" ? step.rect : alphaBounds(context.image, step.pad ?? 2);
        const factor = placement[2] / context.image.width;
        placement = [
          placement[0] + rect[0] * factor,
          placement[1] + rect[1] * factor,
          rect[2] * factor,
          rect[3] * factor,
        ];
        context.image = crop(context.image, rect);
        masks.clear();
        break;
      }
      case "flat": {
        // One colour everywhere, keeping the alpha: a mask image, whose alpha is all that is read.
        const [r, g, b] = hex(step.color);
        for (let at = 0; at < context.image.data.length; at += 4) context.image.data.set([r, g, b], at);
        break;
      }
      case "tileable": {
        const factor = placement[2] / context.image.width;
        context.image = tileable(context.image, step.overlap);
        placement = [placement[0], placement[1], context.image.width * factor, context.image.height * factor];
        break;
      }
      case "resize": {
        const { width, height } = context.image;
        const target = [Math.round(width * step.scale), Math.round(height * step.scale)];
        const out = await sharp(Buffer.from(context.image.data.buffer), { raw: { width, height, channels: 4 } })
          .resize(target[0], target[1], { kernel: "lanczos3" })
          .raw()
          .toBuffer();
        context.image = {
          width: target[0],
          height: target[1],
          data: new Uint8ClampedArray(out.buffer, out.byteOffset, out.length),
        };
        break; // placement keeps its recipe-space size: only pixel density changed
      }
      default:
        throw new Error(`unknown recipe op "${step.op}"`);
    }
  }
  const { width, height, data } = context.image;
  const alpha = output.alpha === true;
  if (alpha) {
    // Colour under a fully transparent pixel is never seen: clear it so the
    // encoder spends nothing there. A layer with no transparency needs no alpha.
    let seeThrough = 0;
    for (let index = 0; index < width * height; index += 1) {
      const at = index * 4;
      if (data[at + 3] === 0) data.fill(0, at, at + 3);
      if (data[at + 3] < 255) seeThrough += 1;
    }
    if (seeThrough === 0)
      throw new Error(`output ${output.id}: every pixel is opaque; set "alpha": false so no alpha plane is stored`);
  }
  return { image: { width, height, data }, alpha, placement };
}

async function encode(image, alpha, quality) {
  const { width, height, data } = image;
  const encoder = sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {
    raw: { width, height, channels: 4 },
  });
  return encodeLayer(alpha ? encoder : encoder.removeAlpha(), quality);
}

/**
 * Nothing painted twice: softens the part of each layer image that nearer
 * layers cover for every camera the package allows. An image drawn by more
 * than one layer, or not as a layer at all, is left alone.
 */
async function softenHiddenPaint(template, built, log) {
  for (const layer of template.layers) {
    const lower = built.get(layer.image);
    if (template.layers.filter((item) => item.image === layer.image).length !== 1) continue;
    const uppers = layersOver(template, layer).map((item) => {
      const upper = built.get(item.image);
      return { ...upper.image, rect: upper.rect, depth: item.depth };
    });
    if (uppers.length === 0) continue;
    const hidden = hiddenMask(template, { ...lower.image, rect: lower.rect, depth: layer.depth }, uppers);
    const share = hidden.reduce((total, value) => total + value, 0) / hidden.length;
    if (share === 0) continue;
    lower.image = await softenHidden(lower.image, hidden);
    log(`${lower.output.file}: ${(share * 100).toFixed(1)}% is always behind nearer layers; softened`);
  }
}

function moduleSource(scene) {
  const lines = scene.images.map((image) => `  "${image.file}": new URL("./${image.file}", import.meta.url).href,`);
  return [
    "// Generated by `pnpm scene build`; do not edit. Loaded lazily via scene-registry.ts.",
    'import manifest from "./scene.json";',
    "",
    "export { manifest };",
    "export const files: Readonly<Record<string, string>> = Object.freeze({",
    ...lines,
    "});",
    "",
  ].join("\n");
}

/** True when the recipe reads any image file (anything but generated sources). */
export function needsSourceFiles(directory) {
  const recipe = JSON.parse(readFileSync(join(directory, "recipe.json"), "utf8"));
  return recipe.sources.some((source) => source.generate === undefined);
}

export async function buildScene(directory, sourcesDirectory, log = console.log) {
  const recipe = JSON.parse(readFileSync(join(directory, "recipe.json"), "utf8"));
  if (recipe.format !== "tear-scene-recipe" || recipe.version !== 1) throw new Error("unsupported recipe");
  const context = { recipe, sources: sourcesDirectory, image: undefined };
  const { scale, origin } = recipe.space;
  const template = recipe.scene;
  const built = new Map();
  const placements = new Map();
  for (const output of recipe.outputs) {
    const result = await runOutput(output, context);
    const [x, y, w, h] = result.placement;
    const round = (value) => Math.round(value * 1000) / 1000;
    const rect = [round((x + origin[0]) * scale), round((y + origin[1]) * scale), round(w * scale), round(h * scale)];
    placements.set(output.id, rect);
    built.set(output.id, { output, image: result.image, alpha: result.alpha, rect });
  }
  await softenHiddenPaint(template, built, log);
  const images = [];
  for (const { output, image, alpha } of built.values()) {
    const encoded = await encode(image, alpha, output.quality ?? SCENE_IMAGE_QUALITY);
    writeFileSync(join(directory, output.file), encoded);
    log(`${output.file}: ${image.width}x${image.height}, ${encoded.length} bytes`);
    images.push({
      id: output.id,
      file: output.file,
      width: image.width,
      height: image.height,
      alpha,
      bytes: encoded.length,
      sha256: sha256(encoded),
      sources: output.sources,
    });
  }
  const scene = {
    format: "tear-scene-package",
    version: 1,
    ...template,
    sources: recipe.sources.map((source) =>
      Object.fromEntries(Object.entries(source).filter(([key]) => key !== "file" && key !== "generate")),
    ),
    images,
    layers: template.layers.map((layer) => ({ ...layer, rect: placements.get(layer.image) })),
    // Water covers the area its mask image was cut from; light and motes give their own rect.
    ...(template.motion === undefined
      ? {}
      : {
          motion: template.motion.map((part) =>
            part.mask === undefined ? part : { ...part, rect: placements.get(part.mask) },
          ),
        }),
  };
  const { validateScenePackage } = await loadContract();
  validateScenePackage(scene);
  writeFileSync(join(directory, "scene.json"), `${JSON.stringify(scene, null, 2)}\n`);
  writeFileSync(join(directory, "scene.ts"), moduleSource(scene));
  log(`scene.json and scene.ts written (${images.length} images)`);
}
