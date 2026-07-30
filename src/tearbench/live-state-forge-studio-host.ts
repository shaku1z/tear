import { stableVerificationHash } from "../replay/hash";
import type { TearSnapshotV1 } from "./contracts";
import type { TearRuntimeBridgeFactory } from "./live-runtime-contracts";
import {
  installStateForgeStudio,
  type StateForgeCheckpointItem,
  type StateForgeForkRequest,
  type StateForgeStudioHost,
} from "./state-forge-studio";
import type { TearSdlDocumentV1, TearSdlResolved } from "./tearsdl";
import { TearCheckpointBank } from "./tearsdl";

const INITIAL_DOCUMENT: TearSdlDocumentV1 = Object.freeze({
  format: "tearsdl",
  schemaVersion: 1,
  id: "state-forge.live-sandbox",
  stateClass: "recorded-canonical",
  seed: "state-forge-live",
  start: Object.freeze({
    mode: "endless",
    difficulty: "normal",
    weapon: "sword",
    wave: 1,
  }),
  state: Object.freeze({}),
  constraints: Object.freeze({ legalProgression: true }),
  tags: Object.freeze(["state-forge", "developer", "disposable"]),
  maxTicks: 3_600,
});

function snapshotForState(
  template: TearSnapshotV1,
  id: string,
  tick: number,
  state: Readonly<Record<string, unknown>>,
): TearSnapshotV1 {
  const exact = stableVerificationHash(state);
  return Object.freeze({
    ...template,
    id,
    tick,
    hashes: Object.freeze({ ...template.hashes, exact, semantic: exact }),
    state: Object.freeze(structuredClone(state)),
  });
}

function downloadScenario(fileName: string, source: string): void {
  const blob = new Blob([source], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = href;
  anchor.click();
  queueMicrotask(() => { URL.revokeObjectURL(href); });
}

export function createLiveStateForgeStudioHost(
  factory: TearRuntimeBridgeFactory,
): StateForgeStudioHost {
  const environment = factory.create("A");
  const bank = new TearCheckpointBank();
  const snapshots = new Map<string, TearSnapshotV1>();
  const library = new Map<string, TearSdlDocumentV1>([[INITIAL_DOCUMENT.id, INITIAL_DOCUMENT]]);
  let sequence = 0;

  const addLiveCheckpoint = (label: string): StateForgeCheckpointItem => {
    sequence += 1;
    const id = `state-forge-live-${String(sequence)}`;
    const snapshot = environment.captureSnapshot(id);
    bank.addSnapshot(snapshot);
    snapshots.set(id, snapshot);
    return Object.freeze({
      id,
      label,
      tick: snapshot.tick,
      state: snapshot.state,
      provenance: snapshot.provenance,
    });
  };

  const checkpointItem = (id: string): StateForgeCheckpointItem => {
    const entry = bank.list().find((candidate) => candidate.id === id);
    if (entry === undefined) throw new RangeError(`checkpoint does not exist: ${id}`);
    const snapshot = snapshots.get(id);
    if (snapshot !== undefined) {
      return Object.freeze({
        id, label: id, tick: entry.tick, state: snapshot.state, provenance: snapshot.provenance,
      });
    }
    const parentId = entry.parentId;
    const parent = parentId === undefined ? undefined : checkpointItem(parentId);
    if (parent === undefined) throw new RangeError(`fork ${id} has no provenance parent`);
    return Object.freeze({
      id, label: id, tick: entry.tick, parentId: parent.id,
      state: bank.materialize(id), provenance: parent.provenance,
    });
  };

  return Object.freeze({
    initialSource: `${JSON.stringify(INITIAL_DOCUMENT, null, 2)}\n`,
    tearSdlLibrary: () => new Map(library),
    checkpoints: () => Object.freeze(bank.list().map((entry) => checkpointItem(entry.id))),
    fork(request: StateForgeForkRequest) {
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(request.id)) {
        throw new TypeError("fork id is invalid");
      }
      const parent = checkpointItem(request.parentId);
      bank.fork(request.parentId, request.id, parent.tick, request.patch);
      return checkpointItem(request.id);
    },
    watch(checkpointId: string) {
      const item = checkpointItem(checkpointId);
      const template = snapshots.get(checkpointId)
        ?? snapshots.get(bank.export().snapshots[0]?.id ?? "");
      if (template === undefined) throw new RangeError("checkpoint bank has no live snapshot template");
      const result = environment.restoreSnapshot(
        snapshotForState(template, item.id, item.tick, bank.materialize(item.id)),
      );
      if (!result.ok) throw new Error(`checkpoint restore failed during ${result.phase}`);
    },
    launch(resolved: TearSdlResolved) {
      const result = environment.forgeResolvedScenario(resolved);
      if (!result.ok) {
        throw new Error(`scenario forge failed during ${result.phase}: ${result.issues.map((issue) => issue.message).join("; ")}`);
      }
      library.set(resolved.document.id, resolved.document);
      return addLiveCheckpoint(`Launch · ${resolved.scenario.id}`);
    },
    exportScenario: downloadScenario,
  });
}

export function installLiveStateForgeStudio(factory: TearRuntimeBridgeFactory): void {
  if (new URLSearchParams(window.location.search).get("stateforge") !== "1") return;
  installStateForgeStudio(createLiveStateForgeStudioHost(factory));
}
