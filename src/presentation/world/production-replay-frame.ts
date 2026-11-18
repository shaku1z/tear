import { renderWorldFrame, type WorldFramePorts } from "./world-frame";

/** Settled scene owned by an isolated replay seek; only draw capabilities escape. */
export function createProductionReplayFrame(
  input: Readonly<{
    tick: number;
    clockSeconds: number;
    screen: string;
    clockBlocked: boolean;
    cameraX: number;
    cameraY: number;
    /** Leaves the area behind the world clear instead of filling it. */
    transparent?: boolean;
    ports: Omit<WorldFramePorts, "canvas" | "screen">;
  }>,
) {
  const { width, height, zoom } = input.ports;
  const camera = Object.freeze({
    policy: "player-follow" as const,
    x: input.cameraX,
    y: input.cameraY,
    scale: zoom,
    reconstructed: true as const,
  });
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
        const scale = Math.min(rectangle.w / width, rectangle.h / height);
        canvas.translate(
          rectangle.x + (rectangle.w - width * scale) / 2,
          rectangle.y + (rectangle.h - height * scale) / 2,
        );
        canvas.scale(scale, scale);
        // Keep the logical content inside its aspect-fit rectangle before moving the world camera.
        canvas.beginPath();
        canvas.rect(0, 0, width, height);
        canvas.clip();
        const dx = (width / 2 - camera.x) * zoom,
          dy = (height / 2 - camera.y) * zoom;
        canvas.translate(dx, dy);
        renderWorldFrame({ ...input.ports, canvas, screen: { x: -dx, y: -dy, w: width, h: height } });
      } finally {
        canvas.restore();
      }
    },
  });
}
