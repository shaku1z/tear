import { describe, expect, it } from "vitest";
import { CONFIG, OVERSCAN } from "../../src/config/game-config";
import { clamp } from "../../src/domain/geometry";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { createUi } from "../../src/presentation/ui";
import {
  arsenalPanel,
  runContentSurface,
  runProgressPanel,
  waveLogPanel,
} from "../../src/presentation/screens/run-overlay-panels";
import type { ScreenRenderContext } from "../../src/presentation/screens/contracts";

interface Recording {
  readonly context: ScreenRenderContext;
  /** Opaque rectangles filled so far, and every text drawn with the rectangles that covered it. */
  readonly rects: { x: number; y: number; w: number; h: number }[];
  readonly uncovered: string[];
}

function record(): Recording {
  const ui = createUi({
    CLOCK: createTearWorldClock(),
    presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan: OVERSCAN },
    clamp,
    Input: { mode: "mouse" },
  });
  const values = new Map<PropertyKey, unknown>([["globalAlpha", 1]]);
  const rects: Recording["rects"] = [];
  const uncovered: string[] = [];
  const alpha = (): number => values.get("globalAlpha") as number;
  const canvas = new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, property) => {
      if (property === "fillRect")
        return (x: number, y: number, w: number, h: number) => {
          if (alpha() === 1) rects.push({ x, y, w, h });
        };
      if (property === "measureText") return (text: string) => ({ width: text.length * 8 });
      if (property === "fillText")
        return (text: string, x: number, y: number) => {
          const covered = rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
          if (!covered) uncovered.push(text);
        };
      return values.get(property) ?? (() => undefined);
    },
    set: (_target, property, value) => {
      values.set(property, value);
      return true;
    },
  });
  return { context: { canvas, ui, scroll: 0 } as unknown as ScreenRenderContext, rects, uncovered };
}

const ROWS = [
  { label: "Land 10 updraft launches", current: 0, goal: 10, kind: "daily" as const },
  { label: "Wayfarer", current: 1, goal: 6, kind: "achievement" as const },
];

describe("run overlay content surface", () => {
  it("fills content on a fully opaque panel over the translucent scrim", () => {
    const { context, rects } = record();
    runContentSurface(context, 10, 10, 100, 100);
    expect(rects).toHaveLength(1);
    expect(context.ui.t.alpha.overlay).toBeLessThan(1);
  });

  it("puts every text of the progress panel on an opaque surface drawn before it", () => {
    for (const rows of [ROWS, ROWS.slice(0, 1)]) {
      const { context, uncovered } = record();
      runProgressPanel(context, rows, 100, 100, 400, 700);
      expect(uncovered).toEqual([]);
    }
  });

  it("draws no empty-state line, nor its surface, when the rows overflow the panel", () => {
    const { context, rects, uncovered } = record();
    runProgressPanel(context, ROWS.slice(0, 1), 100, 100, 400, 140);
    expect(uncovered).toEqual([]);
    for (const r of rects) expect(r.y + r.h).toBeLessThanOrEqual(140 + context.ui.t.metric.panelPad);
  });

  it("puts the wave log and the arsenal on opaque surfaces", () => {
    const log = record();
    waveLogPanel(log.context, [{ wave: "1", time: "0:10", kills: 3, peak: "2x", died: false }], {
      x: 100,
      y: 100,
      w: 400,
      h: 300,
    });
    expect(log.uncovered).toEqual([]);
    const arsenal = record();
    arsenalPanel(arsenal.context, [], { x: 100, y: 100, w: 400, h: 300 });
    expect(arsenal.uncovered).toEqual([]);
  });
});
