import type { FinaleOutwardCall } from "../campaign/finale-outward-call";
import type {
  OutcomeRunState,
  PendingFinaleRecord,
  PreparedVictory,
  RunResultInfo,
  VictoryProgressionIntent,
} from "./outcome-planner";

type TerminalOutcome = "defeat" | "victory";
type BestRecord = Readonly<{ wave: number; score: number; time: number }>;
type EconomyTelemetry = Readonly<Record<string, unknown>>;

/**
 * Data-only receipts for the synchronous terminal-run boundary.  They record
 * that a host adapter accepted a request; they never claim cloud completion,
 * durable-storage success, rendered pixels, audible samples, or device output.
 */
export type OutcomeChronologyEffect =
  | Readonly<{ type: "finale-outward"; call: FinaleOutwardCall }>
  | Readonly<{ type: "outcome.stop-clipper" }>
  | Readonly<{ type: "outcome.terminal-published"; outcome: TerminalOutcome; run: OutcomeRunState }>
  | Readonly<{ type: "outcome.score-newness-decided"; run: OutcomeRunState; isNew: boolean }>
  | Readonly<{ type: "outcome.coins-awarded"; score: number; earned: number }>
  | Readonly<{ type: "outcome.wallet-read"; coins: number }>
  | Readonly<{ type: "outcome.achievement-policy-read"; enabled: boolean }>
  | Readonly<{ type: "outcome.economy-telemetry-read"; earned: number; telemetry: EconomyTelemetry }>
  | Readonly<{ type: "outcome.defeat-progression-dispatched"; run: OutcomeRunState; earned: number }>
  | Readonly<{ type: "outcome.victory-intents-dispatched"; intents: readonly VictoryProgressionIntent[] }>
  | Readonly<{ type: "outcome.best-read"; run: OutcomeRunState; best: BestRecord }>
  | Readonly<{ type: "outcome.prepared-cache-hit"; prepared: PreparedVictory }>
  | Readonly<{ type: "outcome.prepared-stored"; prepared: PreparedVictory }>
  /** The adapter returned from a write request; this does not assert durable storage. */
  | Readonly<{ type: "outcome.pending-finale-write-requested"; record: PendingFinaleRecord }>
  /** The adapter returned from a save request; this does not assert durable storage. */
  | Readonly<{ type: "outcome.profile-save-requested" }>
  /** The adapter returned from a clear request; this does not assert durable storage. */
  | Readonly<{ type: "outcome.pending-finale-clear-requested" }>
  /** The adapter accepted a push request; this does not assert cloud completion. */
  | Readonly<{ type: "outcome.cloud-push-requested" }>
  | Readonly<{ type: "outcome.lifecycle-terminated"; outcome: TerminalOutcome }>
  /** The presentation adapter returned; this does not assert rendered pixels or device output. */
  | Readonly<{ type: "outcome.presentation-dispatched"; outcome: TerminalOutcome; result: RunResultInfo }>;

export interface OutcomeChronologyEntry {
  readonly sequence: number;
  readonly effect: OutcomeChronologyEffect;
}

export type OutcomeChronologyObserver = (entry: OutcomeChronologyEntry) => void;

export interface OutcomeChronologyJournal {
  readonly record: (effect: OutcomeChronologyEffect) => void;
  readonly entries: () => readonly OutcomeChronologyEntry[];
}

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  return Object.freeze(value);
}

/**
 * One in-memory, monotonic journal shared by finale and terminal-outcome
 * adapters. The caller owns its lifetime; this module performs no persistence.
 */
export function createOutcomeChronologyJournal(
  observer?: OutcomeChronologyObserver,
): OutcomeChronologyJournal {
  const entries: OutcomeChronologyEntry[] = [];
  const record = (effect: OutcomeChronologyEffect): void => {
    const snapshot = freezeDeep(structuredClone(effect));
    const entry = Object.freeze({ sequence: entries.length, effect: snapshot });
    entries.push(entry);
    observer?.(entry);
  };
  return Object.freeze({ record, entries: () => Object.freeze([...entries]) });
}
