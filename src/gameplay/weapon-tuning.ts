import { WEAPON_IDS, type WeaponId } from "./weapon-selection";

/**
 * The authored Final Five weapon numbers.
 *
 * This module is intentionally pure: it contains no runtime ports, browser
 * state, remote configuration, or entity behavior. `CONFIG.weapons` is a
 * mutable legacy adapter created from this authority at boot.
 */

export type FinalFiveWeaponTuningId = WeaponId;

export interface SwordTuning {
  reversalWindow: number;
  reversalExitRadius: number;
  reversalOppositeDot: number;
  reversalExitPadding: number;
  reversalDamageMult: number;
  reversalStun: number;
  threadcutDamageMult: number;
}

export interface HammerTuning {
  weakFloor: number;
  commitmentRef: number;
  fullCommitMult: number;
  breakPerDamage: number;
  breakThreshold: number;
  bossBreakThreshold: number;
  meteorGravity: number;
  meteorRadius: number;
  meteorStun: number;
  meteorBreak: number;
  recallTargetCap: number;
}

export interface GreatswordTuning {
  weakNearHilt: number;
  cleaveThreshold: number;
  cleaveDamageMult: number;
  lightMomentumRetention: number;
  mediumMomentumRetention: number;
  heavyMomentumRetention: number;
  bossMomentumRetention: number;
  wheelSpin: number;
  wheelReturnAlign: number;
  wheelReturnMult: number;
}

export interface ChainbladeTuning {
  lashForce: number;
  hookDuration: number;
  slingSpeed: number;
  collisionDamage: number;
  releaseStun: number;
  heavyBreak: number;
  bossTug: number;
  minRadius: number;
  maxRadius: number;
  tightenRate: number;
  linkSegments: number;
  angularAcceleration: number;
  angularDamping: number;
  maxAngularSpeed: number;
  orbitSpring: number;
  orbitFollow: number;
  releaseOrbitMult: number;
  releaseMomentumCarry: number;
  maxReleaseSpeed: number;
  knockbackReference: number;
  anchorPull: number;
  anchorMaxSpeed: number;
  worldCollisionCooldown: number;
}

export interface RiftlockTuning {
  chambers: number;
  chamberReform: number;
  razorCooldown: number;
  razorDamage: number;
  razorSpeed: number;
  razorRadius: number;
  razorLife: number;
  recoil: number;
  recoilCutWindow: number;
  bayonetRefill: number;
  perfectParryRefill: number;
  catchRefill: number;
  looseCannonDuration: number;
  remoteShotCooldown: number;
  backblastSpeed: number;
  captureDuration: number;
  captureRecoilTransfer: number;
  captureBossTransfer: number;
}

export interface FinalFiveWeaponTuningConfig {
  sword: SwordTuning;
  hammer: HammerTuning;
  greatsword: GreatswordTuning;
  chainblade: ChainbladeTuning;
  riftlock: RiftlockTuning;
}

export const FINAL_FIVE_WEAPON_TUNING = Object.freeze({
  sword: Object.freeze({
    reversalWindow: 1.45,
    reversalExitRadius: 86,
    reversalOppositeDot: -0.55,
    reversalExitPadding: 18,
    reversalDamageMult: 1.65,
    reversalStun: 0.24,
    threadcutDamageMult: 1.35,
  }),
  hammer: Object.freeze({
    weakFloor: 0.28,
    commitmentRef: 760,
    fullCommitMult: 1.32,
    breakPerDamage: 1.15,
    breakThreshold: 82,
    bossBreakThreshold: 190,
    meteorGravity: 1850,
    meteorRadius: 170,
    meteorStun: 0.85,
    meteorBreak: 75,
    recallTargetCap: 2,
  }),
  greatsword: Object.freeze({
    weakNearHilt: 0.48,
    cleaveThreshold: 0.68,
    cleaveDamageMult: 1,
    lightMomentumRetention: 0.92,
    mediumMomentumRetention: 0.78,
    heavyMomentumRetention: 0.55,
    bossMomentumRetention: 0.35,
    wheelSpin: 14,
    wheelReturnAlign: 13,
    wheelReturnMult: 1.28,
  }),
  chainblade: Object.freeze({
    lashForce: 780,
    hookDuration: 3.1,
    slingSpeed: 1650,
    collisionDamage: 28,
    releaseStun: 0.38,
    heavyBreak: 28,
    bossTug: 0.24,
    minRadius: 70,
    maxRadius: 300,
    tightenRate: 260,
    linkSegments: 14,
    angularAcceleration: 34,
    angularDamping: 4.2,
    maxAngularSpeed: 8.5,
    orbitSpring: 18,
    orbitFollow: 9,
    releaseOrbitMult: 1.08,
    releaseMomentumCarry: 0.18,
    maxReleaseSpeed: 2600,
    knockbackReference: 10,
    anchorPull: 11,
    anchorMaxSpeed: 900,
    worldCollisionCooldown: 0.16,
  }),
  riftlock: Object.freeze({
    chambers: 4,
    chamberReform: 1.35,
    razorCooldown: 0.24,
    razorDamage: 42,
    razorSpeed: 1450,
    razorRadius: 6,
    razorLife: 1.15,
    recoil: 520,
    recoilCutWindow: 0.2,
    bayonetRefill: 1,
    perfectParryRefill: 2,
    catchRefill: 1,
    looseCannonDuration: 4.2,
    remoteShotCooldown: 0.3,
    backblastSpeed: 4200,
    captureDuration: 1.4,
    captureRecoilTransfer: 0.72,
    captureBossTransfer: 0.16,
  }),
} as const satisfies Readonly<{
  [K in keyof FinalFiveWeaponTuningConfig]: Readonly<FinalFiveWeaponTuningConfig[K]>;
}>);

if (Object.keys(FINAL_FIVE_WEAPON_TUNING).some((id, index) => id !== WEAPON_IDS[index])
  || Object.keys(FINAL_FIVE_WEAPON_TUNING).length !== WEAPON_IDS.length) {
  throw new Error("Final Five weapon tuning order must match the canonical weapon roster");
}

/** Return a fresh mutable legacy-compatible tuning object for one world. */
export function createFinalFiveWeaponTuning(): FinalFiveWeaponTuningConfig {
  return {
    sword: { ...FINAL_FIVE_WEAPON_TUNING.sword },
    hammer: { ...FINAL_FIVE_WEAPON_TUNING.hammer },
    greatsword: { ...FINAL_FIVE_WEAPON_TUNING.greatsword },
    chainblade: { ...FINAL_FIVE_WEAPON_TUNING.chainblade },
    riftlock: { ...FINAL_FIVE_WEAPON_TUNING.riftlock },
  };
}
