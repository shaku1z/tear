import type { EnemyTypes } from "../../../gameplay/entities/enemies";
import type { GameConfig, Point } from "../../../gameplay/entities/enemy-contracts";

export interface EnemyPresentationDependencies {
  A11Y: { highContrast: boolean; reducedMotion: boolean };
  CLOCK: { sim: number };
  CONFIG: GameConfig;
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

export type EnemyClassName = "Enemy" | "Charger" | "Ranged" | "Flyer" | "Bomber" | "Armored" | "Boss" | "Support" | "Wraith" | "Chimera" | "Warden" | "Colossus" | "Aldric" | "Echo" | "VoidWisp" | "Source";
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
