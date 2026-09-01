import type { EnvironmentFeature, EnvironmentFeatureContext } from "./environment-feature-ports";
import { applyBloomWellForce, advanceBloomWell, installRootboundBloomPattern, isBloomWellState, type BloomWellActor, type RootboundBloomPatternId } from "./bloom-well";
import { applyElasticLeashForce, createElasticLeash, createRootNetwork, installRootNetwork, isElasticLeashValid, isRootbinderLineValid, redistributeRootNetworkKnockback, type ElasticLeash, type RootbinderCandidate, type RootbinderState } from "../entities/rootbinder-runtime";
import { advanceGraftAnchor, installGraftAnchor, isGraftAnchorState, resolveRootboundGraftEffects, ROOTBOUND_NO_GRAFT_EFFECTS, type GraftAnchorPlacementRequest, type RootboundGraftEffects } from "./graft-anchor";
import { advanceRootCage, installRootCage, isRootCageState, type RootCagePlacementRequest } from "./root-cage";
import { createRootboundRegrowthConnections, type RootboundRegrowthState } from "./regrowth-link";
import { publishEnvironmentEvent } from "./environment-events";
import type { EnvironmentCombatObjectState } from "./environment-contracts";

/** Verdant-only environment behavior, late-bound behind the neutral kernel port. */
export class VerdantEnvironmentFeature implements EnvironmentFeature {
  readonly id = "verdant";
  isActive(environment: EnvironmentFeatureContext): boolean {
    return environment.stageId === "verdant-sanctum"
      || environment.fields().some((field) => field.kind === "bloom-well" || field.kind === "rootline")
      || environment.combatObjects().some((object) => object.kind === "graft-anchor" || object.kind === "root-link")
      || environment.routes().some((route) => route.kind === "regrowth-link")
      || (this.#rootbinderActors?.().length ?? 0) > 0 || (this.#rootboundActors?.().length ?? 0) > 0;
  }
  claimsField(field: ReturnType<EnvironmentFeatureContext["fields"]>[number]): boolean { return isBloomWellState(field); }
  #bloomActors: (() => readonly BloomWellActor[]) | undefined;
  #rootbinderActors: (() => readonly RootbinderEnvironmentActor[]) | undefined;
  #rootboundActors: (() => readonly RootboundEnvironmentActor[]) | undefined;
  readonly #rootbinderNetworks = new Map<string, readonly string[]>();
  readonly #rootbinderLeashes = new Map<string, string>();
  readonly #rootbinderRedistribution = new Map<string, Readonly<{ x: number; y: number }>>();
  readonly #rootbinderGenerations = new Map<string, number>();
  readonly #rootlineFields = new Map<string, string>();
  readonly #rootlineHitFields = new Set<string>();

  setActorSource(slot: string, source: (() => readonly unknown[]) | undefined): void {
    if (slot === "bloom-well") this.#bloomActors = source as (() => readonly BloomWellActor[]) | undefined;
    if (slot === "rootbinder") this.#rootbinderActors = source as (() => readonly RootbinderEnvironmentActor[]) | undefined;
    if (slot === "rootbound") this.#rootboundActors = source as (() => readonly RootboundEnvironmentActor[]) | undefined;
  }
  clear(environment: EnvironmentFeatureContext): void {
    for (const actor of this.#rootboundActors?.() ?? []) { actor.applyGraftEffects?.(ROOTBOUND_NO_GRAFT_EFFECTS); actor.completeRootCage?.(); }
    this.#rootbinderNetworks.clear(); this.#rootbinderLeashes.clear(); this.#rootbinderRedistribution.clear(); this.#rootbinderGenerations.clear(); this.#rootlineFields.clear(); this.#rootlineHitFields.clear();
    void environment;
  }
  replace(environment: EnvironmentFeatureContext): void {
    this.#rootbinderNetworks.clear(); this.#rootbinderLeashes.clear(); this.#rootbinderRedistribution.clear(); this.#rootlineFields.clear(); this.#rootlineHitFields.clear();
    const networks = new Map<string, string[]>();
    for (const object of environment.combatObjects()) {
      if (object.kind !== "root-link" || object.ownerId === null || object.state === "destroyed" || object.state === "expired") continue;
      if ("playerId" in object) this.#rootbinderLeashes.set(object.ownerId, object.id);
      else networks.set(object.ownerId, [...(networks.get(object.ownerId) ?? []), object.id]);
    }
    for (const [ownerId, ids] of networks) this.#rootbinderNetworks.set(ownerId, Object.freeze(ids));
  }
  combatObjectUpdated(environment: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void { if (isGraftAnchorState(object) && object.ownerId !== null) this.#applyGraftEffects(environment, object.ownerId); }
  combatObjectRemoved(environment: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void { if (isGraftAnchorState(object) && object.ownerId !== null) this.#applyGraftEffects(environment, object.ownerId); }

  step(environment: EnvironmentFeatureContext, tick: number, seconds: number): void {
    for (const field of environment.fields()) {
      if (!isBloomWellState(field)) continue;
      const result = advanceBloomWell(field, tick, environment.events); if (result !== field) environment.updateField(field.id, result);
      if (result.state === "active") for (const actor of this.#bloomActors?.() ?? []) applyBloomWellForce(result, actor, seconds);
    }
    this.#advanceRootbinder(environment, tick, seconds);
    this.#advanceRootbound(environment, tick);
  }

  #advanceRootbound(environment: EnvironmentFeatureContext, tick: number): void {
    const actors = this.#rootboundActors?.() ?? [];
    for (const actor of actors) {
      const stage = actor.state.stage; const state = stage === null ? "expired" : stage === "cleanup" ? "cooldown" : stage;
      let fieldId = this.#rootlineFields.get(actor.id);
      if (stage !== null && fieldId === undefined) { fieldId = environment.addField({ kind: "rootline", geometry: actor.state.geometry, state, stateTick: tick, timer: 0, ownerId: actor.id, schedule: null, eligibility: { player: true, enemies: false, bosses: false }, force: null, cleanupReason: null, patternId: "rootbound-rootline" }); this.#rootlineFields.set(actor.id, fieldId); }
      else if (stage !== null && fieldId !== undefined) { const prior = environment.fields().find((field) => field.id === fieldId); if (prior !== undefined) environment.updateField(fieldId, { state, stateTick: tick, geometry: actor.state.geometry }); }
      if (stage === "active" && fieldId !== undefined && !this.#rootlineHitFields.has(fieldId)) { const target = actor.player; const g = actor.state.geometry; if (target !== undefined && !target.invulnerable && target.x + target.hw >= g.x && target.x - target.hw <= g.x + g.w && target.y + target.hh >= g.y && target.y - target.hh <= g.y + g.h) { this.#rootlineHitFields.add(fieldId); target.takeDamage(actor.state.damage * target.hazardDamageMultiplier, g.x + g.w / 2, actor.source); } }
      if (stage === null && fieldId !== undefined) { const reason = actor.state.cleanupReason ?? "natural-expiry"; environment.updateField(fieldId, { state: "expired", stateTick: tick, cleanupReason: reason }); this.#rootlineFields.delete(actor.id); this.#rootlineHitFields.delete(fieldId); }
      const placements = actor.state.graftPlacements ?? []; const ownerPosition = actor.state.ownerPosition;
      if (ownerPosition !== undefined) for (const placement of placements) installGraftAnchor(environment, { ownerId: actor.id, ownerPosition, ...placement, createdTick: tick });
      const owned = environment.combatObjects().filter(isGraftAnchorState).filter((graft) => graft.ownerId === actor.id);
      if (placements.length === 0) {
        for (const graft of owned) if (graft.state !== "destroyed" && graft.state !== "expired") {
          environment.cleanupCombatObject(graft.id, "stage-transition", tick);
        }
      } else {
        for (const graft of owned) {
          const next = advanceGraftAnchor(graft, tick, actor.recoverGraftHealth);
          if (next !== graft) environment.updateCombatObject(graft.id, next);
        }
      }
      this.#applyGraftEffects(environment, actor.id);
      const patternId = actor.state.bloomPattern; const arena = actor.state.arena;
      this.#pruneDormantBloomPatterns(environment, actor.id, patternId);
      if (patternId !== null && patternId !== undefined && arena !== undefined) installRootboundBloomPattern(environment, { patternId, bossOwnerId: actor.id, startTick: tick, arenaWidth: arena.width, groundY: arena.groundY });
      this.#advanceCage(environment, actor, tick);
      this.#advanceRegrowth(environment, actor, tick);
    }
    for (const [ownerId, fieldId] of this.#rootlineFields) if (!actors.some((actor) => actor.id === ownerId)) { environment.updateField(fieldId, { state: "expired", stateTick: tick, cleanupReason: "stage-transition" }); this.#rootlineFields.delete(ownerId); this.#rootlineHitFields.delete(fieldId); }
  }

  #advanceRegrowth(environment: EnvironmentFeatureContext, actor: RootboundEnvironmentActor, tick: number): void {
    const regrowth = actor.state.regrowth, arena = actor.state.arena, ownerPosition = actor.state.ownerPosition; if (actor.state.phase !== 3 || regrowth === undefined || arena === undefined || ownerPosition === undefined) return;
    if (regrowth.phase === "idle") { const rootNodes = [{ id: "left-remnant", x: arena.width * .18, y: arena.groundY }, { id: "heart-root", x: arena.width * .5, y: arena.groundY }, { id: "right-remnant", x: arena.width * .82, y: arena.groundY }]; const bundle = createRootboundRegrowthConnections({ ownerId: actor.id, ownerPosition, rootNodes, startTick: tick }); const ids = bundle.combatObjects.map((object) => object.id); if (actor.beginRegrowth?.(tick, ids) !== true) return; for (const object of bundle.combatObjects) environment.addCombatObject(object); for (const route of bundle.routes) environment.addRoute(route); return; }
    if (regrowth.phase !== "channeling") return; const active = new Set(regrowth.requiredConnectionIds.filter((id: string) => environment.combatObjects().some((object) => object.id === id && object.state !== "destroyed" && object.state !== "expired"))); const resolved = actor.advanceRegrowth?.(tick, active, false); if (resolved?.phase !== "resolved") return; for (const id of resolved.requiredConnectionIds) { const object = environment.combatObjects().find((entry) => entry.id === id); if (object !== undefined && object.state !== "destroyed" && object.state !== "expired") environment.cleanupCombatObject(id, "natural-expiry", tick); const route = environment.routes().find((entry) => entry.id === `${id}:route`); if (route !== undefined && route.state !== "destroyed" && route.state !== "expired") environment.updateRoute(route.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" }); }
  }
  #advanceCage(environment: EnvironmentFeatureContext, actor: RootboundEnvironmentActor, tick: number): void {
    const request = actor.state.rootCagePlacement; const owned = environment.combatObjects().filter(isRootCageState).filter((boundary) => boundary.ownerId === actor.id); if (request === null || request === undefined) { for (const boundary of owned) if (boundary.state !== "destroyed" && boundary.state !== "expired") environment.cleanupCombatObject(boundary.id, "stage-transition", tick); return; }
    const rootCageId = `${actor.id}:root-cage:g${String(request.sequence)}`; let matching = owned.filter((boundary) => boundary.rootCageId === rootCageId); if (matching.length === 0) { for (const boundary of owned) if (boundary.state === "destroyed" || boundary.state === "expired") environment.removeCombatObject(boundary.id); installRootCage(environment, actor.id, request, tick); matching = environment.combatObjects().filter(isRootCageState).filter((boundary) => boundary.rootCageId === rootCageId); }
    for (const boundary of matching) { const next = advanceRootCage(boundary, tick); if (next !== boundary) environment.updateCombatObject(boundary.id, next); }
    if (!environment.combatObjects().filter(isRootCageState).some((boundary) => boundary.rootCageId === rootCageId && boundary.state !== "destroyed" && boundary.state !== "expired")) actor.completeRootCage?.();
  }

  #advanceRootbinder(environment: EnvironmentFeatureContext, tick: number, seconds: number): void {
    const actors = this.#rootbinderActors?.() ?? [], present = new Set<string>();
    for (const actor of actors) {
      present.add(actor.id); const existing = this.#rootbinderNetworks.get(actor.id);
      if (actor.state.state === "linked" && existing === undefined) { this.#prune(environment, actor.id); const segments = installRootNetwork(environment, { id: this.#nextId(actor.id, "network"), worldId: environment.worldId, stageId: environment.stageId, ownerId: actor.id, sourceX: actor.state.x, sourceY: actor.state.y, maxLength: actor.state.tuning.lineMaxLength, tuning: actor.state.tuning }, actor.candidates, { activeNetworks: 0, activePlayerLeashes: this.#rootbinderLeashes.size, limits: actor.state.tuning }); if (segments.length > 0) { this.#rootbinderNetworks.set(actor.id, Object.freeze(segments.map((s) => s.id))); for (const segment of segments) if (environment.events) publishEnvironmentEvent(environment.events, { event: "combat-object-link-created", objectId: segment.id, category: "combat-object", objectKind: segment.kind }, tick); } }
      else if (existing !== undefined && actor.state.state === "linked") { let active = false; for (const id of existing) { const segment = environment.combatObjects().find((entry) => entry.id === id); const candidate = segment === undefined ? undefined : actor.candidates.find((value) => value.id === segment.targetId); if (segment && candidate) active ||= this.#refresh(environment, segment, actor, candidate, tick, seconds); else if (segment && segment.state !== "destroyed" && segment.state !== "expired") environment.cleanupCombatObject(segment.id, "natural-expiry", tick); } if (!active) this.#rootbinderNetworks.delete(actor.id); }
      else if (existing !== undefined) { for (const id of existing) { const object = environment.combatObjects().find((entry) => entry.id === id); if (object && object.state !== "destroyed" && object.state !== "expired") environment.cleanupCombatObject(id, actor.state.state === "broken" ? "natural-expiry" : "stage-transition", tick); } this.#rootbinderNetworks.delete(actor.id); }
      const player = actor.player; let leashId = this.#rootbinderLeashes.get(actor.id); const useful = this.#rootbinderNetworks.has(actor.id) || createRootNetwork({ id: `${actor.id}:probe`, worldId: environment.worldId, stageId: environment.stageId, ownerId: actor.id, sourceX: actor.state.x, sourceY: actor.state.y, tuning: actor.state.tuning }, actor.candidates).length > 0;
      if (!useful && player && player.alive && (actor.state.state === "link-warning" || actor.state.state === "linked")) { if (leashId === undefined && this.#rootbinderLeashes.size < actor.state.tuning.maxPlayerLeashes) { this.#prune(environment, actor.id); const leash = createElasticLeash({ id: this.#nextId(actor.id, "leash"), worldId: environment.worldId, stageId: environment.stageId, sourceId: actor.id, playerId: player.id, sourceX: actor.state.x, sourceY: actor.state.y, playerX: player.x, playerY: player.y, radius: actor.state.tuning.leashRadius, tuning: actor.state.tuning }); environment.addCombatObject(leash); this.#rootbinderLeashes.set(actor.id, leash.id); leashId = leash.id; } else { const leash = environment.combatObjects().find((entry) => entry.id === leashId) as ElasticLeash | undefined; if (leash) { const valid = isElasticLeashValid(leash, { worldId: environment.worldId, stageId: environment.stageId, currentTick: tick, expiryTick: actor.state.transitionTick, sourceAlive: true, playerAlive: player.alive, severed: leash.state === "destroyed" }); if (!valid) { environment.cleanupCombatObject(leash.id, "natural-expiry", tick); this.#rootbinderLeashes.delete(actor.id); } else { const active = actor.state.state === "linked"; if (active && leash.state === "warning") environment.updateCombatObject(leash.id, { state: "active", stateTick: tick }); const geometry = { x: actor.state.x, y: actor.state.y, radius: actor.state.tuning.leashRadius, points: [{ x: actor.state.x, y: actor.state.y }, { x: player.x, y: player.y }] }; environment.updateCombatObject(leash.id, { geometry }); if (active) player.apply(applyElasticLeashForce({ ...leash, state: "active", geometry }, player, seconds)); } } } }
      else if (leashId !== undefined) { const leash = environment.combatObjects().find((entry) => entry.id === leashId); if (leash && leash.state !== "destroyed" && leash.state !== "expired") environment.cleanupCombatObject(leash.id, player?.alive === false ? "defeat" : "stage-transition", tick); this.#rootbinderLeashes.delete(actor.id); }
    }
    for (const [ownerId, ids] of this.#rootbinderNetworks) if (!present.has(ownerId)) { for (const id of ids) { const object = environment.combatObjects().find((entry) => entry.id === id); if (object && object.state !== "destroyed" && object.state !== "expired") environment.cleanupCombatObject(id, "defeat", tick); } this.#rootbinderNetworks.delete(ownerId); }
  }
  #refresh(environment: EnvironmentFeatureContext, segment: EnvironmentCombatObjectState, actor: RootbinderEnvironmentActor, candidate: RootbinderCandidate, tick: number, seconds: number): boolean { if (segment.state === "destroyed" || segment.state === "expired") return false; const valid = isRootbinderLineValid({ worldId: environment.worldId, stageId: environment.stageId, targetWorldId: candidate.worldId, targetStageId: candidate.stageId, sourceX: actor.state.x, sourceY: actor.state.y, targetX: candidate.x, targetY: candidate.y, maxLength: actor.state.tuning.lineMaxLength }); if (!valid || candidate.dead || candidate.dying || candidate.geometryValid === false) { environment.cleanupCombatObject(segment.id, "natural-expiry", tick); return false; } environment.updateCombatObject(segment.id, { geometry: { x: actor.state.x, y: actor.state.y, points: [{ x: actor.state.x, y: actor.state.y }, { x: candidate.x, y: candidate.y }] } }); const edgeDistance = Math.max(0, Math.hypot(candidate.x - actor.state.x, candidate.y - actor.state.y) - actor.state.tuning.lineMaxLength * 0.75); if (edgeDistance === 0) this.#rootbinderRedistribution.delete(segment.id); if (edgeDistance > 0 && candidate.applyVelocity !== undefined) { const prior = this.#rootbinderRedistribution.get(segment.id); const result = redistributeRootNetworkKnockback({ x: candidate.x, y: candidate.y, vx: candidate.vx ?? 0, vy: candidate.vy ?? 0, weight: candidate.weight ?? 1, maxRedistribution: actor.state.tuning.maxNetworkRedistribution, edgeDistance, seconds, ...(prior === undefined ? {} : { appliedImpulseX: prior.x, appliedImpulseY: prior.y }), directionX: actor.state.x - candidate.x, directionY: actor.state.y - candidate.y }); candidate.applyVelocity(result.vx, result.vy); this.#rootbinderRedistribution.set(segment.id, Object.freeze({ x: result.appliedImpulseX, y: result.appliedImpulseY })); } return true; }
  #nextId(ownerId: string, kind: "network" | "leash"): string { const generation = (this.#rootbinderGenerations.get(ownerId) ?? 0) + 1; this.#rootbinderGenerations.set(ownerId, generation); return `${ownerId}:${kind}:g${String(generation)}`; }
  #prune(environment: EnvironmentFeatureContext, ownerId: string): void { for (const object of [...environment.combatObjects()]) if (object.kind === "root-link" && object.ownerId === ownerId && (object.state === "destroyed" || object.state === "expired")) environment.removeCombatObject(object.id); }
  #pruneDormantBloomPatterns(environment: EnvironmentFeatureContext, ownerId: string, selectedPattern: RootboundBloomPatternId | null | undefined): void {
    const selectedPrefix = selectedPattern === null || selectedPattern === undefined ? null : `bloom-well/rootbound/${selectedPattern}/`;
    for (const field of [...environment.fields()]) {
      if (!isBloomWellState(field) || field.variant !== "boss" || field.bossOwnerId !== ownerId || field.state !== "dormant") continue;
      if (selectedPrefix === null || field.patternId?.startsWith(selectedPrefix) !== true) environment.removeField(field.id);
    }
  }
  #applyGraftEffects(environment: EnvironmentFeatureContext, ownerId: string): void {
    const actor = this.#rootboundActors?.().find((candidate) => candidate.id === ownerId);
    actor?.applyGraftEffects?.(resolveRootboundGraftEffects(environment.combatObjects(), ownerId));
  }
  resolveCollisions(environment: EnvironmentFeatureContext): void {
    if ([...this.#rootbinderLeashes.values()].some((id) => environment.combatObjects().some((object) => object.id === id && object.state === "active"))) return;
    for (const actor of this.#rootboundActors?.() ?? []) { const target = actor.player, request = actor.state.rootCagePlacement; if (!target || !request) continue; const rootCageId = `${actor.id}:root-cage:g${String(request.sequence)}`; let x = target.x, vx = target.vx ?? 0; for (const boundary of environment.combatObjects().filter(isRootCageState).filter((entry) => entry.rootCageId === rootCageId && entry.state === "active")) { const width = boundary.geometry.w ?? 0, height = boundary.geometry.h ?? 0; if (target.y + target.hh <= boundary.geometry.y || target.y - target.hh >= boundary.geometry.y + height) continue; if (boundary.boundarySide === "left") { const edge = boundary.geometry.x + width; if (x - target.hw < edge && x + target.hw > boundary.geometry.x) { x = edge + target.hw; vx = Math.max(0, vx); } } else { const edge = boundary.geometry.x; if (x + target.hw > edge && x - target.hw < boundary.geometry.x + width) { x = edge - target.hw; vx = Math.min(0, vx); } } } if ((x !== target.x || vx !== (target.vx ?? 0)) && target.applyCageConstraint) target.applyCageConstraint(x, vx); }
  }
}

export interface RootbinderEnvironmentActor {
  readonly id: string; readonly state: RootbinderState; readonly candidates: readonly RootbinderCandidate[];
  readonly player?: Readonly<{ id: string; x: number; y: number; vx: number; vy: number; jumpEnabled: boolean;
    dashEnabled: boolean; alive: boolean; apply: (value: { readonly vx: number; readonly vy: number }) => void }>;
}
export interface RootboundEnvironmentActor {
  readonly id: string; readonly source: unknown;
  readonly state: Readonly<{ stage: "warning" | "active" | "cleanup" | null;
    geometry: Readonly<{ x: number; y: number; w: number; h: number }>; damage: number;
    cleanupReason: "natural-expiry" | "stage-transition" | null;
    graftPlacements?: readonly GraftAnchorPlacementRequest[];
    ownerPosition?: Readonly<{ x: number; y: number }>; bloomPattern?: RootboundBloomPatternId | null;
    rootCagePlacement?: RootCagePlacementRequest | null;
    arena?: Readonly<{ width: number; groundY: number }>; phase?: number; regrowth?: RootboundRegrowthState }>;
  readonly applyGraftEffects?: (effects: RootboundGraftEffects) => void; readonly recoverGraftHealth?: (fraction: number) => number;
  readonly completeRootCage?: () => void; readonly beginRegrowth?: (startTick: number, ids: readonly string[]) => boolean;
  readonly advanceRegrowth?: (tick: number, ids: ReadonlySet<string>, broken?: boolean) => RootboundRegrowthState;
  readonly player?: Readonly<{ x: number; y: number; vx?: number; hw: number; hh: number; invulnerable: boolean;
    hazardDamageMultiplier: number; takeDamage: (damage: number, sourceX: number, source: unknown) => void;
    applyCageConstraint?: (x: number, vx: number) => void }>;
}

export function createVerdantEnvironmentFeature(): VerdantEnvironmentFeature { return new VerdantEnvironmentFeature(); }
