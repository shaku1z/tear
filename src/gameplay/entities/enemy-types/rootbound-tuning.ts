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
 * Every Rootbound healing rule, in one place.
 *
 * Phase II (Mercy): the keeper heals only while a Mercy Graft stands and the player has not hit it for
 * `quietSeconds`; any hit restarts that wait, and the wait stands still while a strike is coming at the
 * player or a Root Cage holds them. It heals `perSecond` of its full health each second, at most
 * `phaseTwoCap` of its full health in the whole of Phase II, and never back above the health it entered
 * Phase II with.
 *
 * Phase III (Regrowth, once): if the channel runs to its end it heals `regrowthMax` of its full health times
 * the share of its three links still standing, never above the health it entered Phase III with. Cutting all
 * three, or dealing `regrowthBreak` of its full health to it while it channels, heals nothing and opens it
 * for `regrowthBrokenExposed` seconds.
 */
export const ROOTBOUND_HEALING = Object.freeze({
  quietSeconds: 3,
  perSecond: 0.015,
  phaseTwoCap: 0.08,
  regrowthMax: 0.08,
  regrowthBreak: 0.08,
  regrowthBrokenExposed: 1.8,
});
/** openingDelay: seconds after the transformation before the keeper plants its first Graft. */
export const ROOTBOUND_PHASE_TWO_CADENCE = Object.freeze({ openingDelay: 0.85, recovery: 0.7 });

/**
 * Phase III: openingDelay before Regrowth; gapMultiplier shortens the pause after each move, so the last phase
 * is the fastest. When Last Spring comes is its move's `afterMoves` (`rootbound-moves.ts`).
 */
export const ROOTBOUND_PHASE_THREE_CADENCE = Object.freeze({ openingDelay: 0.7, gapMultiplier: 0.7 });
/**
 * openingContactGrace: seconds after the intro before the body deals contact damage
 * (the boss spawns where the player stands).
 */
export const ROOTBOUND_ENCOUNTER = Object.freeze({ openingContactGrace: 1.2 });
