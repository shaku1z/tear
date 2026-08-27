/**
 * Native, presentation-independent gameplay facts emitted at authoritative
 * simulation boundaries. Replay formats consume these through outward
 * adapters; no replay version owns this contract. Stage facts retain the
 * numeric index for existing replay consumers while optionally carrying the
 * stable authored stage identity for new consumers.
 */
import type { StageId } from "../stages";

export type TearGameplayEvent =
  | Readonly<{
    kind: "run"; tick: number; transition: "started" | "paused" | "resumed" | "completed" | "defeated" | "abandoned";
    runId: string; mode: string; difficulty: string; weaponId: string; wave: number; score: number; runTimeSeconds: number;
    reason?: string;
  }>
  | Readonly<{ kind: "stage"; tick: number; stage: number; stageId?: StageId; transition?: "entered" | "exited" }>
  | Readonly<{ kind: "wave"; tick: number; wave: number; event: string }>
  | Readonly<{
    kind: "spawn"; tick: number; actorId: string; actorKind: string; x: number; y: number;
    variantName?: string; bossId?: string;
  }>
  | Readonly<{ kind: "death"; tick: number; actorId: string; cause: string }>
  | Readonly<{ kind: "loadout"; tick: number; choiceId: string; tier: number; wave: number }>
  /** Generic weapon transport facts.  Weapon-specific mechanics remain in the
   * authoritative state; this port records only the shared launch/resolve/catch
   * lifecycle that every production host already owns. */
  | Readonly<{
    kind: "weapon"; tick: number; event: "throw-launch" | "throw-resolved" | "catch";
    weaponId: string; throwId: number; x: number; y: number; damage?: number;
  }>
  /** Authoritative projectile lifecycle facts. These are emitted by the live
   * combat phase as it consumes real projectile state, never by replay tools. */
  | Readonly<{
    kind: "projectile"; tick: number; event: "spawned" | "deflected" | "owner-changed" | "hit" | "expired";
    projectileId: string; x: number; y: number; vx: number; vy: number;
    owner: "enemy" | "player"; sourceEnemyId?: string; targetEnemyId?: string; perfect?: boolean;
  }>
  /** A source-owned world transition.  It is intentionally separate from
   * presentation effects so replay consumers can retain causal custody. */
  | Readonly<{ kind: "world"; tick: number; event: "void-rescue"; x: number; y: number; lane: "lower" | "upper" | null; hp: number }>
  | Readonly<{
    kind: "environment"; tick: number;
    event: "field-started" | "field-resolved" | "combat-object-damaged" | "combat-object-destroyed" | "object-cleaned";
    objectId: string; category: "field" | "combat-object" | "route"; objectKind: string;
    integrity?: number; reason?: string;
  }>
  | Readonly<{ kind: "effect"; tick: number; effect: string; x: number; y: number }>;

/** Exhaustive runtime-owned event families; additions fail the typed coverage contract. */
export const GAMEPLAY_EVENT_KIND_IDS = Object.freeze(Object.keys({
  run: true,
  stage: true,
  wave: true,
  spawn: true,
  death: true,
  loadout: true,
  weapon: true,
  projectile: true,
  world: true,
  environment: true,
  effect: true,
} satisfies Readonly<Record<TearGameplayEvent["kind"], true>>) as TearGameplayEvent["kind"][]);

export type UntickedTearGameplayEvent =
  TearGameplayEvent extends infer Event
    ? Event extends TearGameplayEvent ? Omit<Event, "tick"> : never
    : never;

export interface TearGameplayEventSource {
  subscribe(listener: (event: TearGameplayEvent) => void): () => void;
}

export interface TearGameplayEventPort extends TearGameplayEventSource {
  publish(event: TearGameplayEvent): void;
  emit(event: UntickedTearGameplayEvent): void;
}

/**
 * Small synchronous port used by the fixed-step host. Event order is listener
 * order independent: every listener receives the same frozen value before the
 * publisher proceeds.
 */
export class TearGameplayEventBus implements TearGameplayEventPort {
  readonly #listeners = new Set<(event: TearGameplayEvent) => void>();
  #tick: () => number;

  constructor(tick: () => number = () => 0) {
    this.#tick = tick;
  }

  /**
   * Composition may construct native publishers before it constructs the
   * canonical simulation runtime.  Rebind that one clock at composition time;
   * callers still receive only immutable, validated facts.
   */
  setTickSource(tick: () => number): void {
    this.#tick = tick;
  }

  subscribe(listener: (event: TearGameplayEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  publish(event: TearGameplayEvent): void {
    if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
      throw new RangeError("gameplay event tick must be a non-negative safe integer");
    }
    const frozen = Object.freeze({ ...event }) as TearGameplayEvent;
    for (const listener of this.#listeners) listener(frozen);
  }

  emit(event: UntickedTearGameplayEvent): void {
    this.publish({ ...event, tick: this.#tick() });
  }
}
