import type { GhostVaultBackend } from "../ghost";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearAgentIntentTrace } from "./contracts";
import type { TearPolicyDecisionReceipt } from "./policy-runtime";

const JOURNAL_PREFIX = "policy-decision-journal:v1:";
const QUARANTINE_PREFIX = "policy-decision-journal-quarantine:v1:";
const HASH = /^[a-f0-9]{16}$/u;
const MAX_CAPACITY = 256;

export interface TearPolicyDecisionJournalEntryV1 {
  readonly sequence: number;
  readonly tick: number;
  readonly receipt: TearPolicyDecisionReceipt;
  readonly actions: readonly GameAction[];
  readonly actionHash: string;
  readonly trace: TearAgentIntentTrace;
  readonly previousEntryHash?: string;
  readonly entryHash: string;
}

export interface TearPolicyDecisionJournalV1 {
  readonly format: "tear-policy-decision-journal";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly maxEntries: number;
  readonly droppedEntries: number;
  readonly nextSequence: number;
  readonly entries: readonly TearPolicyDecisionJournalEntryV1[];
  readonly rootHash: string;
  readonly journalHash: string;
}

export interface TearPolicyDecisionJournalSnapshot {
  readonly id: string;
  readonly committed: number;
  readonly dropped: number;
  readonly pending: number;
  readonly failed?: string;
}

export interface TearPolicyDecisionJournalInput {
  readonly tick: number;
  readonly receipt: TearPolicyDecisionReceipt;
  readonly actions: readonly GameAction[];
  readonly trace: TearAgentIntentTrace;
}

interface MutableJournalState {
  id: string;
  maxEntries: number;
  committed: number;
  dropped: number;
  pending: number;
  failed?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function integer(value: unknown): value is number { return Number.isSafeInteger(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function journalKey(id: string): string { return `${JOURNAL_PREFIX}${id}`; }

function freezeReceipt(value: TearPolicyDecisionReceipt): TearPolicyDecisionReceipt {
  if (!hash(value.observationHash) || (value.artifactId !== undefined && !text(value.artifactId))
    || (value.artifactHash !== undefined && !hash(value.artifactHash))
    || (value.reason !== undefined && !["no-active-artifact", "invalid-model", "missing-decision", "invalid-action", "decision-budget-exceeded", "invalid-active-artifact", "canonical-source-unavailable", "no-legal-action"].includes(value.reason))
    || (value.activationHash !== undefined && !hash(value.activationHash))
    || (value.source === "artifact" && (value.artifactId === undefined || value.artifactHash === undefined || value.reason !== undefined))
    || (value.source === "refused" && (value.reason !== "invalid-active-artifact" && value.reason !== "canonical-source-unavailable"))) {
    throw new TypeError("invalid policy decision receipt");
  }
  return Object.freeze({ ...value });
}

function freezeTrace(value: TearAgentIntentTrace): TearAgentIntentTrace {
  if (!integer(value.tick) || value.tick < 0 || !text(value.profile) || !text(value.objective) || !text(value.maneuver)
    || typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || typeof value.recovery !== "boolean"
    || (value.observationClass !== "structured-state" && value.observationClass !== "pixel-only" && value.observationClass !== "privileged-diagnostic")
    || !Array.isArray(value.critic) || !value.critic.every(text) || (value.targetId !== undefined && !text(value.targetId))) {
    throw new TypeError("invalid policy decision trace");
  }
  return Object.freeze({ ...value, critic: Object.freeze([...value.critic]) });
}

function freezeActions(value: readonly unknown[]): readonly GameAction[] {
  return Object.freeze(value.map((action) => {
    const normalized = normalizeGameAction(action);
    if (!normalized.ok) throw new TypeError(`invalid journal action: ${normalized.reason}`);
    return normalized.action;
  }));
}

function entryHash(value: Omit<TearPolicyDecisionJournalEntryV1, "entryHash">): string { return stableVerificationHash(value); }
function rootHash(entries: readonly TearPolicyDecisionJournalEntryV1[]): string { return stableVerificationHash(entries.map((entry) => entry.entryHash)); }
function journalHash(value: Omit<TearPolicyDecisionJournalV1, "journalHash">): string { return stableVerificationHash(value); }

function freezeEntry(value: Omit<TearPolicyDecisionJournalEntryV1, "entryHash">): TearPolicyDecisionJournalEntryV1 {
  if (!integer(value.sequence) || value.sequence < 1 || !integer(value.tick) || value.tick < 0
    || value.trace.tick !== value.tick || !hash(value.actionHash) || value.actionHash !== stableVerificationHash(value.actions)
    || (value.previousEntryHash !== undefined && !hash(value.previousEntryHash))) throw new TypeError("invalid policy decision journal entry");
  return Object.freeze({ ...value, receipt: freezeReceipt(value.receipt), actions: freezeActions(value.actions), trace: freezeTrace(value.trace), entryHash: entryHash(value) });
}

function createJournal(id: string, maxEntries: number): TearPolicyDecisionJournalV1 {
  if (!text(id) || !integer(maxEntries) || maxEntries < 1 || maxEntries > MAX_CAPACITY) throw new TypeError("invalid policy decision journal identity");
  const draft = { format: "tear-policy-decision-journal" as const, schemaVersion: 1 as const, id, maxEntries, droppedEntries: 0,
    nextSequence: 1, entries: Object.freeze([]) as readonly TearPolicyDecisionJournalEntryV1[], rootHash: rootHash([]) };
  return Object.freeze({ ...draft, journalHash: journalHash(draft) });
}

export function parseTearPolicyDecisionJournal(value: unknown): TearPolicyDecisionJournalV1 {
  if (!record(value) || value.format !== "tear-policy-decision-journal" || value.schemaVersion !== 1 || !text(value.id)
    || !integer(value.maxEntries) || value.maxEntries < 1 || value.maxEntries > MAX_CAPACITY || !integer(value.droppedEntries) || value.droppedEntries < 0
    || !integer(value.nextSequence) || value.nextSequence < 1 || !Array.isArray(value.entries) || value.entries.length > value.maxEntries
    || !hash(value.rootHash) || !hash(value.journalHash)) throw new TypeError("invalid policy decision journal");
  const entries = value.entries.map((entry) => {
    if (!record(entry) || !hash(entry.entryHash)) throw new TypeError("invalid policy decision journal entry");
    const { entryHash: recorded, ...draft } = entry as unknown as TearPolicyDecisionJournalEntryV1;
    const frozen = freezeEntry(draft);
    if (frozen.entryHash !== recorded) throw new TypeError("policy decision journal entry integrity mismatch");
    return frozen;
  });
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index]?.sequence !== (entries[index - 1]?.sequence ?? 0) + 1
      || entries[index]?.previousEntryHash !== entries[index - 1]?.entryHash) throw new TypeError("policy decision journal chain mismatch");
  }
  const { journalHash: recordedJournalHash, ...untrustedDraft } = value as unknown as TearPolicyDecisionJournalV1;
  const draft = { ...untrustedDraft, entries: Object.freeze(entries), rootHash: rootHash(entries) };
  if (untrustedDraft.rootHash !== draft.rootHash || recordedJournalHash !== journalHash(draft)) throw new TypeError("policy decision journal integrity mismatch");
  return Object.freeze({ ...draft, journalHash: recordedJournalHash });
}

/**
 * A bounded, integrity-checked Ghost Vault analysis journal. It intentionally
 * records policy intent separately from Ghost's causal gameplay capsule stream.
 */
export class TearPolicyDecisionJournal {
  readonly #backend: GhostVaultBackend;
  #state: MutableJournalState | undefined;
  #tail: Promise<void> = Promise.resolve();

  constructor(backend: GhostVaultBackend) { this.#backend = backend; }

  begin(id: string, maxEntries = MAX_CAPACITY): TearPolicyDecisionJournalSnapshot {
    if (!text(id) || !integer(maxEntries) || maxEntries < 1 || maxEntries > MAX_CAPACITY) throw new TypeError("invalid policy decision journal identity");
    this.#state = { id, maxEntries, committed: 0, dropped: 0, pending: 0 };
    return this.snapshot();
  }

  snapshot(): TearPolicyDecisionJournalSnapshot {
    const state = this.#state;
    if (state === undefined) throw new Error("policy decision journal has not begun");
    return Object.freeze({ id: state.id, committed: state.committed, dropped: state.dropped, pending: state.pending,
      ...(state.failed === undefined ? {} : { failed: state.failed }) });
  }

  current(): TearPolicyDecisionJournalSnapshot | undefined {
    return this.#state === undefined ? undefined : this.snapshot();
  }

  append(input: TearPolicyDecisionJournalInput): void {
    const state = this.#state;
    if (state === undefined) throw new Error("policy decision journal has not begun");
    if (!integer(input.tick) || input.tick < 0 || input.trace.tick !== input.tick) throw new TypeError("policy decision tick is invalid");
    const receipt = freezeReceipt(input.receipt), actions = freezeActions(input.actions), trace = freezeTrace(input.trace);
    state.pending += 1;
    this.#tail = this.#tail.then(async () => {
      const key = journalKey(state.id), raw = await this.#backend.get("analysis", key);
      let journal: TearPolicyDecisionJournalV1;
      let quarantine: string | undefined;
      try { journal = raw === undefined ? createJournal(state.id, state.maxEntries) : parseTearPolicyDecisionJournal(JSON.parse(raw)); }
      catch (error) {
        journal = createJournal(state.id, state.maxEntries); quarantine = error instanceof Error ? error.message : String(error);
      }
      if (journal.id !== state.id || journal.maxEntries !== state.maxEntries) throw new TypeError("policy decision journal identity conflict");
      const previous = journal.entries.at(-1)?.entryHash;
      const entry = freezeEntry({ sequence: journal.nextSequence, tick: input.tick, receipt, actions, actionHash: stableVerificationHash(actions), trace,
        ...(previous === undefined ? {} : { previousEntryHash: previous }) });
      const combined = [...journal.entries, entry], removed = Math.max(0, combined.length - journal.maxEntries), entries = Object.freeze(combined.slice(removed));
      const draft = { format: "tear-policy-decision-journal" as const, schemaVersion: 1 as const, id: journal.id, maxEntries: journal.maxEntries,
        droppedEntries: journal.droppedEntries + removed, nextSequence: journal.nextSequence + 1, entries, rootHash: rootHash(entries) };
      const next = Object.freeze({ ...draft, journalHash: journalHash(draft) });
      await this.#backend.commit(Object.freeze([
        ...(quarantine === undefined ? [] : [{ store: "quarantine" as const, key: `${QUARANTINE_PREFIX}${state.id}:${String(journal.nextSequence).padStart(12, "0")}`,
          value: JSON.stringify(Object.freeze({ format: "tear-policy-decision-journal-quarantine", schemaVersion: 1, key, raw, reason: quarantine })) }]),
        { store: "analysis" as const, key, value: JSON.stringify(next) },
      ]));
      state.committed = next.entries.length; state.dropped = next.droppedEntries;
    }).catch((error: unknown) => { state.failed = error instanceof Error ? error.message : String(error); }).finally(() => { state.pending -= 1; });
  }

  async flush(): Promise<void> {
    await this.#tail;
    const state = this.#state;
    if (state?.failed !== undefined) throw new Error(`policy decision journal failed: ${state.failed}`);
  }

  async read(id: string): Promise<TearPolicyDecisionJournalV1 | undefined> {
    if (!text(id)) throw new TypeError("policy decision journal id is required");
    const key = journalKey(id), raw = await this.#backend.get("analysis", key);
    if (raw === undefined) return undefined;
    try {
      const journal = parseTearPolicyDecisionJournal(JSON.parse(raw));
      if (journal.id !== id) throw new TypeError("policy decision journal key/id mismatch");
      return journal;
    } catch (error) {
      await this.#backend.commit(Object.freeze([
        { store: "quarantine", key: `${QUARANTINE_PREFIX}${id}:read`, value: JSON.stringify(Object.freeze({ format: "tear-policy-decision-journal-quarantine", schemaVersion: 1, key, raw, reason: error instanceof Error ? error.message : String(error) })) },
      ]));
      return undefined;
    }
  }
}
