/**
 * Pixel-only visual QA utilities.  These comparisons are deliberately an
 * engineering measurement, not an observation channel for the Class C policy:
 * callers provide two rendered frames and receive image-space metrics only.
 *
 * They avoid brittle byte-for-byte screenshot comparisons by combining
 * brightness-normalized perceptual samples with local structure and optional
 * normalized regions of interest.
 */

import type { TearPixelFrame } from "./pixel-observation";

export interface TearVisualComparisonRegion {
  /** Stable label for the report; it has no semantic meaning to the comparator. */
  readonly name: string;
  /** Normalized image-space bounds (0..1), independent of screenshot scale. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TearVisualComparisonOptions {
  /** Coarse lattice side length.  Larger values trade execution cost for detail. */
  readonly samplesPerAxis?: number;
  readonly regions?: readonly TearVisualComparisonRegion[];
}

export interface TearVisualComparisonMetrics {
  readonly perceptualSimilarity: number;
  readonly luminanceDifference: number;
  readonly chromaDifference: number;
  readonly structureDifference: number;
  readonly samples: number;
}

export interface TearVisualRegionComparison extends TearVisualComparisonMetrics {
  readonly region: TearVisualComparisonRegion;
}

export interface TearVisualComparison extends TearVisualComparisonMetrics {
  /** Dimensions are reported, but comparison uses normalized image coordinates. */
  readonly dimensionsMatch: boolean;
  readonly regions: readonly TearVisualRegionComparison[];
}

interface Sample {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly luma: number;
}

function requireFrame(frame: TearPixelFrame): void {
  if (!Number.isSafeInteger(frame.width) || frame.width < 1 || !Number.isSafeInteger(frame.height) || frame.height < 1) {
    throw new RangeError("visual comparison frame dimensions must be positive safe integers");
  }
  if (frame.rgba.length !== frame.width * frame.height * 4) throw new RangeError("visual comparison frame must contain exactly RGBA pixels");
}

function clampUnit(value: number): number { return Math.max(0, Math.min(1, value)); }

function finiteUnit(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be a finite normalized value`);
  return value;
}

function validateRegion(region: TearVisualComparisonRegion): TearVisualComparisonRegion {
  if (region.name.trim().length === 0) throw new RangeError("visual comparison region name cannot be empty");
  const x = finiteUnit("visual comparison region x", region.x);
  const y = finiteUnit("visual comparison region y", region.y);
  const width = finiteUnit("visual comparison region width", region.width);
  const height = finiteUnit("visual comparison region height", region.height);
  if (width === 0 || height === 0 || x + width > 1 || y + height > 1) throw new RangeError("visual comparison region must be non-empty and stay within normalized image bounds");
  return Object.freeze({ name: region.name, x, y, width, height });
}

function sample(frame: TearPixelFrame, normalizedX: number, normalizedY: number): Sample {
  const x = Math.min(frame.width - 1, Math.max(0, Math.floor(normalizedX * frame.width)));
  const y = Math.min(frame.height - 1, Math.max(0, Math.floor(normalizedY * frame.height)));
  const offset = (y * frame.width + x) * 4;
  const alpha = (frame.rgba[offset + 3] ?? 0) / 255;
  // Composite transparent screenshot pixels on black so alpha has visible meaning.
  const red = ((frame.rgba[offset] ?? 0) / 255) * alpha;
  const green = ((frame.rgba[offset + 1] ?? 0) / 255) * alpha;
  const blue = ((frame.rgba[offset + 2] ?? 0) / 255) * alpha;
  return { red, green, blue, luma: red * 0.2126 + green * 0.7152 + blue * 0.0722 };
}

function average(samples: readonly Sample[]): Sample {
  let red = 0, green = 0, blue = 0, luma = 0;
  for (const value of samples) { red += value.red; green += value.green; blue += value.blue; luma += value.luma; }
  const count = samples.length;
  return { red: red / count, green: green / count, blue: blue / count, luma: luma / count };
}

function compareRegion(expected: TearPixelFrame, actual: TearPixelFrame, region: TearVisualComparisonRegion | undefined, samplesPerAxis: number): TearVisualComparisonMetrics {
  const x = region?.x ?? 0;
  const y = region?.y ?? 0;
  const width = region?.width ?? 1;
  const height = region?.height ?? 1;
  const expectedSamples: Sample[] = [];
  const actualSamples: Sample[] = [];
  for (let row = 0; row < samplesPerAxis; row += 1) {
    for (let column = 0; column < samplesPerAxis; column += 1) {
      const sampleX = x + ((column + 0.5) / samplesPerAxis) * width;
      const sampleY = y + ((row + 0.5) / samplesPerAxis) * height;
      expectedSamples.push(sample(expected, sampleX, sampleY));
      actualSamples.push(sample(actual, sampleX, sampleY));
    }
  }
  const expectedMean = average(expectedSamples);
  const actualMean = average(actualSamples);
  let luminance = 0, chroma = 0, structure = 0;
  for (let index = 0; index < expectedSamples.length; index += 1) {
    const reference = expectedSamples[index];
    const candidate = actualSamples[index];
    if (reference === undefined || candidate === undefined) throw new Error("visual comparison sample sequence is incomplete");
    // Mean-normalized luminance avoids treating a harmless uniform exposure
    // shift as a total visual regression.
    luminance += Math.abs((reference.luma - expectedMean.luma) - (candidate.luma - actualMean.luma));
    chroma += Math.hypot(reference.red - reference.luma - (candidate.red - candidate.luma), reference.green - reference.luma - (candidate.green - candidate.luma), reference.blue - reference.luma - (candidate.blue - candidate.luma)) / Math.sqrt(3);
    const next = expectedSamples[(index + 1) % expectedSamples.length];
    const nextCandidate = actualSamples[(index + 1) % actualSamples.length];
    if (next === undefined || nextCandidate === undefined) throw new Error("visual comparison structure sample is incomplete");
    structure += Math.abs(Math.abs(reference.luma - next.luma) - Math.abs(candidate.luma - nextCandidate.luma));
  }
  const count = expectedSamples.length;
  const luminanceDifference = luminance / count;
  const chromaDifference = chroma / count;
  const structureDifference = structure / count;
  // The global exposure difference is intentionally a small factor: UI QA
  // should concentrate on visible composition and local contrast.
  const exposureDifference = Math.abs(expectedMean.luma - actualMean.luma);
  const perceptualSimilarity = clampUnit(1 - (luminanceDifference * 0.45 + chromaDifference * 0.2 + structureDifference * 0.25 + exposureDifference * 0.1));
  return Object.freeze({ perceptualSimilarity, luminanceDifference, chromaDifference, structureDifference, samples: count });
}

/**
 * Compares two rendered pixel frames at normalized coordinates.  It never
 * requires equal dimensions and never consumes state, DOM, OCR, or UI IDs.
 */
export function comparePixelVisuals(expected: TearPixelFrame, actual: TearPixelFrame, options: TearVisualComparisonOptions = {}): TearVisualComparison {
  requireFrame(expected);
  requireFrame(actual);
  const samplesPerAxis = options.samplesPerAxis ?? 24;
  if (!Number.isSafeInteger(samplesPerAxis) || samplesPerAxis < 2 || samplesPerAxis > 512) throw new RangeError("samplesPerAxis must be an integer between 2 and 512");
  const wholeImage = compareRegion(expected, actual, undefined, samplesPerAxis);
  const regions = Object.freeze((options.regions ?? []).map((region) => {
    const validRegion = validateRegion(region);
    return Object.freeze({ region: validRegion, ...compareRegion(expected, actual, validRegion, samplesPerAxis) });
  }));
  return Object.freeze({ ...wholeImage, dimensionsMatch: expected.width === actual.width && expected.height === actual.height, regions });
}
