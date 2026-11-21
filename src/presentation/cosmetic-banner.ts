/**
 * A worn banner drawn as a band: one colour (flat), two halves (split) or alternating stripes (stripe).
 * Every card that shows a player's banner draws it through this routine, so a leaderboard row or a replay
 * card later looks the same as the passport. A band is never drawn under text: banner colours are not
 * checked for readability.
 */
import type { BannerStyle } from "./cosmetic-styles";

/** The parts of a banner style a band needs. */
export type BannerBand = Pick<BannerStyle, "colors" | "pattern">;

/** How many stripes a band of the stripe pattern is cut into. */
const STRIPES = 12;

export function drawBannerBand(
  canvas: CanvasRenderingContext2D,
  band: BannerBand,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const [first, second = first] = band.colors;
  if (first === undefined || second === undefined) return;
  const parts = band.pattern === "flat" ? 1 : band.pattern === "split" ? 2 : STRIPES;
  for (let index = 0; index < parts; index += 1) {
    canvas.fillStyle = index % 2 === 0 ? first : second;
    const left = x + (index * w) / parts;
    canvas.fillRect(left, y, x + ((index + 1) * w) / parts - left, h);
  }
}
