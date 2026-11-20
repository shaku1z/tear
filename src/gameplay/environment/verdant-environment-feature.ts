import type { EnvironmentFeature, EnvironmentFeatureContext } from "./environment-feature-ports";
import {
  applyBloomWellForce,
  advanceBloomWell,
  bloomWellContains,
  installRootboundBloomPattern,
  isBloomWellState,
  type BloomWellActor,
  type RootboundBloomPatternId,
} from "./bloom-well";
import {
  chooseRootTargets,
  createRootLink,
  ROOTBINDER_RULES,
  rootLinkGeometry,
  type RootbinderAlly,
  type RootbinderPhase,
} from "../entities/rootbinder-runtime";
import {
  advanceGraftAnchor,
  installGraftAnchor,
  isGraftAnchorState,
  resolveRootboundGraftEffects,
  ROOTBOUND_NO_GRAFT_EFFECTS,
  type GraftAnchorPlacementRequest,
  type GraftAnchorType,
  type RootboundGraftEffects,
} from "./graft-anchor";
import { isRootSnareState, RootSnares, type RootSnarePlayer, type RootSnareSource } from "./root-snare";
import { advanceRootCage, installRootCage, isRootCageState, type RootCagePlacementRequest } from "./root-cage";
import { createRootboundRegrowthConnections, type RootboundRegrowthState } from "./regrowth-link";
import { publishEnvironmentEvent } from "./environment-events";
import type { EnvironmentCombatObjectState } from "./environment-contracts";

/** Verdant-only environment behavior, late-bound behind the neutral kernel port. */
export class VerdantEnvironmentFeature implements EnvironmentFeature {
  readonly id = "verdant";
  isActive(environment: EnvironmentFeatureContext): boolean {
    return (
      environment.stageId === "verdant-sanctum" ||
      environment.fields().some((field) => field.kind === "bloom-well") ||
      environment.combatObjects().some((object) => object.kind === "graft-anchor" || object.kind === "root-link") ||
      environment.routes().some((route) => route.kind === "regrowth-link") ||
      (this.#rootbinderActors?.().length ?? 0) > 0 ||
      (this.#rootboundActors?.().length ?? 0) > 0
    );
  }
  claimsField(field: ReturnType<EnvironmentFeatureContext["fields"]>[number]): boolean {
    return isBloomWellState(field);
  }
  #bloomActors: (() => readonly BloomWellActor[]) | undefined;
  #rootbinderActors: (() => readonly RootbinderEnvironmentActor[]) | undefined;
  #rootboundActors: (() => readonly RootboundEnvironmentActor[]) | undefined;
  /** The live roots each planted Rootbinder holds, and how many of this planting's roots the player has cut. */
  readonly #rootLinks = new Map<string, readonly string[]>();
  readonly #rootCuts = new Map<string, number>();
  readonly #snares = new RootSnares();
  readonly #rootbinderGenerations = new Map<string, number>();

  setActorSource(slot: string, source: (() => readonly unknown[]) | undefined): void {
    if (slot === "bloom-well") this.#bloomActors = source as (() => readonly BloomWellActor[]) | undefined;
    if (slot === "rootbinder")
      this.#rootbinderActors = source as (() => readonly RootbinderEnvironmentActor[]) | undefined;
    if (slot === "rootbound")
      this.#rootboundActors = source as (() => readonly RootboundEnvironmentActor[]) | undefined;
  }
  clear(environment: EnvironmentFeatureContext): void {
    for (const actor of this.#rootboundActors?.() ?? []) {
      actor.applyGraftEffects?.(ROOTBOUND_NO_GRAFT_EFFECTS);
      actor.completeRootCage?.();
    }
    this.#rootLinks.clear();
    this.#rootCuts.clear();
    this.#snares.clear();
    this.#rootbinderGenerations.clear();
    void environment;
  }
  replace(environment: EnvironmentFeatureContext): void {
    this.#rootLinks.clear();
    this.#rootCuts.clear();
    this.#snares.replace(environment.combatObjects());
    const networks = new Map<string, string[]>();
    for (const object of environment.combatObjects()) {
      if (
        object.kind !== "root-link" ||
        isRootSnareState(object) ||
        object.ownerId === null ||
        object.state === "destroyed" ||
        object.state === "expired"
      )
        continue;
      if (object.targetId !== null) networks.set(object.ownerId, [...(networks.get(object.ownerId) ?? []), object.id]);
    }
    for (const [ownerId, ids] of networks) this.#rootLinks.set(ownerId, Object.freeze(ids));
  }
  combatObjectUpdated(environment: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void {
    if (object.ownerId === null) return;
    // "destroyed" is the player's cut; cleanup ends an object as "expired".
    const cut = object.state === "destroyed";
    if (isGraftAnchorState(object)) {
      this.#applyGraftEffects(environment, object.ownerId);
      if (cut) this.#rootbound(object.ownerId)?.graftSevered?.(object.graftType);
    } else if (cut && isRootCageState(object)) this.#rootbound(object.ownerId)?.cageSevered?.();
  }
  combatObjectRemoved(environment: EnvironmentFeatureContext, object: EnvironmentCombatObjectState): void {
    if (isGraftAnchorState(object) && object.ownerId !== null) this.#applyGraftEffects(environment, object.ownerId);
  }

  step(environment: EnvironmentFeatureContext, tick: number, seconds: number): void {
    const bossPresent = (this.#rootboundActors?.().length ?? 0) > 0;
    for (const field of environment.fields()) {
      if (!isBloomWellState(field)) continue;
      // The Rootbound authors its own Wells; recurring stage Wells end and leave the arena to it.
      if (bossPresent && field.variant === "stage" && field.cleanupReason === null) {
        environment.updateField(field.id, {
          state: "expired",
          stateTick: tick,
          transitionTick: tick,
          cleanupReason: "stage-transition",
        });
        continue;
      }
      const result = advanceBloomWell(field, tick, environment.events);
      if (result !== field) environment.updateField(field.id, result);
      if (result.state === "active")
        for (const actor of this.#bloomActors?.() ?? []) applyBloomWellForce(result, actor, seconds);
    }
    this.#advanceRootbinder(environment, tick);
    this.#advanceRootbound(environment, tick);
  }

  #advanceRootbound(environment: EnvironmentFeatureContext, tick: number): void {
    const actors = this.#rootboundActors?.() ?? [];
    for (const actor of actors) {
      const placements = actor.state.graftPlacements ?? [];
      // The boss lists the Grafts it wants; each is planted once, and again only after the boss asks again.
      const planted = actor.state.plantedGraftTypes ?? [];
      for (const placement of placements) {
        if (planted.includes(placement.graftType)) continue;
        if (installGraftAnchor(environment, { ownerId: actor.id, ...placement, createdTick: tick }) !== null)
          actor.acknowledgeGraftPlanted?.(placement.graftType);
      }
      const owned = environment
        .combatObjects()
        .filter(isGraftAnchorState)
        .filter((graft) => graft.ownerId === actor.id);
      // A standing Graft the boss did not ask for is one restored into the fight: the boss adopts it, or
      // (after Phase II, or once the encounter is cleaned up) it goes.
      for (const graft of owned) {
        if (graft.state === "destroyed" || graft.state === "expired") continue;
        const wanted =
          placements.some((entry) => entry.graftType === graft.graftType) ||
          actor.adoptGraft?.(graft.graftType, graft.geometry) === true;
        if (!wanted) environment.cleanupCombatObject(graft.id, "stage-transition", tick);
        else {
          const next = advanceGraftAnchor(graft, tick);
          if (next !== graft) environment.updateCombatObject(graft.id, next);
        }
      }
      this.#applyGraftEffects(environment, actor.id);
      this.#plantBloomPattern(environment, actor, tick);
      this.#advanceCage(environment, actor, tick);
      this.#advanceRegrowth(environment, actor, tick);
    }
  }

  #advanceRegrowth(environment: EnvironmentFeatureContext, actor: RootboundEnvironmentActor, tick: number): void {
    const regrowth = actor.state.regrowth,
      arena = actor.state.arena,
      ownerPosition = actor.state.ownerPosition;
    if (actor.state.phase !== 3 || regrowth === undefined || arena === undefined || ownerPosition === undefined) return;
    if (regrowth.phase === "idle") {
      // The links grow when the keeper's Regrowth move asks for them, at its tell.
      if (actor.state.regrowthCalled !== true) return;
      const rootNodes = [
        { id: "left-remnant", x: arena.width * 0.18, y: arena.groundY },
        { id: "heart-root", x: arena.width * 0.5, y: arena.groundY },
        { id: "right-remnant", x: arena.width * 0.82, y: arena.groundY },
      ];
      const bundle = createRootboundRegrowthConnections({
        ownerId: actor.id,
        ownerPosition,
        rootNodes,
        startTick: tick,
      });
      const ids = bundle.combatObjects.map((object) => object.id);
      if (actor.beginRegrowth?.(tick, ids) !== true) return;
      for (const object of bundle.combatObjects) environment.addCombatObject(object);
      for (const route of bundle.routes) environment.addRoute(route);
      return;
    }
    if (regrowth.phase !== "channeling") return;
    const active = new Set(
      regrowth.requiredConnectionIds.filter((id: string) =>
        environment
          .combatObjects()
          .some((object) => object.id === id && object.state !== "destroyed" && object.state !== "expired"),
      ),
    );
    const resolved = actor.advanceRegrowth?.(tick, active, false);
    if (resolved?.phase !== "resolved") return;
    for (const id of resolved.requiredConnectionIds) {
      const object = environment.combatObjects().find((entry) => entry.id === id);
      if (object !== undefined && object.state !== "destroyed" && object.state !== "expired")
        environment.cleanupCombatObject(id, "natural-expiry", tick);
      const route = environment.routes().find((entry) => entry.id === `${id}:route`);
      if (route !== undefined && route.state !== "destroyed" && route.state !== "expired")
        environment.updateRoute(route.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
    }
  }
  #advanceCage(environment: EnvironmentFeatureContext, actor: RootboundEnvironmentActor, tick: number): void {
    const request = actor.state.rootCagePlacement;
    const owned = environment
      .combatObjects()
      .filter(isRootCageState)
      .filter((boundary) => boundary.ownerId === actor.id);
    if (request === null || request === undefined) {
      for (const boundary of owned)
        if (boundary.state !== "destroyed" && boundary.state !== "expired")
          environment.cleanupCombatObject(boundary.id, "stage-transition", tick);
      return;
    }
    const rootCageId = `${actor.id}:root-cage:g${String(request.sequence)}`;
    let matching = owned.filter((boundary) => boundary.rootCageId === rootCageId);
    if (matching.length === 0) {
      installRootCage(environment, actor.id, request, tick);
      matching = environment
        .combatObjects()
        .filter(isRootCageState)
        .filter((boundary) => boundary.rootCageId === rootCageId);
    }
    for (const boundary of matching) {
      const next = advanceRootCage(boundary, tick);
      if (next !== boundary) environment.updateCombatObject(boundary.id, next);
    }
    if (
      !environment
        .combatObjects()
        .filter(isRootCageState)
        .some(
          (boundary) =>
            boundary.rootCageId === rootCageId && boundary.state !== "destroyed" && boundary.state !== "expired",
        )
    )
      actor.completeRootCage?.();
  }

  /**
   * Roots: a planted Rootbinder roots the nearest allies in reach, each root is a severable root-link, and a
   * rooted ally cannot be flung or lifted. A cut frees its ally (and launches it from an active Well); once
   * the player has cut a root, that planting grows no new ones, and with its last root gone it is uprooted.
   */
  #advanceRootbinder(environment: EnvironmentFeatureContext, tick: number): void {
    const actors = this.#rootbinderActors?.() ?? [];
    // Snares first: a snare the player cut counts as a cut root of its owner.
    const snares = this.#snares.advance(environment, tick, actors.map(snareSource));
    for (const ownerId of snares.cutOwners) this.#rootCuts.set(ownerId, (this.#rootCuts.get(ownerId) ?? 0) + 1);
    if (snares.started !== null) this.#announceLink(environment, snares.started, tick);
    const present = new Set<string>();
    const rooted = new Set<string>();
    for (const actor of actors) {
      present.add(actor.id);
      const planted = actor.phase === "planted";
      const live: string[] = [];
      let cuts = planted ? (this.#rootCuts.get(actor.id) ?? 0) : 0;
      for (const id of this.#rootLinks.get(actor.id) ?? []) {
        const link = environment.combatObjects().find((entry) => entry.id === id);
        if (link === undefined || link.state === "expired") continue;
        const ally = actor.allies.find((value) => value.id === link.targetId);
        if (link.state === "destroyed") {
          // "destroyed" with no cleanup reason is the player's cut.
          if (link.cleanupReason === null) {
            cuts += 1;
            if (ally !== undefined) this.#freeRootedAlly(environment, ally);
          }
          continue;
        }
        const held =
          planted &&
          ally?.rootable === true &&
          Math.hypot(ally.x - actor.x, ally.y - actor.y) <= ROOTBINDER_RULES.linkMaxLength;
        if (!held) {
          environment.cleanupCombatObject(id, "natural-expiry", tick);
          continue;
        }
        environment.updateCombatObject(id, { geometry: rootLinkGeometry(actor, ally) });
        live.push(id);
        rooted.add(ally.id);
      }
      if (planted && cuts > 0 && live.length === 0) {
        actor.uproot();
        cuts = 0;
      } else if (planted && cuts === 0) {
        const claimed = new Set(rooted);
        for (const object of environment.combatObjects())
          if (isRootLinkToAlly(object) && object.state === "active" && object.targetId !== null)
            claimed.add(object.targetId);
        const free = ROOTBINDER_RULES.maxLinks - live.length;
        for (const ally of chooseRootTargets(actor, actor.allies, claimed, free)) {
          const link = createRootLink({ id: this.#nextId(actor.id), ownerId: actor.id, tick, source: actor }, ally);
          environment.addCombatObject(link);
          live.push(link.id);
          rooted.add(ally.id);
          this.#announceLink(environment, link, tick);
        }
      }
      const held = Object.freeze(live);
      this.#rootLinks.set(actor.id, held);
      this.#rootCuts.set(actor.id, cuts);
      const snareId = this.#snares.liveId(actor.id);
      actor.reportLinks(snareId === undefined ? held : Object.freeze([...held, snareId]));
    }
    for (const [ownerId, ids] of this.#rootLinks)
      if (!present.has(ownerId)) {
        for (const id of ids) {
          const object = environment.combatObjects().find((entry) => entry.id === id);
          if (object && object.state !== "destroyed" && object.state !== "expired")
            environment.cleanupCombatObject(id, "defeat", tick);
        }
        this.#rootLinks.delete(ownerId);
        this.#rootCuts.delete(ownerId);
      }
    for (const actor of actors) for (const ally of actor.allies) ally.setRooted(rooted.has(ally.id));
  }
  #announceLink(environment: EnvironmentFeatureContext, link: EnvironmentCombatObjectState, tick: number): void {
    if (environment.events)
      publishEnvironmentEvent(
        environment.events,
        { event: "combat-object-link-created", objectId: link.id, category: "combat-object", objectKind: link.kind },
        tick,
      );
  }
  /** A cut root: its ally staggers, and one standing in an active Well is thrown up by it. */
  #freeRootedAlly(environment: EnvironmentFeatureContext, ally: RootbinderEnvironmentAlly): void {
    ally.stagger(ROOTBINDER_RULES.freedStaggerSeconds);
    const lifted = environment
      .fields()
      .some((field) => isBloomWellState(field) && field.state === "active" && bloomWellContains(field, ally.x, ally.y));
    if (lifted) ally.launch(ROOTBINDER_RULES.cutLaunchSpeed);
  }
  #nextId(ownerId: string): string {
    const generation = (this.#rootbinderGenerations.get(ownerId) ?? 0) + 1;
    this.#rootbinderGenerations.set(ownerId, generation);
    return `${ownerId}:root:g${String(generation)}`;
  }
  /**
   * Plants the boss's selected Well pattern once per selection; the boss records it. When the selection
   * changes, Wells of the old pattern that have not started yet end; running ones finish their cycle.
   */
  #plantBloomPattern(environment: EnvironmentFeatureContext, actor: RootboundEnvironmentActor, tick: number): void {
    const selected = actor.state.bloomPattern ?? null;
    if (selected === (actor.state.plantedBloomPattern ?? null)) return;
    for (const field of environment.fields())
      if (isBloomWellState(field) && field.bossOwnerId === actor.id && field.state === "dormant")
        environment.updateField(field.id, { state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
    const arena = actor.state.arena;
    if (selected !== null && arena !== undefined)
      installRootboundBloomPattern(environment, {
        patternId: selected,
        bossOwnerId: actor.id,
        startTick: tick,
        arenaWidth: arena.width,
        groundY: arena.groundY,
      });
    actor.acknowledgeBloomPattern?.(selected);
  }
  #rootbound(ownerId: string): RootboundEnvironmentActor | undefined {
    return this.#rootboundActors?.().find((candidate) => candidate.id === ownerId);
  }
  #applyGraftEffects(environment: EnvironmentFeatureContext, ownerId: string): void {
    this.#rootbound(ownerId)?.applyGraftEffects?.(resolveRootboundGraftEffects(environment.combatObjects(), ownerId));
  }
  resolveCollisions(environment: EnvironmentFeatureContext): void {
    this.#snares.hold(environment, (this.#rootbinderActors?.() ?? []).map(snareSource));
    for (const actor of this.#rootboundActors?.() ?? []) {
      const target = actor.player,
        request = actor.state.rootCagePlacement;
      if (!target || !request) continue;
      const rootCageId = `${actor.id}:root-cage:g${String(request.sequence)}`;
      let x = target.x,
        vx = target.vx ?? 0;
      for (const boundary of environment
        .combatObjects()
        .filter(isRootCageState)
        .filter((entry) => entry.rootCageId === rootCageId && entry.state === "active")) {
        const width = boundary.geometry.w ?? 0,
          height = boundary.geometry.h ?? 0;
        if (target.y + target.hh <= boundary.geometry.y || target.y - target.hh >= boundary.geometry.y + height)
          continue;
        if (boundary.boundarySide === "left") {
          const edge = boundary.geometry.x + width;
          if (x - target.hw < edge && x + target.hw > boundary.geometry.x) {
            x = edge + target.hw;
            vx = Math.max(0, vx);
          }
        } else {
          const edge = boundary.geometry.x;
          if (x + target.hw > edge && x - target.hw < boundary.geometry.x + width) {
            x = edge - target.hw;
            vx = Math.min(0, vx);
          }
        }
      }
      if ((x !== target.x || vx !== (target.vx ?? 0)) && target.applyCageConstraint) target.applyCageConstraint(x, vx);
    }
  }
}

/** An ally as a root acts on it: whether a root holds it, its stagger when cut free and its launch. */
export interface RootbinderEnvironmentAlly extends RootbinderAlly {
  setRooted(rooted: boolean): void;
  stagger(seconds: number): void;
  launch(speed: number): void;
}
export interface RootbinderEnvironmentActor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly phase: RootbinderPhase;
  /** Every other enemy in the arena, rootable or not. */
  readonly allies: readonly RootbinderEnvironmentAlly[];
  /** Tells the Rootbinder which roots it holds, by stage-object id. */
  readonly reportLinks: (ids: readonly string[]) => void;
  /** Called when the player has cut every root of this planting. */
  readonly uproot: () => void;
  /** Its own clock says it may snare now, and the call that restarts that clock. */
  readonly snareReady: boolean;
  readonly snareStarted: () => void;
  readonly player?: RootSnarePlayer;
}
function snareSource(actor: RootbinderEnvironmentActor): RootSnareSource {
  return {
    id: actor.id,
    x: actor.x,
    y: actor.y,
    planted: actor.phase === "planted",
    snareReady: actor.snareReady,
    snareStarted: actor.snareStarted,
    ...(actor.player === undefined ? {} : { player: actor.player }),
  };
}
function isRootLinkToAlly(object: EnvironmentCombatObjectState): boolean {
  return object.kind === "root-link" && !isRootSnareState(object);
}
export interface RootboundEnvironmentActor {
  readonly id: string;
  readonly source: unknown;
  readonly state: Readonly<{
    graftPlacements?: readonly GraftAnchorPlacementRequest[];
    plantedGraftTypes?: readonly string[];
    ownerPosition?: Readonly<{ x: number; y: number }>;
    bloomPattern?: RootboundBloomPatternId | null;
    plantedBloomPattern?: RootboundBloomPatternId | null;
    rootCagePlacement?: RootCagePlacementRequest | null;
    arena?: Readonly<{ width: number; groundY: number }>;
    phase?: number;
    regrowth?: RootboundRegrowthState;
    regrowthCalled?: boolean;
  }>;
  readonly applyGraftEffects?: (effects: RootboundGraftEffects) => void;
  /** The player cut a Graft of this type, or a Root Cage wall. */
  readonly graftSevered?: (graftType: string) => void;
  /** A Graft restored into the fight; true when the boss takes it as its own. */
  readonly adoptGraft?: (graftType: GraftAnchorType, geometry: GraftAnchorPlacementRequest["geometry"]) => boolean;
  readonly cageSevered?: () => void;
  readonly completeRootCage?: () => void;
  readonly acknowledgeGraftPlanted?: (graftType: string) => void;
  readonly acknowledgeBloomPattern?: (patternId: RootboundBloomPatternId | null) => void;
  readonly beginRegrowth?: (startTick: number, ids: readonly string[]) => boolean;
  readonly advanceRegrowth?: (tick: number, ids: ReadonlySet<string>, broken?: boolean) => RootboundRegrowthState;
  readonly player?: Readonly<{
    x: number;
    y: number;
    vx?: number;
    hw: number;
    hh: number;
    applyCageConstraint?: (x: number, vx: number) => void;
  }>;
}

export function createVerdantEnvironmentFeature(): VerdantEnvironmentFeature {
  return new VerdantEnvironmentFeature();
}
