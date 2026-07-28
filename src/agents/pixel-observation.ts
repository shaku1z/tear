/**
 * Pure image-space perception for Class C work.  It deliberately accepts only
 * RGBA pixels and local frame history: no canvas, DOM, runtime state, or
 * semantic UI import is permitted here.
 */

export interface TearPixelFrame {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly capturedAtMs: number;
}

export interface TearPixelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TearPixelViewportCalibration {
  readonly bounds: TearPixelBounds;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly confidence: number;
}

export interface TearPixelRegion extends TearPixelBounds {
  readonly density: number;
  readonly confidence: number;
}

/**
 * These are visual-layout hypotheses, not runtime screen identifiers.  They
 * deliberately describe what is visible (a reward-card row or terminal-like
 * result surface) instead of leaking a renderer, route, or game-state name.
 */
export type TearPixelScreenKind = "unknown" | "menu-like" | "setup-like" | "playing-like" | "overlay-like" | "draft-like" | "terminal-like";

export interface TearPixelObservation {
  readonly kind: TearPixelScreenKind;
  readonly confidence: number;
  readonly calibration: TearPixelViewportCalibration;
  readonly brightRegions: readonly TearPixelRegion[];
  readonly topBandDensity: number;
  readonly centreBandDensity: number;
  readonly bottomBandDensity: number;
}

export interface TearPixelTemporalObservation {
  readonly observation: TearPixelObservation;
  /** Motion is image-only world evidence, intentionally distinct from UI state. */
  readonly world: TearPixelWorldObservation;
  readonly frameDifference: number;
  readonly stable: boolean;
  readonly occluded: boolean;
  readonly trackedFrames: number;
}

export interface TearPixelWorldObservation {
  readonly motionEnergy: number;
  readonly motionRegions: readonly TearPixelRegion[];
}

export interface TearPixelObserverOptions {
  readonly logicalWidth?: number;
  readonly logicalHeight?: number;
  readonly brightThreshold?: number;
  readonly minimumRegionPixels?: number;
  readonly maximumFrames?: number;
}

const DEFAULT_LOGICAL_WIDTH = 1600;
const DEFAULT_LOGICAL_HEIGHT = 900;
const DEFAULT_BRIGHT_THRESHOLD = 0.78;

function requireFrame(frame: TearPixelFrame): void {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || !Number.isSafeInteger(frame.height) || frame.height < 1) {
    throw new RangeError("pixel frame dimensions must be positive safe integers");
  }
  if (frame.rgba.length !== frame.width * frame.height * 4) throw new RangeError("pixel frame must contain exactly RGBA pixels");
  if (!Number.isFinite(frame.capturedAtMs)) throw new RangeError("pixel frame capture time must be finite");
}

function luma(r: number, g: number, b: number): number {
  return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
}

function pixelLuma(frame: TearPixelFrame, x: number, y: number): number {
  const offset = (y * frame.width + x) * 4;
  return luma(frame.rgba[offset] ?? 0, frame.rgba[offset + 1] ?? 0, frame.rgba[offset + 2] ?? 0);
}

function pixelRgb(frame: TearPixelFrame, x: number, y: number): readonly [number, number, number] {
  const offset = (y * frame.width + x) * 4;
  return [frame.rgba[offset] ?? 0, frame.rgba[offset + 1] ?? 0, frame.rgba[offset + 2] ?? 0];
}

function edgeBackground(frame: TearPixelFrame): readonly [number, number, number] {
  const points = [[0, 0], [frame.width - 1, 0], [0, frame.height - 1], [frame.width - 1, frame.height - 1]] as const;
  let red = 0, green = 0, blue = 0;
  for (const [x, y] of points) {
    const [r, g, b] = pixelRgb(frame, x, y);
    red += r; green += g; blue += b;
  }
  return [red / points.length, green / points.length, blue / points.length];
}

function contrast(frame: TearPixelFrame, x: number, y: number, background: readonly [number, number, number]): number {
  const [r, g, b] = pixelRgb(frame, x, y);
  return Math.hypot(r - background[0], g - background[1], b - background[2]) / 441.6729559300637;
}

function isVisible(frame: TearPixelFrame, x: number, y: number): boolean {
  return (frame.rgba[(y * frame.width + x) * 4 + 3] ?? 0) > 0;
}

/** The public render surface normally occupies the full screenshot.  Alpha is
 * nevertheless honoured so letterboxing and transparent capture fixtures are
 * calibrated from image evidence rather than DOM geometry. */
export function calibratePixelViewport(
  frame: TearPixelFrame,
  options: Pick<TearPixelObserverOptions, "logicalWidth" | "logicalHeight"> = {},
): TearPixelViewportCalibration {
  requireFrame(frame);
  let minX = frame.width, minY = frame.height, maxX = -1, maxY = -1, visible = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (!isVisible(frame, x, y)) continue;
      visible += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const bounds = maxX < minX
    ? Object.freeze({ x: 0, y: 0, width: frame.width, height: frame.height })
    : Object.freeze({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  const logicalWidth = options.logicalWidth ?? DEFAULT_LOGICAL_WIDTH;
  const logicalHeight = options.logicalHeight ?? DEFAULT_LOGICAL_HEIGHT;
  const coverage = visible / (frame.width * frame.height);
  return Object.freeze({
    bounds,
    scaleX: bounds.width / logicalWidth,
    scaleY: bounds.height / logicalHeight,
    confidence: Math.max(0, Math.min(1, coverage)),
  });
}

function density(frame: TearPixelFrame, bounds: TearPixelBounds, threshold: number, background: readonly [number, number, number]): number {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(frame.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(frame.height, Math.ceil(bounds.y + bounds.height));
  let samples = 0, bright = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      samples += 1;
      if (contrast(frame, x, y, background) >= threshold) bright += 1;
    }
  }
  return samples === 0 ? 0 : bright / samples;
}

/** Finds bright connected components after coarse sampling.  Text is not
 * treated as an accessibility tree: regions are visual affordances only. */
export function detectBrightPixelRegions(
  frame: TearPixelFrame,
  calibration: TearPixelViewportCalibration,
  options: Pick<TearPixelObserverOptions, "brightThreshold" | "minimumRegionPixels"> = {},
): readonly TearPixelRegion[] {
  requireFrame(frame);
  const threshold = Math.min(0.45, options.brightThreshold ?? DEFAULT_BRIGHT_THRESHOLD);
  const background = edgeBackground(frame);
  const minimum = options.minimumRegionPixels ?? 12;
  const { bounds } = calibration;
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(frame.width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(frame.height, Math.ceil(bounds.y + bounds.height));
  const visited = new Uint8Array(frame.width * frame.height);
  const regions: TearPixelRegion[] = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  for (let startY = top; startY < bottom; startY += 1) {
    for (let startX = left; startX < right; startX += 1) {
      const start = startY * frame.width + startX;
      if (visited[start] === 1 || contrast(frame, startX, startY, background) < threshold) continue;
      const queue: (readonly [number, number])[] = [[startX, startY]];
      visited[start] = 1;
      let index = 0, count = 0, minX = startX, minY = startY, maxX = startX, maxY = startY;
      while (index < queue.length) {
        const point = queue[index];
        if (point === undefined) throw new Error("pixel region queue lost its active point");
        index += 1;
        const [x, y] = point;
        count += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (const [dx, dy] of directions) {
          const nextX = x + dx, nextY = y + dy;
          if (nextX < left || nextX >= right || nextY < top || nextY >= bottom) continue;
          const next = nextY * frame.width + nextX;
          if (visited[next] === 1 || contrast(frame, nextX, nextY, background) < threshold) continue;
          visited[next] = 1; queue.push([nextX, nextY]);
        }
      }
      if (count < minimum) continue;
      const regionBounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
      const regionDensity = count / (regionBounds.width * regionBounds.height);
      regions.push(Object.freeze({ ...regionBounds, density: regionDensity, confidence: Math.min(1, count / minimum / 4) }));
    }
  }
  return Object.freeze(regions.sort((a, b) => b.density * b.width * b.height - a.density * a.width * a.height));
}

function countDraftCards(regions: readonly TearPixelRegion[], bounds: TearPixelBounds): number {
  return regions.filter((region) => {
    const width = region.width / bounds.width, height = region.height / bounds.height;
    const centreY = (region.y + region.height / 2 - bounds.y) / bounds.height;
    return width >= 0.12 && width <= 0.28 && height >= 0.25 && height <= 0.58 && centreY >= 0.32 && centreY <= 0.62;
  }).length;
}

function countTerminalActions(regions: readonly TearPixelRegion[], bounds: TearPixelBounds): number {
  return regions.filter((region) => {
    const width = region.width / bounds.width, height = region.height / bounds.height;
    const centreY = (region.y + region.height / 2 - bounds.y) / bounds.height;
    return width >= 0.12 && width <= 0.28 && height >= 0.025 && height <= 0.12 && centreY >= 0.28 && centreY <= 0.82;
  }).length;
}

function countTopTitleMarks(regions: readonly TearPixelRegion[], bounds: TearPixelBounds): number {
  return regions.filter((region) => {
    const width = region.width / bounds.width, height = region.height / bounds.height;
    const centreY = (region.y + region.height / 2 - bounds.y) / bounds.height;
    return width >= 0.008 && width <= 0.055 && height >= 0.015 && height <= 0.08 && centreY <= 0.18;
  }).length;
}

function classify(top: number, centre: number, bottom: number, regions: readonly TearPixelRegion[], bounds: TearPixelBounds): TearPixelScreenKind {
  const draftCards = countDraftCards(regions, bounds);
  // A row of three or more tall, similarly sized visual cards is a robust
  // affordance pattern. It contains no card labels, choice IDs, or UI state.
  if (draftCards >= 3) return "draft-like";
  const terminalActions = countTerminalActions(regions, bounds);
  const titleMarks = countTopTitleMarks(regions, bounds);
  // Result surfaces are intentionally kept generic: a compact top title and
  // one or more central action panels on a low-density canvas. This avoids
  // treating OCR or route names as Class-C observations.
  if (top >= 0.006 && top <= 0.03 && centre <= 0.02 && bottom <= 0.012 && terminalActions >= 1 && titleMarks >= 4) return "terminal-like";
  const largeCentralRegions = regions.filter((region) => region.width >= 40 && region.height >= 6).length;
  if (top > 0.025 && centre > 0.018 && largeCentralRegions >= 3) return "menu-like";
  if (top > 0.018 && centre > 0.005 && largeCentralRegions >= 2) return "setup-like";
  if (bottom > 0.025 && centre < 0.025) return "playing-like";
  if (top > 0.03 && centre > 0.03) return "overlay-like";
  return "unknown";
}

export function observePixels(frame: TearPixelFrame, options: TearPixelObserverOptions = {}): TearPixelObservation {
  const calibration = calibratePixelViewport(frame, options);
  const threshold = Math.min(0.45, options.brightThreshold ?? DEFAULT_BRIGHT_THRESHOLD);
  const background = edgeBackground(frame);
  const { bounds } = calibration;
  const top = density(frame, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height / 3 }, threshold, background);
  const centre = density(frame, { x: bounds.x, y: bounds.y + bounds.height / 3, width: bounds.width, height: bounds.height / 3 }, threshold, background);
  const bottom = density(frame, { x: bounds.x, y: bounds.y + bounds.height * 2 / 3, width: bounds.width, height: bounds.height / 3 }, threshold, background);
  const brightRegions = detectBrightPixelRegions(frame, calibration, options);
  const kind = classify(top, centre, bottom, brightRegions, bounds);
  const confidence = kind === "unknown" ? Math.min(0.45, calibration.confidence) : Math.min(1, 0.45 + calibration.confidence * 0.25 + Math.min(0.3, brightRegions.length / 40));
  return Object.freeze({ kind, confidence, calibration, brightRegions, topBandDensity: top, centreBandDensity: centre, bottomBandDensity: bottom });
}

function frameDifference(previous: TearPixelFrame, next: TearPixelFrame): number {
  if (previous.width !== next.width || previous.height !== next.height) return 1;
  let difference = 0, samples = 0;
  // A sparse lattice keeps the policy bounded for full-resolution browser frames.
  const stride = Math.max(1, Math.floor(Math.min(next.width, next.height) / 96));
  for (let y = 0; y < next.height; y += stride) {
    for (let x = 0; x < next.width; x += stride) {
      difference += Math.abs(pixelLuma(previous, x, y) - pixelLuma(next, x, y)); samples += 1;
    }
  }
  return samples === 0 ? 0 : difference / samples;
}

function rgbDifference(previous: TearPixelFrame, next: TearPixelFrame, x: number, y: number): number {
  const left = (y * previous.width + x) * 4;
  const right = (y * next.width + x) * 4;
  return (Math.abs((previous.rgba[left] ?? 0) - (next.rgba[right] ?? 0))
    + Math.abs((previous.rgba[left + 1] ?? 0) - (next.rgba[right + 1] ?? 0))
    + Math.abs((previous.rgba[left + 2] ?? 0) - (next.rgba[right + 2] ?? 0))) / 765;
}

/**
 * Finds connected moving visual regions on a coarse image lattice.  It is not
 * an entity oracle: callers receive only changed pixel locations and must keep
 * UI and structured channels independently disabled for Class-C decisions.
 */
export function detectPixelMotionRegions(
  previous: TearPixelFrame | undefined,
  next: TearPixelFrame,
  calibration: TearPixelViewportCalibration,
  minimumEnergy = 0.12,
): TearPixelWorldObservation {
  requireFrame(next);
  if (previous === undefined) {
    return Object.freeze({ motionEnergy: 0, motionRegions: Object.freeze([]) });
  }
  if (previous.width !== next.width || previous.height !== next.height) {
    return Object.freeze({ motionEnergy: 0, motionRegions: Object.freeze([]) });
  }
  requireFrame(previous);
  if (!Number.isFinite(minimumEnergy) || minimumEnergy <= 0 || minimumEnergy > 1) throw new RangeError("pixel motion energy must be within (0, 1]");
  const stride = Math.max(2, Math.floor(Math.min(next.width, next.height) / 180));
  const left = Math.max(0, Math.floor(calibration.bounds.x));
  const top = Math.max(0, Math.floor(calibration.bounds.y));
  const right = Math.min(next.width, Math.ceil(calibration.bounds.x + calibration.bounds.width));
  const bottom = Math.min(next.height, Math.ceil(calibration.bounds.y + calibration.bounds.height));
  const columns = Math.ceil((right - left) / stride);
  const rows = Math.ceil((bottom - top) / stride);
  const active = new Uint8Array(columns * rows);
  let energyTotal = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(right - 1, left + column * stride);
      const y = Math.min(bottom - 1, top + row * stride);
      const energy = rgbDifference(previous, next, x, y);
      energyTotal += energy;
      if (energy >= minimumEnergy) active[row * columns + column] = 1;
    }
  }
  const visited = new Uint8Array(active.length);
  const regions: TearPixelRegion[] = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const minimumCells = 3;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const start = row * columns + column;
      if (active[start] === 0 || visited[start] === 1) continue;
      const queue: (readonly [number, number])[] = [[column, row]];
      visited[start] = 1;
      let index = 0, count = 0, minColumn = column, maxColumn = column, minRow = row, maxRow = row;
      while (index < queue.length) {
        const point = queue[index];
        if (point === undefined) throw new Error("motion-region queue lost its active point");
        index += 1;
        const [currentColumn, currentRow] = point;
        count += 1;
        minColumn = Math.min(minColumn, currentColumn); maxColumn = Math.max(maxColumn, currentColumn);
        minRow = Math.min(minRow, currentRow); maxRow = Math.max(maxRow, currentRow);
        for (const [columnDelta, rowDelta] of directions) {
          const candidateColumn = currentColumn + columnDelta, candidateRow = currentRow + rowDelta;
          if (candidateColumn < 0 || candidateColumn >= columns || candidateRow < 0 || candidateRow >= rows) continue;
          const candidate = candidateRow * columns + candidateColumn;
          if (active[candidate] === 0 || visited[candidate] === 1) continue;
          visited[candidate] = 1; queue.push([candidateColumn, candidateRow]);
        }
      }
      if (count < minimumCells) continue;
      const width = Math.min(right, left + (maxColumn + 1) * stride) - (left + minColumn * stride);
      const height = Math.min(bottom, top + (maxRow + 1) * stride) - (top + minRow * stride);
      regions.push(Object.freeze({
        x: left + minColumn * stride, y: top + minRow * stride, width, height,
        density: count / ((maxColumn - minColumn + 1) * (maxRow - minRow + 1)),
        confidence: Math.min(1, count / (minimumCells * 3)),
      }));
    }
  }
  return Object.freeze({
    motionEnergy: rows * columns === 0 ? 0 : energyTotal / (rows * columns),
    motionRegions: Object.freeze(regions.sort((leftRegion, rightRegion) => rightRegion.width * rightRegion.height * rightRegion.density - leftRegion.width * leftRegion.height * leftRegion.density)),
  });
}

export class TearPixelTemporalTracker {
  readonly #options: TearPixelObserverOptions;
  readonly #frames: TearPixelFrame[] = [];

  constructor(options: TearPixelObserverOptions = {}) { this.#options = Object.freeze({ ...options }); }

  observe(frame: TearPixelFrame): TearPixelTemporalObservation {
    const observation = observePixels(frame, this.#options);
    const previous = this.#frames.at(-1);
    const difference = previous === undefined ? 0 : frameDifference(previous, frame);
    const world = detectPixelMotionRegions(previous, frame, observation.calibration);
    const maximum = this.#options.maximumFrames ?? 4;
    this.#frames.push(frame);
    while (this.#frames.length > maximum) this.#frames.shift();
    const opaque = observation.calibration.confidence > 0;
    const occluded = !opaque || (previous !== undefined && difference > 0.88);
    const stable = !occluded && this.#frames.length >= 2 && difference <= 0.12;
    return Object.freeze({ observation, world, frameDifference: difference, stable, occluded, trackedFrames: this.#frames.length });
  }
}
