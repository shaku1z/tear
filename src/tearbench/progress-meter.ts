import type { TearObservationV1 } from "./contracts";

/**
 * Whether a run is getting anywhere, for every no-progress watchdog.
 *
 * Progress is one of: the screen changes, the wave advances, the score rises, the player's health changes, an
 * enemy loses health, or an enemy is gone. Nothing else counts. Movement, shots in flight and enemies arriving or
 * healing are not progress: a count of everything in the arena changes with every thrown blade, and a watchdog that
 * read one stayed quiet for 45 minutes on a run that could not end (easy, seed 117, wave 24; 2026-11-20).
 */
export class TearProgressMeter {
  #screen: string | undefined;
  #wave = 0;
  #score = 0;
  #playerHealth = 0;
  #enemyHealth = new Map<string, number>();

  /** Reads one observation. True when the run has progressed since the one before; the first one is progress. */
  observe(observation: TearObservationV1, screen: string): boolean {
    const enemyHealth = new Map<string, number>();
    for (const entity of observation.entities)
      if (entity.kind !== "projectile") enemyHealth.set(entity.id, entity.hpRatio ?? 1);
    const playerHealth = Math.round(observation.player.hp);
    let progressed =
      screen !== this.#screen ||
      observation.run.wave !== this.#wave ||
      observation.run.score > this.#score ||
      playerHealth !== this.#playerHealth;
    for (const [id, before] of this.#enemyHealth) {
      const now = enemyHealth.get(id);
      if (now === undefined || now < before) progressed = true;
    }
    this.#screen = screen;
    this.#wave = observation.run.wave;
    this.#score = observation.run.score;
    this.#playerHealth = playerHealth;
    this.#enemyHealth = enemyHealth;
    return progressed;
  }

  reset(): void {
    this.#screen = undefined;
    this.#enemyHealth = new Map();
  }
}
