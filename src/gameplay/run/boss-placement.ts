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

export function planBossPlacement(
  id: string,
  width: number,
  config: BossPlacementConfig,
): BossPlacement {
  const x = width / 2;
  const ground = config.world.groundY;
  if (id === "source") return Object.freeze({ factoryId: "source", x, y: ground - 300 });
  if (id === "echo") return Object.freeze({ factoryId: "echo", x, y: ground - config.echo.h / 2 });
  if (id === "aldric") return Object.freeze({ factoryId: "aldric", x, y: ground - config.aldric.h / 2 });
  if (id === "rootbound") return Object.freeze({ factoryId: "rootbound", x, y: ground - 140 });
  if (id === "colossus") return Object.freeze({ factoryId: "colossus", x, y: ground - config.colossus.h / 2 });
  if (id === "warden") return Object.freeze({ factoryId: "warden", x, y: ground - 140 });
  return Object.freeze({ factoryId: "boss", x, y: ground - 140 });
}
