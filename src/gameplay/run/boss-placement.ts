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

export function planBossPlacement(id: string, width: number, config: BossPlacementConfig): BossPlacement {
  if (!isBossDefinitionId(id)) throw new RangeError(`no boss placement for ${id}`);
  const { factoryId, lift } = bossDefinition(id).spawn;
  const rise = typeof lift === "number" ? lift : config[lift].h / 2;
  return Object.freeze({ factoryId, x: width / 2, y: config.world.groundY - rise });
}
