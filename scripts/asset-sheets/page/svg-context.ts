/**
 * A drawing context that writes SVG. It takes the same calls as a canvas 2D context, so the game's own
 * drawing code produces vector pictures that stay sharp at any size. It follows canvas rules: path points
 * are fixed in device space when added, and a fill or stroke uses the transform current at that moment
 * (the element is written in that user space with a transform attribute, so line widths, dashes and
 * gradients come out as the canvas would draw them).
 *
 * What SVG cannot say exactly is written as close as it can be and listed in `approximations`: a canvas
 * shadow becomes an SVG drop-shadow filter, "lighter" becomes the plus-lighter blend, and any other
 * composite mode, pattern or image is noted.
 */

type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];
type Segment =
  | Readonly<{ op: "M" | "L"; p: Point }>
  | Readonly<{ op: "C"; c1: Point; c2: Point; p: Point }>
  | Readonly<{ op: "Q"; c: Point; p: Point }>
  | Readonly<{ op: "Z" }>;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}
const apply = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Fixed precision keeps the output small and byte-identical between runs. */
function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
const esc = (text: string) =>
  text.replace(/[&<>"]/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

class SvgGradient {
  readonly stops: { offset: number; color: string }[] = [];
  constructor(
    readonly kind: "linear" | "radial",
    readonly args: readonly number[],
  ) {}
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

interface DrawState {
  matrix: Matrix;
  fillStyle: string | SvgGradient;
  strokeStyle: string | SvgGradient;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  globalAlpha: number;
  composite: string;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  filter: string;
  /** How many clip groups this state opened; restore closes them. */
  clips: number;
}

const BASELINE: Record<CanvasTextBaseline, string> = {
  top: "text-before-edge",
  hanging: "hanging",
  middle: "central",
  alphabetic: "alphabetic",
  ideographic: "ideographic",
  bottom: "text-after-edge",
};

export interface SvgDrawing {
  /** The finished document cropped to the rectangle (in device units). */
  document(rect: Readonly<{ x: number; y: number; w: number; h: number }>, title: string): string;
  readonly approximations: ReadonlySet<string>;
}

/** What the recording needs from a real canvas: colour normalising and text measuring. */
export type SvgMeasure = Pick<CanvasRenderingContext2D, "fillStyle" | "font" | "measureText">;

/**
 * Creates the recording context. `measure` is a real canvas context used only to normalise colours and measure
 * text, so the SVG uses exactly the colours and widths the canvas would. `idPrefix` keeps the ids of
 * gradients, filters and clips unique when several pictures are put in one sheet.
 */
export function createSvgContext(
  width: number,
  height: number,
  measure: SvgMeasure,
  idPrefix: string,
): CanvasRenderingContext2D & SvgDrawing {
  let state: DrawState = {
    matrix: IDENTITY,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    dash: [],
    dashOffset: 0,
    globalAlpha: 1,
    composite: "source-over",
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    filter: "none",
    clips: 0,
  };
  const stack: DrawState[] = [];
  let path: Segment[] = [];
  let start: Point | null = null;
  let current: Point | null = null;
  const defs: string[] = [];
  const body: string[] = [];
  const defIds = new Map<string, string>();
  const approximations = new Set<string>();
  let nextId = 0;

  /** Splits a CSS colour into an opaque colour and its alpha, normalised by the real canvas. */
  function color(value: string): { rgb: string; alpha: number } {
    measure.fillStyle = "#000000";
    measure.fillStyle = value;
    const normal = measure.fillStyle;
    const rgba = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/u.exec(normal);
    if (rgba !== null) {
      const hex = [rgba[1], rgba[2], rgba[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("");
      return { rgb: `#${hex}`, alpha: Number(rgba[4]) };
    }
    return { rgb: normal, alpha: 1 };
  }
  function define(key: string, make: (id: string) => string): string {
    const known = defIds.get(key);
    if (known !== undefined) return known;
    const id = `${idPrefix}-d${String(nextId++)}`;
    defIds.set(key, id);
    defs.push(make(id));
    return id;
  }
  function paint(style: string | SvgGradient, kind: "fill" | "stroke"): string {
    if (typeof style === "string") {
      const { rgb, alpha } = color(style);
      return `${kind}="${rgb}"${alpha < 1 ? ` ${kind}-opacity="${num(alpha)}"` : ""}`;
    }
    const stops = style.stops
      .map(({ offset, color: value }) => {
        const { rgb, alpha } = color(value);
        return `<stop offset="${num(offset)}" stop-color="${rgb}"${alpha < 1 ? ` stop-opacity="${num(alpha)}"` : ""}/>`;
      })
      .join("");
    const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0] = style.args;
    const geometry =
      style.kind === "linear"
        ? `x1="${num(a0)}" y1="${num(a1)}" x2="${num(a2)}" y2="${num(a3)}"`
        : `fx="${num(a0)}" fy="${num(a1)}" fr="${num(a2)}" cx="${num(a3)}" cy="${num(a4)}" r="${num(a5)}"`;
    const tag = style.kind === "linear" ? "linearGradient" : "radialGradient";
    const id = define(`${tag}|${geometry}|${stops}`, (key) => {
      return `<${tag} id="${key}" gradientUnits="userSpaceOnUse" ${geometry}>${stops}</${tag}>`;
    });
    return `${kind}="url(#${id})"`;
  }
  /** Scale of the current transform, for lengths that canvas keeps in device pixels (shadow blur). */
  const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

  function effects(): string {
    const parts: string[] = [];
    if (state.globalAlpha < 1) parts.push(`opacity="${num(state.globalAlpha)}"`);
    const style: string[] = [];
    if (state.composite === "lighter") style.push("mix-blend-mode:plus-lighter");
    else if (state.composite !== "source-over") {
      const blend = ["multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn"];
      if (blend.includes(state.composite)) style.push(`mix-blend-mode:${state.composite}`);
      approximations.add(`composite ${state.composite}`);
    }
    if (state.filter !== "none") {
      style.push(`filter:${state.filter}`);
      approximations.add("canvas filter");
    }
    const shadow = color(state.shadowColor);
    if (shadow.alpha > 0 && (state.shadowBlur > 0 || state.shadowOffsetX !== 0 || state.shadowOffsetY !== 0)) {
      // Canvas shadows ignore the transform; the filter works in the element's user space, so undo the scale.
      const s = scaleOf(state.matrix);
      const inverse = invert([state.matrix[0], state.matrix[1], state.matrix[2], state.matrix[3], 0, 0]) ?? IDENTITY;
      const [dx, dy] = apply(inverse, state.shadowOffsetX, state.shadowOffsetY);
      const shape = `${num(dx)}|${num(dy)}|${num(state.shadowBlur / 2 / s)}|${shadow.rgb}|${num(shadow.alpha)}`;
      const id = define(`shadow|${shape}`, (key) => {
        // User-space region: a thin line has an empty bounding box, which would hide it.
        return (
          `<filter id="${key}" filterUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">` +
          `<feDropShadow dx="${num(dx)}" dy="${num(dy)}" stdDeviation="${num(state.shadowBlur / 2 / s)}" ` +
          `flood-color="${shadow.rgb}" flood-opacity="${num(shadow.alpha)}"/></filter>`
        );
      });
      parts.push(`filter="url(#${id})"`);
    }
    if (style.length > 0) parts.push(`style="${style.join(";")}"`);
    return parts.join(" ");
  }
  function transformAttribute(): string {
    const m = state.matrix;
    if (m.every((value, index) => value === IDENTITY[index])) return "";
    return ` transform="matrix(${m.map(num).join(" ")})"`;
  }
  /** The path in the current user space (device points mapped back through the current transform). */
  function pathData(segments: readonly Segment[]): string | null {
    const inverse = invert(state.matrix);
    if (inverse === null) return null;
    const p = (point: Point) => {
      const [x, y] = apply(inverse, point[0], point[1]);
      return `${num(x)} ${num(y)}`;
    };
    return segments
      .map((segment) => {
        if (segment.op === "Z") return "Z";
        if (segment.op === "C") return `C${p(segment.c1)} ${p(segment.c2)} ${p(segment.p)}`;
        if (segment.op === "Q") return `Q${p(segment.c)} ${p(segment.p)}`;
        return `${segment.op}${p(segment.p)}`;
      })
      .join("");
  }
  function emitPath(segments: readonly Segment[], mode: "fill" | "stroke", rule: CanvasFillRule = "nonzero"): void {
    if (segments.length === 0) return;
    const d = pathData(segments);
    if (d === null || d === "") return;
    const attributes =
      mode === "fill"
        ? `${paint(state.fillStyle, "fill")}${rule === "evenodd" ? ' fill-rule="evenodd"' : ""}`
        : `fill="none" ${paint(state.strokeStyle, "stroke")} stroke-width="${num(state.lineWidth)}"` +
          (state.lineCap === "butt" ? "" : ` stroke-linecap="${state.lineCap}"`) +
          (state.lineJoin === "miter" ? "" : ` stroke-linejoin="${state.lineJoin}"`) +
          (state.miterLimit === 4 ? "" : ` stroke-miterlimit="${num(state.miterLimit)}"`) +
          (state.dash.length === 0
            ? ""
            : ` stroke-dasharray="${state.dash.map(num).join(" ")}"` +
              (state.dashOffset === 0 ? "" : ` stroke-dashoffset="${num(state.dashOffset)}"`));
    const extra = effects();
    body.push(`<path d="${d}" ${attributes}${transformAttribute()}${extra === "" ? "" : ` ${extra}`}/>`);
  }

  // Path building, in device space.
  const device = (x: number, y: number) => apply(state.matrix, x, y);
  function moveTo(x: number, y: number): void {
    const p = device(x, y);
    path.push({ op: "M", p });
    start = p;
    current = p;
  }
  function lineTo(x: number, y: number): void {
    if (current === null) {
      moveTo(x, y);
      return;
    }
    const p = device(x, y);
    path.push({ op: "L", p });
    current = p;
  }
  /** An elliptical arc as cubic curves (at most a quarter turn each), placed through the current transform. */
  function ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    from: number,
    to: number,
    anticlockwise = false,
  ): void {
    const tau = Math.PI * 2;
    let sweep = to - from;
    if (!anticlockwise && sweep < 0) sweep = (sweep % tau) + tau;
    if (anticlockwise && sweep > 0) sweep = (sweep % tau) - tau;
    if (!anticlockwise && to - from >= tau) sweep = tau;
    if (anticlockwise && from - to >= tau) sweep = -tau;
    const local = (angle: number): Point => {
      const x = rx * Math.cos(angle),
        y = ry * Math.sin(angle);
      return [
        cx + x * Math.cos(rotation) - y * Math.sin(rotation),
        cy + x * Math.sin(rotation) + y * Math.cos(rotation),
      ];
    };
    const derivative = (angle: number): Point => {
      const x = -rx * Math.sin(angle),
        y = ry * Math.cos(angle);
      return [x * Math.cos(rotation) - y * Math.sin(rotation), x * Math.sin(rotation) + y * Math.cos(rotation)];
    };
    const [sx, sy] = local(from);
    if (current === null) moveTo(sx, sy);
    else lineTo(sx, sy);
    const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const step = sweep / pieces;
    const k = (4 / 3) * Math.tan(step / 4);
    for (let index = 0; index < pieces; index += 1) {
      const a = from + step * index,
        b = a + step;
      const [ax, ay] = local(a),
        [bx, by] = local(b);
      const [dax, day] = derivative(a),
        [dbx, dby] = derivative(b);
      const p: Point = device(bx, by);
      path.push({ op: "C", c1: device(ax + k * dax, ay + k * day), c2: device(bx - k * dbx, by - k * dby), p });
      current = p;
    }
  }

  const context = {
    get canvas() {
      return { width, height };
    },
    get approximations() {
      return approximations;
    },
    save() {
      // The saved state keeps its own clip count; the new level starts with none of its own.
      stack.push({ ...state, dash: [...state.dash] });
      state = { ...state, dash: [...state.dash], clips: 0 };
    },
    restore() {
      for (let index = 0; index < state.clips; index += 1) body.push("</g>");
      const previous = stack.pop();
      if (previous !== undefined) state = previous;
    },
    // Transforms.
    translate(x: number, y: number) {
      state.matrix = multiply(state.matrix, [1, 0, 0, 1, x, y]);
    },
    scale(x: number, y: number) {
      state.matrix = multiply(state.matrix, [x, 0, 0, y, 0, 0]);
    },
    rotate(angle: number) {
      const c = Math.cos(angle),
        s = Math.sin(angle);
      state.matrix = multiply(state.matrix, [c, s, -s, c, 0, 0]);
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      state.matrix = multiply(state.matrix, [a, b, c, d, e, f]);
    },
    setTransform(a: number | DOMMatrix2DInit = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
      if (typeof a === "object") state.matrix = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
      else state.matrix = [a, b, c, d, e, f];
    },
    resetTransform() {
      state.matrix = IDENTITY;
    },
    getTransform() {
      const [a, b, c, d, e, f] = state.matrix;
      return new DOMMatrix([a, b, c, d, e, f]);
    },
    // Paths.
    beginPath() {
      path = [];
      start = null;
      current = null;
    },
    closePath() {
      if (current === null) return;
      path.push({ op: "Z" });
      current = start;
    },
    moveTo,
    lineTo,
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      if (current === null) moveTo(cpx, cpy);
      const p = device(x, y);
      path.push({ op: "Q", c: device(cpx, cpy), p });
      current = p;
    },
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
      if (current === null) moveTo(c1x, c1y);
      const p = device(x, y);
      path.push({ op: "C", c1: device(c1x, c1y), c2: device(c2x, c2y), p });
      current = p;
    },
    arc(x: number, y: number, r: number, from: number, to: number, anticlockwise?: boolean) {
      ellipse(x, y, r, r, 0, from, to, anticlockwise);
    },
    ellipse,
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
      // Rare in the game; a corner without the rounding keeps the shape's extent.
      approximations.add("arcTo drawn as a corner");
      lineTo(x1, y1);
      lineTo(x2, y2);
      void r;
    },
    rect(x: number, y: number, w: number, h: number) {
      moveTo(x, y);
      lineTo(x + w, y);
      lineTo(x + w, y + h);
      lineTo(x, y + h);
      context.closePath();
      moveTo(x, y);
    },
    roundRect(
      x: number,
      y: number,
      w: number,
      h: number,
      radii: number | DOMPointInit | (number | DOMPointInit)[] = 0,
    ) {
      const first = Array.isArray(radii) ? radii[0] : radii;
      const r = Math.min(
        Math.abs(typeof first === "number" ? first : (first?.x ?? 0)),
        Math.abs(w) / 2,
        Math.abs(h) / 2,
      );
      if (r === 0) {
        context.rect(x, y, w, h);
        return;
      }
      moveTo(x + r, y);
      lineTo(x + w - r, y);
      ellipse(x + w - r, y + r, r, r, 0, -Math.PI / 2, 0);
      lineTo(x + w, y + h - r);
      ellipse(x + w - r, y + h - r, r, r, 0, 0, Math.PI / 2);
      lineTo(x + r, y + h);
      ellipse(x + r, y + h - r, r, r, 0, Math.PI / 2, Math.PI);
      lineTo(x, y + r);
      ellipse(x + r, y + r, r, r, 0, Math.PI, Math.PI * 1.5);
      context.closePath();
      moveTo(x, y);
    },
    fill(rule?: CanvasFillRule) {
      emitPath(path, "fill", rule);
    },
    stroke() {
      emitPath(path, "stroke");
    },
    clip(rule?: CanvasFillRule) {
      // The clip path is written in device space: clip groups carry no transform.
      const saved = state.matrix;
      state.matrix = IDENTITY;
      const deviceD = pathData(path) ?? "";
      state.matrix = saved;
      const id = `${idPrefix}-c${String(nextId++)}`;
      defs.push(
        `<clipPath id="${id}"><path d="${deviceD}"${rule === "evenodd" ? ' clip-rule="evenodd"' : ""}/></clipPath>`,
      );
      body.push(`<g clip-path="url(#${id})">`);
      state.clips += 1;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const saved = { path, start, current };
      context.beginPath();
      context.rect(x, y, w, h);
      emitPath(path, "fill");
      ({ path, start, current } = saved);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      const saved = { path, start, current };
      context.beginPath();
      context.rect(x, y, w, h);
      emitPath(path, "stroke");
      ({ path, start, current } = saved);
    },
    clearRect(x: number, y: number, w: number, h: number) {
      // A transparent picture starts clear; clearing part of a drawing cannot be said in SVG.
      if (body.length > 0) approximations.add("clearRect over a drawing");
      void [x, y, w, h];
    },
    // Text.
    measureText(text: string) {
      measure.font = state.font;
      return measure.measureText(text);
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      drawText(text, x, y, maxWidth, "fill");
    },
    strokeText(text: string, x: number, y: number, maxWidth?: number) {
      drawText(text, x, y, maxWidth, "stroke");
    },
    // Styles.
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      return new SvgGradient("linear", [x0, y0, x1, y1]);
    },
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
      return new SvgGradient("radial", [x0, y0, r0, x1, y1, r1]);
    },
    createPattern() {
      approximations.add("pattern fill (left out)");
      return null;
    },
    drawImage() {
      approximations.add("raster image (left out)");
    },
    setLineDash(segments: number[]) {
      state.dash = segments.length % 2 === 0 ? [...segments] : [...segments, ...segments];
    },
    getLineDash() {
      return [...state.dash];
    },
    getImageData() {
      throw new Error("an SVG drawing has no pixels to read");
    },
    isPointInPath() {
      return false;
    },
  };

  function drawText(text: string, x: number, y: number, maxWidth: number | undefined, mode: "fill" | "stroke") {
    const anchor =
      state.textAlign === "center"
        ? "middle"
        : state.textAlign === "right" || state.textAlign === "end"
          ? "end"
          : "start";
    let fit = "";
    if (maxWidth !== undefined) {
      measure.font = state.font;
      const natural = measure.measureText(text).width;
      if (natural > maxWidth) fit = ` textLength="${num(maxWidth)}" lengthAdjust="spacingAndGlyphs"`;
    }
    const painted =
      mode === "fill"
        ? paint(state.fillStyle, "fill")
        : `fill="none" ${paint(state.strokeStyle, "stroke")} stroke-width="${num(state.lineWidth)}"`;
    const extra = effects();
    body.push(
      `<text x="${num(x)}" y="${num(y)}" ${painted} style="font:${esc(state.font)}" text-anchor="${anchor}" ` +
        `dominant-baseline="${BASELINE[state.textBaseline]}"${fit}${transformAttribute()}${extra === "" ? "" : ` ${extra}`}` +
        `>${esc(text)}</text>`,
    );
  }

  // Plain style properties.
  const properties: Record<string, [keyof DrawState, (value: never) => unknown]> = {
    fillStyle: ["fillStyle", (value) => value],
    strokeStyle: ["strokeStyle", (value) => value],
    lineWidth: ["lineWidth", (value: number) => (Number.isFinite(value) && value > 0 ? value : state.lineWidth)],
    lineCap: ["lineCap", (value) => value],
    lineJoin: ["lineJoin", (value) => value],
    miterLimit: ["miterLimit", (value) => value],
    lineDashOffset: ["dashOffset", (value) => value],
    globalAlpha: ["globalAlpha", (value: number) => (value >= 0 && value <= 1 ? value : state.globalAlpha)],
    globalCompositeOperation: ["composite", (value) => value],
    shadowBlur: ["shadowBlur", (value) => value],
    shadowColor: ["shadowColor", (value) => value],
    shadowOffsetX: ["shadowOffsetX", (value) => value],
    shadowOffsetY: ["shadowOffsetY", (value) => value],
    font: ["font", (value) => value],
    textAlign: ["textAlign", (value) => value],
    textBaseline: ["textBaseline", (value) => value],
    filter: ["filter", (value) => value],
  };
  for (const [name, [key, accept]] of Object.entries(properties))
    Object.defineProperty(context, name, {
      get: () => state[key],
      set: (value: never) => {
        (state as unknown as Record<string, unknown>)[key] = accept(value);
      },
    });
  // Settings with no SVG meaning are accepted and ignored.
  for (const name of ["imageSmoothingEnabled", "imageSmoothingQuality", "direction", "letterSpacing", "fontKerning"])
    Object.defineProperty(context, name, { value: undefined, writable: true });

  Object.defineProperty(context, "document", {
    value(rect: Readonly<{ x: number; y: number; w: number; h: number }>, title: string): string {
      const open = stack.reduce((sum, saved) => sum + saved.clips, state.clips);
      const closing = "</g>".repeat(open);
      return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(rect.x)} ${num(rect.y)} ${num(rect.w)} ${num(rect.h)}" ` +
        `width="${num(rect.w)}" height="${num(rect.h)}"><title>${esc(title)}</title>` +
        `${defs.length > 0 ? `<defs>${defs.join("")}</defs>` : ""}${body.join("")}${closing}</svg>`
      );
    },
  });

  // Any other canvas call is a gap to fill here, not something to skip quietly.
  return new Proxy(context, {
    get(target, property, receiver) {
      if (typeof property === "string" && !(property in target))
        throw new Error(`SVG drawing context has no "${property}"; add it to scripts/asset-sheets/page/svg-context.ts`);
      return Reflect.get(target, property, receiver) as unknown;
    },
  }) as unknown as CanvasRenderingContext2D & SvgDrawing;
}
