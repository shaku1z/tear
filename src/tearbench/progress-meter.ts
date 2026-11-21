/** What the meter reads. A `TearObservationV1` is one; a host may also build it straight from its world. */
export interface TearProgressReading {
  readonly player: Readonly<{ hp: number }>;
  readonly run: Readonly<{ wave: number; score: number }>;
  readonly entities: readonly Readonly<{ id: string; kind: string; hpRatio?: number }>[];
}

/**
 * Whether a run is getting anywhere, for every no-progress watchdog.
 *
 * Progress is one of: the screen changes, the wave advances, the score rises, an enemy is gone, an enemy's health
 * falls below the lowest it has been, or the player's health falls below the lowest it has been since the last
 * progress. Nothing else counts.
 * Movement, shots in flight and enemies arriving or healing are not progress: a count of everything in the arena
 * changes with every thrown blade, and a watchdog that read one stayed quiet for 45 minutes on a run that could not
 * end (easy, seed 117, wave 24; 2026-11-20). Health counts only as a net loss, the player's and an enemy's alike:
 * healing and being hit again in a loop is not progress, while being worn down is, until the run ends.
 */
export class TearProgressMeter {
  #screen: string | undefined;
  #wave = 0;
  #score = 0;
  /** The lowest the player's health has been since the last progress. */
  #healthFloor = 0;
  #enemyFloors = new Map<string, number>();

  /** Reads one observation. True when the run has progressed since the one before; the first one is progress. */
  observe(observation: TearProgressReading, screen: string): boolean {
    let enemyHurt = false;
    /** Each enemy in the arena, with the lowest its health has been. */
    const enemyFloors = new Map<string, number>();
    for (const entity of observation.entities) {
      if (entity.kind === "projectile") continue;
      const health = entity.hpRatio ?? 1;
      const floor = this.#enemyFloors.get(entity.id) ?? health;
      if (health < floor) enemyHurt = true;
      enemyFloors.set(entity.id, Math.min(floor, health));
    }
    const enemyGone = [...this.#enemyFloors.keys()].some((id) => !enemyFloors.has(id));
    const playerHealth = Math.round(observation.player.hp);
    const progressed =
      screen !== this.#screen ||
      observation.run.wave !== this.#wave ||
      observation.run.score > this.#score ||
      playerHealth < this.#healthFloor ||
      enemyHurt ||
      enemyGone;
    this.#screen = screen;
    this.#wave = observation.run.wave;
    this.#score = observation.run.score;
    if (progressed) this.#healthFloor = playerHealth;
    this.#enemyFloors = enemyFloors;
    return progressed;
  }

  reset(): void {
    this.#screen = undefined;
    this.#enemyFloors = new Map();
  }
}
