/**
 * Authored Rootbound numbers for the parts not on the move table (`rootbound-moves.ts`): phase cadence,
 * Grafts, healing and Last Spring. Behaviour lives in rootbound.ts.
 */
/** openingDelay: seconds before the first move of Phase I; recovery: the pause as Phase I ends. */
export const ROOTBOUND_PHASE_ONE_CADENCE = Object.freeze({ openingDelay: 0.9, recovery: 0.55 });

export const ROOTBOUND_GRAFT_ANCHOR_GEOMETRY = Object.freeze({ width: 54, height: 90 });
/**
 * Grafts in Phase II. A cut Graft opens the keeper for `cutExposed` seconds; cutting the last one after all
 * three stood together opens it for `uprootedExposed`. A cut Graft is not planted again for `regrow` seconds.
 */
export const ROOTBOUND_GRAFTS = Object.freeze({ cutExposed: 1.4, uprootedExposed: 3, regrow: 8 });
/**
 * Every Rootbound healing rule, in one place. The keeper heals only while a Mercy Graft stands and the
 * player has not hit it for `quietSeconds`; any hit restarts that wait. It heals `perSecond` of its full
 * health each second, at most `phaseTwoCap` of its full health in the whole of Phase II, and never back
 * above the health it entered Phase II with.
 */
export const ROOTBOUND_HEALING = Object.freeze({ quietSeconds: 3, perSecond: 0.015, phaseTwoCap: 0.08 });

export const ROOTBOUND_LAST_SPRING = Object.freeze({ warning: 0.8, bloom: 1.5, commit: 0.35, punish: 0.9, damage: 24 });
export type RootboundLastSpringStage = "warning" | "bloom" | "commit" | "punish" | "complete";
/** openingDelay: seconds after the transformation before the keeper plants its first Graft. */
export const ROOTBOUND_PHASE_TWO_CADENCE = Object.freeze({ openingDelay: 0.85, recovery: 0.7 });

/** Phase III after Regrowth: openingDelay before its first move or Last Spring. */
export const ROOTBOUND_PHASE_THREE_CADENCE = Object.freeze({ openingDelay: 0.7 });
/**
 * openingContactGrace: seconds after the intro before the body deals contact damage
 * (the boss spawns where the player stands). regrowthBreakFraction: max-HP share of
 * damage that breaks the Regrowth channel outright.
 */
export const ROOTBOUND_ENCOUNTER = Object.freeze({ openingContactGrace: 1.2, regrowthBreakFraction: 0.08 });
