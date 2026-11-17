/**
 * Authored Rootbound timing, geometry and damage for the parts not on the move table (`rootbound-moves.ts`):
 * phase cadence, Grafts, the Memory Choir and Last Spring. Behaviour lives in rootbound.ts.
 */
/** openingDelay: seconds before the first move of Phase I; recovery: the pause as Phase I ends. */
export const ROOTBOUND_PHASE_ONE_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 });

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

/** Phase III after Regrowth: openingDelay before its first move or Last Spring. */
export const ROOTBOUND_PHASE_THREE_CADENCE = Object.freeze({ openingDelay: 0.7 });
/** Bloom Shift holds a readable re-planting pose while the next Well pattern arms. */
export const ROOTBOUND_BLOOM_SHIFT = Object.freeze({ warning: 0.6 });
/**
 * openingContactGrace: seconds after the intro before the body deals contact damage
 * (the boss spawns where the player stands). regrowthBreakFraction: max-HP share of
 * damage that breaks the Regrowth channel outright.
 */
export const ROOTBOUND_ENCOUNTER = Object.freeze({ openingContactGrace: 1.2, regrowthBreakFraction: 0.08 });
