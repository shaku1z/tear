import { renderWorldFrame, type WorldFramePorts } from "./world-frame";

/**
 * Settled scene owned by an isolated replay seek; only draw capabilities escape.
 *
 * The camera is the live game's: `renderWorldFrame` centres it on the arena and applies the world's zoom
 * (`ports.zoom`). A replay adds no camera of its own. `draw` fits the whole arena into the rectangle it is
 * given, as the live game fits it into the window, and paints the backdrop over the rest of the rectangle.
 */
export function createProductionReplayFrame(
  input: Readonly<{
    tick: number;
    clockSeconds: number;
    screen: string;
    clockBlocked: boolean;
    /** Leaves the area behind the world clear instead of filling it. */
    transparent?: boolean;
    ports: Omit<WorldFramePorts, "canvas" | "screen">;
    /** What play draws over the world (HUD, scenes, banners), in the arena's coordinates. */
    drawOverlay?: (canvas: CanvasRenderingContext2D) => void;
  }>,
) {
  const { width, height, zoom } = input.ports;
  const camera = Object.freeze({ policy: "arena" as const, x: width / 2, y: height / 2, scale: zoom });
  return Object.freeze({
    tick: input.tick,
    viewport: Object.freeze({ width, height }),
    clockSeconds: input.clockSeconds,
    screen: input.screen,
    clockBlocked: input.clockBlocked,
    camera,
    draw(canvas: CanvasRenderingContext2D, rectangle: Readonly<{ x: number; y: number; w: number; h: number }>): void {
      if (
        ![rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(Number.isFinite) ||
        rectangle.w <= 0 ||
        rectangle.h <= 0
      )
        throw new RangeError("replay viewport is invalid");
      canvas.save();
      try {
        canvas.beginPath();
        canvas.rect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
        canvas.clip();
        if (input.transparent !== true) {
          canvas.fillStyle = "#090e15";
          canvas.fillRect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
        }
        const scale = Math.min(rectangle.w / width, rectangle.h / height),
          left = rectangle.x + (rectangle.w - width * scale) / 2,
          top = rectangle.y + (rectangle.h - height * scale) / 2;
        canvas.translate(left, top);
        canvas.scale(scale, scale);
        // The rectangle in world-frame coordinates: the arena plus the margin the fit leaves around it.
        const screen = {
          x: (rectangle.x - left) / scale,
          y: (rectangle.y - top) / scale,
          w: rectangle.w / scale,
          h: rectangle.h / scale,
        };
        renderWorldFrame({ ...input.ports, canvas, screen });
        input.drawOverlay?.(canvas);
      } finally {
        canvas.restore();
      }
    },
  });
}
