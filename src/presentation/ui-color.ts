/** Colour arithmetic for guaranteed-contrast text. Pure; no canvas. */

function parseHex(color: string): readonly [number, number, number] | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (hex === undefined) return undefined;
  const full = hex.length === 3 ? hex.split("").map((digit) => digit + digit).join("") : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rgb/#rrggbb colour; undefined when unparsable. */
export function luminance(color: string): number | undefined {
  const rgb = parseHex(color);
  return rgb === undefined ? undefined : 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground) ?? 0, b = luminance(background) ?? 1;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** True for a light ink (dark surface); anything unparsable counts as dark ink. */
export function inkIsLight(color: string): boolean {
  return (luminance(color) ?? 0) > 0.5;
}

const darkened = new Map<string, string>();

/**
 * Darkens a hue (keeping its identity) until it reaches `ratio` against `background`.
 * Used for coloured labels on the paper sheet, where the raw game palette
 * (cyan, gold, green) is too light to read as text.
 */
export function darkenToContrast(color: string, background: string, ratio = 4.5): string {
  const key = color + "|" + background + "|" + String(ratio);
  const cached = darkened.get(key);
  if (cached !== undefined) return cached;
  const result = computeDarkened(color, background, ratio);
  if (darkened.size < 256) darkened.set(key, result);
  return result;
}

function computeDarkened(color: string, background: string, ratio: number): string {
  const rgb = parseHex(color);
  if (rgb === undefined || contrastRatio(color, background) >= ratio) return color;
  for (let factor = 0.95; factor > 0.05; factor -= 0.05) {
    const candidate = "#" + rgb.map((value) => Math.round(value * factor).toString(16).padStart(2, "0")).join("");
    if (contrastRatio(candidate, background) >= ratio) return candidate;
  }
  return "#000000";
}
