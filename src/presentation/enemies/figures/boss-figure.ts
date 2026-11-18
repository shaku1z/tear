import type { BossAttackPose } from "../../../gameplay/entities/boss-attack-runner";

/**
 * A boss figure as data, drawn by one function. A figure is a list of parts (shapes in the figure's own frame: feet
 * at the origin, facing +x), a set of named poses that move the figure and its parts, and palettes that colour them.
 * A boss's renderer only chooses which poses apply, how strongly, and which flags are set; it draws nothing itself.
 */
/** The part of a 2D canvas context a figure draws with. */
export type FigureCanvas = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "translate"
  | "rotate"
  | "scale"
  | "beginPath"
  | "closePath"
  | "moveTo"
  | "lineTo"
  | "quadraticCurveTo"
  | "bezierCurveTo"
  | "arc"
  | "rect"
  | "fill"
  | "stroke"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "lineCap"
  | "globalAlpha"
>;

export type FigurePoint = readonly [number, number];

export type FigurePathCommand =
  | readonly ["M" | "L", number, number]
  | readonly ["Q", number, number, number, number]
  | readonly ["C", number, number, number, number, number, number]
  | readonly ["Z"];

export type FigureShape =
  /** No drawing: a transform node other parts hang from. */
  | Readonly<{ kind: "group" }>
  | Readonly<{ kind: "path"; commands: readonly FigurePathCommand[] }>
  | Readonly<{ kind: "disc"; center: FigurePoint; radius: number }>
  | Readonly<{ kind: "rect"; at: FigurePoint; size: FigurePoint }>
  | Readonly<{ kind: "stroke"; from: FigurePoint; to: FigurePoint }>
  /** A plant stem along a curve, thinning from `width[0]` to `width[1]`. */
  | Readonly<{ kind: "stem"; from: FigurePoint; control: FigurePoint; to: FigurePoint; width: FigurePoint }>
  /** A lens-shaped leaf from its base along `angle`. */
  | Readonly<{ kind: "leaf"; at: FigurePoint; angle: number; length: number; width: number }>;

export interface FigurePart<Key extends string> {
  readonly id: string;
  /** The part whose transform this one inherits. */
  readonly parent?: string;
  /** Where this part rotates and scales, in its parent's frame. */
  readonly pivot?: FigurePoint;
  readonly shape: FigureShape;
  readonly fill?: Key;
  readonly line?: Readonly<{ color: Key; width: number }>;
  /** Drawn only while this flag is set. */
  readonly when?: string;
  /** Not drawn while this flag is set. */
  readonly unless?: string;
}

export interface FigureTransform {
  readonly dx?: number;
  readonly dy?: number;
  readonly rotate?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly alpha?: number;
}

/** A pose moves the whole figure (about its feet) and any of its parts (about their pivots), and may set flags. */
export interface FigurePose {
  readonly figure?: FigureTransform;
  readonly parts?: Readonly<Record<string, FigureTransform>>;
  readonly flags?: readonly string[];
}

export type FigurePaletteName = "standard" | "highContrast";

export interface BossFigureDefinition<Key extends string> {
  readonly parts: readonly FigurePart<Key>[];
  readonly poses: Readonly<Record<string, FigurePose>>;
  readonly palettes: Readonly<Record<FigurePaletteName, Readonly<Record<Key, string>>>>;
  /** Palette keys that turn white with a hit flash; the others keep their colour. */
  readonly flashKeys: readonly Key[];
}

/** One pose applied with a weight from 0 (none) to 1 (full). Weights add, so poses layer. */
export interface FigurePoseLayer {
  readonly pose: string;
  readonly weight: number;
}

export interface BossFigureFrame<Key extends string> {
  readonly layers: readonly FigurePoseLayer[];
  readonly flags: ReadonlySet<string>;
  readonly palette: FigurePaletteName;
  /** 0 to 1: how far the flash keys are mixed toward white. */
  readonly flash: number;
  /** 1 faces right, -1 faces left. */
  readonly facing: number;
  /** Colours the world supplies, such as the theme's ink. */
  readonly colors?: Readonly<Partial<Record<Key, string>>>;
}

interface Resolved {
  readonly dx: number;
  readonly dy: number;
  readonly rotate: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly alpha: number;
}

const IDENTITY: Resolved = { dx: 0, dy: 0, rotate: 0, scaleX: 1, scaleY: 1, alpha: 1 };
const STEM_SAMPLES = 14;
const LEAF_BELLY = 0.45;
const FLASH_TARGET = "#ffffff";

/** Adds weighted transforms: offsets and turns sum, scales and alpha move from 1 by each weighted step. */
function combine(transforms: readonly (readonly [FigureTransform, number])[]): Resolved {
  let out = IDENTITY;
  for (const [t, w] of transforms) {
    out = {
      dx: out.dx + (t.dx ?? 0) * w,
      dy: out.dy + (t.dy ?? 0) * w,
      rotate: out.rotate + (t.rotate ?? 0) * w,
      scaleX: out.scaleX + ((t.scaleX ?? 1) - 1) * w,
      scaleY: out.scaleY + ((t.scaleY ?? 1) - 1) * w,
      alpha: out.alpha * (1 + ((t.alpha ?? 1) - 1) * w),
    };
  }
  return out;
}

function apply(ctx: FigureCanvas, t: Resolved, pivot: FigurePoint) {
  ctx.translate(pivot[0] + t.dx, pivot[1] + t.dy);
  ctx.rotate(t.rotate);
  ctx.scale(t.scaleX, t.scaleY);
  ctx.translate(-pivot[0], -pivot[1]);
}

function mixHex(from: string, to: string, amount: number): string {
  if (amount <= 0 || !from.startsWith("#") || from.length !== 7) return from;
  const channel = (hex: string, index: number) => Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount));
  return `rgb(${mixed.join(",")})`;
}

function quad(from: FigurePoint, control: FigurePoint, to: FigurePoint, t: number): FigurePoint {
  const u = 1 - t;
  return [
    u * u * from[0] + 2 * u * t * control[0] + t * t * to[0],
    u * u * from[1] + 2 * u * t * control[1] + t * t * to[1],
  ];
}

/** Traces a stem's outline: a curve from `from` to `to` thinning from `width[0]` to `width[1]`. */
export function traceStem(
  ctx: FigureCanvas,
  from: FigurePoint,
  control: FigurePoint,
  to: FigurePoint,
  width: FigurePoint,
): void {
  const left: FigurePoint[] = [];
  const right: FigurePoint[] = [];
  for (let i = 0; i <= STEM_SAMPLES; i += 1) {
    const t = i / STEM_SAMPLES;
    const [x, y] = quad(from, control, to, t);
    const dx = 2 * (1 - t) * (control[0] - from[0]) + 2 * t * (to[0] - control[0]);
    const dy = 2 * (1 - t) * (control[1] - from[1]) + 2 * t * (to[1] - control[1]);
    const length = Math.hypot(dx, dy) || 1;
    const half = (width[0] + (width[1] - width[0]) * t) / 2;
    left.push([x - (dy / length) * half, y + (dx / length) * half]);
    right.push([x + (dy / length) * half, y - (dx / length) * half]);
  }
  ctx.beginPath();
  const outline = [...left, ...right.reverse()];
  for (const [i, [x, y]] of outline.entries()) {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function traceShape(ctx: FigureCanvas, shape: FigureShape): void {
  ctx.beginPath();
  switch (shape.kind) {
    case "group":
      return;
    case "path":
      for (const command of shape.commands) {
        if (command[0] === "M") ctx.moveTo(command[1], command[2]);
        else if (command[0] === "L") ctx.lineTo(command[1], command[2]);
        else if (command[0] === "Q") ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]);
        else if (command[0] === "C")
          ctx.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]);
        else ctx.closePath();
      }
      return;
    case "disc":
      ctx.arc(shape.center[0], shape.center[1], shape.radius, 0, Math.PI * 2);
      return;
    case "rect":
      ctx.rect(shape.at[0], shape.at[1], shape.size[0], shape.size[1]);
      return;
    case "stroke":
      ctx.moveTo(shape.from[0], shape.from[1]);
      ctx.lineTo(shape.to[0], shape.to[1]);
      return;
    case "stem":
      traceStem(ctx, shape.from, shape.control, shape.to, shape.width);
      return;
    case "leaf": {
      const { at, angle, length, width } = shape;
      const point = (along: number, across: number): FigurePoint => [
        at[0] + Math.cos(angle) * along - Math.sin(angle) * across,
        at[1] + Math.sin(angle) * along + Math.cos(angle) * across,
      ];
      const [tipX, tipY] = point(length, 0);
      const [upX, upY] = point(length * LEAF_BELLY, -width);
      const [downX, downY] = point(length * LEAF_BELLY, width);
      ctx.moveTo(at[0], at[1]);
      ctx.quadraticCurveTo(upX, upY, tipX, tipY);
      ctx.quadraticCurveTo(downX, downY, at[0], at[1]);
      ctx.closePath();
    }
  }
}

/** Resolves every pose layer into one figure transform, one transform per part and the flags the poses set. */
function resolvePoses<Key extends string>(definition: BossFigureDefinition<Key>, frame: BossFigureFrame<Key>) {
  const layers = frame.layers
    .map((layer) => [definition.poses[layer.pose], Math.max(0, Math.min(1, layer.weight))] as const)
    .filter((entry): entry is readonly [FigurePose, number] => entry[0] !== undefined && entry[1] > 0);
  const figure = combine(layers.map(([pose, w]) => [pose.figure ?? {}, w] as const));
  const parts = new Map(
    definition.parts.map((part) => [
      part.id,
      combine(layers.map(([pose, w]) => [pose.parts?.[part.id] ?? {}, w] as const)),
    ]),
  );
  const flags = new Set(frame.flags);
  for (const [pose] of layers) for (const flag of pose.flags ?? []) flags.add(flag);
  return { figure, parts, flags };
}

/** Draws a figure in `frame` with its feet at the current origin. */
export function drawBossFigure<Key extends string>(
  ctx: FigureCanvas,
  definition: BossFigureDefinition<Key>,
  frame: BossFigureFrame<Key>,
): void {
  const { figure, parts, flags } = resolvePoses(definition, frame);
  const palette = { ...definition.palettes[frame.palette], ...frame.colors };
  const flashed = new Set<Key>(definition.flashKeys);
  const color = (key: Key) => mixHex(palette[key], FLASH_TARGET, flashed.has(key) ? frame.flash : 0);
  const byId = new Map(definition.parts.map((part) => [part.id, part]));
  const chain = (part: FigurePart<Key>): FigurePart<Key>[] => {
    const parent = part.parent === undefined ? undefined : byId.get(part.parent);
    return parent === undefined ? [part] : [...chain(parent), part];
  };
  ctx.save();
  ctx.scale(frame.facing, 1);
  apply(ctx, figure, [0, 0]);
  ctx.globalAlpha *= figure.alpha;
  for (const part of definition.parts) {
    if (part.shape.kind === "group") continue;
    if (part.when !== undefined && !flags.has(part.when)) continue;
    if (part.unless !== undefined && flags.has(part.unless)) continue;
    ctx.save();
    for (const link of chain(part)) {
      const t = parts.get(link.id) ?? IDENTITY;
      apply(ctx, t, link.pivot ?? [0, 0]);
      ctx.globalAlpha *= t.alpha;
    }
    if (ctx.globalAlpha > 0) {
      traceShape(ctx, part.shape);
      if (part.fill !== undefined) {
        ctx.fillStyle = color(part.fill);
        ctx.fill();
      }
      if (part.line !== undefined) {
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = color(part.line.color);
        ctx.lineWidth = part.line.width;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * What is wrong with a figure's data: a parent or posed part that does not exist, a parent loop, or a part shown
 * by a flag that no pose sets and the renderer does not set (`rendererFlags`). Empty when the figure is sound.
 */
export function bossFigureProblems<Key extends string>(
  definition: BossFigureDefinition<Key>,
  rendererFlags: readonly string[],
): string[] {
  const ids = new Set(definition.parts.map((part) => part.id));
  const byId = new Map(definition.parts.map((part) => [part.id, part]));
  const flags = new Set([...rendererFlags, ...Object.values(definition.poses).flatMap((pose) => pose.flags ?? [])]);
  const problems: string[] = [];
  for (const part of definition.parts) {
    if (part.parent !== undefined && !ids.has(part.parent)) problems.push(`${part.id}: no parent ${part.parent}`);
    const seen = new Set<string>();
    for (let link = part.parent; link !== undefined; link = byId.get(link)?.parent) {
      if (seen.has(link)) {
        problems.push(`${part.id}: parent loop through ${link}`);
        break;
      }
      seen.add(link);
    }
    for (const flag of [part.when, part.unless])
      if (flag !== undefined && !flags.has(flag)) problems.push(`${part.id}: nothing sets flag ${flag}`);
  }
  for (const [name, pose] of Object.entries(definition.poses))
    for (const id of Object.keys(pose.parts ?? {})) if (!ids.has(id)) problems.push(`pose ${name}: no part ${id}`);
  return problems;
}

/** Which pose each stage of each move shows. A tell grows in, an active stage holds, a recovery lets go. */
export type FigureMovePoses = Readonly<Record<string, Readonly<Partial<Record<BossAttackPose["stage"], string>>>>>;

/** The pose layer for a move in progress, from the shared attack runner's pose. */
export function movePoseLayer(table: FigureMovePoses, pose: BossAttackPose | null): FigurePoseLayer | null {
  if (pose === null) return null;
  const name = table[pose.attackId]?.[pose.stage];
  if (name === undefined) return null;
  const weight = pose.stage === "tell" ? pose.progress : pose.stage === "recover" ? 1 - pose.progress : 1;
  return { pose: name, weight };
}
