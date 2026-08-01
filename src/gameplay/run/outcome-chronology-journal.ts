import type { FinaleOutwardCall } from "../campaign/finale-outward-call";
import type {
  OutcomeRunState,
  PendingFinaleRecord,
  PreparedVictory,
  RunResultInfo,
} from "./outcome-planner";

/**
 * Data-only receipts for the synchronous terminal-run boundary.  They record
 * that a host adapter accepted a request; they never claim cloud completion,
 * durable-storage success, rendered pixels, audible samples, or device output.
 */
export type OutcomeChronologyEffect =
  | Readonly<{ type: "finale-outward"; call: FinaleOutwardCall }>
  | Readonly<{ type: "outcome.stop-clipper" }>
  | Readonly<{ type: "outcome.terminal-published"; outcome: "defeat" | "victory"; run: OutcomeRunState }>
  | Readonly<{ type: "outcome.prepared-cache-hit"; prepared: PreparedVictory }>
  | Readonly<{ type: "outcome.prepared-stored"; prepared: PreparedVictory }>
  | Readonly<{ type: "outcome.pending-finale-persisted"; record: PendingFinaleRecord }>
  | Readonly<{ type: "outcome.pending-finale-cleared" }>
  | Readonly<{ type: "outcome.lifecycle-terminated"; outcome: "defeat" | "victory" }>
  | Readonly<{ type: "outcome.presented"; outcome: "defeat" | "victory"; result: RunResultInfo }>;

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
