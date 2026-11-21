/**
 * The new Rootbinder's body and move table (plans/active/VERDANT_PALE_REBUILD.md, 2.2): a Verdant enemy that keeps
 * its distance, plants and sends roots along the floor, like the ranged enemies of the other biomes. It roots no
 * allies, snares no player and has no stage objects. Lengths are ticks at 120 Hz, distances px, speeds px/s.
 */

/** Its body, as today's Rootbinder's. */
export const ROOTBINDER_BODY = Object.freeze({
  w: 34,
  h: 46,
  hp: 72,
  speed: 105,
  contactDmg: 7,
  knockbackTaken: 8,
  weight: 1.8,
});

export const ROOTBINDER_MOVES = Object.freeze({
  /** Walk: it keeps between `near` and `far` px from the player, backing away inside and closing outside. */
  walk: Object.freeze({ near: 300, far: 520 }),
  /**
   * Plant: after `settle` ticks inside its band it kneels (`windup`, its stem rising), then stays planted for up
   * to `hold` ticks: open, taking `damageTaken` times the damage, and harmless to touch.
   */
  plant: Object.freeze({ settle: 60, windup: 60, hold: 480, damageTaken: 1.3 }),
  /**
   * Root Run, while planted, every `every` ticks from one start to the next: the stem flicks back and a bulge
   * forms at its feet (`windup`), then a root runs along the floor at the player, a jumpable ground shock.
   */
  rootRun: Object.freeze({ every: 180, windup: 36, recover: 24, speed: 560, life: 192, damage: 10, radius: 12 }),
  /**
   * Uproot: one hit of `hitShare` of its health, or the player within `near` px for `nearTicks`, ends the
   * planting. It pulls free (`windup`), hops `hop` px away from the player over `hopTicks`, recovers, then walks.
   */
  uproot: Object.freeze({
    hitShare: 0.3,
    near: 140,
    nearTicks: 60,
    windup: 18,
    hop: 220,
    hopTicks: 30,
    hopRise: 60,
    recover: 48,
  }),
});
