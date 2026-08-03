import { EnvelopeSequencer, type CommandEnvelope } from "../domain/envelopes";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { TearGameplayEventBus, type TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { GameAction } from "../input/game-action";
import type { TearScenarioV1, TearSnapshotV1 } from "./contracts";
import { projectGameplayEventForParity, type TearSemanticEngineEventV1 } from "./gameplay-causal-events";
import { createProductionGhostReplayComposition } from "./production-replay-composition";

export interface ProductionC27AHashReceipt {
  readonly tick: number;
  readonly canonical: string;
  readonly state: Readonly<Record<string, unknown>>;
}

export type ProductionC27ASegment =
  | Readonly<{ kind: "fixed"; fromTick: number; toTick: number;
    actions: readonly Readonly<{ command: GameAction }>[] }>
  | Readonly<{ kind: "route"; atTick: number; actions: readonly Readonly<{ command: GameAction }>[] }>;

/** A C27A browser artifact's portable, post-origin replay boundary. */
export interface ProductionC27ATrace {
  readonly scenario: TearScenarioV1;
  readonly origin: TearSnapshotV1;
  readonly schedule: Readonly<Record<string, readonly Readonly<{ tick: number; id: number; command: GameAction }>[]>>;
  readonly hashes: readonly ProductionC27AHashReceipt[];
  readonly engineEventProjection: Readonly<{
    format: "tear-semantic-engine-events";
    schemaVersion: 1;
    boundary: Readonly<{ kind: "post-origin-snapshot"; originTick: number }>;
    events: readonly TearSemanticEngineEventV1[];
  }>;
  readonly segments?: readonly ProductionC27ASegment[];
  readonly routeBoundaries?: readonly unknown[];
}

export interface ProductionC27AReplayReceipt {
  readonly tick: number;
  readonly canonical: string;
  readonly state: CanonicalGameplayState;
}

export interface ProductionC27AReplayResult {
  readonly id: string;
  readonly hashes: readonly ProductionC27AReplayReceipt[];
  readonly engineEvents: readonly TearSemanticEngineEventV1[];
  readonly routeBoundaries: readonly unknown[];
}

export interface ProductionC27AMatrixEntry {
  readonly id: string;
  readonly status: "replayed" | "rejected";
  readonly result?: ProductionC27AReplayResult;
  readonly error?: string;
}

function fallbackSegments(trace: ProductionC27ATrace): readonly ProductionC27ASegment[] {
  let previousTick = trace.origin.tick;
  return trace.hashes.map((hash) => {
    const segment = Object.freeze({ kind: "fixed" as const, fromTick: previousTick, toTick: hash.tick,
      actions: Object.freeze((trace.schedule[String(hash.tick)] ?? []).map((entry) => Object.freeze({ command: entry.command }))) });
    previousTick = hash.tick;
    return segment;
  });
}

function routeProjection(
  result: ReturnType<ReturnType<typeof createProductionGhostReplayComposition>["create"]>,
) {
  const run = result.replay.world.state.run() as never as { wave: number; mods: { owned: Record<string, number> } };
  const selection = result.waveReward.reward.snapshot();
  return Object.freeze({
    tick: result.simulation.scheduler.tick,
    screen: result.waveReward.screen(),
    wave: run.wave,
    lifecycle: result.replay.world.lifecycle.snapshot(),
    reward: selection === null ? null : Object.freeze({
      phase: selection.phase,
      choiceIds: selection.choices.map((choice) => choice.id),
      reserveChoiceIds: selection.reserveChoices.map((choice) => choice.id),
    }),
    focusableIds: result.waveReward.screen() === "draft" ? selection?.choices.map((choice) => choice.id) ?? [] : [],
    owned: Object.freeze({ ...run.mods.owned }),
  });
}

/**
 * Replays one captured C27A origin through the C29 production composition.
 * This is an evidence adapter: it returns raw replay receipts and does not
 * declare that either the hashes or outward streams match live.
 */
export function replayProductionC27ATrace(trace: ProductionC27ATrace): ProductionC27AReplayResult {
  let schedulerTick = trace.origin.tick;
  const gameplayEvents = new TearGameplayEventBus(() => schedulerTick);
  const nativeEvents: TearGameplayEvent[] = [];
  gameplayEvents.subscribe((event) => { nativeEvents.push(event); });
  const composed = createProductionGhostReplayComposition({
    seed: trace.origin.seed,
    mode: trace.scenario.start.mode,
    weaponId: trace.scenario.start.weapon,
    gameplayEvents,
  }).create(trace.origin);
  const { simulation } = composed;
  gameplayEvents.setTickSource(() => simulation.scheduler.tick);
  const sequencer = new EnvelopeSequencer();
  const hashes: ProductionC27AReplayReceipt[] = [];
  const routeBoundaries: unknown[] = [];
  const segments = trace.segments ?? fallbackSegments(trace);

  for (const segment of segments) {
    if (segment.kind === "route") {
      if (simulation.scheduler.tick !== segment.atTick) {
        throw new Error(`route segment expected tick ${String(segment.atTick)}, got ${String(simulation.scheduler.tick)}`);
      }
      const before = routeProjection(composed);
      for (const entry of segment.actions) {
        sequencer.command(segment.atTick + 1, entry.command);
        if (!composed.routeAction(entry.command)) throw new Error(`source route rejected ${entry.command.type}`);
      }
      routeBoundaries.push(Object.freeze({ before, after: routeProjection(composed) }));
      continue;
    }
    if (segment.toTick !== segment.fromTick + 1) {
      throw new Error(`fixed segment must advance exactly one tick (${String(segment.fromTick)} -> ${String(segment.toTick)})`);
    }
    if (simulation.scheduler.tick !== segment.fromTick) {
      throw new Error(`fixed segment expected tick ${String(segment.fromTick)}, got ${String(simulation.scheduler.tick)}`);
    }
    const actions: CommandEnvelope<GameAction>[] = segment.actions.map((entry) =>
      sequencer.command(segment.toTick, entry.command));
    const result = simulation.advanceOne(actions);
    schedulerTick = result.tick;
    hashes.push(Object.freeze({ tick: result.tick, canonical: result.stateHash, state: result.state }));
  }
  return Object.freeze({
    id: trace.scenario.id,
    hashes: Object.freeze(hashes),
    engineEvents: Object.freeze(nativeEvents.map(projectGameplayEventForParity)),
    routeBoundaries: Object.freeze(routeBoundaries),
  });
}

/** Runs every supplied artifact independently and preserves a precise rejection per trace. */
export function replayProductionC27AMatrix(
  traces: readonly ProductionC27ATrace[],
): readonly ProductionC27AMatrixEntry[] {
  return Object.freeze(traces.map((trace) => {
    try {
      return Object.freeze({ id: trace.scenario.id, status: "replayed" as const,
        result: replayProductionC27ATrace(trace) });
    } catch (error) {
      return Object.freeze({ id: trace.scenario.id, status: "rejected" as const,
        error: error instanceof Error ? error.message : String(error) });
    }
  }));
}

/** Compares a recorded source receipt without converting a mismatch into a pass. */
export function firstProductionC27AHashDivergence(
  trace: ProductionC27ATrace,
  replay: ProductionC27AReplayResult,
) {
  const comparable = Math.min(trace.hashes.length, replay.hashes.length);
  for (let index = 0; index < comparable; index += 1) {
    const expected = trace.hashes[index];
    const actual = replay.hashes[index];
    if (expected?.canonical !== actual?.canonical) return Object.freeze({
      tick: expected?.tick ?? actual?.tick ?? trace.origin.tick,
      expected: expected?.canonical ?? null,
      actual: actual?.canonical ?? null,
    });
  }
  if (trace.hashes.length !== replay.hashes.length) return Object.freeze({
    tick: trace.hashes[comparable]?.tick ?? replay.hashes[comparable]?.tick ?? trace.origin.tick,
    expected: trace.hashes[comparable]?.canonical ?? null,
    actual: replay.hashes[comparable]?.canonical ?? null,
  });
  return null;
}
