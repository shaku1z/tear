export function renderReplayThumbnail(input: {
  readonly canvas: CanvasRenderingContext2D;
  readonly source?: string;
  readonly bounds: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly cache: Record<string, HTMLImageElement | undefined>;
  readonly createImage: () => HTMLImageElement;
  readonly ink: string;
}): void {
  const { canvas, bounds } = input;
  canvas.save(); canvas.fillStyle = "#0e1017"; canvas.globalAlpha = 0.15;
  canvas.fillRect(bounds.x, bounds.y, bounds.w, bounds.h); canvas.globalAlpha = 1;
  if (input.source !== undefined && input.source !== "") {
    let image = input.cache[input.source];
    if (image === undefined) { image = input.createImage(); image.src = input.source; input.cache[input.source] = image; }
    if (image.complete && image.naturalWidth > 0) canvas.drawImage(image, bounds.x, bounds.y, bounds.w, bounds.h);
  }
  canvas.strokeStyle = input.ink; canvas.globalAlpha = 0.35; canvas.lineWidth = 1;
  canvas.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h); canvas.restore();
}
