/**
 * Colour rules every cosmetic look is checked against. Pure maths on hex strings so the catalog
 * validator, its tests and (later) the style resolver share one definition of "readable".
 */

/** Reference backdrops a cosmetic must stay visible on, by name (a light and a dark stage background). */
export type ReadabilityBackdrops = Readonly<Record<string, string>>;

/**
 * Lowest contrast ratio a look colour may have against either reference backdrop. The game's own
 * default swing trail must pass it (tested), so no cosmetic is harder to see than the default.
 */
export const MIN_BACKDROP_CONTRAST = 1.3;

/** Saturated hues in this band (degrees, wrapping through 0) are the enemy-tell family: red to orange. */
export const TELL_HUE_BAND = Object.freeze({ from: 345, to: 40, minSaturation: 0.45 });

const HEX = /^#[0-9a-f]{6}$/iu;

export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value);

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) =>
    value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first),
    b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Hue in degrees (0..360) and HSL saturation (0..1). */
export function hueAndSaturation(hex: string): { hue: number; saturation: number } {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const lightness = (max + min) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (raw * 60 + 360) % 360, saturation };
}

export function isTellColor(hex: string): boolean {
  const { hue, saturation } = hueAndSaturation(hex);
  return saturation >= TELL_HUE_BAND.minSaturation && (hue >= TELL_HUE_BAND.from || hue <= TELL_HUE_BAND.to);
}

/** The first reason a colour is unreadable or tell-like, or null when it passes. */
export function colourProblem(hex: string, backdrops: ReadabilityBackdrops, rejectTell = true): string | null {
  if (!isHexColor(hex)) return `"${String(hex)}" is not a #rrggbb colour`;
  if (rejectTell && isTellColor(hex)) return `${hex} is in the red/orange enemy-tell family`;
  for (const [name, backdrop] of Object.entries(backdrops))
    if (contrastRatio(hex, backdrop) < MIN_BACKDROP_CONTRAST)
      return `${hex} has contrast ${contrastRatio(hex, backdrop).toFixed(2)} against the ${name} backdrop (minimum ${String(MIN_BACKDROP_CONTRAST)})`;
  return null;
}
