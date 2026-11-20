// How the release Adventure journey's scripted player moves toward the enemy it picked.
// Kept apart from the browser script so a unit test can drive the real enemy code with it
// (tests/unit/release-adventure-pilot.test.ts).
//
// Positions are body centres in screen pixels; `scale` is screen pixels per world unit.

/**
 * How high a jump from the ground lifts the player, in world units: jumpSpeed² / (2 · gravity)
 * from CONFIG (920² / 4800). The unit test checks it against the game's config.
 */
const JUMP_REACH_WORLD = (920 * 920) / (2 * 2400);

/** Horizontal distance, in world units, beyond which the player walks to its target. */
const APPROACH_WORLD = 150;

/**
 * How far, in world units, the player steps out from under a target it cannot reach. It is wider
 * than half of the widest stage platform (320), so the player stands clear of the platform's edge.
 */
const STEP_OUT_WORLD = 360;

/**
 * Which way to walk (-1, 0 or 1) and whether a jump is worth trying.
 *
 * A charger stands still on a platform above a player who is directly beneath it: it walks toward
 * the player's x and charges only within 150 world units of height. When that platform is higher
 * than one jump, neither side can reach the other and the wave never ends (main run 44688612321).
 * So a target higher than a jump makes the player step out from under it. The charger follows to
 * the platform's edge and drops to the floor.
 */
function chooseMove(player, target, scale) {
  const dx = target.x - player.x,
    dy = target.y - player.y,
    toward = Math.sign(dx) || 1;
  if (dy < -JUMP_REACH_WORLD * scale) return { walk: Math.abs(dx) < STEP_OUT_WORLD * scale ? -toward : 0, jump: false };
  return {
    walk: Math.abs(dx) > APPROACH_WORLD * scale ? toward : 0,
    jump: dy < -120 * scale && Math.abs(dx) < 260 * scale,
  };
}

module.exports = { APPROACH_WORLD, JUMP_REACH_WORLD, STEP_OUT_WORLD, chooseMove };
