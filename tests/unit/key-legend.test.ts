import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { clamp } from "../../src/domain/geometry";
import { PROMPT_ACTIONS, promptLabel } from "../../src/domain/prompt-vocabulary";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { keyLegendRuns, measureKeyLegend } from "../../src/presentation/key-legend";
import { createUi } from "../../src/presentation/ui";

const ARROW_GLYPH = /[←→↑↓]/u;

interface Drawn {
  readonly texts: string[];
  /** One entry per filled arrow head: the stroke weight of the shaft drawn just before it. */
  readonly arrows: number[];
}

/** A context that measures each character as 0.6 em and records text runs and arrow shapes. */
function recordingContext(drawn: Drawn): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { font: "bold 16px sans-serif", lineWidth: 1, fillStyle: "#000" };
  const stack: Record<string, unknown>[] = [];
  let strokeWeight = 0;
  const size = () => Number(/(\d+(?:\.\d+)?)px/u.exec(String(state.font))?.[1] ?? 16);
  const methods: Record<string, (...args: never[]) => unknown> = {
    measureText: (text: string) => ({ width: text.length * size() * 0.6 }),
    fillText: (text: string) => drawn.texts.push(text),
    stroke: () => {
      strokeWeight = Number(state.lineWidth);
    },
    fill: () => drawn.arrows.push(strokeWeight),
    save: () => stack.push({ ...state }),
    restore: () => Object.assign(state, stack.pop()),
  };
  return new Proxy(state, {
    get: (target, key) => methods[String(key)] ?? target[String(key)] ?? (() => undefined),
    set: (target, key, value) => {
      target[String(key)] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function desktopUi() {
  return createUi({
    CLOCK: createTearWorldClock(),
    presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan: { x: 0, y: 0 } },
    clamp,
    Input: { mode: "keyboard" },
  });
}

const keyboardLegends = PROMPT_ACTIONS.map((action) => promptLabel(action, "keyboard") ?? "");

describe("key legends draw the arrow keys with the letters' weight", () => {
  it("names arrows in the keyboard vocabulary, so the rule has legends to cover", () => {
    expect(keyboardLegends.filter((legend) => ARROW_GLYPH.test(legend)).length).toBeGreaterThan(0);
  });

  it("splits a legend into text and arrows in reading order", () => {
    expect(keyLegendRuns("S/↓ + SHIFT")).toEqual([{ text: "S/" }, { arrow: [0, 1] }, { text: " + SHIFT" }]);
    expect(keyLegendRuns("A D / ← →")).toEqual([
      { text: "A D / " },
      { arrow: [-1, 0] },
      { text: " " },
      { arrow: [1, 0] },
    ]);
  });

  it("gives an arrow a capital's advance, whatever width the font's arrow glyph has", () => {
    const drawn: Drawn = { texts: [], arrows: [] };
    const context = recordingContext(drawn);
    context.font = "bold 20px sans-serif";
    expect(measureKeyLegend(context, "←", 20)).toBe(16);
    expect(measureKeyLegend(context, "A ←", 20)).toBeCloseTo(2 * 12 + 16);
  });

  it("draws every key cap's arrows as shapes with a bold stem, never as a font glyph", () => {
    const ui = desktopUi();
    for (const legend of keyboardLegends) {
      const drawn: Drawn = { texts: [], arrows: [] };
      ui.keycap(recordingContext(drawn), legend, 0, 40);
      expect(drawn.texts.join(""), legend).not.toMatch(ARROW_GLYPH);
      const arrows = legend.match(/[←→↑↓]/gu)?.length ?? 0;
      expect(drawn.arrows, legend).toHaveLength(arrows);
      for (const weight of drawn.arrows) expect(weight, legend).toBeGreaterThanOrEqual(ui.t.type.micro * 0.14);
    }
  });

  it("draws the controls guide's key column the same way", () => {
    const ui = desktopUi();
    const drawn: Drawn = { texts: [], arrows: [] };
    const width = ui.keyLegend(recordingContext(drawn), "A D / ← →", 10, 40, "#123", "left", 16);
    expect(drawn.texts.join("")).toBe("A D /  ");
    expect(drawn.arrows).toHaveLength(2);
    expect(width).toBeCloseTo(7 * 16 * 0.6 + 2 * Math.round(16 * 0.78));
  });
});
