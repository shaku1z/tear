export interface HeldStrikeTuning {
  readonly slamMinDownSpeed: number; readonly launchMinUpSpeed: number; readonly risingSpeedRef: number;
  readonly slamPowerSpeed: number; readonly slamEmpowerAt: number; readonly slamMultiplier: number;
  readonly slamPowerBonus: number; readonly risingDmgBonus: number; readonly hitStopThreshold: number;
  readonly aerialRaveCap: number;
}
export interface HeldStrikeInput {
  readonly baseDamage: number; readonly tipVerticalSpeed: number; readonly tipSpeed: number;
  readonly playerVerticalSpeed: number; readonly playerGrounded: boolean; readonly playerHealth: number; readonly playerMaxHealth: number;
  readonly playerAirTime: number; readonly dashEndTime: number; readonly tempoTime: number; readonly tempoStacks: number;
  readonly enemyGrounded: boolean; readonly enemyY: number; readonly enemyHalfHeight: number; readonly groundY: number;
  readonly styleMultiplier: number; readonly repeatScale: number; readonly runDamageMultiplier: number; readonly enemyDamageMultiplier: number;
  readonly berserk: boolean; readonly airBonus: number; readonly aerialRave: number; readonly slipstream: boolean; readonly tempo: number;
  readonly tuning: HeldStrikeTuning;
}
export interface HeldStrikePlan {
  readonly damage: number; readonly slam: boolean; readonly launch: boolean; readonly spike: boolean;
  readonly empoweredLaunch: boolean; readonly empoweredSlam: boolean; readonly riseFraction: number; readonly descentFraction: number;
  readonly heightFraction: number; readonly strikeFraction: number; readonly big: boolean;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export function planHeldStrike(input: HeldStrikeInput): HeldStrikePlan {
  const { tuning } = input, slam = !input.playerGrounded && input.tipVerticalSpeed > tuning.slamMinDownSpeed;
  const launch = input.tipVerticalSpeed < -tuning.launchMinUpSpeed, spike = slam && !input.enemyGrounded;
  const riseFraction = launch ? clamp01(Math.max(0, -input.playerVerticalSpeed) / tuning.risingSpeedRef) : 0;
  const empoweredLaunch = launch && riseFraction > 0.45;
  const descentFraction = slam ? clamp01(input.playerVerticalSpeed / tuning.slamPowerSpeed) : 0;
  const empoweredSlam = slam && descentFraction > tuning.slamEmpowerAt;
  const heightFraction = spike ? clamp01(((input.groundY - input.enemyHalfHeight) - input.enemyY) / 400) : 0;
  const strikeFraction = spike ? clamp01(input.tipSpeed / 4000) : 0;
  let damage = input.baseDamage * (slam ? tuning.slamMultiplier : 1) * input.repeatScale * input.styleMultiplier;
  if (slam) damage *= 1 + descentFraction * tuning.slamPowerBonus;
  if (launch) damage *= 1 + riseFraction * tuning.risingDmgBonus;
  if (spike) damage *= 1 + heightFraction * 0.6 + strikeFraction * 0.3;
  if (input.berserk && input.playerHealth < input.playerMaxHealth * 0.5) damage *= 1.25;
  if (!input.playerGrounded && input.airBonus) damage *= 1 + input.airBonus;
  if (!input.playerGrounded && input.aerialRave) damage *= 1 + Math.min(input.playerAirTime * input.aerialRave, tuning.aerialRaveCap);
  if (input.slipstream && input.dashEndTime > 0) damage *= 1.35;
  if (input.tempoTime > 0 && input.tempo) damage *= 1 + input.tempo * input.tempoStacks;
  damage *= input.runDamageMultiplier * input.enemyDamageMultiplier;
  return { damage, slam, launch, spike, empoweredLaunch, empoweredSlam, riseFraction, descentFraction, heightFraction, strikeFraction,
    big: slam || empoweredLaunch || spike || damage >= tuning.hitStopThreshold };
}
