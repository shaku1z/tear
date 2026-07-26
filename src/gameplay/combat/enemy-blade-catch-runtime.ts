export interface BladeCatchEnemy {
  readonly dead: boolean;
  readonly tryCatchBlade?: unknown;
}

/** Gives live enemies one ordered opportunity to intercept the player's blade. */
export function resolveEnemyBladeCatch<TEnemy extends BladeCatchEnemy>(
  enemies: readonly TEnemy[],
  blade: unknown,
  player: unknown,
): TEnemy | null {
  for (const enemy of enemies) {
    const catchBlade = enemy.tryCatchBlade;
    if (!enemy.dead && typeof catchBlade === "function"
      && Reflect.apply(catchBlade, enemy, [blade, player]) === true) return enemy;
  }
  return null;
}
