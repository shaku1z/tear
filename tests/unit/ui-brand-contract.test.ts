import { describe, expect, it } from "vitest";
import { CLOCK, CONFIG, OVERSCAN } from "../../src/config/game-config";
import { clamp } from "../../src/domain/geometry";
import { createUi } from "../../src/presentation/ui";

function canvasStub(strokes: string[], text: string[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "fillText") return (value: string): void => { text.push(value); };
      if (property === "stroke") return (): void => { strokes.push("stroke"); };
      if (property === "measureText") return (value: string): TextMetrics => ({ width: value.length * 8 } as TextMetrics);
      return (): void => { return; };
    },
    set(_target, property, value): boolean { values.set(property, value); return true; },
  });
}

describe("Tear brand typography", () => {
  const ui = createUi({ CLOCK, CONFIG, OVERSCAN, clamp, Input: { mode: "mouse" } });

  it("keeps the established Courier core interface separate from cinematic families", () => {
    expect(ui.font(80)).toBe("80px 'Courier New', 'Nimbus Mono PS', 'Liberation Mono', monospace");
    expect(ui.font(24, true)).toBe("bold 24px 'Courier New', 'Nimbus Mono PS', 'Liberation Mono', monospace");
    expect(ui.displayFont(24)).toContain("Barlow Condensed");
    expect(ui.bodyFont(16)).toContain("IBM Plex Mono");
  });

  it("renders the plain wordmark and limits the blade slash to its brief motion beat", () => {
    const quietStrokes: string[] = [], quietText: string[] = [];
    ui.wordmark(canvasStub(quietStrokes, quietText), 100, 150, 1);
    expect(quietText).toEqual(["T E A R"]);
    expect(quietStrokes).toEqual([]);

    const activeStrokes: string[] = [], activeText: string[] = [];
    ui.wordmark(canvasStub(activeStrokes, activeText), 100, 150, 0.25);
    expect(activeText).toEqual(["T E A R"]);
    expect(activeStrokes).toEqual(["stroke"]);

    const reducedStrokes: string[] = [];
    ui.wordmark(canvasStub(reducedStrokes, []), 100, 150, 0.25, true);
    expect(reducedStrokes).toEqual([]);
  });
});
