import { ENEMY_STATUS_FIELDS, copyStatus, type RuntimeEnemyState } from "../../gameplay/runtime/canonical-state";
import type { EnemyTypes } from "../../gameplay/entities/enemies";
import type { GameEnemy } from "../../gameplay/runtime/game-runtime-state";

/**
 * An enemy's row in the canonical state, read from the actor. Live play and the detached replay world both
 * project their enemies through here, so a field added here is hashed the same on both sides.
 */
export function projectLiveCanonicalEnemy(entity: GameEnemy): RuntimeEnemyState {
  const enemy = entity;
  const base: RuntimeEnemyState = {
    ...(typeof enemy._gid === "number" ? { _gid: enemy._gid } : {}),
    kind: enemy.kind,
    ...(typeof enemy.bossId === "string" ? { bossId: enemy.bossId } : {}),
    x: enemy.x,
    y: enemy.y,
    vx: enemy.vx,
    vy: enemy.vy,
    hp: enemy.hp,
    dead: enemy.dead,
    ...copyStatus(ENEMY_STATUS_FIELDS, enemy),
  };
  if (enemy.kind === "rimehound") {
    const hound = entity as InstanceType<EnemyTypes["Rimehound"]>;
    return {
      ...base,
      atk: hound.atk,
      atkT: hound.atkT,
      atkCd: hound.atkCd,
      packRole: hound.packRole,
      packFlank: hound.packFlank,
      packLockT: hound.packLockT,
      packAttackAuthorized: hound.packAttackAuthorized,
      pounceTargetX: hound.pounceTargetX,
      pounceAirborne: hound.pounceAirborne,
      auroraDirection: hound.auroraDirection,
      auroraResponseT: hound.auroraResponseT,
      auroraPounceExtended: hound.auroraPounceExtended,
    };
  }
  if (enemy.kind !== "white-hart") return base;
  const hart = entity as InstanceType<EnemyTypes["WhiteHart"]>;
  return {
    ...base,
    state: hart.state,
    atk: hart.atk,
    stateT: hart.stateT,
    stateMax: hart.stateMax,
    phaseMarker: hart.phaseMarker,
    attackCursor: hart.attackCursor,
    attackStep: hart.attackStep,
    attackSequence: hart.attackSequence,
    environmentSequence: hart.environmentSequence,
    routeProgress: hart.routeProgress,
    trueRouteIndex: hart.trueRouteIndex,
    fracturePlatformId: hart.fracturePlatformId,
    fractureWindow: hart.fractureWindow,
    batonStrike: hart.batonStrike,
    auroraBossChargeActive: hart.auroraBossChargeActive,
    parryOutcome: hart.parryOutcome,
    routeTelegraph: hart.routeTelegraph,
    candidateRoutes: hart.candidateRoutes,
  };
}
