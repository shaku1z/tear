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

export interface LiveCombatAdapterContext {
  readonly entities: CombatEntityRuntimeHooks;
  readonly opening: Readonly<{
    values(): OpeningValues;
    actions: OpeningActions;
    readState(): LiveOpeningState;
    writeState(state: LiveOpeningState): void;
  }>;
  readonly collision: Readonly<{
    values(): CollisionValues;
    actions: CollisionActions;
    readState(): LiveCollisionPhaseState;
    writeState(state: LiveCollisionPhaseState): void;
  }>;
  readonly kill: LiveKillHost;
}

export interface LiveCombatAdapters {
  readonly entities: CombatEntityRuntimeHooks;
  readonly opening: LiveOpeningPhaseHost;
  collisionFor(combat: CombatEntityRuntime): LiveCollisionPhaseHost;
  readonly kill: LiveKillHost;
}

/**
 * Owns the mutable legacy state adapters at the strict-runtime boundary. Values
 * are read lazily so replacing a run, player, blade, or entity array never
 * leaves the fixed-step host holding a stale snapshot.
 */
export function createLiveCombatAdapters(context: LiveCombatAdapterContext): LiveCombatAdapters {
  const openingState = stateProxy(context.opening.readState, context.opening.writeState);
  const collisionState = stateProxy(context.collision.readState, context.collision.writeState);
  const opening = Object.defineProperties({ ...context.opening.actions, state: openingState }, {
    player: lazy(() => context.opening.values().player),
    blade: lazy(() => context.opening.values().blade),
    run: lazy(() => context.opening.values().run),
    enemies: lazy(() => context.opening.values().enemies),
    projectiles: lazy(() => context.opening.values().projectiles),
    platforms: lazy(() => context.opening.values().platforms),
    width: lazy(() => context.opening.values().width),
    blocking: lazy(() => context.opening.values().blocking),
    playerMode: lazy(() => context.opening.values().playerMode),
    protection: lazy(() => context.opening.values().protection),
    lowGraphics: lazy(() => context.opening.values().lowGraphics),
    transformationBlocked: lazy(() => context.opening.values().transformationBlocked),
  }) as LiveOpeningPhaseHost;
  return Object.freeze({ entities: context.entities, opening,
    collisionFor(combat: CombatEntityRuntime): LiveCollisionPhaseHost {
      return Object.defineProperties({ ...context.collision.actions, state: collisionState, combat }, {
        player: lazy(() => context.collision.values().player),
        blade: lazy(() => context.collision.values().blade),
        run: lazy(() => context.collision.values().run),
        width: lazy(() => context.collision.values().width),
      }) as LiveCollisionPhaseHost;
    },
    kill: context.kill });
}

function lazy(get: () => unknown): PropertyDescriptor {
  return { configurable: false, enumerable: true, get };
}

function stateProxy<T extends object>(read: () => T, write: (state: T) => void): T {
  return new Proxy({} as T, {
    get(_target, key) { return Reflect.get(read(), key); },
    set(_target, key, value) {
      const current = read();
      Reflect.set(current, key, value);
      write(current);
      return true;
    },
  });
}
