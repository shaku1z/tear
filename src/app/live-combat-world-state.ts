import type { LiveCollisionPhaseState } from "../gameplay/combat/live-collision-phase";
import type { LiveOpeningState } from "../gameplay/combat/live-opening-phase";
import type { TearWorldTransientState } from "../gameplay/runtime/tear-world-transient-state";
import type { LiveCombatMutableState } from "./live-combat-action-context";
import type { GameBlade, GameEnemy, GameFloater, GamePlayer, GameProjectile, GameRun, GameSlowZone, GameTemporaryWall } from "./game-runtime-state";
import type { LiveGameHostState } from "./live-game-host-state";

type CollisionState = Omit<LiveCollisionPhaseState, "enemies" | "projectiles" | "floaters">;
type WorldStatePort = Pick<LiveGameHostState,
  "enemies" | "setEnemies" | "projectiles" | "setProjectiles" | "floaters" | "setFloaters" |
  "slowZones" | "setSlowZones" | "temporaryWalls" | "setTemporaryWalls"> & Readonly<{
    player(): GamePlayer;
    blade(): GameBlade;
    run(): GameRun;
  }>;

/**
 * Binds combat's legacy mutable state port to the one per-world host state and
 * the one per-world transient record set. Combat no longer reads opening or
 * impact values from live-runtime closure variables. It still executes inside
 * the live host, so this is not a portable production combat host claim.
 */
export function createLiveCombatWorldState(
  state: WorldStatePort,
  transient: TearWorldTransientState,
): LiveCombatMutableState<GameEnemy, GameProjectile, GameFloater> {
  return Object.freeze({
    // The live combat composition is constructed while the menu is active.
    // These are intentionally lazy live getters; the adapter must preserve
    // the former pre-run lifecycle instead of failing application bootstrap.
    player: () => state.player(), blade: () => state.blade(), run: () => state.run(),
    enemies: () => state.enemies(), setEnemies: (value: GameEnemy[]) => { state.setEnemies(value); },
    projectiles: () => state.projectiles(), setProjectiles: (value: GameProjectile[]) => { state.setProjectiles(value); },
    floaters: () => state.floaters(), setFloaters: (value: GameFloater[]) => { state.setFloaters(value); },
    slowZones: () => state.slowZones(), setSlowZones: (value: GameSlowZone[]) => { state.setSlowZones(value); },
    walls: () => state.temporaryWalls(), setWalls: (value: GameTemporaryWall[]) => { state.setTemporaryWalls(value); },
    // The opening prelude writes protection fields in place, so combat must see
    // the owned record itself; opening/impact are copied per read as before.
    openingProtection: () => transient.protection,
    setOpeningProtection: (value: { active: boolean; lastMode: string | null }) => { transient.assignProtection(value); },
    openingState: () => ({ ...transient.opening }),
    setOpeningState: (value: LiveOpeningState) => { transient.assignOpening(value); },
    collisionState: () => ({ hitStop: transient.impact.hitStop, slowMotion: transient.impact.slowMotion, shake: transient.impact.shake }),
    setCollisionState: (value: CollisionState) => { transient.assignImpact(value); },
  });
}
