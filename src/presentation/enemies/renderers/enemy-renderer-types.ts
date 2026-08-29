import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { Point } from "../../../gameplay/entities/enemy-contracts";

export type EnemyRendererColor = "armored" | "armoredShield" | "bladeGlow" | "bladeTrail" | "bomber" | "boss"
  | "charger" | "chimera" | "deflected" | "enemyShot" | "eye" | "flyer" | "perfect" | "ranged" | "slam" | "sludge";
export interface EnemyPresentationPolicy {
  readonly view: Readonly<{ w: number; h: number }>;
  readonly world: Readonly<{ groundY: number }>;
  readonly colors: Readonly<Record<EnemyRendererColor, string>>;
  readonly aldric: Readonly<{
    ascendHalfW: number; chargeWindup: number; crownfireWindup: number; overheadRange: number;
    overheadWindup: number; thronefallRise: number; vaultArc: number;
  }>;
  readonly bossTheater: Readonly<{ introDur: number }>;
  readonly chargedShot: Readonly<{ r: number }>;
  readonly exotic: Readonly<{ geoWallH: number; geoWallW: number; gravReach: number }>;
  readonly source: Readonly<{
    beamW: number; beamWarn: number; collapseWindup: number; dashWindup: number; depthHandW: number;
    depthMawW: number; depthRearAlpha: number; depthRearScale: number; voidFormScale: number; voidWispTell: number;
  }>;
  readonly warden: Readonly<{ batonWindup: number; lungeWind: number; lungeWindup: number; stringWind: number }>;
}

export interface EnemyPresentationDependencies {
  A11Y: { highContrast: boolean; reducedMotion: boolean };
  CLOCK: { sim: number };
  policy: EnemyPresentationPolicy;
  GFX: { low: boolean };
  THEME: { dark: boolean; ink: string; rim: string };
  UI: {
    font: (size: number, bold?: boolean) => string;
    tag: (context: CanvasRenderingContext2D, text: string, x: number, y: number, color?: string, align?: CanvasTextAlign, size?: number) => void;
    t: { type: { caption: number } };
  };
  clamp: (value: number, min: number, max: number) => number;
  len: (x: number, y: number) => number;
  lerp: (from: number, to: number, amount: number) => number;
}

export type EnemyClassName = "Enemy" | "Charger" | "Ranged" | "Flyer" | "Bomber" | "Armored" | "Boss" | "Support" | "Wraith" | "Chimera" | "Rimehound" | "Warden" | "Colossus" | "Aldric" | "Echo" | "VoidWisp" | "Source" | "Rootbound" | "WhiteHart";
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
export interface CrownRenderPose extends Point { rot: number; heat?: number }
