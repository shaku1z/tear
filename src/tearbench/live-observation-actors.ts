import type { TearRuntimeAccessClass } from "./live-runtime-contracts";

/** Projects authored actor modes only for structured Class A/B observers. */
export function projectLiveBehaviorMode(
  actor: Readonly<{ mode?: unknown }>,
  accessClass: TearRuntimeAccessClass,
): string | undefined {
  if (accessClass === "C") return undefined;
  const mode = actor.mode;
  return typeof mode === "string" && mode.length > 0 ? mode : undefined;
}

export function projectLiveBladeMechanics(
  blade: Readonly<{ orbit?: unknown; circuitEnergy?: unknown }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{ orbit?: number; circuitEnergy?: number }> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(typeof blade.orbit === "number" && Number.isFinite(blade.orbit) ? { orbit: blade.orbit } : {}),
    ...(typeof blade.circuitEnergy === "number" && Number.isFinite(blade.circuitEnergy)
      ? { circuitEnergy: blade.circuitEnergy }
      : {}),
  });
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function projectLivePlayerMechanics(
  player: Readonly<{
    hw?: unknown; hh?: unknown; dashTimer?: unknown; dashCd?: unknown;
    iframe?: unknown; maxDashCharges?: unknown;
  }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{
  halfWidth?: number; halfHeight?: number; dashTimer?: number;
  dashCooldown?: number; iframe?: number; maxCharges?: number;
}> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(finiteNonnegative(player.hw) ? { halfWidth: player.hw } : {}),
    ...(finiteNonnegative(player.hh) ? { halfHeight: player.hh } : {}),
    ...(finiteNonnegative(player.dashTimer) ? { dashTimer: player.dashTimer } : {}),
    ...(finiteNonnegative(player.dashCd) ? { dashCooldown: player.dashCd } : {}),
    ...(finiteNonnegative(player.iframe) ? { iframe: player.iframe } : {}),
    ...(finiteNonnegative(player.maxDashCharges) ? { maxCharges: player.maxDashCharges } : {}),
  });
}

export function projectLiveActorMechanics(
  actor: Readonly<{
    hw?: unknown; hh?: unknown; contactReach?: unknown; contactDmg?: unknown;
    chargeMult?: unknown; auraDmg?: unknown; contactEnabled?: unknown;
  }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{
  halfWidth?: number; halfHeight?: number; contactReach?: number; contactDamage?: number;
  chargeMult?: number; auraDmg?: number; contactEnabled?: boolean;
}> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(finiteNonnegative(actor.hw) ? { halfWidth: actor.hw } : {}),
    ...(finiteNonnegative(actor.hh) ? { halfHeight: actor.hh } : {}),
    ...(finiteNonnegative(actor.contactReach) ? { contactReach: actor.contactReach } : {}),
    ...(finiteNonnegative(actor.contactDmg) ? { contactDamage: actor.contactDmg } : {}),
    ...(finiteNonnegative(actor.chargeMult) ? { chargeMult: actor.chargeMult } : {}),
    ...(finiteNonnegative(actor.auraDmg) ? { auraDmg: actor.auraDmg } : {}),
    ...(typeof actor.contactEnabled === "boolean" ? { contactEnabled: actor.contactEnabled } : {}),
  });
}

export function projectLiveProjectileMechanics(
  projectile: Readonly<{
    r?: unknown; dmg?: unknown; counterplay?: unknown; unparryable?: unknown;
  }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{ radius?: number; damage?: number; counterplay?: string; unparryable?: boolean }> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(finiteNonnegative(projectile.r) ? { radius: projectile.r } : {}),
    ...(finiteNonnegative(projectile.dmg) ? { damage: projectile.dmg } : {}),
    ...(typeof projectile.counterplay === "string" && projectile.counterplay.length > 0
      ? { counterplay: projectile.counterplay } : {}),
    ...(typeof projectile.unparryable === "boolean" ? { unparryable: projectile.unparryable } : {}),
  });
}
