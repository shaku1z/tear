/**
 * Stage art recipes: the data a stage's look is drawn from. A recipe names a
 * key light, an atmosphere, colour ramps and layers of strokes; the shared
 * stroke routines turn it into painted layers at load. All positions are world
 * units of the 1600x900 arena; layers may extend past it for camera bleed.
 */
import type { StageId } from "../../gameplay/stages";
import type { SceneCameraContract } from "../scenes/scene-contract";
import type { SplinePoint } from "./paint-kit";

export type Rect = readonly [x: number, y: number, w: number, h: number];
/** Centre and radii of one rough ellipse, world units. */
export type Blob = readonly [cx: number, cy: number, rx: number, ry: number];

/**
 * An area strokes fill: the union of rough ellipses, or with `outside` the
 * region beyond the first ellipse (a frame around an opening).
 */
export interface MassShape {
  readonly blobs: readonly Blob[];
  /** Edge wobble as a fraction of the radius (0 = smooth ellipse). */
  readonly rough: number;
  /** Wobbles around the edge. */
  readonly lobes: number;
  readonly outside?: boolean;
}

interface Seeded {
  readonly seed: number;
}

/** How much a stroke fades into the atmosphere: 0 near .. 1 fully hazed. */
interface Hazed {
  readonly haze: number;
}

export interface SkyStroke {
  readonly kind: "sky";
  readonly top: string;
  readonly middle: string;
  readonly bottom: string;
}

/** Additive bloom around the key light. */
export interface GlowStroke {
  readonly kind: "glow";
  readonly radius: number;
  readonly alpha: number;
}

/** A horizontal band of atmosphere between two world rows. */
export interface HazeStroke {
  readonly kind: "haze";
  readonly top: number;
  readonly bottom: number;
  readonly alpha: number;
}

/** Foliage and other dappled masses: a block-in pass, then textured leaf dabs. */
export interface MassStroke extends Seeded, Hazed {
  readonly kind: "mass";
  readonly shape: MassShape;
  readonly ramp: string;
  /** Leaf dab radius, world px. */
  readonly size: number;
  /** Dabs per 10,000 square world px of the shape's bounds. */
  readonly density: number;
  /** Added to the light value (negative darkens a frame). */
  readonly lightBias?: number;
  /** How strongly leaves near the light turn to dark silhouettes with bright flecks (0..1). */
  readonly backlight?: number;
}

/** Hanging growth: willow curtains (soft streaks) or vines (leaf dabs). */
export interface StrandsStroke extends Seeded, Hazed {
  readonly kind: "strands";
  readonly form: "curtain" | "vine";
  /** Area the strands hang from (their tops fall in the upper part). */
  readonly area: Rect;
  readonly count: number;
  readonly length: number;
  readonly size: number;
  readonly ramp: string;
}

/** Trunks and roots: a spine with lit twisting fibres, crevices and moss. */
export interface TrunkStroke extends Seeded, Hazed {
  readonly kind: "trunk";
  readonly spine: readonly SplinePoint[];
  readonly ramp: string;
  readonly fibers: number;
  /** Fibre turns along the spine. */
  readonly twist: number;
  /** Which side faces the light: -1 left, 1 right. */
  readonly litSide: -1 | 1;
  /** Overall light scale (frames sit in shadow below 1). */
  readonly light: number;
  readonly moss: number;
  readonly mossRamp: string;
  readonly mossSize: number;
  readonly rim: boolean;
  /** Limbs wound together into one trunk (1 or omitted = a single limb). */
  readonly braid?: number;
}

/** Ruined arcades: arched bays, cornices, coursing, stains and ivy. */
export interface ArcadeStroke extends Seeded, Hazed {
  readonly kind: "arcade";
  /** Left edge and base row, world px. */
  readonly x: number;
  readonly y: number;
  readonly bays: number;
  readonly bayWidth: number;
  /** Height of one storey. */
  readonly height: number;
  readonly levels: number;
  readonly ramp: string;
  readonly mossRamp: string;
  /** Depth of the shadowed return face, world px (0 = a flat facade). */
  readonly thickness?: number;
  /** Chance (0..1) that each stretch of the top edge has broken away. */
  readonly ruin?: number;
  /** Ivy multiplier (1 = default growth). */
  readonly ivy?: number;
  /** Standing in water: draws its reflection and a wet waterline in this ramp. */
  readonly waterRamp?: string;
}

/** Still water: depth gradient, rippled reflection of everything behind, glints. */
export interface WaterStroke extends Seeded {
  readonly kind: "water";
  readonly top: number;
  /** Shallow, middle, deep. */
  readonly ramp: string;
  readonly reflection: number;
  /** Glint and trough strokes per 10,000 square world px. */
  readonly ripples: number;
}

/** Falling water: bright streaks from a ledge down to the pool, with mist where it lands. */
export interface FallsStroke extends Seeded, Hazed {
  readonly kind: "falls";
  /** Centre column, the ledge row and the row it lands on. */
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  /** Shallow-to-deep water ramp; the streaks use its light end. */
  readonly ramp: string;
  readonly alpha: number;
}

/** Beams fanning down from the key light (angles in radians, 0 = right). */
export interface ShaftsStroke extends Seeded {
  readonly kind: "shafts";
  readonly count: number;
  readonly from: number;
  readonly to: number;
  readonly width: number;
  readonly alpha: number;
}

export interface VignetteStroke {
  readonly kind: "vignette";
  readonly color: string;
  readonly alpha: number;
}

/** Small repeated forms (flowers, pebbles, snow clumps) around spots. */
export interface ScatterStroke extends Seeded {
  readonly kind: "scatter";
  readonly spots: readonly Blob[];
  readonly count: number;
  readonly petals: number;
  readonly size: number;
  readonly colors: readonly string[];
  readonly center: string;
}

export type StageArtStroke =
  | SkyStroke
  | GlowStroke
  | HazeStroke
  | MassStroke
  | StrandsStroke
  | TrunkStroke
  | ArcadeStroke
  | WaterStroke
  | FallsStroke
  | ShaftsStroke
  | VignetteStroke
  | ScatterStroke;

export type StrokeKind = StageArtStroke["kind"];

/**
 * One painted layer. `depth` follows the scene camera (1 moves with the
 * gameplay plane, below 1 is farther). `scale` is canvas px per world unit:
 * soft distant layers bake small to save memory.
 */
export interface StageArtLayer {
  readonly id: string;
  readonly depth: number;
  readonly plane: "back" | "front";
  readonly scale: number;
  /** Bounds to paint; omitted, the layer covers every camera the stage allows. */
  readonly area?: Rect;
  readonly strokes: readonly StageArtStroke[];
}

/** Surface strip painted for platforms: lit top edge at row 0. */
export interface StageArtSurface {
  readonly width: number;
  readonly height: number;
  readonly ramp: string;
  readonly mossRamp: string;
  readonly scale: number;
  readonly fill: string;
  readonly shadow: { readonly color: string; readonly opacity: number; readonly length: number };
}

export interface StageArtRecipe {
  readonly stageId: StageId;
  readonly seed: number;
  readonly light: {
    readonly x: number;
    readonly y: number;
    readonly reach: number;
    readonly core: string;
    readonly glow: string;
  };
  readonly atmosphere: { readonly haze: string; readonly warmth: number };
  /** Parallax, zoom and shake range the layers must cover. */
  readonly camera: SceneCameraContract;
  readonly ramps: Readonly<Record<string, readonly string[]>>;
  /** Colour shown where a camera outruns the art. */
  readonly edge: string;
  readonly surface: StageArtSurface;
  readonly layers: readonly StageArtLayer[];
}

/** Hard bounds that keep any recipe's bake short and its memory small. */
/** What the stage itself defines and the painted scene must keep: HUD paper and platform material. */
export interface StageArtIdentity {
  readonly paper: string;
  readonly platformMaterial: string;
}

export const STAGE_ART_LIMITS = Object.freeze({
  layers: 8,
  strokesPerLayer: 48,
  /** Estimated brush operations for the whole recipe at full detail. */
  operations: 400_000,
  maxScale: 1,
  minScale: 0.25,
});
