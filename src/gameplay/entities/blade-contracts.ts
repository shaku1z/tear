// ------- the momentum blade -------
// HELD: the hilt is a physics point spring-pulled toward the reticle, tethered to
//   the player's hand by an elastic leash; the blade points outward toward the aim
//   with a velocity lead. Damage comes from tip speed.
// FLYING/RETURNING/EMBEDDED: thrown blade. It pierces, embeds where it lands, and
//   is reclaimed by getting within tether range and recalling it.
import type { CONFIG as GAME_CONFIG } from "../../config/game-config";
import type {
  WeaponActionResult, WeaponBladeContext, WeaponDamageContext, WeaponPlayerContext,
  WeaponQualityContext, WeaponUpdateContext,
} from "../weapons";

export type GameConfig = typeof GAME_CONFIG;

export interface BladePoint { x: number; y: number }
export type BladeActionResult = WeaponActionResult;
export interface BladeChannels {
  throwPower: number; throwSpeed: number; remoteRange: number;
  secondaryPower: number; returnSpeed: number; controlDuration: number;
}
export interface BladePlatformPort { x: number; y: number; w: number; h: number; oneway?: boolean; floor?: boolean }
export interface BladePlayerPort { x: number; y: number; vx: number; vy: number; facing: number }
export interface BladeEnemyPort {
  x: number; y: number; vx: number; vy: number; radius: number; dead: boolean; dying?: boolean;
  isBoss?: boolean; weight: number; anchored?: boolean; stun: number;
  applyBreak?: ((power: number) => void) | undefined;
  hit(damage: number, fromX: number, fromY: number): void;
}

export interface BladeWeaponContext {
  blade: BladeEntity;
  dt?: number;
  player?: BladePlayerPort;
  platforms?: readonly BladePlatformPort[];
  hand?: BladePoint;
  quality?: number;
  enemy?: BladeEnemyPort;
  baseDamage?: number;
}

export interface BladeWeaponPort {
  id: string;
  channels: BladeChannels;
  throwCollisionPad: number;
  qualityMetric(context: WeaponQualityContext): number;
  damageProfile(context: WeaponDamageContext): number;
  onHeldUpdate?(context: BladeWeaponContext): void;
  onThrowLaunch(context: WeaponBladeContext): void;
  updateThrown(context: WeaponUpdateContext): void;
  onSecondaryThrowAction(context: WeaponPlayerContext): BladeActionResult;
  onCatch?(context: BladeWeaponContext): void;
}

export interface BladeInputPort {
  touchAim: boolean;
  stickAim: BladePoint | null;
  locked: boolean;
  mouseX: number;
  mouseY: number;
  tetherHeld: boolean;
  lmb?: boolean;
  consumeDelta(): BladePoint;
}

export interface BladeDependencies {
  CLOCK: { sim: number };
  CONFIG: GameConfig;
  Input: BladeInputPort;
  presentation: BladePresentationPort;
  clamp: (value: number, min: number, max: number) => number;
  len: (x: number, y: number) => number;
  lerp: (from: number, to: number, amount: number) => number;
  lerpAngle: (from: number, to: number, amount: number) => number;
}

export interface BladeEntity {
  x: number; y: number; vx: number; vy: number; state: string;
}

export interface BladeRenderSnapshot {
  readonly x: number; readonly y: number; readonly angle: number;
  readonly tipX: number; readonly tipY: number; readonly glowV: number;
  readonly state: string; readonly throwSizeMult: number; readonly model: string;
  readonly trail: readonly Readonly<{ hx: number; hy: number; tx: number; ty: number }>[];
  readonly trailColor?: string; readonly glowColor?: string; readonly restoredTrail?: boolean;
  readonly tension: number; readonly circuitEnergy: number; readonly circuitEnergyMax: number;
  readonly circuitOrbit: number; readonly orbit: number; readonly finalFree?: boolean;
  readonly hostile: boolean; readonly stolenBy: unknown; readonly hideThrowUI?: boolean;
  handPos(player: BladePlayerPort): BladePoint;
  lastHand(): BladePoint | null;
  actionPoint(): BladePoint;
  actionRange(): number;
}

export interface BladePresentationPort {
  draw(surface: unknown, blade: BladeRenderSnapshot, player: BladePlayerPort): void;
}
