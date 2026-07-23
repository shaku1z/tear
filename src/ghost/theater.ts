import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { GhostEnvelopeV3 } from "./truth-kernel";

export type GhostLensVisibility = "public" | "ranked" | "developer";

export interface GhostLens {
  readonly id: string;
  readonly visibility: GhostLensVisibility;
  readonly requiredTracks: readonly ("command" | "state" | "visual")[];
  readonly describe: (ghost: GhostEnvelopeV3, tick: number) => Readonly<Record<string, unknown>>;
}

export class GhostLensRegistry {
  readonly #lenses = new Map<string, GhostLens>();

  register(lens: GhostLens): void {
    if (this.#lenses.has(lens.id)) throw new TypeError(`Ghost Lens already exists: ${lens.id}`);
    this.#lenses.set(lens.id, lens);
  }

  available(
    ghost: GhostEnvelopeV3,
    audience: GhostLensVisibility,
  ): readonly GhostLens[] {
    const rank = { public: 0, ranked: 1, developer: 2 } as const;
    return Object.freeze([...this.#lenses.values()].filter((lens) =>
      rank[lens.visibility] <= rank[audience]
      && lens.requiredTracks.every((track) => ghost.trident[track].available)));
  }
}

export interface GhostTheaterState {
  readonly playing: boolean;
  readonly tick: number;
  readonly speed: 0.25 | 0.5 | 1 | 2 | 4;
  readonly selectedEventId?: string;
  readonly camera: "player" | "blade" | "target" | "free" | "comparison";
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly layout: "mobile" | "tablet" | "desktop";
  readonly visibleLayers: readonly ("commands" | "state" | "events" | "visual")[];
}

export class GhostTheaterTransport {
  #state: GhostTheaterState;
  readonly #events: readonly TearCausalEventV1[];

  constructor(events: readonly TearCausalEventV1[], width = 1_600) {
    this.#events = Object.freeze([...events].sort((left, right) => left.tick - right.tick || left.sequence - right.sequence));
    this.#state = Object.freeze({
      playing: false,
      tick: 0,
      speed: 1,
      camera: "player",
      reducedMotion: false,
      highContrast: false,
      layout: width < 640 ? "mobile" : width < 1_024 ? "tablet" : "desktop",
      visibleLayers: Object.freeze(["commands", "state", "events", "visual"] as const),
    });
  }

  state(): GhostTheaterState { return this.#state; }
  play(): void { this.#state = Object.freeze({ ...this.#state, playing: true }); }
  pause(): void { this.#state = Object.freeze({ ...this.#state, playing: false }); }
  seek(tick: number): void { this.#state = Object.freeze({ ...this.#state, tick: Math.max(0, Math.floor(tick)) }); }
  speed(value: GhostTheaterState["speed"]): void { this.#state = Object.freeze({ ...this.#state, speed: value }); }
  camera(value: GhostTheaterState["camera"]): void { this.#state = Object.freeze({ ...this.#state, camera: value }); }
  accessibility(reducedMotion: boolean, highContrast: boolean): void {
    this.#state = Object.freeze({ ...this.#state, reducedMotion, highContrast });
  }
  selectEvent(id: string): void {
    const event = this.#events.find((candidate) => candidate.id === id);
    if (event === undefined) throw new RangeError(`Theater event does not exist: ${id}`);
    this.#state = Object.freeze({ ...this.#state, tick: event.tick, selectedEventId: event.id });
  }
  nextEvent(type?: TearCausalEventV1["type"]): TearCausalEventV1 | undefined {
    const event = this.#events.find((candidate) => candidate.tick > this.#state.tick && (type === undefined || candidate.type === type));
    if (event !== undefined) this.selectEvent(event.id);
    return event;
  }
}

export interface GhostAlignedEvent {
  readonly type: TearCausalEventV1["type"];
  readonly occurrence: number;
  readonly ticksByGhost: Readonly<Record<string, number | null>>;
}

export function alignGhostsBySemanticEvent(
  ghosts: readonly GhostEnvelopeV3[],
  type: TearCausalEventV1["type"],
): readonly GhostAlignedEvent[] {
  const sequences = ghosts.map((ghost) => ({
    id: ghost.id,
    events: ghost.events.filter((event) => event.type === type),
  }));
  const count = Math.max(0, ...sequences.map((sequence) => sequence.events.length));
  return Object.freeze(Array.from({ length: count }, (_, occurrence) => Object.freeze({
    type,
    occurrence,
    ticksByGhost: Object.freeze(Object.fromEntries(sequences.map((sequence) => [
      sequence.id,
      sequence.events[occurrence]?.tick ?? null,
    ]))),
  })));
}

export interface GhostTrajectoryPoint {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
}

export interface GhostTrajectoryDiff {
  readonly tick: number;
  readonly distance: number;
}

export function diffTrajectories(
  left: readonly GhostTrajectoryPoint[],
  right: readonly GhostTrajectoryPoint[],
): readonly GhostTrajectoryDiff[] {
  const rightByTick = new Map(right.map((point) => [point.tick, point]));
  return Object.freeze(left.flatMap((point) => {
    const other = rightByTick.get(point.tick);
    return other === undefined ? [] : [{
      tick: point.tick,
      distance: Math.hypot(point.x - other.x, point.y - other.y),
    }];
  }));
}
