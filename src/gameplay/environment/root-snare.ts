import type { BossTell } from "../entities/boss-tells";
import type { EnvironmentCombatObjectState } from "./environment-contracts";
import { environmentObjectDefinition } from "./environment-definitions";
import type { EnvironmentFeatureContext } from "./environment-feature-ports";
import { rootLinkGeometry } from "../entities/rootbinder-runtime";

/**
 * The root snare: a planted enemy marks the ground where the player stands, the mark closes, and roots come
 * up there. A player still standing in it is held near that spot by a root until it is cut or lets go. The
 * mark is aimed at a place, never at the player, so it can always be walked out of. Every number is here.
 */
export const ROOT_SNARE_RULES = Object.freeze({
  ticksPerSecond: 120,
  /** How long after planting the first mark comes, and how long after each mark the next one does. */
  firstDelaySeconds: 1.5,
  intervalSeconds: 6,
  /** The player must stand on the ground within this distance of the enemy to be marked. */
  reach: 420,
  /** Half the mark's width, and how far above the marked ground a player's feet still count as in it. */
  ringHalfWidth: 65,
  catchHeight: 40,
  /** The warning, the time the roots stay up to catch, and the longest a caught player is held. */
  warningTicks: 108,
  eruptTicks: 24,
  holdTicks: 240,
  /** A held player cannot move further than this, left or right, from where they were caught. */
  holdRadius: 70,
  /** After a hold ends, however it ends, no snare can mark the player again for this long. */
  immunityTicks: 360,
});

/** The actor id a snare names as its target. */
export const ROOT_SNARE_TARGET_ID = "player";

export type RootSnarePhase = "warning" | "erupting" | "holding";

/** A snare as a stage object: the shared severable root-link, with where it was aimed and how far along it is. */
export interface RootSnareState extends EnvironmentCombatObjectState {
  readonly factoryId: "root-link";
  readonly kind: "root-link";
  readonly patternId: "root-snare";
  readonly snarePhase: RootSnarePhase;
  /** The marked spot: its centre and the ground height there. */
  readonly ringX: number;
  readonly ringY: number;
  /** 0 when the mark appears, 1 when it closes. */
  readonly warningProgress: number;
  /** Where the player was caught; the hold is measured from here. */
  readonly anchorX: number;
}

export function isRootSnareState(value: EnvironmentCombatObjectState): value is RootSnareState {
  return value.kind === "root-link" && value.patternId === "root-snare";
}

function ringGeometry(ringX: number, ringY: number): EnvironmentCombatObjectState["geometry"] {
  const rules = ROOT_SNARE_RULES;
  return Object.freeze({
    x: ringX - rules.ringHalfWidth,
    y: ringY - rules.catchHeight,
    w: rules.ringHalfWidth * 2,
    h: rules.catchHeight,
  });
}

/** A new snare in its warning: a mark on the ground at `ring`, owned by the enemy that placed it. */
export function createRootSnare(
  input: Readonly<{ id: string; ownerId: string; tick: number; ring: Readonly<{ x: number; y: number }> }>,
): RootSnareState {
  return Object.freeze({
    id: input.id,
    factoryId: "root-link" as const,
    kind: "root-link" as const,
    patternId: "root-snare" as const,
    ownerId: input.ownerId,
    targetId: ROOT_SNARE_TARGET_ID,
    geometry: ringGeometry(input.ring.x, input.ring.y),
    integrity: 1,
    maxIntegrity: 1,
    counterplayTags: environmentObjectDefinition("root-link").counterplayTags,
    procEligible: false,
    damageDedupeId: `${input.id}:damage`,
    state: "warning" as const,
    stateTick: input.tick,
    cleanupReason: null,
    snarePhase: "warning" as const,
    ringX: input.ring.x,
    ringY: input.ring.y,
    warningProgress: 0,
    anchorX: input.ring.x,
  });
}

/** True when the feet of someone at `x` with their feet at `feetY` are inside the mark. */
export function rootSnareCatches(snare: RootSnareState, x: number, feetY: number): boolean {
  const rules = ROOT_SNARE_RULES;
  return Math.abs(x - snare.ringX) <= rules.ringHalfWidth && Math.abs(feetY - snare.ringY) <= rules.catchHeight;
}

/** Where a held player may stand: the nearest place to `x` inside the hold. */
export function rootSnareHeldX(snare: RootSnareState, x: number): number {
  return Math.max(
    snare.anchorX - ROOT_SNARE_RULES.holdRadius,
    Math.min(snare.anchorX + ROOT_SNARE_RULES.holdRadius, x),
  );
}

/**
 * The snare's mark in the shared tell format the bosses use, or null once it holds (a held player sees the
 * root, not a mark). It never hurts, so `damaging` is false; its lead is the full warning.
 */
export function rootSnareTell(snare: RootSnareState): BossTell | null {
  if (snare.snarePhase === "holding" || snare.state === "destroyed" || snare.state === "expired") return null;
  const rules = ROOT_SNARE_RULES;
  const leadSeconds = rules.warningTicks / rules.ticksPerSecond;
  const warning = snare.snarePhase === "warning";
  return Object.freeze({
    id: snare.id,
    attackId: "root-snare",
    mark: "reticle" as const,
    stage: warning ? ("warning" as const) : ("active" as const),
    x: snare.ringX,
    y: snare.ringY - rules.catchHeight / 2,
    hw: rules.ringHalfWidth,
    hh: rules.catchHeight / 2,
    leadSeconds,
    remainingSeconds: warning ? leadSeconds * (1 - snare.warningProgress) : 0,
    damaging: false,
  });
}

/** The player as a snare acts on them. */
export interface RootSnarePlayer {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly hh: number;
  readonly onGround: boolean;
  readonly alive: boolean;
  /** Puts the held player at `x` with horizontal speed `vx`. */
  hold(x: number, vx: number): void;
}

/** An enemy that can snare, as the stage-object layer sees it. */
export interface RootSnareSource {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** It stands planted: a snare lives only while its owner does. */
  readonly planted: boolean;
  /** Its own clock says it may mark now (it is not held back by a wave opening grace). */
  readonly snareReady: boolean;
  readonly snareStarted: () => void;
  readonly player?: RootSnarePlayer;
}

type SnareEnvironment = Pick<
  EnvironmentFeatureContext,
  "combatObjects" | "addCombatObject" | "updateCombatObject" | "cleanupCombatObject"
>;

function ended(object: EnvironmentCombatObjectState): boolean {
  return object.state === "destroyed" || object.state === "expired";
}

/**
 * Owns every snare of one world: at most one on the player at a time, whoever placed it, and none for
 * `immunityTicks` after a hold ends. A biome feature steps it with the enemies that can snare.
 */
export class RootSnares {
  /** The live snare each owner has, by stage-object id. */
  readonly #live = new Map<string, string>();
  #immuneUntilTick = 0;

  clear(): void {
    this.#live.clear();
    this.#immuneUntilTick = 0;
  }

  /** Picks the live snares up again from restored stage objects. */
  replace(objects: readonly EnvironmentCombatObjectState[]): void {
    this.clear();
    for (const object of objects)
      if (isRootSnareState(object) && object.ownerId !== null && !ended(object))
        this.#live.set(object.ownerId, object.id);
  }

  /** The live snare of this owner, if it has one. */
  liveId(ownerId: string): string | undefined {
    return this.#live.get(ownerId);
  }

  /**
   * One tick of every snare. Returns the owners whose snare the player cut this tick, and the snare that
   * began this tick (for the caller to announce), if one did.
   */
  advance(
    environment: SnareEnvironment,
    tick: number,
    sources: readonly RootSnareSource[],
  ): Readonly<{ cutOwners: readonly string[]; started: RootSnareState | null }> {
    const rules = ROOT_SNARE_RULES;
    const cutOwners: string[] = [];
    for (const [ownerId, id] of [...this.#live]) {
      const snare = environment.combatObjects().find((entry) => entry.id === id);
      const release = (held: boolean): void => {
        this.#live.delete(ownerId);
        if (held) this.#immuneUntilTick = tick + rules.immunityTicks;
      };
      if (snare === undefined || !isRootSnareState(snare) || snare.state === "expired") {
        release(false);
        continue;
      }
      const holding = snare.snarePhase === "holding";
      if (snare.state === "destroyed") {
        // "destroyed" with no cleanup reason is the cut by the player.
        if (snare.cleanupReason === null) cutOwners.push(ownerId);
        release(holding);
        continue;
      }
      const owner = sources.find((source) => source.id === ownerId);
      const player = owner?.player;
      const end = (reason: "natural-expiry" | "defeat"): void => {
        environment.cleanupCombatObject(id, reason, tick);
        release(holding);
      };
      if (owner === undefined) end("defeat");
      else if (player === undefined || !owner.planted || !player.alive) end("natural-expiry");
      else if (snare.snarePhase === "warning") {
        const elapsed = tick - snare.stateTick;
        if (elapsed < rules.warningTicks)
          environment.updateCombatObject(id, { warningProgress: elapsed / rules.warningTicks });
        else
          environment.updateCombatObject(id, {
            state: "active",
            stateTick: tick,
            snarePhase: "erupting",
            warningProgress: 1,
          });
      } else if (snare.snarePhase === "erupting") {
        if (rootSnareCatches(snare, player.x, player.y + player.hh))
          environment.updateCombatObject(id, {
            stateTick: tick,
            snarePhase: "holding",
            anchorX: player.x,
            geometry: rootLinkGeometry(owner, player),
          });
        else if (tick - snare.stateTick >= rules.eruptTicks) end("natural-expiry");
      } else if (tick - snare.stateTick >= rules.holdTicks) end("natural-expiry");
      else environment.updateCombatObject(id, { geometry: rootLinkGeometry(owner, player) });
    }
    return { cutOwners, started: this.#begin(environment, tick, sources) };
  }

  #begin(environment: SnareEnvironment, tick: number, sources: readonly RootSnareSource[]): RootSnareState | null {
    if (this.#live.size > 0 || tick < this.#immuneUntilTick) return null;
    for (const source of sources) {
      const player = source.player;
      if (!source.planted || !source.snareReady || player === undefined || !player.alive || !player.onGround) continue;
      if (Math.hypot(player.x - source.x, player.y - source.y) > ROOT_SNARE_RULES.reach) continue;
      const snare = createRootSnare({
        id: `${source.id}:snare:t${String(tick)}`,
        ownerId: source.id,
        tick,
        ring: { x: player.x, y: player.y + player.hh },
      });
      environment.addCombatObject(snare);
      this.#live.set(source.id, snare.id);
      source.snareStarted();
      return snare;
    }
    return null;
  }

  /** Keeps a held player inside the hold, on the ground and in the air alike. */
  hold(environment: SnareEnvironment, sources: readonly RootSnareSource[]): void {
    for (const [ownerId, id] of this.#live) {
      const snare = environment.combatObjects().find((entry) => entry.id === id);
      const player = sources.find((source) => source.id === ownerId)?.player;
      if (snare === undefined || !isRootSnareState(snare) || player === undefined) continue;
      if (snare.snarePhase !== "holding" || snare.state !== "active") continue;
      const x = rootSnareHeldX(snare, player.x);
      if (x === player.x) continue;
      // Stopped at the edge: speed that would carry them further out is taken away.
      const outward = Math.sign(player.x - snare.anchorX);
      player.hold(x, outward > 0 ? Math.min(0, player.vx) : Math.max(0, player.vx));
    }
  }
}
