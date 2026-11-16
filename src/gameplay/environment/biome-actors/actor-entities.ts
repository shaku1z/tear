/**
 * The parts of the live player and enemies that biome actor bindings read or write. Live play and
 * the production replay world pass their own entities; both satisfy these shapes structurally.
 */
export interface BiomeActorPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly hw: number;
  readonly hh: number;
  readonly hp: number;
  readonly invulnerable: boolean;
  readonly hazardDmgMult: number;
  takeDamage(damage: number, sourceX: number, source: never): unknown;
}

export interface BiomeActorEnemy {
  readonly kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly weight: number;
  readonly isBoss?: boolean;
  readonly dead: boolean;
  readonly dying: boolean;
}
