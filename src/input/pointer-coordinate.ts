export interface ClientPointerPoint {
  readonly clientX: number;
  readonly clientY: number;
}

export interface PointerElementRectangle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LogicalPointerViewport {
  readonly width: number;
  readonly height: number;
  readonly overscanX: number;
  readonly overscanY: number;
}

/** Maps browser coordinates into Tear's fixed arena, including the aspect-ratio bleed. */
export function mapClientPointerToLogical(
  point: ClientPointerPoint,
  rectangle: PointerElementRectangle,
  viewport: LogicalPointerViewport,
): Readonly<{ x: number; y: number }> {
  const spanWidth = viewport.width + viewport.overscanX * 2;
  const spanHeight = viewport.height + viewport.overscanY * 2;
  const x = (point.clientX - rectangle.left) / rectangle.width * spanWidth - viewport.overscanX;
  const y = (point.clientY - rectangle.top) / rectangle.height * spanHeight - viewport.overscanY;
  return Object.freeze({ x, y });
}
