import type { EnvironmentRuntime } from "../environment-runtime";
import {
  createVerdantEnvironmentFeature,
  type RootbinderEnvironmentActor,
  type RootbinderEnvironmentAlly,
} from "../verdant-environment-feature";
import type { RootbinderPhase } from "../../entities/rootbinder-runtime";
import type { RootSnarePlayer } from "../root-snare";
import type { BiomeActorEnemy, BiomeActorPlayer } from "./actor-entities";

/** What a root reads and writes on a live enemy. Every enemy has these through the enemy base. */
export interface RootableEnemy extends BiomeActorEnemy {
  readonly flies?: boolean;
  readonly spawnT?: number;
  /** False for an enemy that is never rooted (one that plants itself or stands apart from the fight). */
  readonly rootable?: boolean;
  readonly anchored?: boolean;
  readonly rooted?: boolean;
  stun?: number;
  onGround?: boolean;
  setRooted?(rooted: boolean): void;
}

/** A live enemy that roots others: it reports its phase and is told its roots and when they are all cut. */
export interface RootingEnemy extends RootableEnemy {
  readonly rootPhase: RootbinderPhase;
  rootLinkIds: readonly string[];
  uproot(): void;
  readonly snareReady: boolean;
  snareStarted(): void;
}

function snarePlayer(player: BiomeActorPlayer): RootSnarePlayer {
  return {
    get x() {
      return player.x;
    },
    get y() {
      return player.y;
    },
    get vx() {
      return player.vx;
    },
    hh: player.hh,
    get onGround() {
      return player.onGround === true;
    },
    get alive() {
      return player.hp > 0;
    },
    hold: (x, vx) => {
      player.x = x;
      player.vx = vx;
    },
  };
}

function roots(enemy: RootableEnemy): enemy is RootingEnemy {
  return "rootPhase" in enemy;
}

/** An enemy can be rooted when it stands in the fight on the ground and nothing else holds it in place. */
function rootable(enemy: RootableEnemy): boolean {
  if (enemy.dead || enemy.dying || enemy.isBoss === true || enemy.flies === true || enemy.rootable === false)
    return false;
  if ((enemy.spawnT ?? 0) > 0) return false;
  return enemy.rooted === true || enemy.anchored !== true;
}

function ally(enemy: RootableEnemy, id: string): RootbinderEnvironmentAlly {
  return {
    id,
    get x() {
      return enemy.x;
    },
    get y() {
      return enemy.y;
    },
    get rootable() {
      return rootable(enemy);
    },
    setRooted: (value) => enemy.setRooted?.(value),
    stagger: (seconds) => {
      enemy.stun = Math.max(enemy.stun ?? 0, seconds);
    },
    launch: (speed) => {
      enemy.vy = -speed;
      enemy.onGround = false;
    },
  };
}

/** Binds live enemies and the player to the environment phase that owns roots and snares. */
export function bindLiveRootbinderActors(
  environment: EnvironmentRuntime,
  player: () => BiomeActorPlayer | null,
  enemies: () => readonly RootableEnemy[],
  actorId: (enemy: RootableEnemy) => string,
): void {
  environment.addFeature(createVerdantEnvironmentFeature());
  environment.setFeatureActorSource("verdant", "rootbinder", () => {
    const values = enemies();
    const rooting = values.filter(roots).filter((enemy) => !enemy.dead && !enemy.dying);
    if (rooting.length === 0) {
      // No one roots any more: nothing stays held.
      for (const enemy of values) if (enemy.rooted === true) enemy.setRooted?.(false);
      return [];
    }
    const allies = values.map((enemy) => ({ enemy, port: ally(enemy, actorId(enemy)) }));
    const target = player();
    const snared = target === null ? undefined : snarePlayer(target);
    return rooting.map((enemy): RootbinderEnvironmentActor => ({
      id: actorId(enemy),
      get x() {
        return enemy.x;
      },
      get y() {
        return enemy.y;
      },
      get phase() {
        return enemy.rootPhase;
      },
      get snareReady() {
        return enemy.snareReady;
      },
      snareStarted: () => {
        enemy.snareStarted();
      },
      ...(snared === undefined ? {} : { player: snared }),
      allies: allies.filter((entry) => entry.enemy !== enemy).map((entry) => entry.port),
      reportLinks: (ids) => {
        enemy.rootLinkIds = ids;
      },
      uproot: () => {
        enemy.uproot();
      },
    }));
  });
}
