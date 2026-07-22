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
  readonly uiZoom: number;
}

/** Maps browser coordinates into Tear's fixed arena, including bleed and overlay zoom. */
export function mapClientPointerToLogical(
  point: ClientPointerPoint,
  rectangle: PointerElementRectangle,
  viewport: LogicalPointerViewport,
): Readonly<{ x: number; y: number }> {
  const spanWidth = viewport.width + viewport.overscanX * 2;
  const spanHeight = viewport.height + viewport.overscanY * 2;
  let x = (point.clientX - rectangle.left) / rectangle.width * spanWidth - viewport.overscanX;
  let y = (point.clientY - rectangle.top) / rectangle.height * spanHeight - viewport.overscanY;
  const zoom = viewport.uiZoom || 1;
  if (zoom > 1.001) {
    x = viewport.width / 2 + (x - viewport.width / 2) / zoom;
    y = viewport.height / 2 + (y - viewport.height / 2) / zoom;
  }
  return Object.freeze({ x, y });
}
