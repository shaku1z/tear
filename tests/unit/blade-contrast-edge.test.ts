import { describe, expect, it } from "vitest";
import type { BladeRenderSnapshot } from "../../src/gameplay/entities/blade-contracts";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { BLADE_TONE, BLADE_TONE_STYLES, createBladeRenderer } from "../../src/presentation/entities/blade-renderer";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";

const INK = { light: "#0a0a0a", dark: "#ecebf6" } as const;

type Paint = Readonly<{ kind: "stroke" | "fill"; color: string; width: number; shadowBlur: number; lineJoin: string }>;

/** A canvas that records every stroke and fill in order, with the state it was drawn in; save/restore stack. */
function recordingCanvas() {
  const paints: Paint[] = [];
  interface State {
    strokeStyle: string;
    fillStyle: string;
    lineWidth: number;
    shadowBlur: number;
    lineJoin: string;
  }
  let state: State = { strokeStyle: "", fillStyle: "", lineWidth: 1, shadowBlur: 0, lineJoin: "miter" };
  const stack: State[] = [];
  const noop = (): void => undefined;
  const paint = (kind: Paint["kind"]) => () => {
    paints.push({
      kind,
      color: kind === "stroke" ? state.strokeStyle : state.fillStyle,
      width: state.lineWidth,
      shadowBlur: state.shadowBlur,
      lineJoin: state.lineJoin,
    });
  };
  const surface = {
    save: () => {
      stack.push({ ...state });
    },
    restore: () => {
      state = stack.pop() ?? state;
    },
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
    fillRect: paint("fill"),
    strokeRect: paint("stroke"),
    fill: paint("fill"),
    stroke: paint("stroke"),
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
    get shadowBlur() {
      return state.shadowBlur;
    },
    set shadowBlur(value: number) {
      state.shadowBlur = value;
    },
    get lineJoin() {
      return state.lineJoin;
    },
    set lineJoin(value: string) {
      state.lineJoin = value;
    },
    lineCap: "butt",
    globalAlpha: 1,
    shadowColor: "",
  };
  return { surface, paints };
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
    looks: DEFAULT_COSMETIC_LOOKS,
    clock: { sim: 0 },
    policy: { colors: { bladeTrail: "trail", perfect: "perfect" }, juice: { trailAlpha: 0.4 } },
    graphics: { low },
    theme: { dark, ink: dark ? INK.dark : INK.light, rim: "rim" },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    len: Math.hypot,
    lerp: (from, to, amount) => from + (to - from) * amount,
  }).draw(canvas.surface, restingBlade(model), { x: 100, y: 100, vx: 0, vy: 0, facing: 1 });
  return canvas.paints;
}

describe("blade contrast edge", () => {
  for (const model of WEAPON_IDS)
    for (const dark of [false, true])
      for (const low of [false, true])
        it(`draws the ${model} on a soft rim of the opposite tone (${dark ? "dark" : "light"} stage, ${low ? "low" : "full"} graphics)`, () => {
          const paints = drawResting(model, dark, low);
          const ink = dark ? INK.dark : INK.light;
          const bands = (dark ? BLADE_TONE_STYLES.dark : BLADE_TONE_STYLES.light).edge.map((band) => band.color);
          const rim = paints.filter((paint) => bands.includes(paint.color));
          expect(rim.length, "rim strokes").toBeGreaterThan(0);
          // Every rim stroke is soft, joined round and carries no shadow.
          for (const paint of rim) {
            expect(paint.kind).toBe("stroke");
            expect(paint.lineJoin).toBe("round");
            expect(paint.shadowBlur).toBe(0);
          }
          // Outer band then inner band, every time; the rim goes down before the ink it frames.
          expect(rim.map((paint) => paint.color)).toEqual(rim.map((_, index) => bands[index % bands.length]));
          const firstInk = paints.findIndex((paint) => paint.color === ink);
          expect(firstInk, "the ink body").toBeGreaterThan(-1);
          expect(paints.findIndex((paint) => bands.includes(paint.color))).toBeLessThan(firstInk);
        });

  it("lays the sword's rim as one path per band, round the blade and guard together", () => {
    const paints = drawResting("sword", false, false);
    const rims = BLADE_TONE.edge.map((band) => 7 + band.spread * 2);
    expect(paints.map((paint) => paint.width)).toEqual([...rims, 7, 5]);
  });

  it("keeps the rim shadow on the ink, as before the rim", () => {
    const paints = drawResting("sword", false, false);
    const ink = paints.filter((paint) => paint.color === INK.light);
    expect(ink.map((paint) => paint.shadowBlur)).toEqual([6, 0]);
  });

  it("keeps the rim soft: no band is opaque", () => {
    for (const band of BLADE_TONE.edge) expect(band.alpha).toBeLessThan(1);
  });
});
