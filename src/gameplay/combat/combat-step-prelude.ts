import type { BladePlatformPort } from "../entities/blade-contracts";

export interface CombatPreludePlayer {
  cinematicProtected: boolean; cinematicGraceT: number; flowDR: number; hazardT: number;
  moveBoost: number; tempoT: number; afterimageT: number; afterimageSpeedMult: number;
  supportPlatform: unknown; voidLane: unknown; voidMajorWindow: boolean;
  x: number; y: number; vx: number; vy: number; facing: number;
  heal(amount: number): void; update(dt: number, platforms: readonly BladePlatformPort[]): void;
}

export interface CombatPreludeBlade {
  state: string; secondaryStartedNew: boolean; linkBrokenNew: string | false;
  weapon?: Readonly<{ id?: string }> | null; orbit: number;
  update(dt: number, player: CombatPreludePlayer, platforms: readonly BladePlatformPort[]): void;
}

export interface CombatPreludeMods {
  flowGuard?: boolean; flowRegen?: boolean; cinderSlow?: boolean; secondPass?: number; redirect?: boolean;
  stormBurst?: boolean; concussive?: number; concStun?: boolean; concRefund?: boolean; phantomDash?: number;
  phantomRefund?: boolean; cinder?: boolean; overrun?: number; overrunStacks?: number;
}
export interface CombatPreludeRun {
  readonly mods: Readonly<CombatPreludeMods>;
  readonly mult: number; lifestealCd: number;
  readonly weaponStats: { distanceMoved: number };
  readonly voidScroll?: unknown;
}

export interface CombatStepPreludeOptions {
  readonly dt: number; readonly blocking: boolean; readonly playerMode: string;
  readonly player: CombatPreludePlayer; readonly blade: CombatPreludeBlade; readonly run: CombatPreludeRun;
  readonly platforms: readonly BladePlatformPort[];
  readonly protection: { active: boolean; lastMode: string | null };
  readonly timers: { throwCooldown: number };
  readonly tuning: { flowGuardTier: number; flowGuardMultiplier: number; thrownMoveBoost: number; orbitMove: number };
  readonly overrunMovementMultiplier: number;
  stepCinematic(dt: number): void; flushClosingInput(): void; updateWeaponAbilities(dt: number): void;
  updateZonesAndWalls(dt: number): void; syncVoidSupport(): void;
  activateThrowSecondary(): void;
}

export interface CombatStepPreludeResult {
  readonly blocked: boolean; readonly previousBladeState: string; readonly wasReturning: boolean;
  readonly linkBreakReason: string | false;
}

export function stepCombatPrelude(options: CombatStepPreludeOptions): CombatStepPreludeResult {
  const { dt, player, blade, run } = options;
  if (options.blocking) {
    player.cinematicProtected = true; options.protection.active = true; options.protection.lastMode = options.playerMode;
    options.stepCinematic(dt);
    return { blocked: true, previousBladeState: blade.state, wasReturning: false, linkBreakReason: false };
  }
  if (options.protection.active) {
    player.cinematicProtected = false;
    player.cinematicGraceT = Math.max(player.cinematicGraceT,
      options.protection.lastMode === "landing" || options.protection.lastMode === "finalLanding" ? 0.7 : 0.45);
    options.protection.lastMode = null; options.protection.active = false; options.flushClosingInput();
  }
  player.flowDR = run.mods.flowGuard && run.mult >= options.tuning.flowGuardTier ? options.tuning.flowGuardMultiplier : 1;
  if (run.mods.flowRegen && run.mult >= 3) player.heal(7 * dt);
  if (run.lifestealCd > 0) run.lifestealCd -= dt;
  if (options.timers.throwCooldown > 0) options.timers.throwCooldown -= dt;
  options.updateWeaponAbilities(dt);
  if (player.hazardT > 0) player.hazardT = Math.max(0, player.hazardT - dt);
  options.updateZonesAndWalls(dt);
  const orbitMove = blade.weapon?.id === "ringblade" ? 1 + blade.orbit * options.tuning.orbitMove : 1;
  player.moveBoost = (blade.state !== "held" ? options.tuning.thrownMoveBoost : 1) * options.overrunMovementMultiplier * orbitMove *
    (player.tempoT > 0 ? 1.18 : 1) * (player.afterimageT > 0 ? player.afterimageSpeedMult : 1);
  player.update(dt, options.platforms); run.weaponStats.distanceMoved += Math.hypot(player.vx, player.vy) * dt;
  if (run.voidScroll) options.syncVoidSupport();
  else { player.supportPlatform = null; player.voidLane = null; player.voidMajorWindow = false; }
  const previousBladeState = blade.state, wasReturning = previousBladeState === "returning";
  blade.update(dt, player, options.platforms);
  if (blade.secondaryStartedNew) { blade.secondaryStartedNew = false; options.activateThrowSecondary(); }
  const linkBreakReason = blade.linkBrokenNew;
  if (linkBreakReason) blade.linkBrokenNew = false;
  return { blocked: false, previousBladeState, wasReturning, linkBreakReason };
}
