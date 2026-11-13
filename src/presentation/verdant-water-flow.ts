import { VERDANT_POOL_CONTOURS } from "./verdant-pool-receiver";

/** Source-pixel authoring units, not calibrated physical water depth. */
export const VERDANT_WATER_INLET = Object.freeze({
  x: 1350,
  y: 738,
  period: 0.9,
  speed: 90,
  compression: 0.28,
  damping: 185,
});
const left = 150,
  top = 640,
  columns = 29,
  rows = 25,
  stepY = 8;
// Long basin waves tolerate wider cells; keep the short inlet packets dense.
function columnX(column: number): number {
  return left + Math.min(column, 15) * 64 + Math.max(0, column - 15) * 32;
}
const stride = 5;
type Motion = "live" | "neutral" | "minimum" | "maximum";

export function verdantRippleEnvelope(distance: number, age: number): number {
  if (age < 0 || age > 5.4) return 0;
  const q = (distance - VERDANT_WATER_INLET.speed * age) / 18;
  return (
    Math.exp(-0.5 * q * q - distance / VERDANT_WATER_INLET.damping) *
    Math.min(1, age / 0.16) *
    Math.min(1, (5.4 - age) / 0.4)
  );
}

/** Reflection offsets follow local packet slope, never bulk image advection. */
export function sampleVerdantWaterSlope(x: number, y: number, seconds: number, output: Float64Array): void {
  const dx = x - VERDANT_WATER_INLET.x,
    dz = (y - VERDANT_WATER_INLET.y) / VERDANT_WATER_INLET.compression;
  const distance = Math.hypot(dx, dz);
  let slope = 0;
  const newest = Math.floor(seconds / VERDANT_WATER_INLET.period);
  for (let packet = newest - 6; packet <= newest; packet += 1) {
    const age = seconds - packet * VERDANT_WATER_INLET.period;
    const q = (distance - VERDANT_WATER_INLET.speed * age) / 18;
    slope += -q * verdantRippleEnvelope(distance, age);
  }
  // Behind the central pier feet is a quiet lee, not another wave source.
  const leeX = Math.min(1, Math.max(0, (1180 - x) / 40));
  const leeY = Math.min(1, Math.max(0, (772 - y) / 20));
  const lee = 1 - 0.82 * leeX * leeY;
  const downstream = Math.min(1, Math.max(0, (y - 732) / 12));
  const strength = Math.max(-1, Math.min(1, slope)) * lee * downstream;
  output[0] = distance > 0 ? (5 * strength * dx) / distance : 0;
  output[1] = distance > 0 ? (1.4 * strength * dz) / distance : 0;
  // Broad shallow surface waves travel left along the open channel. Their
  // curved phase is distinct from inlet impacts; amplitude fades at pier feet.
  // Fade before the inlet so the original causal packet response stays intact.
  const basin = Math.min(1, Math.max(0, (1240 - x) / 160));
  const exposed = Math.min(1, Math.max(0, (y - 700) / 72));
  const phase = (x + 65 * Math.sin((y - 700) / 95) + seconds * 34) / 38;
  const cross = (x - (y - 740) * 2.3 + seconds * 22) / 67;
  const swell = (Math.sin(phase) * 0.72 + Math.sin(cross) * 0.28) * basin * exposed;
  output[0] = Math.max(-5, Math.min(5, output[0] + 4.6 * swell));
  output[1] = Math.max(-1.4, Math.min(1.4, output[1] + 1.3 * swell));
}

function insideWater(x: number, y: number): boolean {
  let inside = false;
  for (const contour of VERDANT_POOL_CONTOURS) {
    for (let index = 0; index < contour.length; index += 1) {
      const a = contour[index],
        b = contour[(index + 1) % contour.length];
      if (!a || !b) continue;
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

function waterCell(x: number, y: number, stepX: number): boolean {
  if (
    !insideWater(x, y) ||
    !insideWater(x + stepX, y) ||
    !insideWater(x, y + stepY) ||
    !insideWater(x + stepX, y + stepY)
  )
    return false;
  // Reject cells crossed by any mask edge, including small holes with no corner
  // outside. This source-space collar keeps masonry out of the sampled texture.
  for (const contour of VERDANT_POOL_CONTOURS) {
    for (let index = 0; index < contour.length; index += 1) {
      const a = contour[index],
        b = contour[(index + 1) % contour.length];
      if (!a || !b) continue;
      if (
        Math.max(a[0], b[0]) >= x &&
        Math.min(a[0], b[0]) <= x + stepX &&
        Math.max(a[1], b[1]) >= y &&
        Math.min(a[1], b[1]) <= y + stepY
      )
        return false;
    }
  }
  return true;
}

function triangle(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  points: Float64Array,
  ia: number,
  ib: number,
  ic: number,
): void {
  const ax = points[ia] ?? 0,
    ay = points[ia + 1] ?? 0,
    bx = points[ib] ?? 0,
    by = points[ib + 1] ?? 0;
  const cx = points[ic] ?? 0,
    cy = points[ic + 1] ?? 0;
  const adx = ax + (points[ia + 2] ?? 0),
    ady = ay + (points[ia + 3] ?? 0);
  const bdx = bx + (points[ib + 2] ?? 0),
    bdy = by + (points[ib + 3] ?? 0);
  const cdx = cx + (points[ic + 2] ?? 0),
    cdy = cy + (points[ic + 3] ?? 0);
  const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  const a = ((bdx - adx) * (cy - ay) - (cdx - adx) * (by - ay)) / det;
  const c = ((cdx - adx) * (bx - ax) - (bdx - adx) * (cx - ax)) / det;
  const b = ((bdy - ady) * (cy - ay) - (cdy - ady) * (by - ay)) / det;
  const d = ((cdy - ady) * (bx - ax) - (bdy - ady) * (cx - ax)) / det;
  context.save();
  context.beginPath();
  context.moveTo(adx, ady);
  context.lineTo(bdx, bdy);
  context.lineTo(cdx, cdy);
  context.closePath();
  context.clip();
  context.transform(a, b, c, d, adx - a * ax - c * ay, ady - b * ax - d * ay);
  const sx = Math.min(ax, bx, cx),
    sy = Math.min(ay, by, cy);
  const width = Math.max(ax, bx, cx) - sx,
    height = Math.max(ay, by, cy) - sy;
  context.drawImage(image, sx, sy - 471, width, height, sx, sy, width, height);
  context.restore();
}

function drawInletPackets(context: CanvasRenderingContext2D, seconds: number, flash: number): void {
  const newest = Math.floor(seconds / VERDANT_WATER_INLET.period);
  context.lineWidth = 1.1;
  for (let packet = newest - 6; packet <= newest; packet += 1) {
    const age = seconds - packet * VERDANT_WATER_INLET.period;
    const radius = age * VERDANT_WATER_INLET.speed;
    if (radius < 4 || radius > 440) continue;
    const energy = verdantRippleEnvelope(radius, age);
    // Broken arcs, not closed gameplay-like warning rings. All share the same
    // emitting impact and propagation speed as the reflection normal field.
    for (let arc = 0; arc < 7; arc += 1) {
      const angle = 0.15 + arc * 0.42,
        span = 0.2 + (arc % 3) * 0.035;
      context.beginPath();
      context.ellipse(
        VERDANT_WATER_INLET.x,
        VERDANT_WATER_INLET.y + 1.4,
        radius,
        radius * VERDANT_WATER_INLET.compression,
        0,
        angle,
        angle + span,
      );
      context.globalAlpha = 0.12 * energy * flash;
      context.strokeStyle = "#285e57";
      context.stroke();
      context.beginPath();
      context.ellipse(
        VERDANT_WATER_INLET.x,
        VERDANT_WATER_INLET.y,
        radius,
        radius * VERDANT_WATER_INLET.compression,
        0,
        angle,
        angle + span,
      );
      context.globalAlpha = 0.28 * energy * flash;
      context.strokeStyle = "#d4eccc";
      context.stroke();
    }
  }
  // Surface fragments follow two curved paths out of the impact; they move
  // much more slowly than the waves. No downstream transport of the reflection.
  for (let lane = 0; lane < 2; lane += 1) {
    for (let index = 0; index < 18; index += 1) {
      const phase = (((seconds / 48 + index / 18 + lane * 0.13) % 1) + 1) % 1;
      const x = 1350 - 1040 * phase + lane * 36 * Math.sin(phase * Math.PI);
      const y = 744 + 47 * Math.sin(phase * Math.PI) + lane * 20 * Math.sin(phase * Math.PI);
      context.globalAlpha = 0.38 * Math.sin(phase * Math.PI) ** 0.5 * flash;
      context.strokeStyle = "#d4eccc";
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(x - 13, y + 1.8, x - 30, y + 2.4);
      context.stroke();
    }
  }
}

/** One prepared, allocation-free draw owner for the visible basin. */
export function createVerdantWaterFlow() {
  const points = new Float64Array((columns + 1) * (rows + 1) * stride);
  const cells = new Uint8Array(columns * rows);
  const slope = new Float64Array(2);
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < columns; col += 1) {
      cells[row * columns + col] = waterCell(columnX(col), top + row * stepY, columnX(col + 1) - columnX(col)) ? 1 : 0;
    }
  for (let row = 0; row <= rows; row += 1)
    for (let col = 0; col <= columns; col += 1) {
      const index = (row * (columns + 1) + col) * stride;
      points[index] = columnX(col);
      points[index + 1] = top + row * stepY;
      points[index + 4] =
        row > 0 &&
        row < rows &&
        col > 0 &&
        col < columns &&
        cells[(row - 1) * columns + col - 1] &&
        cells[(row - 1) * columns + col] &&
        cells[row * columns + col - 1] &&
        cells[row * columns + col]
          ? 1
          : 0;
    }
  return Object.freeze({
    cellCount: cells.reduce((sum, cell) => sum + cell, 0),
    draw(context: CanvasRenderingContext2D, image: CanvasImageSource, seconds: number, motion: Motion, flash: number) {
      if (motion === "neutral" || flash <= 0) return;
      const time = motion === "live" ? seconds : motion === "minimum" ? 0.45 : 2.35;
      for (let index = 0; index < points.length; index += stride) {
        sampleVerdantWaterSlope(points[index] ?? 0, points[index + 1] ?? 0, time, slope);
        points[index + 2] = (slope[0] ?? 0) * (points[index + 4] ?? 0) * flash;
        points[index + 3] = (slope[1] ?? 0) * (points[index + 4] ?? 0) * flash;
      }
      for (let row = 0; row < rows; row += 1)
        for (let col = 0; col < columns; col += 1) {
          if (!cells[row * columns + col]) continue;
          const a = (row * (columns + 1) + col) * stride,
            b = a + stride;
          const c = a + (columns + 1) * stride,
            d = c + stride;
          triangle(context, image, points, a, b, c);
          triangle(context, image, points, b, d, c);
        }
      drawInletPackets(context, time, flash);
    },
  });
}

/** Short falling glints over two observed water ribbons, not moving masonry. */
export function drawVerdantInletFalls(context: CanvasRenderingContext2D, seconds: number, flash: number): void {
  context.save();
  context.lineWidth = 1.2;
  context.strokeStyle = "#d4ead4";
  for (let segment = 0; segment < 2; segment += 1) {
    const startY = segment === 0 ? 520 : 644,
      endY = segment === 0 ? 579 : 732;
    const speed = segment === 0 ? 90 : 145,
      width = segment === 0 ? 32 : 29;
    for (let index = 0; index < 12; index += 1) {
      const phase = (((seconds * speed + index * 19) % (endY - startY)) + endY - startY) % (endY - startY);
      const y = startY + phase,
        x = 1341 + ((index * 17) % width);
      context.globalAlpha = 0.3 * Math.sin((phase / (endY - startY)) * Math.PI) ** 2 * flash;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x - 1, Math.min(endY, y + 8));
      context.stroke();
    }
  }
  context.restore();
}
