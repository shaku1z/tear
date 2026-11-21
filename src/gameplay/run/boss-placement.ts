import { bossDefinition, isBossDefinitionId } from "./boss-definitions";

/**
 * Where each boss enters the arena.
 *
 * This is simulation state, not presentation: the spawn transform is part of
 * the canonical world, so every host that builds a boss — the live content
 * composition, a detached world, a replay, a headless episode — must place it
 * identically or their traces diverge on the first boss tick.
 */
export interface BossPlacementConfig {
  readonly world: { readonly groundY: number };
  readonly boss: { readonly h: number };
  readonly whiteHart: { readonly h: number };
  readonly echo: { readonly h: number };
  readonly aldric: { readonly h: number };
  readonly colossus: { readonly h: number };
}

export interface BossPlacement {
  /** The entity-construction factory id for this boss. */
  readonly factoryId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A boss enters at the arena's centre. One with a start gap enters at least that far from the player: it
 * moves to the side with more room, so it never enters inside them. `playerX` is where the player stands
 * when it enters; every host passes it, as the placement is canonical.
 */
export function planBossPlacement(
  id: string,
  width: number,
  config: BossPlacementConfig,
  playerX: number,
): BossPlacement {
  if (!isBossDefinitionId(id)) throw new RangeError(`no boss placement for ${id}`);
  const { factoryId, lift, startGap } = bossDefinition(id).spawn;
  const rise = typeof lift === "number" ? lift : config[lift].h / 2;
  let x = width / 2;
  if (startGap !== undefined && Math.abs(playerX - x) < startGap)
    x = playerX < width / 2 ? Math.min(width, playerX + startGap) : Math.max(0, playerX - startGap);
  return Object.freeze({ factoryId, x, y: config.world.groundY - rise });
}
