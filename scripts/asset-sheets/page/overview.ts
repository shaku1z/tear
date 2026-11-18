/**
 * A category's overview: every picture in one labelled PNG, at 1x, with no background. Pictures are scaled
 * down to fit their cell, never up. Labels are a mid grey that reads on light and dark. The full-quality,
 * true-scale sheets are the per-asset SVG sheets; this is for a quick look.
 */
export async function overviewSheet(cells: readonly Readonly<{ label: string; sub: string; image: string }>[]) {
  const CELL = { w: 240, h: 200, label: 34, gap: 10 };
  const columns = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(cells.length * 1.4))));
  const rows = Math.ceil(cells.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * (CELL.w + CELL.gap) + CELL.gap;
  canvas.height = rows * (CELL.h + CELL.label + CELL.gap) + CELL.gap;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d canvas");
  const images = await Promise.all(
    cells.map(async (cell) => {
      const image = new Image();
      image.src = cell.image;
      await image.decode();
      return image;
    }),
  );
  cells.forEach((cell, index) => {
    const image = images[index];
    if (image === undefined) return;
    const x = CELL.gap + (index % columns) * (CELL.w + CELL.gap),
      y = CELL.gap + Math.floor(index / columns) * (CELL.h + CELL.label + CELL.gap);
    const fit = Math.min(1, CELL.w / image.naturalWidth, CELL.h / image.naturalHeight);
    const w = image.naturalWidth * fit,
      h = image.naturalHeight * fit;
    context.drawImage(image, x + (CELL.w - w) / 2, y + (CELL.h - h) / 2, w, h);
    context.fillStyle = "#8c96a8";
    context.textBaseline = "top";
    context.font = "bold 12px 'Courier New', monospace";
    context.fillText(cell.label, x, y + CELL.h + 4, CELL.w);
    context.font = "11px 'Courier New', monospace";
    context.fillText(cell.sub, x, y + CELL.h + 19, CELL.w);
  });
  return canvas.toDataURL("image/png");
}
