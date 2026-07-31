/**
 * One world's simulation clock.
 *
 * Physical animation time advances only with fixed simulation steps, so hit
 * stop freezes tells, weapons, projectiles, and world dressing; UI retains wall
 * time. The value is a mutable `sim` field because entity constructors capture
 * the clock object and read it every step. There is deliberately no module
 * instance: a second world must not share the live world's simulation time.
 */
export interface TearWorldClock {
  sim: number;
}

export function createTearWorldClock(seconds = 0): TearWorldClock {
  return { sim: seconds };
}
