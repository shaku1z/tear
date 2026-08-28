// ------- interchangeable weapons (one per run, chosen at setup) -------
// Weapon definitions own feel, damage expression, lifecycle, and selection copy.
// Blade owns shared movement, stable identities, and collision geometry.

import type { CONFIG as GAME_CONFIG } from "../config/game-config";
import { clamp, len, lerp } from "../domain/geometry";
import type { EnvironmentCounterplayTag } from "./environment/environment-definitions";
import { migrateWeaponSelection, type WeaponId } from "./weapon-selection";

export type { WeaponId } from "./weapon-selection";
export type WeaponModel = WeaponId;
export type WeaponConfiguration = typeof GAME_CONFIG;
export type WeaponActionResult = "recalled" | "queued" | "busy" | "toofar";

export interface WeaponChannels {
  throwPower: number;
  throwSpeed: number;
  remoteRange: number;
  secondaryPower: number;
  returnSpeed: number;
  controlDuration: number;
}

export interface WeaponRatings { handling: number; impact: number; reach: number; difficulty: number }
export interface WeaponEnemyPort { seamT: number; readonly [key: string]: unknown }
export interface WeaponPlayerPort { x: number; y: number; vx: number; vy: number; facing: number }
export interface WeaponPlatformPort { x: number; y: number; w: number; h: number; oneway?: boolean; floor?: boolean }

export interface WeaponBladePort {
  readonly config?: WeaponConfiguration;
  vx: number;
  vy: number;
  tipX: number;
  tipY: number;
  tension: number;
  linkT: number;
  _lastHand: { x: number; y: number } | null;
  sliceQuality(): number;
  axialQuality(): number;
  channel(name: keyof WeaponChannels): number;
  repeatScale(enemy: object): number;
  swingId: number;
  attackId: number;
  resolveReversal(target: object): "armed" | "reversal" | null;
  primeReversal(target: object): boolean;
  heldDamageMultiplierAt(x: number, y: number): number;
  resetRiftlock(): void;
  claimRiftBayonet(): boolean;
  claimRiftRecoilCut(target: object): boolean;
  refillRiftChambers(amount: number): void;
  _launchStraight(): void;
  _launchBallistic(gravity: number): void;
  _launchWheelCut(): void;
  _launchHook(): void;
  _launchLooseCannon(): void;
  _updateStandardThrown(dt: number, player: WeaponPlayerPort, platforms: readonly WeaponPlatformPort[],
    retrace: boolean, maximumLife?: number): void;
  _updateBallisticThrown(dt: number, player: WeaponPlayerPort, platforms: readonly WeaponPlatformPort[]): void;
  _updateWheelCut(dt: number, player: WeaponPlayerPort, platforms: readonly WeaponPlatformPort[]): void;
  _updateHookThrown(dt: number, player: WeaponPlayerPort, platforms: readonly WeaponPlatformPort[]): void;
  _updateLooseCannon(dt: number, player: WeaponPlayerPort, platforms: readonly WeaponPlatformPort[]): void;
  _beginReturn(player: WeaponPlayerPort, options?: { retrace: boolean }): WeaponActionResult;
  _releaseHook(player: WeaponPlayerPort): WeaponActionResult;
  _beginBackblast(player: WeaponPlayerPort): WeaponActionResult;
}

// `config` is optional for the final-five runtime (which owns the canonical
// CONFIG singleton), but retained as a compatibility input for the newer
// production-world/State-Forge callers that pass their configuration value.
export interface WeaponBladeContext { blade: WeaponBladePort; config?: WeaponConfiguration }
export interface WeaponPlayerContext extends WeaponBladeContext { player: WeaponPlayerPort }
export interface WeaponUpdateContext extends WeaponPlayerContext { platforms: readonly WeaponPlatformPort[]; dt: number }
export interface WeaponDamageContext extends WeaponBladeContext { quality: number; baseDamage?: number }
export interface WeaponContext extends WeaponUpdateContext { enemy: WeaponEnemyPort; quality: number; damage: number; secondary: boolean }
export type WeaponQualityContext = WeaponBladeContext;

export interface WeaponMechanicResult {
  mechanic: string;
  seam?: number;
  hitIframe?: number;
  breakPower?: number;
  force?: number;
  stun?: number;
  damageMult?: number;
  consumeSeam?: boolean;
  stop?: boolean;
  redirect?: boolean;
  repeatScale?: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  model: WeaponModel;
  playstyle: string;
  description: string;
  blurb: string;
  /** JSON-safe names for the authored mechanics; runtime hooks remain below. */
  mechanics: readonly string[];
  tags: readonly string[];
  weaknesses: readonly string[];
  throwIdentity: string;
  ratings: WeaponRatings;
  throwCollisionPad: number;
  channels: WeaponChannels;
  /** Source-owned capabilities resolved against environment object metadata. */
  environmentCounterplay?: Readonly<{
    held?: EnvironmentCounterplayTag;
    thrown?: EnvironmentCounterplayTag;
    projectile?: EnvironmentCounterplayTag;
  }>;
  applyPhysics(context: { config: WeaponConfiguration; weapon: WeaponDefinition }): void;
  applyPlayerChassis(context: { config: WeaponConfiguration; weapon: WeaponDefinition }): void;
  qualityMetric(context: WeaponQualityContext): number;
  damageProfile(context: WeaponDamageContext): number;
  onHeldHit(context: WeaponContext): WeaponMechanicResult | null;
  onThrowLaunch(context: WeaponBladeContext): void;
  updateThrown(context: WeaponUpdateContext): void;
  onThrowHit(context: WeaponContext): WeaponMechanicResult | null;
  onWorldImpact?(context: WeaponContext): WeaponMechanicResult;
  onSecondaryThrowAction(context: WeaponPlayerContext): WeaponActionResult;
  onReset?(context: WeaponBladeContext): void;
  onCatch?(context: WeaponBladeContext): void;
}

function weaponChannels(values: Partial<WeaponChannels> = {}): WeaponChannels {
  return Object.assign({
    throwPower: 1, throwSpeed: 1, remoteRange: 1,
    secondaryPower: 1, returnSpeed: 1, controlDuration: 1,
  }, values);
}

function contextConfig(context: WeaponBladeContext): WeaponConfiguration {
  const config = context.config ?? context.blade.config;
  if (config === undefined) throw new Error("Weapon action requires an explicit world configuration");
  return config;
}

const WEAPONS: readonly WeaponDefinition[] = [
  {
    id: "sword", name: "Sword", model: "sword",
    playstyle: "Control, parries, and deliberate reversals.",
    description: "The responsive baseline. Leave a first cut, reverse through the line with a new swing, then Threadcut your throw route home.",
    blurb: "Responsive precision · Reversal · Threadcut recall",
    mechanics: ["Reversal", "Threadcut"],
    tags: ["Precision", "Parry", "Recall"], weaknesses: ["Low burst", "Narrow control", "Requires timing"],
    throwIdentity: "Threadcut", ratings: { handling: 5, impact: 3, reach: 3, difficulty: 2 },
    throwCollisionPad: 4, channels: weaponChannels(),
    environmentCounterplay: Object.freeze({ held: "cut" }),
    applyPhysics({ config }) {
      const B = config.blade;
      B.springStiffness *= 1.08; B.angleSmooth *= 1.1;
      B.deflectMinSpeed *= 0.9; B.perfectSpeed *= 0.9;
    },
    applyPlayerChassis({ config }) { config.player.thrownMoveBoost = 1.15; },
    qualityMetric(ctx) { return ctx.blade.sliceQuality(); },
    damageProfile() { return 1; },
    onHeldHit(ctx) {
      if (ctx.quality < 0.58) return null;
      const config = contextConfig(ctx);
      return ctx.blade.resolveReversal(ctx.enemy) === "reversal"
        ? { mechanic: "reversal", damageMult: config.weapons.sword.reversalDamageMult,
          stun: config.weapons.sword.reversalStun }
        : null;
    },
    onThrowLaunch(ctx) { ctx.blade._launchStraight(); },
    updateThrown(ctx) { ctx.blade._updateStandardThrown(ctx.dt, ctx.player, ctx.platforms, true); },
    onThrowHit(ctx) { const config = contextConfig(ctx); return ctx.secondary ? { mechanic: "threadcut", damageMult: config.weapons.sword.threadcutDamageMult } : null; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginReturn(ctx.player, { retrace: true }); },
  },
  {
    id: "hammer", name: "Hammer", model: "hammer",
    playstyle: "Impact, control, and destruction.",
    description: "Slow and devastating. Committed hits build Break, while Meteor throws erupt into seismic shockwaves.",
    blurb: "Committed impact · Break · Meteor shockwave",
    mechanics: ["Break", "Meteor"],
    tags: ["Break", "Slam", "Crowd"], weaknesses: ["Slow", "Short control", "Hard parries"],
    throwIdentity: "Meteor", ratings: { handling: 1, impact: 5, reach: 2, difficulty: 3 },
    throwCollisionPad: 13,
    channels: weaponChannels({ throwPower: 1.35, throwSpeed: 0.82, secondaryPower: 1.18, returnSpeed: 0.78 }),
    environmentCounterplay: Object.freeze({ held: "break" }),
    applyPhysics({ config }) {
      const B = config.blade;
      B.springStiffness *= 0.62; B.damping *= 1.18; B.gravity *= 1.58;
      B.length += 4; B.aimRadius -= 18; B.maxReach -= 10;
      B.damageScale *= 1.28; B.maxDamage = Math.round(B.maxDamage * 1.48);
      B.minHitSpeed *= 1.34; B.slamMultiplier *= 1.35; B.launchPower *= 1.38;
      B.deflectMinSpeed *= 1.22; B.perfectSpeed *= 1.28;
    },
    applyPlayerChassis({ config }) {
      config.player.moveSpeed *= 0.96; config.player.airAccel *= 0.92;
      config.player.knockbackMult *= 0.75; config.player.thrownMoveBoost = 1.25;
    },
    qualityMetric(ctx) { const config = contextConfig(ctx); return clamp(len(ctx.blade.vx, ctx.blade.vy) / config.weapons.hammer.commitmentRef, 0, 1); },
    damageProfile(ctx) { const config = contextConfig(ctx); return lerp(config.weapons.hammer.weakFloor, config.weapons.hammer.fullCommitMult, ctx.quality); },
    onHeldHit(ctx) { const config = contextConfig(ctx); return { mechanic: "break", breakPower: ctx.damage * config.weapons.hammer.breakPerDamage * ctx.quality }; },
    onThrowLaunch(ctx) { const config = contextConfig(ctx); ctx.blade._launchBallistic(config.weapons.hammer.meteorGravity); },
    updateThrown(ctx) { ctx.blade._updateBallisticThrown(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit(ctx) { return ctx.secondary ? { mechanic: "hammerReturn" } : { mechanic: "meteor", stop: true }; },
    onWorldImpact() { return { mechanic: "meteor" }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginReturn(ctx.player, { retrace: false }); },
  },
  {
    id: "greatsword", name: "Greatsword", model: "greatsword",
    playstyle: "Formation cleaving and committed routes.",
    description: "A broad steel edge carries through lighter foes. Throw a spinning Wheel Cut and call it back edge-first.",
    blurb: "Broad edge · Cleaving Momentum · Wheel Cut",
    mechanics: ["Cleave", "Wheel Cut"],
    tags: ["Reach", "Cleave", "Formation"], weaknesses: ["Slow", "Weak near hilt", "Committed"],
    throwIdentity: "Wheel Cut", ratings: { handling: 2, impact: 4, reach: 5, difficulty: 4 },
    throwCollisionPad: 10,
    channels: weaponChannels({ throwPower: 1.14, throwSpeed: 0.92, returnSpeed: 0.94 }),
    environmentCounterplay: Object.freeze({ held: "cut" }),
    applyPhysics({ config }) {
      const B = config.blade;
      B.length += 30; B.aimRadius += 14; B.maxReach += 24;
      B.springStiffness *= 0.76; B.damping *= 1.15; B.gravity *= 1.2; B.angleSmooth *= 0.72;
      B.damageScale *= 1.18; B.maxDamage = Math.round(B.maxDamage * 1.22);
    },
    applyPlayerChassis({ config }) { config.player.moveSpeed *= 0.97; config.player.airAccel *= 0.94; config.player.thrownMoveBoost = 1.12; },
    qualityMetric(ctx) { return ctx.blade.sliceQuality(); },
    damageProfile(ctx) { return lerp(0.76, 1.16, ctx.quality); },
    onHeldHit(ctx) { const config = contextConfig(ctx); return ctx.quality >= config.weapons.greatsword.cleaveThreshold
      ? { mechanic: "cleave", repeatScale: 1 }
      : null; },
    onThrowLaunch(ctx) { ctx.blade._launchWheelCut(); },
    updateThrown(ctx) { ctx.blade._updateWheelCut(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit(ctx) { const config = contextConfig(ctx); return { mechanic: ctx.secondary ? "wheelReturn" : "wheelCut", damageMult: ctx.secondary ? config.weapons.greatsword.wheelReturnMult : 1 }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginReturn(ctx.player, { retrace: false }); },
  },
  {
    id: "chainblade", name: "Chainblade", model: "chainblade",
    playstyle: "Crowd control through physical reach and sling momentum.",
    description: "A compact blade with a full-damage Lash. Hook a target, swing it through the arena, and release it tangentially on recall.",
    blurb: "Compact Lash · Hook & Sling · Tangential release",
    mechanics: ["Lash", "Hook & Sling"],
    tags: ["Control", "Sling", "Expert"], weaknesses: ["Needs space", "Setup", "Low boss damage"],
    throwIdentity: "Hook & Sling", ratings: { handling: 3, impact: 3, reach: 5, difficulty: 5 },
    throwCollisionPad: 9,
    channels: weaponChannels({ remoteRange: 1.35, controlDuration: 1.2, secondaryPower: 1.15 }),
    applyPhysics({ config }) {
      const B = config.blade;
      B.length -= 20; B.aimRadius += 18; B.maxReach += 40;
      B.springStiffness *= 0.64; B.damping *= 0.82; B.gravity *= 1.04;
      B.angleSmooth *= 0.76; B.maxSpeed *= 1.06; B.perfectSpeed *= 1.12;
    },
    applyPlayerChassis({ config }) { config.player.moveSpeed *= 0.98; config.player.airAccel *= 0.96; config.player.knockbackMult *= 0.85; },
    qualityMetric(ctx) { return ctx.blade.sliceQuality(); },
    damageProfile(ctx) { return lerp(0.88, 1.08, ctx.quality); },
    onHeldHit(ctx) { const config = contextConfig(ctx); return ctx.quality >= 0.5 ? { mechanic: "lash", force: config.weapons.chainblade.lashForce * ctx.quality } : null; },
    onThrowLaunch(ctx) { ctx.blade._launchHook(); },
    updateThrown(ctx) { ctx.blade._updateHookThrown(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit(ctx) { return ctx.secondary ? { mechanic: "sling" } : { mechanic: "hook", stop: true }; },
    onSecondaryThrowAction(ctx) { return ctx.blade._releaseHook(ctx.player); },
  },
  {
    id: "riftlock", name: "Riftlock", model: "riftlock",
    playstyle: "Ranged pressure, recoil routes, and bayonet recovery.",
    description: "Fire Razor Rounds from four reforming chambers, then throw the whole weapon as a Loose Cannon and command it remotely.",
    blurb: "Razor Rounds · Recoil Cut · Loose Cannon",
    mechanics: ["Razor Rounds", "Recoil Cut", "Capture", "Loose Cannon", "Backblast"],
    tags: ["Ranged", "Recoil", "Resource"], weaknesses: ["Chambers", "Precise fire", "No wide control"],
    throwIdentity: "Loose Cannon", ratings: { handling: 4, impact: 3, reach: 5, difficulty: 5 },
    throwCollisionPad: 7,
    channels: weaponChannels({ throwSpeed: 1.06, remoteRange: 1.35, returnSpeed: 1.15, controlDuration: 1.1 }),
    applyPhysics({ config }) {
      const B = config.blade;
      B.length += 8; B.springStiffness *= 1.12; B.damping *= 1.04; B.gravity *= 0.82; B.angleSmooth *= 1.16;
      B.deflectMinSpeed *= 0.92; B.perfectSpeed *= 0.94;
    },
    applyPlayerChassis({ config }) { config.player.moveSpeed *= 1.02; config.player.airAccel *= 1.04; config.player.thrownMoveBoost = 1.08; },
    qualityMetric(ctx) { return ctx.blade.sliceQuality(); },
    damageProfile(ctx) { return lerp(0.82, 1.04, ctx.quality); },
    onReset(ctx) { ctx.blade.resetRiftlock(); },
    onHeldHit(ctx) {
      const chambered = ctx.blade.claimRiftBayonet();
      return { mechanic: ctx.blade.claimRiftRecoilCut(ctx.enemy) ? "recoilCut" : chambered ? "chamberCut" : "bayonet" };
    },
    onThrowLaunch(ctx) { ctx.blade._launchLooseCannon(); },
    updateThrown(ctx) { ctx.blade._updateLooseCannon(ctx.dt, ctx.player, ctx.platforms); },
    onThrowHit(ctx) {
      return ctx.secondary ? { mechanic: "backblast" } : { mechanic: "capture", stop: true };
    },
    onSecondaryThrowAction(ctx) { return ctx.blade._beginBackblast(ctx.player); },
    onCatch(ctx) { const config = contextConfig(ctx); ctx.blade.refillRiftChambers(config.weapons.riftlock.catchRefill); },
  },
];

function getWeapon(id: string): WeaponDefinition {
  const selected = migrateWeaponSelection(id);
  const weapon = WEAPONS.find((entry) => entry.id === selected) ?? WEAPONS[0];
  if (!weapon) throw new Error("Weapon catalogue must contain a fallback weapon");
  return weapon;
}

function applyWeapon(config: WeaponConfiguration, id: string): WeaponDefinition;
function applyWeapon(config: WeaponConfiguration, id: string): WeaponDefinition {
  const weapon = getWeapon(id);
  weapon.applyPhysics({ config, weapon });
  weapon.applyPlayerChassis({ config, weapon });
  return weapon;
}

export { WEAPONS, applyWeapon, getWeapon };
export { migrateWeaponSelection, WEAPON_SELECTION_MIGRATION } from "./weapon-selection";
