/**
 * The replay presentation over recording canvases, with a stub UI kit, for tests that draw a real replay frame
 * (tests/unit/ghost-production-replay-world.test.ts, tests/unit/replay-screen-layers.test.ts).
 */
import {
  createBrowserGhostReplayPresentation,
  type BrowserGhostReplayPresentationOptions,
} from "../../src/app/replay/browser-ghost-replay-presentation";

/** A point a drawing call reached, in the canvas's own pixels (after every transform), and the call. */
export interface RecordedPoint {
  readonly call: string;
  readonly x: number;
  readonly y: number;
}

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, [a, b, c, d, e, f]: Matrix): Matrix {
  return [
    m[0] * a + m[2] * b,
    m[1] * a + m[3] * b,
    m[0] * c + m[2] * d,
    m[1] * c + m[3] * d,
    m[0] * e + m[2] * f + m[4],
    m[1] * e + m[3] * f + m[5],
  ];
}

/** The points each drawing call names, in the coordinates it was called with. */
function namedPoints(call: string, args: readonly unknown[]): readonly (readonly [number, number])[] {
  const n = args.map((value) => (typeof value === "number" ? value : Number.NaN));
  switch (call) {
    case "fillRect":
    case "strokeRect":
    case "rect":
    case "roundRect":
      return [
        [n[0], n[1]],
        [n[0] + n[2], n[1] + n[3]],
      ];
    case "fillText":
    case "strokeText":
      return [[n[1], n[2]]];
    case "moveTo":
    case "lineTo":
      return [[n[0], n[1]]];
    case "arc":
    case "ellipse": {
      const rx = n[2],
        ry = call === "ellipse" ? n[3] : n[2];
      return [
        [n[0] - rx, n[1] - ry],
        [n[0] + rx, n[1] + ry],
      ];
    }
    case "quadraticCurveTo":
      return [[n[2], n[3]]];
    case "bezierCurveTo":
      return [[n[4], n[5]]];
    case "drawImage":
      if (args.length >= 9)
        return [
          [n[5], n[6]],
          [n[5] + n[7], n[6] + n[8]],
        ];
      if (args.length >= 5)
        return [
          [n[1], n[2]],
          [n[1] + n[3], n[2] + n[4]],
        ];
      return [[n[1], n[2]]];
    default:
      return [];
  }
}

/**
 * A canvas whose context records every drawing call into `calls` and, when `points` is given, where each call
 * reached in the canvas's own pixels: it follows save, restore and every transform.
 */
export function recordingCanvas(calls: string[], points?: RecordedPoint[], size = { width: 1600, height: 900 }) {
  const surface = { ...size, getContext: () => context };
  let matrix: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  const transforms: Record<string, (...args: number[]) => void> = {
    save: () => void stack.push(matrix),
    restore: () => void (matrix = stack.pop() ?? IDENTITY),
    translate: (x, y) => void (matrix = multiply(matrix, [1, 0, 0, 1, x, y])),
    scale: (x, y) => void (matrix = multiply(matrix, [x, 0, 0, y, 0, 0])),
    rotate: (angle) =>
      void (matrix = multiply(matrix, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0])),
    transform: (a, b, c, d, e, f) => void (matrix = multiply(matrix, [a, b, c, d, e, f])),
    setTransform: (a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) => void (matrix = [a, b, c, d, e, f]),
    resetTransform: () => void (matrix = IDENTITY),
  };
  const context = new Proxy(
    { canvas: surface },
    {
      has: () => true,
      get(target, key) {
        if (key === "canvas") return target.canvas;
        if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern")
          return () => ({
            addColorStop() {
              return;
            },
          });
        if (key === "measureText") return () => ({ width: 10 });
        if (key === "getTransform")
          return () => ({ a: matrix[0], b: matrix[1], c: matrix[2], d: matrix[3], e: matrix[4], f: matrix[5] });
        return (...args: unknown[]) => {
          const call = String(key);
          calls.push(`${call}:${args.map(String).join(",")}`);
          const transform = transforms[call];
          if (transform !== undefined) {
            transform(...(args as number[]));
            return;
          }
          for (const [x, y] of namedPoints(call, args))
            if (Number.isFinite(x) && Number.isFinite(y))
              points?.push({
                call,
                x: matrix[0] * x + matrix[2] * y + matrix[4],
                y: matrix[1] * x + matrix[3] * y + matrix[5],
              });
        };
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return surface;
}

/** A UI kit text call drawn as one fillText at its anchor, so a recording canvas sees where the text went. */
const text = (canvas: CanvasRenderingContext2D, value: string, x: number, y: number) => {
  canvas.fillText(value, x, y);
};
const noDraw = () => undefined;

/** The replay presentation over recording canvases (each `createElement` records into `calls`). */
export function replayPresentation(calls: string[], options: BrowserGhostReplayPresentationOptions = {}) {
  const document = { createElement: () => recordingCanvas(calls) } as unknown as Document;
  return createBrowserGhostReplayPresentation(
    document,
    {
      font: () => "12px sans-serif",
      tag: text,
      text,
      title: text,
      bossHud: noDraw,
      chapterHeader: noDraw,
      loreFragment: noDraw,
      chapterPrompt: noDraw,
      biomeReveal: noDraw,
      cinematicFrame: noDraw,
      finaleFracture: noDraw,
      finalReward: noDraw,
      cinematicPrompt: noDraw,
      bossDeclaration: noDraw,
      dialogueCard: noDraw,
      ink: "#000",
      density: { touch: false, compact: false },
      readable: (color: string) => color,
      displayText: text,
      fitText: (_canvas: unknown, value: string, _width: number, fit: { size: number }) => ({
        size: fit.size,
        lines: [value],
        truncated: false,
      }),
      textBox: (_canvas: unknown, value: string) => ({ size: 16, lines: [value], height: 24, lineHeight: 24 }),
      keycap: () => 30,
      keycapSize: () => ({ w: 30, h: 22 }),
      sheetRect: () => ({ x: 180, y: 44, w: 1240, h: 820 }),
      sheetFooter: () => ({ y: 804, h: 48, backX: 690 }),
      t: {
        type: { display: 40, h2: 28, title: 24, lead: 20, body: 16, label: 14, caption: 12, micro: 10 },
        alpha: { soft: 0.5, muted: 0.66, faint: 0.2 },
        color: { accent: "#f00", muted: "#888", paper: "#fff", danger: "#e44", scrim: "#06070c", scrimInk: "#f1eff9" },
        metric: {
          bossHudH: 40,
          bossNotchH: 6,
          bossGuardGap: 10,
          bossGuardH: 6,
          barH: 14,
          hudPad: 10,
          hudBarW: 320,
          hudAbilityRows: 4,
        },
        space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
        motion: { finalRewardIn: 0.4 },
      },
    },
    options,
  );
}
