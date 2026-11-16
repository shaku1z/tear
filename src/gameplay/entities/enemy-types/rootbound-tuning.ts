/** Authored Rootbound timing, geometry and damage. Behaviour lives in rootbound.ts and its phase modules. */
export const ROOTBOUND_PHASE_ONE_ATTACK_ORDER = Object.freeze([
  "vine-sweep",
  "seed-arc",
  "rootline",
  "canopy-step",
] as const);
export type RootboundPhaseOneAttack = (typeof ROOTBOUND_PHASE_ONE_ATTACK_ORDER)[number];
export const ROOTBOUND_PHASE_ONE_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 });
export const ROOTBOUND_VINE_SWEEP = Object.freeze({
  windup: 0.65,
  active: 0.14,
  followThrough: 0.22,
  reach: 360,
  halfHeight: 72,
  damage: 18,
});
export type RootboundVineSweepStage = "windup" | "active" | "follow-through";
export const ROOTBOUND_SEED_ARC = Object.freeze({
  windup: 0.55,
  release: 0.3,
  launchSpeed: 560,
  gravity: 820,
  spread: 140,
  damage: 16,
  radius: 12,
});
export type RootboundSeedArcStage = "windup" | "release";
export const ROOTBOUND_ROOTLINE = Object.freeze({
  windup: 0.7,
  active: 0.24,
  cleanup: 0.18,
  width: 430,
  height: 104,
  damage: 20,
});
export type RootboundRootlineStage = "warning" | "active" | "cleanup";
/** floorStandoff: how far from the player the drop back to the floor lands. */
export const ROOTBOUND_CANOPY_STEP = Object.freeze({ telegraph: 0.55, travel: 0.48, settle: 0.24, floorStandoff: 230 });
export type RootboundCanopyStepStage = "telegraph" | "travel" | "settle";

export const ROOTBOUND_GRAFT_ANCHOR_GEOMETRY = Object.freeze({ width: 54, height: 90 });
export const ROOTBOUND_MEMORY_CHOIR = Object.freeze({
  maxManifestations: 3,
  warning: 0.65,
  echoStagger: 0.12,
  active: 0.18,
  afterimage: 0.3,
  width: 180,
  height: 120,
  damage: 14,
});
export type RootboundMemoryChoirStage = "warning" | "active" | "afterimage";
export const ROOTBOUND_LAST_SPRING = Object.freeze({ warning: 0.8, bloom: 1.5, commit: 0.35, punish: 0.9, damage: 24 });
export type RootboundLastSpringStage = "warning" | "bloom" | "commit" | "punish" | "complete";
export const ROOTBOUND_PHASE_TWO_ATTACK_ORDER = Object.freeze(["memory-choir", "root-cage", "bloom-shift"] as const);
export type RootboundPhaseTwoAttack = (typeof ROOTBOUND_PHASE_TWO_ATTACK_ORDER)[number];
export const ROOTBOUND_PHASE_TWO_CADENCE = Object.freeze({ openingDelay: 0.85, recovery: 0.7 });
export interface RootboundMemoryChoirManifestation {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly activationDelay: number;
  readonly hitSpent: boolean;
}

/**
 * Phase III after Regrowth: Last Spring opens every rotation and the ground
 * verbs fill the gaps, so the final phase never runs out of attacks.
 */
export const ROOTBOUND_PHASE_THREE_ATTACK_ORDER = Object.freeze([
  "last-spring",
  "vine-sweep",
  "rootline",
  "seed-arc",
] as const);
export type RootboundPhaseThreeAttack = (typeof ROOTBOUND_PHASE_THREE_ATTACK_ORDER)[number];
export const ROOTBOUND_PHASE_THREE_CADENCE = Object.freeze({ openingDelay: 0.7, recovery: 0.45 });
/** Bloom Shift holds a readable re-planting pose while the next Well pattern arms. */
export const ROOTBOUND_BLOOM_SHIFT = Object.freeze({ warning: 0.6 });
/**
 * openingContactGrace: seconds after the intro before the body deals contact damage
 * (the boss spawns where the player stands). regrowthBreakFraction: max-HP share of
 * damage that breaks the Regrowth channel outright.
 */
export const ROOTBOUND_ENCOUNTER = Object.freeze({ openingContactGrace: 1.2, regrowthBreakFraction: 0.08 });
