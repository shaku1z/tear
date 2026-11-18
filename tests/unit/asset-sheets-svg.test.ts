/**
 * The SVG drawing context of `pnpm assets:sheets` must write what a canvas would draw: points placed through
 * the transform current when they are added, fills and strokes in the transform current when they are made,
 * clip groups closed on restore, and a clear error for any canvas call it does not know.
 */
import { describe, expect, it } from "vitest";

import { createSvgContext, type SvgMeasure } from "../../scripts/asset-sheets/page/svg-context";

/** Text metrics of a given width; the recording only reads the width. */
const metrics = (width: number): TextMetrics => ({
  width,
  actualBoundingBoxAscent: 8,
  actualBoundingBoxDescent: 2,
  actualBoundingBoxLeft: 0,
  actualBoundingBoxRight: width,
  alphabeticBaseline: 0,
  emHeightAscent: 8,
  emHeightDescent: 2,
  fontBoundingBoxAscent: 8,
  fontBoundingBoxDescent: 2,
  hangingBaseline: 8,
  ideographicBaseline: -2,
});
/** Stands in for the real canvas used to normalise colours and measure text. */
function fakeMeasure(): SvgMeasure {
  let style: SvgMeasure["fillStyle"] = "#000000";
  return {
    get fillStyle() {
      return style;
    },
    set fillStyle(value) {
      style = value;
    },
    font: "10px sans-serif",
    measureText: (text: string) => metrics(text.length * 6),
  };
}
const whole = { x: 0, y: 0, w: 100, h: 100 };
const draw = (paint: (context: CanvasRenderingContext2D) => void) => {
  const context = createSvgContext(100, 100, fakeMeasure(), "t");
  paint(context);
  return context.document(whole, "test");
};

describe("SVG drawing context", () => {
  it("writes a filled rectangle in its user space with the transform", () => {
    const svg = draw((context) => {
      context.translate(10, 20);
      context.fillStyle = "#ff0000";
      context.fillRect(0, 0, 5, 5);
    });
    expect(svg).toContain('<path d="M0 0L5 0L5 5L0 5ZM0 0" fill="#ff0000" transform="matrix(1 0 0 1 10 20)"/>');
  });

  it("keeps path points where they were added when the transform changes before the stroke", () => {
    const svg = draw((context) => {
      context.beginPath();
      context.moveTo(0, 0);
      context.translate(10, 0);
      context.lineTo(0, 0);
      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      context.stroke();
    });
    // The stroke is made under translate(10, 0), so the first point (device 0,0) is at -10 in that space.
    expect(svg).toContain('d="M-10 0L0 0"');
    expect(svg).toContain('stroke-width="2"');
  });

  it("closes the clip groups a save level opened when it is restored", () => {
    const svg = draw((context) => {
      context.save();
      context.beginPath();
      context.rect(0, 0, 50, 50);
      context.clip();
      context.save();
      context.beginPath();
      context.rect(0, 0, 20, 20);
      context.clip();
      context.restore();
      context.fillRect(0, 0, 10, 10);
      context.restore();
      context.fillRect(60, 60, 10, 10);
    });
    const opened = svg.split("<g clip-path").length - 1;
    const closed = svg.split("</g>").length - 1;
    expect(opened).toBe(2);
    expect(closed).toBe(2);
    // The second rectangle is drawn after both clips are closed.
    expect(svg.lastIndexOf("</g>")).toBeLessThan(svg.indexOf("M60 60"));
  });

  it("writes alpha, gradients, shadows and the additive blend as SVG equivalents", () => {
    const svg = draw((context) => {
      const gradient = context.createLinearGradient(0, 0, 10, 0);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(1, "#000000");
      context.globalAlpha = 0.5;
      context.globalCompositeOperation = "lighter";
      context.shadowColor = "#00ff00";
      context.shadowBlur = 8;
      context.fillStyle = gradient;
      context.fillRect(0, 0, 10, 10);
    });
    expect(svg).toContain('<linearGradient id="t-d0" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain("mix-blend-mode:plus-lighter");
    expect(svg).toContain('stdDeviation="4"');
  });

  it("refuses a canvas call it does not know instead of skipping it", () => {
    const context = createSvgContext(100, 100, fakeMeasure(), "t");
    expect(() => Reflect.get(context, "drawFocusIfNeeded")).toThrow(/has no "drawFocusIfNeeded"/u);
  });
});
