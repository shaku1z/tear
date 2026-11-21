import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { Point } from "../../../gameplay/entities/enemy-contracts";

export type EnemyRendererColor =
  | "armored"
  | "armoredShield"
  | "bladeGlow"
  | "bladeTrail"
  | "bomber"
  | "boss"
  | "charger"
  | "chimera"
  | "deflected"
  | "enemyShot"
  | "eye"
  | "flyer"
  | "perfect"
  | "ranged"
  | "slam"
  | "sludge";
export interface EnemyPresentationPolicy {
  readonly view: Readonly<{ w: number; h: number }>;
  readonly world: Readonly<{ groundY: number }>;
  readonly colors: Readonly<Record<EnemyRendererColor, string>>;
  readonly aldric: Readonly<{
    ascendHalfW: number;
    chargeWindup: number;
    crownfireWindup: number;
    overheadRange: number;
    overheadWindup: number;
    thronefallRise: number;
    vaultArc: number;
  }>;
  readonly bossTheater: Readonly<{ introDur: number }>;
  readonly chargedShot: Readonly<{ r: number }>;
  readonly exotic: Readonly<{ geoWallH: number; geoWallW: number; gravReach: number }>;
  readonly source: Readonly<{
    beamW: number;
    beamWarn: number;
    collapseWindup: number;
    dashWindup: number;
    depthHandW: number;
    depthMawW: number;
    depthRearAlpha: number;
    depthRearScale: number;
    voidFormScale: number;
    voidWispTell: number;
  }>;
  readonly warden: Readonly<{ batonWindup: number; lungeWind: number; lungeWindup: number; stringWind: number }>;
}

/**
 * The shared helpers that draw a mark: a warning of where a strike lands, drawn over the stage. Every
 * boss and enemy renderer draws its marks only through these, so a test that watches them sees every
 * mark (tests/unit/move-visual-lifetime.test.ts).
 */
export const ENEMY_MARK_HELPERS = Object.freeze([
  "chargeTelegraph",
  "dangerArc",
  "dangerLane",
  "dangerColumn",
  "dangerReticle",
  "drawPeril",
  "weaponGlint",
] as const);
export type EnemyMarkHelper = (typeof ENEMY_MARK_HELPERS)[number];
/**
 * The shared helpers that draw a prop: a weapon, a dropped crown or a boss's figure (its body, posed), which
 * may reach far from the body box.
 */
export const ENEMY_PROP_HELPERS = Object.freeze([
  "drawAldricCrown",
  "drawBossFigure",
  "drawGreatCleaver",
  "drawRootVine",
  "drawWardstaff",
] as const);
export type EnemyPropHelper = (typeof ENEMY_PROP_HELPERS)[number];

/** Told when a mark or prop helper starts and finishes drawing. Only tests pass one. */
export interface EnemyMarkObserver {
  enter(helper: EnemyMarkHelper | EnemyPropHelper): void;
  exit(helper: EnemyMarkHelper | EnemyPropHelper): void;
}

export interface EnemyPresentationDependencies {
  /** Watches the mark helpers; absent in the game. */
  markObserver?: EnemyMarkObserver;
  A11Y: { highContrast: boolean; reducedMotion: boolean };
  CLOCK: { sim: number };
  policy: EnemyPresentationPolicy;
  GFX: { low: boolean };
  THEME: { dark: boolean; ink: string; rim: string };
  UI: {
    font: (size: number, bold?: boolean) => string;
    tag: (
      context: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      color?: string,
      align?: CanvasTextAlign,
      size?: number,
    ) => void;
    t: { type: { caption: number } };
  };
  clamp: (value: number, min: number, max: number) => number;
  len: (x: number, y: number) => number;
  lerp: (from: number, to: number, amount: number) => number;
}

export type EnemyClassName =
  | "Enemy"
  | "Charger"
  | "Ranged"
  | "Flyer"
  | "Bomber"
  | "Armored"
  | "Support"
  | "Wraith"
  | "Chimera"
  | "Rimehound"
  | "Warden"
  | "Colossus"
  | "Aldric"
  | "Echo"
  | "VoidWisp"
  | "Source"
  | "Rootbound"
  | "RootboundRebuild"
  | "WhiteHart";
type EnemyInstance<K extends EnemyClassName> = InstanceType<EnemyTypes[K]>;
interface RenderMethods {
  drawHpBar(context: CanvasRenderingContext2D): void;
  _drawWeapon(context: CanvasRenderingContext2D, direction: number): void;
  draw(context: CanvasRenderingContext2D): void;
  drawRear(context: CanvasRenderingContext2D): void;
  _drawDepthTelegraph(context: CanvasRenderingContext2D): void;
  _drawSiphon(context: CanvasRenderingContext2D): void;
}
export type RenderInstance<K extends EnemyClassName> = EnemyInstance<K> & RenderMethods;
export interface CrownRenderPose extends Point {
  rot: number;
  heat?: number;
}
