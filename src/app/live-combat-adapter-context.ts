import type { CombatEntityRuntime, CombatEntityRuntimeHooks } from "../gameplay/combat/combat-entity-runtime";
import type { LiveCollisionPhaseHost, LiveCollisionPhaseState } from "../gameplay/combat/live-collision-phase";
import type { LiveOpeningPhaseHost, LiveOpeningState } from "../gameplay/combat/live-opening-phase";
import type { LiveKillHost } from "../gameplay/combat/live-kill-runtime";

type OpeningValues = Pick<LiveOpeningPhaseHost,
  "player" | "blade" | "run" | "enemies" | "projectiles" | "platforms" | "width" | "blocking" |
  "playerMode" | "protection" | "lowGraphics" | "transformationBlocked">;
type OpeningActions = Omit<LiveOpeningPhaseHost, keyof OpeningValues | "state">;
type CollisionValues = Pick<LiveCollisionPhaseHost, "player" | "blade" | "run" | "width">;
type CollisionActions = Omit<LiveCollisionPhaseHost, keyof CollisionValues | "state" | "combat">;
type ValuePort<T> = { readonly [Key in keyof T]: () => T[Key] };

export interface LiveCombatAdapterContext {
  readonly entities: CombatEntityRuntimeHooks;
  readonly opening: Readonly<{
    values: ValuePort<OpeningValues>;
    actions: OpeningActions;
    state: LiveOpeningState;
  }>;
  readonly collision: Readonly<{
    values: ValuePort<CollisionValues>;
    actions: CollisionActions;
    /**
     * Stable field-backed view of the owning world's collision state. The
     * fields stay live, but reading one field must not materialize the full
     * state or rewrite unrelated collections.
     */
    state: LiveCollisionPhaseState;
  }>;
  readonly kill: LiveKillHost;
}

export interface LiveCombatAdapters {
  readonly entities: CombatEntityRuntimeHooks;
  readonly opening: LiveOpeningPhaseHost;
  collisionFor(combat: CombatEntityRuntime): LiveCollisionPhaseHost;
  readonly kill: LiveKillHost;
}

export interface LiveCollisionStatePort {
  readonly hitStop: () => number; readonly setHitStop: (value: number) => void;
  readonly slowMotion: () => number; readonly setSlowMotion: (value: number) => void;
  readonly shake: () => number; readonly setShake: (value: number) => void;
  readonly enemies: () => LiveCollisionPhaseState["enemies"];
  readonly setEnemies: (value: LiveCollisionPhaseState["enemies"]) => void;
  readonly projectiles: () => LiveCollisionPhaseState["projectiles"];
  readonly setProjectiles: (value: LiveCollisionPhaseState["projectiles"]) => void;
  readonly floaters: () => LiveCollisionPhaseState["floaters"];
  readonly setFloaters: (value: LiveCollisionPhaseState["floaters"]) => void;
}

/** Creates one allocation-stable mutable view over independently owned fields. */
export function createLiveCollisionStateView(port: LiveCollisionStatePort): LiveCollisionPhaseState {
  return Object.defineProperties({} as LiveCollisionPhaseState, {
    hitStop: field(port.hitStop, port.setHitStop),
    slowMotion: field(port.slowMotion, port.setSlowMotion),
    shake: field(port.shake, port.setShake),
    enemies: field(port.enemies, port.setEnemies),
    projectiles: field(port.projectiles, port.setProjectiles),
    floaters: field(port.floaters, port.setFloaters),
  });
}

/**
 * Owns the mutable legacy state adapters at the strict-runtime boundary. Values
 * are read lazily so replacing a run, player, blade, or entity array never
 * leaves the fixed-step host holding a stale snapshot.
 */
export function createLiveCombatAdapters(context: LiveCombatAdapterContext): LiveCombatAdapters {
  let collisionOwner: CombatEntityRuntime | null = null;
  let collisionHost: LiveCollisionPhaseHost | null = null;
  const opening = Object.defineProperties({ ...context.opening.actions, state: context.opening.state }, {
    player: lazy(context.opening.values.player),
    blade: lazy(context.opening.values.blade),
    run: lazy(context.opening.values.run),
    enemies: lazy(context.opening.values.enemies),
    projectiles: lazy(context.opening.values.projectiles),
    platforms: lazy(context.opening.values.platforms),
    width: lazy(context.opening.values.width),
    blocking: lazy(context.opening.values.blocking),
    playerMode: lazy(context.opening.values.playerMode),
    protection: lazy(context.opening.values.protection),
    lowGraphics: lazy(context.opening.values.lowGraphics),
    transformationBlocked: lazy(context.opening.values.transformationBlocked),
  }) as LiveOpeningPhaseHost;
  return Object.freeze({ entities: context.entities, opening,
    collisionFor(combat: CombatEntityRuntime): LiveCollisionPhaseHost {
      if (collisionHost !== null && collisionOwner === combat) return collisionHost;
      collisionOwner = combat;
      collisionHost = Object.defineProperties({ ...context.collision.actions, state: context.collision.state, combat }, {
        player: lazy(context.collision.values.player),
        blade: lazy(context.collision.values.blade),
        run: lazy(context.collision.values.run),
        width: lazy(context.collision.values.width),
      }) as LiveCollisionPhaseHost;
      return collisionHost;
    },
    kill: context.kill });
}

function lazy(get: () => unknown): PropertyDescriptor {
  return { configurable: false, enumerable: true, get };
}

function field<T>(get: () => T, set: (value: T) => void): PropertyDescriptor {
  return { configurable: false, enumerable: true, get, set };
}
