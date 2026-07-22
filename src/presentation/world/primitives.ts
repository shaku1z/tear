export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function easeOut(value: number): number {
  const amount = clamp(value);
  return 1 - (1 - amount) * (1 - amount);
}

export function blendHex(left: string, right: string, amount: number): string {
  const a = Number.parseInt(left.slice(1), 16), b = Number.parseInt(right.slice(1), 16);
  const mix = clamp(amount);
  const red = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * mix);
  const green = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * mix);
  const blue = Math.round((a & 255) + ((b & 255) - (a & 255)) * mix);
  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

export function wrapLeft(
  canvas: CanvasRenderingContext2D, text: string, x: number, y: number,
  maximumWidth: number, lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const candidate = line.length > 0 ? `${line} ${word}` : word;
    if (line.length > 0 && canvas.measureText(candidate).width > maximumWidth) {
      canvas.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else line = candidate;
  }
  if (line.length > 0) canvas.fillText(line, x, lineY);
  return lineY;
}
