/**
 * Counts what the Rootbinder does in a wave, tick by tick, from the stage objects and enemies the game holds:
 * the snares it marks on the player, the roots it grows to its allies, and how each Rootbinder ended.
 * Everything is read by the shared names the game gives them (the "root-link" object kind, the "root-snare"
 * pattern, the `rootPhase` of the enemy), so another enemy that uses the same parts is counted with no edit.
 */

export interface RootbinderCount {
  /** Ticks from its arrival to its death; null when it outlived the wave. */
  readonly killTicks: number | null;
  /** True when it died planted, its roots out. */
  readonly diedPlanted: boolean;
  /** Times it was uprooted. */
  readonly uproots: number;
}

export interface RootCount {
  /** Snares marked on the player. */
  readonly snaresMarked: number;
  /** Snares that closed on the player and held. */
  readonly snaresCaught: number;
  /** Holding snares the player cut their way out of. */
  readonly snaresCut: number;
  /** Ticks the player was held. */
  readonly heldTicks: number;
  /** Roots grown to allies. */
  readonly rootsGrown: number;
  /** Ally roots the player cut. */
  readonly rootsCut: number;
  readonly uproots: number;
  readonly rootbinders: readonly RootbinderCount[];
}

/** The parts of a stage object this reads; the game's objects carry more. */
export interface RootObject {
  readonly id: string;
  readonly kind: string;
  readonly state: string;
  readonly cleanupReason?: string | null;
  readonly patternId?: string;
  readonly snarePhase?: string;
}

interface RootedEnemy {
  readonly rootPhase?: string;
  readonly dead?: boolean;
  readonly dying?: boolean;
}

export const ROOT_LINK_KIND = "root-link";
export const ROOT_SNARE_PATTERN = "root-snare";

interface Binder {
  readonly since: number;
  phase: string;
  killTicks: number | null;
  diedPlanted: boolean;
  uproots: number;
}

/** True for an object the player cut: destroyed, and not cleared away by the game for a reason of its own. */
const cutByPlayer = (object: RootObject): boolean =>
  object.state === "destroyed" && (object.cleanupReason ?? null) === null;

export function createRootCounter(): Readonly<{
  read: (objects: readonly RootObject[], enemies: readonly unknown[], tick: number) => void;
  count: () => RootCount;
}> {
  const marked = new Set<string>();
  const caught = new Set<string>();
  const cut = new Set<string>();
  const grown = new Set<string>();
  const binders = new Map<unknown, Binder>();
  let heldTicks = 0;
  return {
    read: (objects, enemies, tick) => {
      let held = false;
      for (const object of objects) {
        if (object.kind !== ROOT_LINK_KIND) continue;
        const snare = object.patternId === ROOT_SNARE_PATTERN;
        (snare ? marked : grown).add(object.id);
        if (snare && object.snarePhase === "holding" && object.state === "active") {
          caught.add(object.id);
          held = true;
        }
        // A snare counts as cut only once it held: one cut in its warning is a mark the player answered early.
        if (cutByPlayer(object) && (!snare || caught.has(object.id))) cut.add(object.id);
      }
      if (held) heldTicks += 1;
      for (const enemy of enemies as readonly RootedEnemy[]) {
        if (typeof enemy.rootPhase !== "string") continue;
        let binder = binders.get(enemy);
        if (binder === undefined) {
          binder = { since: tick, phase: enemy.rootPhase, killTicks: null, diedPlanted: false, uproots: 0 };
          binders.set(enemy, binder);
        }
        if (binder.killTicks !== null) continue;
        if (enemy.dead === true || enemy.dying === true) {
          binder.killTicks = tick - binder.since;
          binder.diedPlanted = binder.phase === "planted";
          continue;
        }
        if (enemy.rootPhase === "uprooted" && binder.phase !== "uprooted") binder.uproots += 1;
        binder.phase = enemy.rootPhase;
      }
      // The game removes a dead enemy from the world; one that is gone without having been seen dead died this tick.
      for (const [enemy, binder] of binders)
        if (binder.killTicks === null && !enemies.includes(enemy)) {
          binder.killTicks = tick - binder.since;
          binder.diedPlanted = binder.phase === "planted";
        }
    },
    count: () => {
      const rootbinders = [...binders.values()].map(({ killTicks, diedPlanted, uproots }) => ({
        killTicks,
        diedPlanted,
        uproots,
      }));
      return {
        snaresMarked: marked.size,
        snaresCaught: caught.size,
        snaresCut: [...cut].filter((id) => marked.has(id)).length,
        heldTicks,
        rootsGrown: grown.size,
        rootsCut: [...cut].filter((id) => grown.has(id)).length,
        uproots: rootbinders.reduce((total, binder) => total + binder.uproots, 0),
        rootbinders,
      };
    },
  };
}
