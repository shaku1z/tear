import type {
  CombatActorState,
  CombatEntityIntent,
  EntityId,
  ResolvedCombatActorState,
  SupportTuning,
  SupportType,
} from "./combat-entity-contracts";

export interface SupportResolution {
  readonly actors: readonly ResolvedCombatActorState[];
  readonly intents: readonly CombatEntityIntent[];
}

export interface ProjectedSupportWorkspace {
  readonly byId: Map<EntityId, number>;
  readonly intents: CombatEntityIntent[];
}

export function createProjectedSupportWorkspace(): ProjectedSupportWorkspace {
  return { byId: new Map<EntityId, number>(), intents: [] };
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type WorkingActor = Omit<Mutable<ResolvedCombatActorState>, "buffs" | "links"> & {
  buffs: SupportType[];
  links: EntityId[];
};

function distance(a: CombatActorState, b: CombatActorState): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetActor(actor: CombatActorState): WorkingActor {
  return {
    ...actor,
    auraDR: 1,
    auraDmg: 1,
    auraSpeed: 1,
    auraHaste: 1,
    tetherDR: 1,
    anchored: false,
    buffs: [],
    links: [],
  };
}

export function resolveSupportAuras(
  sourceActors: readonly CombatActorState[],
  dt: number,
  tuning: SupportTuning,
  anchorFxColor: string,
): SupportResolution {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
  const actors = new Array<WorkingActor>(sourceActors.length);
  for (let index = 0; index < sourceActors.length; index += 1) {
    const source = sourceActors[index];
    if (source === undefined) continue;
    actors[index] = resetActor(source);
  }
  return resolveWorkingActors(actors, dt, tuning, anchorFxColor);
}

/**
 * Resolves freshly projected runtime snapshots in place. The caller owns the
 * snapshots and discards them after applying the result, avoiding a redundant
 * second full-roster clone while keeping the public pure resolver unchanged.
 */
export function resolveProjectedSupportAuras(
  projectedActors: CombatActorState[],
  dt: number,
  tuning: SupportTuning,
  anchorFxColor: string,
  workspace?: ProjectedSupportWorkspace,
): SupportResolution {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
  const actors = projectedActors as WorkingActor[];
  for (const actor of actors) {
    actor.auraDR = 1; actor.auraDmg = 1; actor.auraSpeed = 1; actor.auraHaste = 1;
    actor.tetherDR = 1; actor.anchored = false;
    const existingBuffs: unknown = Reflect.get(actor, "buffs");
    const buffs = Array.isArray(existingBuffs) ? existingBuffs as SupportType[] : [];
    buffs.length = 0; actor.buffs = buffs;
    const existingLinks: unknown = Reflect.get(actor, "links");
    const links = Array.isArray(existingLinks) ? existingLinks as EntityId[] : [];
    links.length = 0; actor.links = links;
  }
  return resolveWorkingActors(actors, dt, tuning, anchorFxColor, workspace);
}

function resolveWorkingActors(
  actors: WorkingActor[],
  dt: number,
  tuning: SupportTuning,
  anchorFxColor: string,
  workspace?: ProjectedSupportWorkspace,
): SupportResolution {
  const byId = workspace?.byId ?? new Map<EntityId, number>(); byId.clear();
  for (let index = 0; index < actors.length; index += 1) {
    const actor = actors[index]; if (actor !== undefined) byId.set(actor.id, index);
  }
  const intents = workspace?.intents ?? []; intents.length = 0;

  for (const support of actors) {
    if (support.kind !== "support") continue;
    if (support.dead || support.spawnT > 0 || support.stun > 0 || support.supportType === undefined) continue;
    const supportType = support.supportType;
    const range = support.range ?? 0;

    if (supportType === "priest" || supportType === "herald") {
      for (const actor of actors) {
        if (actor.id === support.id || actor.dead || actor.kind === "support") continue;
        if (distance(actor, support) > range + actor.radius) continue;
        if (supportType === "priest") {
          actor.auraDR = Math.min(actor.auraDR, tuning.drMult);
          actor.auraDmg = Math.max(actor.auraDmg, tuning.dmgBuff);
        } else {
          actor.auraSpeed = Math.max(actor.auraSpeed, tuning.speedBuff);
          actor.auraHaste = Math.max(actor.auraHaste, tuning.hasteBuff);
        }
        actor.buffs.push(supportType);
        support.links.push(actor.id);
      }
      continue;
    }

    if (supportType === "mender") {
      let bestIndex = -1;
      let bestHp = Number.POSITIVE_INFINITY;
      for (let actorIndex = 0; actorIndex < actors.length; actorIndex += 1) {
        const actor = actors[actorIndex];
        if (actor === undefined || actor.id === support.id || actor.dead || actor.kind === "support" || actor.hp >= actor.maxHp) continue;
        if (distance(actor, support) > range * 1.3) continue;
        if (actor.hp < bestHp) { bestHp = actor.hp; bestIndex = actorIndex; }
      }
      const best = actors[bestIndex];
      if (best !== undefined) {
        best.hp = Math.min(best.maxHp, best.hp + tuning.menderRate * dt);
        best.buffs.push("mender"); support.links.push(best.id);
      }
      continue;
    }

    let bondedId = support.bondedId ?? null;
    const bondedIndex = bondedId === null ? undefined : byId.get(bondedId);
    const bonded = bondedIndex === undefined ? undefined : actors[bondedIndex];
    if (bondedId !== null && (bonded === undefined || bonded.dead)) {
      support.dead = true;
      const color = support.color ?? anchorFxColor;
      intents.push(
        { type: "fx-ring", x: support.x, y: support.y, radius: 16, color },
        { type: "fx-burst", x: support.x, y: support.y, dx: 0, dy: -1, count: 8, color },
      );
      continue;
    }
    if (bondedId === null) {
      let bestIndex = -1;
      let bestHp = -1;
      for (let actorIndex = 0; actorIndex < actors.length; actorIndex += 1) {
        const actor = actors[actorIndex];
        if (actor === undefined || actor.id === support.id || actor.dead || actor.kind === "support" || actor.kind === "wraith" || actor.spawnT > 0) continue;
        if (actor.maxHp > bestHp) { bestHp = actor.maxHp; bestIndex = actorIndex; }
      }
      bondedId = actors[bestIndex]?.id ?? null;
      support.bondedId = bondedId;
    }
    if (bondedId !== null) {
      const targetIndex = byId.get(bondedId);
      const target = targetIndex === undefined ? undefined : actors[targetIndex];
      if (targetIndex !== undefined && target !== undefined && !target.dead) {
        target.tetherDR = Math.min(target.tetherDR, tuning.anchorDR);
        target.hp = Math.min(target.maxHp, target.hp + tuning.anchorRegen * dt);
        target.anchored = true; target.buffs.push("anchor"); support.links.push(target.id);
      }
    }
  }
  return { actors, intents };
}
