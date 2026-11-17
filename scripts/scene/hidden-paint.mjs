// "Nothing painted twice" (docs/BACKGROUND_WORKFLOW.md, "Size rule"): the part
// of a layer that a nearer layer covers for every camera the package allows is
// never seen, so `pnpm scene build` softens it to a blur before encoding and
// `pnpm scene validate` checks that no detail is left there.
import sharp from "sharp";

/** Extra cells of cover demanded around a pixel: the renderer's smoothing reads neighbours. */
const PAD = 3;
const BLUR_SIGMA = 14;

/**
 * For one coordinate, the range of nearer-layer positions that can sit over a
 * farther-layer position, as [scale, offset] pairs over the camera contract.
 * Screen position is S = c + o d + s (q - c - slide), s = 1 + (zoom - 1) d,
 * slide = playerX playerShift (1 - d); equating S for both layers gives the
 * nearer position as a function of the farther one. That function is monotone
 * in zoom and linear in shake and slide, so the extremes are at the corners.
 */
function coverTerms(camera, centre, lowerDepth, upperDepth, slides) {
  const terms = [];
  for (const zoom of [camera.zoomMin, 1, camera.zoomMax]) {
    const lowerScale = 1 + (zoom - 1) * lowerDepth;
    const upperScale = 1 + (zoom - 1) * upperDepth;
    for (const shake of [-camera.shake, camera.shake]) {
      for (const player of slides ? [-1, 1] : [0]) {
        const lowerSlide = player * camera.playerShift * (1 - lowerDepth);
        const upperSlide = player * camera.playerShift * (1 - upperDepth);
        const scale = lowerScale / upperScale;
        terms.push([
          scale,
          centre + upperSlide + (shake * (lowerDepth - upperDepth)) / upperScale - scale * (centre + lowerSlide),
        ]);
      }
    }
  }
  return terms;
}

/**
 * Which pixels of `lower` are covered by fully opaque pixels of the `uppers`
 * (layers drawn after it at full opacity) for every camera in the contract.
 * Layers are { data (RGBA), width, height, rect (world units), depth }.
 * Returns a Uint8Array of 0/1 per lower pixel.
 */
export function hiddenMask(scene, lower, uppers) {
  const hidden = new Uint8Array(lower.width * lower.height);
  const [lx, ly, lw, lh] = lower.rect;
  const density = Math.max(lower.width / lw, lower.height / lh);
  const margin = 200; // world units of slack around the lower layer for displaced cover
  const gridX = lx - margin;
  const gridY = ly - margin;
  const gridWidth = Math.ceil((lw + margin * 2) * density);
  const gridHeight = Math.ceil((lh + margin * 2) * density);
  for (const depth of new Set(uppers.map((upper) => upper.depth))) {
    // Summed-area table of "not fully opaque" over every nearer layer at this depth.
    const open = new Uint32Array((gridWidth + 1) * (gridHeight + 1));
    const cover = new Uint8Array(gridWidth * gridHeight);
    for (const upper of uppers.filter((item) => item.depth === depth)) {
      const [ux, uy, uw, uh] = upper.rect;
      const x0 = Math.max(0, Math.ceil((ux - gridX) * density));
      const x1 = Math.min(gridWidth, Math.floor((ux + uw - gridX) * density));
      const y0 = Math.max(0, Math.ceil((uy - gridY) * density));
      const y1 = Math.min(gridHeight, Math.floor((uy + uh - gridY) * density));
      for (let gy = y0; gy < y1; gy += 1) {
        const v = ((gridY + (gy + 0.5) / density - uy) / uh) * upper.height;
        // Opaque only if the nearest source pixel and its neighbours are: resampling must not invent cover.
        const row = Math.floor(v);
        if (row < 1 || row >= upper.height - 1) continue;
        for (let gx = x0; gx < x1; gx += 1) {
          const column = Math.floor(((gridX + (gx + 0.5) / density - ux) / uw) * upper.width);
          if (column < 1 || column >= upper.width - 1) continue;
          let opaque = true;
          for (let dy = -1; dy <= 1 && opaque; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1)
              if (upper.data[((row + dy) * upper.width + column + dx) * 4 + 3] !== 255) {
                opaque = false;
                break;
              }
          if (opaque) cover[gy * gridWidth + gx] = 1;
        }
      }
    }
    for (let gy = 0; gy < gridHeight; gy += 1) {
      let run = 0;
      for (let gx = 0; gx < gridWidth; gx += 1) {
        run += 1 - cover[gy * gridWidth + gx];
        open[(gy + 1) * (gridWidth + 1) + gx + 1] = open[gy * (gridWidth + 1) + gx + 1] + run;
      }
    }
    const range = (terms, count, origin, size, gridOrigin, gridSize) => {
      const low = new Int32Array(count);
      const high = new Int32Array(count);
      for (let index = 0; index < count; index += 1) {
        const world = origin + ((index + 0.5) / count) * size;
        let min = Infinity;
        let max = -Infinity;
        for (const [scale, offset] of terms) {
          const value = scale * world + offset;
          if (value < min) min = value;
          if (value > max) max = value;
        }
        low[index] = Math.floor((min - gridOrigin) * density) - PAD;
        high[index] = Math.ceil((max - gridOrigin) * density) + PAD;
        if (low[index] < 0 || high[index] >= gridSize) low[index] = -1; // cover unknown out there
      }
      return [low, high];
    };
    const centreX = scene.world.width / 2;
    const centreY = scene.world.height / 2;
    const [left, right] = range(
      coverTerms(scene.camera, centreX, lower.depth, depth, true),
      lower.width,
      lx,
      lw,
      gridX,
      gridWidth,
    );
    const [top, bottom] = range(
      coverTerms(scene.camera, centreY, lower.depth, depth, false),
      lower.height,
      ly,
      lh,
      gridY,
      gridHeight,
    );
    const stride = gridWidth + 1;
    for (let y = 0; y < lower.height; y += 1) {
      if (top[y] < 0) continue;
      for (let x = 0; x < lower.width; x += 1) {
        if (left[x] < 0) continue;
        const openCells =
          open[(bottom[y] + 1) * stride + right[x] + 1] -
          open[top[y] * stride + right[x] + 1] -
          open[(bottom[y] + 1) * stride + left[x]] +
          open[top[y] * stride + left[x]];
        if (openCells === 0) hidden[y * lower.width + x] = 1;
      }
    }
  }
  return hidden;
}

/** The layers drawn after `layer` at full opacity: back plane in order, then the front plane. */
export function layersOver(scene, layer) {
  const order = [
    ...scene.layers.filter((item) => item.plane === "back"),
    ...scene.layers.filter((item) => item.plane === "front"),
  ];
  return order.slice(order.indexOf(layer) + 1).filter((item) => (item.opacity ?? 1) === 1);
}

/** A copy of an RGBA image whose hidden pixels hold a blur of the paint around them. Alpha is kept. */
export async function softenHidden(image, hidden) {
  const { width, height, data } = image;
  const blurred = await sharp(Buffer.from(data.buffer, data.byteOffset, data.length), {
    raw: { width, height, channels: 4 },
  })
    .removeAlpha()
    .blur(BLUR_SIGMA)
    .raw()
    .toBuffer();
  const out = new Uint8ClampedArray(data);
  for (let index = 0; index < hidden.length; index += 1) {
    if (hidden[index] === 0) continue;
    out[index * 4] = blurred[index * 3];
    out[index * 4 + 1] = blurred[index * 3 + 1];
    out[index * 4 + 2] = blurred[index * 3 + 2];
  }
  return { width, height, data: out };
}

/**
 * Detail left where nobody can see it: the share of the image that is hidden,
 * and the mean change (0..255 per channel) softening would still make there.
 * A layer the build already softened scores near zero.
 */
export async function hiddenDetail(image, hidden) {
  const softened = await softenHidden(image, hidden);
  let pixels = 0;
  let change = 0;
  for (let index = 0; index < hidden.length; index += 1) {
    if (hidden[index] === 0) continue;
    pixels += 1;
    for (let channel = 0; channel < 3; channel += 1)
      change += Math.abs(softened.data[index * 4 + channel] - image.data[index * 4 + channel]);
  }
  return { share: pixels / hidden.length, detail: pixels === 0 ? 0 : change / (pixels * 3) };
}
