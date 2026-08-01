import type { SfxRoute } from "./mixer";

export type FinaleAudioOperation =
  | "final-cut" | "final-relic" | "final-restore" | "final-silence"
  | "void-mix" | "music-duck";

export interface AudioDispatchRequest {
  readonly operation: FinaleAudioOperation;
  readonly arguments: readonly number[];
}

export interface AudioCueSchedulingResult {
  readonly kind: "cue";
  readonly route: SfxRoute;
  readonly context: AudioContextState | "unbound";
  readonly scheduling: "scheduled-to-audio-graph" | "no-context" | "voice-cap-rejected" | "no-schedule";
  readonly attempted: number;
  readonly accepted: number;
}

export interface AudioMixSchedulingResult {
  readonly kind: "mix";
  readonly context: AudioContextState | "unbound";
  readonly logicalBefore: number;
  readonly logicalAfter: number;
  readonly normalizedDuration: number;
  readonly scheduling: "scheduled-automation" | "logical-target-only";
}

export type AudioDispatchExecutionResult = AudioCueSchedulingResult | AudioMixSchedulingResult;

export type AudioDispatchReceipt =
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "queued"; queueDepth: number }>
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "evicted"; queueDepth: number }>
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "executing" }>
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "load-failed" }>
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "completed"; result: AudioDispatchExecutionResult }>
  | Readonly<{ requestId: number; request: AudioDispatchRequest; phase: "execution-failed"; message: string }>;

export type AudioDispatchReceiptObserver = (receipt: AudioDispatchReceipt) => void;

export interface AudioDispatchJournal {
  request(request: AudioDispatchRequest): Readonly<{ id: number; request: AudioDispatchRequest }>;
  queued(entry: Readonly<{ id: number; request: AudioDispatchRequest }>, queueDepth: number): void;
  evicted(entry: Readonly<{ id: number; request: AudioDispatchRequest }>, queueDepth: number): void;
  executing(entry: Readonly<{ id: number; request: AudioDispatchRequest }>): void;
  completed(entry: Readonly<{ id: number; request: AudioDispatchRequest }>, result: AudioDispatchExecutionResult): void;
  loadFailed(entry: Readonly<{ id: number; request: AudioDispatchRequest }>): void;
  executionFailed(entry: Readonly<{ id: number; request: AudioDispatchRequest }>, error: unknown): void;
  observe(observer: AudioDispatchReceiptObserver): () => void;
}

function immutableRequest(request: AudioDispatchRequest): AudioDispatchRequest {
  return Object.freeze({ operation: request.operation, arguments: Object.freeze([...request.arguments]) });
}

function immutableResult(result: AudioDispatchExecutionResult): AudioDispatchExecutionResult {
  return Object.freeze({ ...result });
}

/** Process-local diagnostic journal. It certifies software scheduling only, never audible output. */
export function createAudioDispatchJournal(): AudioDispatchJournal {
  let nextRequestId = 1;
  const observers = new Set<AudioDispatchReceiptObserver>();
  const publish = (receipt: AudioDispatchReceipt): void => {
    const snapshot = structuredClone(receipt);
    Object.freeze(snapshot.request.arguments); Object.freeze(snapshot.request);
    if (snapshot.phase === "completed") Object.freeze(snapshot.result);
    Object.freeze(snapshot);
    for (const observer of observers) observer(snapshot);
  };
  const journal: AudioDispatchJournal = {
    request(request) { return Object.freeze({ id: nextRequestId++, request: immutableRequest(request) }); },
    queued(entry, queueDepth) { publish({ requestId: entry.id, request: entry.request, phase: "queued", queueDepth }); },
    evicted(entry, queueDepth) { publish({ requestId: entry.id, request: entry.request, phase: "evicted", queueDepth }); },
    executing(entry) { publish({ requestId: entry.id, request: entry.request, phase: "executing" }); },
    completed(entry, result) {
      publish({ requestId: entry.id, request: entry.request, phase: "completed", result: immutableResult(result) });
    },
    loadFailed(entry) { publish({ requestId: entry.id, request: entry.request, phase: "load-failed" }); },
    executionFailed(entry, error) {
      publish({ requestId: entry.id, request: entry.request, phase: "execution-failed",
        message: error instanceof Error ? error.message : String(error) });
    },
    observe(observer) { observers.add(observer); return () => { observers.delete(observer); }; },
  };
  return Object.freeze(journal);
}
