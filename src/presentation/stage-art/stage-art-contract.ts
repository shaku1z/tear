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

/** Ruined arcades: arched bays, cornices, coursing, stains and ivy. Haze also gathers as mist at the foot. */
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
  /** Chance (0..1) that each stretch of exposed top edge has lost a block of masonry. */
  readonly ruin?: number;
  /** Share of bays still standing on each storey above the one below (1 or omitted = every bay). */
  readonly standing?: number;
  /** Column shaft width as a share of the pier (0 or omitted = plain piers). */
  readonly columns?: number;
  /** How dark the arch interiors are: 0 see-through .. 1 solid shadow. */
  readonly reveal?: number;
  /** Pier width as a share of the bay (omitted = the default; smaller gives wider arches). */
  readonly pier?: number;
  /**
   * Standing in water painted earlier: the surface crosses the piers `depth` px
   * above the base, the sunk part shows through the water and the ruin is reflected.
   */
  readonly wade?: { readonly depth: number; readonly ramp: string; readonly reflection: number };
  /** Ivy multiplier (1 = default growth). */
  readonly ivy?: number;
}

/**
 * Still water: a depth gradient, then one reflection pass that flips, fades and ripples everything already
 * painted above the waterline (earlier layers and this one), the key light lying on the surface, and glints.
 * Paint it after whatever stands at its far edge; forms standing nearer in it are painted afterwards and wade.
 */
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

/**
 * A ridgeline across the whole layer, filled down to `base`: mountains with a wide `span`, hills with a low
 * `sharp`, a treeline with `teeth`. Faces turned to the key light are lighter, and the foot settles into shade.
 */
export interface RidgeStroke extends Seeded, Hazed {
  readonly kind: "ridge";
  /** The row the crest wanders around, and the row the form is filled down to. */
  readonly crest: number;
  readonly base: number;
  /** How far the crest rises above and dips below its row, world px. */
  readonly relief: number;
  /** Width of one rise and fall, world px. */
  readonly span: number;
  /** 0 rolling .. 1 pointed. */
  readonly sharp: number;
  readonly ramp: string;
  /** Named summits: centre column, half-width and rise above the crest, world px. */
  readonly peaks?: readonly (readonly [x: number, width: number, rise: number])[];
  /** Pointed tips standing along the crest (fir tops), world px. */
  readonly teeth?: { readonly spacing: number; readonly height: number };
}

/**
 * A curtain of light hanging in the sky (aurora): rays standing on a path, brightest just above their feet.
 * Each path point's width is the curtain's height there. The ramp runs from the foot of a ray to its top.
 */
export interface RibbonStroke extends Seeded {
  readonly kind: "ribbon";
  readonly path: readonly SplinePoint[];
  readonly ramp: string;
  readonly alpha: number;
  /** Rays per 100 world px of path. */
  readonly rays: number;
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
  | ScatterStroke
  | RidgeStroke
  | RibbonStroke;

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

/**
 * What moves in the stage. Every entry names the layer it belongs to and draws
 * right after it, so it takes that layer's depth and plane. Reduced motion and
 * low graphics show the stage at rest: parts stay where they were painted, and
 * water, motes and breathing light do not draw. STAGE_ART_LIMITS.live keeps
 * every entry small, slow and faint, so nothing here competes with the fight.
 */
export type StageArtLive = LiveWater | LiveMotes | LivePart;

/** The layer's own paint between two rows, rippling: rows slide sideways, and glints come and go. */
export interface LiveWater extends Seeded {
  readonly kind: "water";
  readonly layer: string;
  readonly top: number;
  readonly bottom: number;
  /** Row height at the far shore and nearest the viewer. */
  readonly rows: readonly [far: number, near: number];
  /** Farthest a row slides either way, at the far shore and nearest the viewer. */
  readonly reach: readonly [far: number, near: number];
  /** Seconds for one pass of the slower wave train. */
  readonly period: number;
  readonly glints: {
    readonly count: number;
    /** Longest streak, world px. */
    readonly length: number;
    readonly alpha: number;
    /** Seconds between one glint's appearances, on average. */
    readonly period: number;
  };
}

/** Specks drifting through an area: pollen, dust, spray, snow. */
export interface LiveMotes extends Seeded {
  readonly kind: "motes";
  readonly layer: string;
  readonly area: Rect;
  readonly count: number;
  readonly size: readonly [min: number, max: number];
  readonly color: string;
  readonly alpha: number;
  /** World px per second. */
  readonly drift: readonly [x: number, y: number];
  /** Sideways wander either way, and the seconds one wander takes. */
  readonly wobble: number;
  readonly period: number;
}

/**
 * Strokes painted on their own canvas so they can move: hanging growth that
 * sways from the edge it grows from, or light that fades in and out.
 */
export interface LivePart {
  readonly kind: "part";
  readonly layer: string;
  readonly id: string;
  readonly area: Rect;
  readonly scale: number;
  readonly strokes: readonly StageArtStroke[];
  /** "lighter" adds the part's light to the layer; omitted, the part covers what is behind it. */
  readonly blend?: "lighter";
  readonly sway?: {
    readonly pivot: "top" | "bottom";
    readonly slices: number;
    /** Farthest the free edge moves either way, world px. */
    readonly reach: number;
    readonly period: number;
    /** Turns of the wave across the part's width. */
    readonly travel: number;
  };
  /** Fades between `low` (shown at rest) and fully shown. */
  readonly breathe?: { readonly low: number; readonly period: number };
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
  readonly layers: readonly StageArtLayer[];
  /** What moves; omitted, the stage is still. */
  readonly live?: readonly StageArtLive[];
}

/** What the stage itself defines and the painted scene must keep: the HUD paper. */
export interface StageArtIdentity {
  readonly paper: string;
}

/** Hard bounds that keep any recipe's bake short and its memory small. */
export const STAGE_ART_LIMITS = Object.freeze({
  layers: 8,
  strokesPerLayer: 48,
  /** Estimated brush operations for the whole recipe at full detail. */
  operations: 400_000,
  maxScale: 1,
  minScale: 0.25,
  /**
   * Bounds on what moves. They keep the live layer cheap to draw and quiet
   * next to combat: few things, small, faint and slow.
   */
  live: Object.freeze({
    entries: 8,
    motes: 64,
    /** World px radius. */
    moteSize: 2.5,
    moteAlpha: 0.45,
    /** World px per second. */
    moteDrift: 14,
    waterRows: 64,
    /** World px a water row may slide either way. */
    waterReach: 4,
    glints: 48,
    glintAlpha: 0.4,
    /** World px a swaying part's free edge may move either way. */
    swayReach: 8,
    swaySlices: 32,
    /** Fastest cycle of any motion, seconds. */
    minPeriod: 3,
    /** Canvas pixels all parts together may hold at full detail. */
    partPixels: 900_000,
  }),
});
