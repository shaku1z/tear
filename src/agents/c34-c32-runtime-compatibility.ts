import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import { normalizeGameAction, type GameAction } from "../input/game-action";
import { stableVerificationHash } from "../replay/hash";
import type { TearOfflineRlQValueV1, TearOfflineRlTrainingResultV1 } from "./offline-rl-training";

const HASH = /^[a-f0-9]{16}$/u;

/**
 * The only C34-to-C32 state identity approved for a future learned-Q runtime.
 * It deliberately receives the production canonical source state, rather than
 * attempting to reconstruct one from C32's lossy structured observation.
 */
export const TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1 = Object.freeze({
  id: "tear-c34-c32-canonical-source-state.v1",
  schemaVersion: 1,
  stateSchema: "tear-canonical-gameplay-state.v1",
  actionSchema: "tear-game-action-command-envelope.v1",
  selection: "highest-q-then-semantic-action-hash.v1",
});

export const TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 = stableVerificationHash(TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1);

export interface TearC34C32SourceStateEncodingV1 {
  readonly adapterId: typeof TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id;
  readonly adapterHash: string;
  readonly stateHash: string;
}

export interface TearC34C32RuntimeModelV1 {
  readonly format: "tear-c34-c32-tabular-q-model";
  readonly schemaVersion: 1;
  readonly sourceStateAdapter: Readonly<{ id: typeof TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id; adapterHash: string }>;
  readonly entries: readonly TearOfflineRlQValueV1[];
  readonly modelHash: string;
}

export interface TearC34C32ActionSelectionV1 {
  readonly actions: readonly GameAction[];
  readonly semanticActionHash: string;
  readonly source: "q" | "fallback";
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }

/** Pure C30/C34/C32 projection. It is byte-for-byte the existing C34 canonical state key. */
export function encodeTearC34C32SourceState(state: CanonicalGameplayState): TearC34C32SourceStateEncodingV1 {
  return Object.freeze({ adapterId: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id,
    adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1, stateHash: stableVerificationHash(state) });
}

/** Named projections prevent future call sites from replacing the common source encoder with a local approximation. */
export const encodeC30SourceStateForC34C32 = encodeTearC34C32SourceState;
export const encodeC34TrainingSourceStateForC32 = encodeTearC34C32SourceState;
export const encodeC32RuntimeSourceStateForC34 = encodeTearC34C32SourceState;

export function tearC34C32SemanticActionHash(actions: readonly GameAction[]): string {
  return stableVerificationHash(actions);
}

/**
 * Normalizes, deduplicates, and orders a declared vocabulary. This is the
 * action identity used by C34 Q entries and by a future C32 runtime adapter.
 */
export function canonicalizeTearC34C32ActionVocabulary(actions: readonly unknown[]): readonly GameAction[] {
  const byHash = new Map<string, GameAction>();
  for (const candidate of actions) {
    const normalized = normalizeGameAction(candidate);
    if (!normalized.ok || stableVerificationHash(candidate) !== stableVerificationHash(normalized.action)) {
      throw new TypeError("C34/C32 action vocabulary must contain canonical semantic actions");
    }
    byHash.set(stableVerificationHash(normalized.action), normalized.action);
  }
  return Object.freeze([...byHash.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, action]) => action));
}

/** Masks the common vocabulary by the source world's currently advertised semantic action types. */
export function maskTearC34C32Actions(actions: readonly unknown[], available: readonly GameAction["type"][]): readonly GameAction[] {
  const allowed = new Set(available);
  return Object.freeze(canonicalizeTearC34C32ActionVocabulary(actions).filter((action) => allowed.has(action.type)));
}

function orderedEntries(entries: readonly TearOfflineRlQValueV1[]): readonly TearOfflineRlQValueV1[] {
  const unique = new Map<string, TearOfflineRlQValueV1>();
  for (const entry of entries) {
    if (!hash(entry.stateHash) || !hash(entry.semanticActionHash) || !hash(entry.actionHash) || !finite(entry.value)) {
      throw new TypeError("invalid C34/C32 Q entry");
    }
    const key = `${entry.stateHash}:${entry.semanticActionHash}`;
    if (unique.has(key)) throw new TypeError("C34/C32 model repeats a state/action entry");
    unique.set(key, Object.freeze({ ...entry }));
  }
  return Object.freeze([...unique.values()].sort((left, right) => left.stateHash.localeCompare(right.stateHash) || left.semanticActionHash.localeCompare(right.semanticActionHash)));
}

function modelHash(draft: Omit<TearC34C32RuntimeModelV1, "modelHash">): string { return stableVerificationHash(draft); }

/** Creates a new explicit V3-compatible model envelope. It never accepts legacy C34 result bytes. */
export function createTearC34C32RuntimeModel(entries: readonly TearOfflineRlQValueV1[]): TearC34C32RuntimeModelV1 {
  const draft = Object.freeze({ format: "tear-c34-c32-tabular-q-model" as const, schemaVersion: 1 as const,
    sourceStateAdapter: Object.freeze({ id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 }),
    entries: orderedEntries(entries) });
  return Object.freeze({ ...draft, modelHash: modelHash(draft) });
}

export function parseTearC34C32RuntimeModel(value: unknown): TearC34C32RuntimeModelV1 {
  if (!record(value) || value.format !== "tear-c34-c32-tabular-q-model" || value.schemaVersion !== 1 || !record(value.sourceStateAdapter)
    || value.sourceStateAdapter.id !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id || value.sourceStateAdapter.adapterHash !== TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1
    || !Array.isArray(value.entries) || !hash(value.modelHash)) throw new TypeError("invalid C34/C32 runtime model");
  const draft = Object.freeze({ format: "tear-c34-c32-tabular-q-model" as const, schemaVersion: 1 as const,
    sourceStateAdapter: Object.freeze({ id: TEAR_C34_C32_SOURCE_STATE_ADAPTER_V1.id, adapterHash: TEAR_C34_C32_SOURCE_STATE_ADAPTER_HASH_V1 }),
    entries: orderedEntries(value.entries as TearOfflineRlQValueV1[]) });
  if (value.modelHash !== modelHash(draft)) throw new TypeError("C34/C32 runtime model integrity mismatch");
  return Object.freeze({ ...draft, modelHash: value.modelHash });
}

/** Legacy C34 V2 results lack this adapter identity and are intentionally ineligible for the C32 path. */
export function requireTearC34C32AdapterEligibleTrainingResult(result: TearOfflineRlTrainingResultV1): never {
  void result;
  throw new RangeError("legacy C34 training results do not declare the C34/C32 source-state adapter; train an explicit V3-compatible model");
}

/** Pure selection: no registry, activation, promotion, host input, or fallback policy is reachable here. */
export function selectTearC34C32RuntimeAction(modelInput: TearC34C32RuntimeModelV1, state: CanonicalGameplayState,
  actions: readonly unknown[], available: readonly GameAction["type"][]): TearC34C32ActionSelectionV1 | undefined {
  const model = parseTearC34C32RuntimeModel(modelInput), encoding = encodeTearC34C32SourceState(state), legal = maskTearC34C32Actions(actions, available);
  let best: Readonly<{ action: GameAction; semanticActionHash: string; value: number }> | undefined;
  for (const action of legal) {
    const semanticActionHash = tearC34C32SemanticActionHash([action]);
    const value = model.entries.find((entry) => entry.stateHash === encoding.stateHash && entry.semanticActionHash === semanticActionHash)?.value ?? 0;
    if (best === undefined || value > best.value || value === best.value && semanticActionHash.localeCompare(best.semanticActionHash) < 0) {
      best = Object.freeze({ action, semanticActionHash, value });
    }
  }
  return best === undefined ? undefined : Object.freeze({ actions: Object.freeze([best.action]), semanticActionHash: best.semanticActionHash,
    source: best.value === 0 ? "fallback" : "q" });
}
