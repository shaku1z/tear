import type { TearRuntimeAccessClass } from "./live-runtime-contracts";
import { bossDefinition, isBossDefinitionId } from "../gameplay/run/boss-definitions";
import { STAGE_BOSS_HOME, type StageId } from "../gameplay/stages";

export interface LiveBossObservation {
  readonly id: string;
  readonly phase: string;
  readonly validPhases: readonly string[];
  readonly homeStage: StageId;
}

/** Projects boss identity, ordinals, and home stage only from production authorities. */
export function projectLiveBossObservation(actor: Readonly<{
  bossId?: unknown; kind?: unknown; phase?: unknown; state?: unknown;
}>): LiveBossObservation | undefined {
  const rawId = typeof actor.bossId === "string" ? actor.bossId : typeof actor.kind === "string" ? actor.kind : "";
  if (!isBossDefinitionId(rawId)) return undefined;
  const definition = bossDefinition(rawId);
  const validPhases = Object.freeze(Array.from({ length: definition.phaseMarks.length + 1 }, (_, index) => String(index + 1)));
  const rawPhase = typeof actor.phase === "number" || typeof actor.phase === "string" ? String(actor.phase) : "";
  const phase = validPhases.includes(rawPhase) ? rawPhase : validPhases[0] ?? "1";
  const home = Object.entries(STAGE_BOSS_HOME).find(([, bossId]) => bossId === rawId)?.[0] as StageId | undefined;
  if (home === undefined) throw new RangeError(`boss ${rawId} has no source-owned home stage`);
  return Object.freeze({ id: rawId, phase, validPhases, homeStage: home });
}

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
  blade: Readonly<{ riftChambers?: unknown; riftChamberCooldown?: unknown;
    wheelSpin?: unknown; reversals?: unknown }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{ chambers?: number; chamberCooldown?: number; wheelSpin?: number; reversalCount?: number }> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(typeof blade.riftChambers === "number" && Number.isFinite(blade.riftChambers) ? { chambers: blade.riftChambers } : {}),
    ...(typeof blade.riftChamberCooldown === "number" && Number.isFinite(blade.riftChamberCooldown)
      ? { chamberCooldown: blade.riftChamberCooldown }
      : {}),
    ...(typeof blade.wheelSpin === "number" && Number.isFinite(blade.wheelSpin)
      ? { wheelSpin: blade.wheelSpin } : {}),
    ...(Array.isArray(blade.reversals) ? { reversalCount: blade.reversals.length } : {}),
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
    chargeMult?: unknown; auraDmg?: unknown; contactEnabled?: unknown; stun?: unknown; boundT?: unknown;
  }>,
  accessClass: TearRuntimeAccessClass,
): Readonly<{
  halfWidth?: number; halfHeight?: number; contactReach?: number; contactDamage?: number;
  chargeMult?: number; auraDmg?: number; contactEnabled?: boolean; stun?: number; bound?: number;
}> {
  if (accessClass === "C") return Object.freeze({});
  return Object.freeze({
    ...(finiteNonnegative(actor.hw) ? { halfWidth: actor.hw } : {}),
    ...(finiteNonnegative(actor.hh) ? { halfHeight: actor.hh } : {}),
    ...(finiteNonnegative(actor.contactReach) ? { contactReach: actor.contactReach } : {}),
    ...(finiteNonnegative(actor.contactDmg) ? { contactDamage: actor.contactDmg } : {}),
    ...(finiteNonnegative(actor.chargeMult) ? { chargeMult: actor.chargeMult } : {}),
    ...(finiteNonnegative(actor.auraDmg) ? { auraDmg: actor.auraDmg } : {}),
    ...(finiteNonnegative(actor.stun) ? { stun: actor.stun } : {}),
    ...(finiteNonnegative(actor.boundT) ? { bound: actor.boundT } : {}),
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
