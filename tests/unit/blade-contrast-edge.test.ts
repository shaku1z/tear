import { describe, expect, it } from "vitest";
import type { BladeRenderSnapshot } from "../../src/gameplay/entities/blade-contracts";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { BLADE_EDGE, createBladeRenderer } from "../../src/presentation/entities/blade-renderer";

const INK = { light: "#0a0a0a", dark: "#ecebf6" } as const;

/** A canvas that records the colour and width of every stroke and the colour of every fill, in order. */
function recordingCanvas() {
  const strokes: { color: string; width: number }[] = [];
  const fills: string[] = [];
  const state = { strokeStyle: "", fillStyle: "", lineWidth: 1 };
  const noop = (): void => undefined;
  const surface = {
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    rect: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
    fillRect: () => fills.push(state.fillStyle),
    strokeRect: () => strokes.push({ color: state.strokeStyle, width: state.lineWidth }),
    fill: () => fills.push(state.fillStyle),
    stroke: () => strokes.push({ color: state.strokeStyle, width: state.lineWidth }),
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    lineCap: "butt",
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: "",
  };
  return { surface, strokes, fills };
}

/** A blade at rest: held, hanging straight down from the hand. */
function restingBlade(model: string): BladeRenderSnapshot {
  const hand = { x: 100, y: 100 };
  return {
    x: 100,
    y: 110,
    angle: Math.PI / 2,
    tipX: 100,
    tipY: 170,
    glowV: 0,
    state: "held",
    throwSizeMult: 1,
    model,
    trail: [],
    tension: 0,
    riftChambers: 0,
    riftChamberCooldown: 0,
    chainPoints: [],
    reversals: [],
    finalFree: true,
    hostile: false,
    stolenBy: null,
    handPos: () => hand,
    lastHand: () => hand,
    actionPoint: () => hand,
    actionRange: () => Infinity,
  };
}

function drawResting(model: string, dark: boolean, low: boolean) {
  const canvas = recordingCanvas();
  createBladeRenderer({
    clock: { sim: 0 },
    policy: { colors: { bladeGlow: "glow", bladeTrail: "trail", perfect: "perfect" }, juice: { trailAlpha: 0.4 } },
    graphics: { low },
    theme: { dark, ink: dark ? INK.dark : INK.light, rim: "rim" },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    len: Math.hypot,
    lerp: (from, to, amount) => from + (to - from) * amount,
  }).draw(canvas.surface, restingBlade(model), { x: 100, y: 100, vx: 0, vy: 0, facing: 1 });
  return canvas;
}

describe("blade contrast edge", () => {
  for (const model of WEAPON_IDS)
    for (const dark of [false, true])
      for (const low of [false, true])
        it(`draws the ${model} in ink over an edge of the opposite tone (${dark ? "dark" : "light"} stage, ${low ? "low" : "full"} graphics)`, () => {
          const { strokes, fills } = drawResting(model, dark, low);
          const ink = dark ? INK.dark : INK.light;
          const edge = dark ? BLADE_EDGE.dark : BLADE_EDGE.light;
          expect(
            strokes.some((stroke) => stroke.color === edge),
            "an edge stroke",
          ).toBe(true);
          expect([...strokes.map((stroke) => stroke.color), ...fills], "the ink body").toContain(ink);
        });

  it("puts each stroke's edge under every ink stroke, wider by the edge on both sides", () => {
    const { strokes } = drawResting("sword", false, false);
    const lastEdge = strokes.map((stroke) => stroke.color).lastIndexOf(BLADE_EDGE.light);
    const firstInk = strokes.findIndex((stroke) => stroke.color === INK.light);
    expect(lastEdge).toBeLessThan(firstInk);
    // The blade and the guard: both edges first, then both ink strokes.
    expect(strokes.map((stroke) => stroke.width)).toEqual([7 + BLADE_EDGE.width * 2, 5 + BLADE_EDGE.width * 2, 7, 5]);
  });
});
