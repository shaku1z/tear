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

function distance(a: CombatActorState, b: CombatActorState): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resetActor(actor: CombatActorState): ResolvedCombatActorState {
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

function addBuff(actor: ResolvedCombatActorState, buff: SupportType): ResolvedCombatActorState {
  return { ...actor, buffs: [...actor.buffs, buff] };
}

export function resolveSupportAuras(
  sourceActors: readonly CombatActorState[],
  dt: number,
  tuning: SupportTuning,
  anchorFxColor: string,
): SupportResolution {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError("dt must be finite and non-negative");
  const actors = sourceActors.map(resetActor);
  const byId = new Map<EntityId, number>(actors.map((actor, index) => [actor.id, index]));
  const intents: CombatEntityIntent[] = [];
  const replace = (index: number, actor: ResolvedCombatActorState): void => { actors[index] = actor; };

  for (let supportIndex = 0; supportIndex < actors.length; supportIndex += 1) {
    let support = actors[supportIndex];
    if (support?.kind !== "support") continue;
    support = { ...support, links: [] };
    replace(supportIndex, support);
    if (support.dead || support.spawnT > 0 || support.stun > 0 || support.supportType === undefined) continue;
    const supportType = support.supportType;
    const range = support.range ?? 0;

    if (supportType === "priest" || supportType === "herald") {
      const links: EntityId[] = [];
      for (let actorIndex = 0; actorIndex < actors.length; actorIndex += 1) {
        const actor = actors[actorIndex];
        if (actor === undefined || actor.id === support.id || actor.dead || actor.kind === "support") continue;
        if (distance(actor, support) > range + actor.radius) continue;
        const buffed = supportType === "priest"
          ? { ...actor, auraDR: Math.min(actor.auraDR, tuning.drMult), auraDmg: Math.max(actor.auraDmg, tuning.dmgBuff) }
          : { ...actor, auraSpeed: Math.max(actor.auraSpeed, tuning.speedBuff), auraHaste: Math.max(actor.auraHaste, tuning.hasteBuff) };
        replace(actorIndex, addBuff(buffed, supportType));
        links.push(actor.id);
      }
      replace(supportIndex, { ...support, links });
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
        replace(bestIndex, addBuff({ ...best, hp: Math.min(best.maxHp, best.hp + tuning.menderRate * dt) }, "mender"));
        replace(supportIndex, { ...support, links: [best.id] });
      }
      continue;
    }

    let bondedId = support.bondedId ?? null;
    const bondedIndex = bondedId === null ? undefined : byId.get(bondedId);
    const bonded = bondedIndex === undefined ? undefined : actors[bondedIndex];
    if (bondedId !== null && (bonded === undefined || bonded.dead)) {
      replace(supportIndex, { ...support, dead: true });
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
      support = { ...support, bondedId };
      replace(supportIndex, support);
    }
    if (bondedId !== null) {
      const targetIndex = byId.get(bondedId);
      const target = targetIndex === undefined ? undefined : actors[targetIndex];
      if (targetIndex !== undefined && target !== undefined && !target.dead) {
        replace(targetIndex, addBuff({
          ...target,
          tetherDR: Math.min(target.tetherDR, tuning.anchorDR),
          hp: Math.min(target.maxHp, target.hp + tuning.anchorRegen * dt),
          anchored: true,
        }, "anchor"));
        replace(supportIndex, { ...support, links: [target.id] });
      }
    }
  }
  return { actors, intents };
}
