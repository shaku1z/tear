import type { TearSnapshotV1 } from "../tearbench/contracts";
import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import { parseGhostApplicationFrameCursor, type GhostApplicationFrameCursor, type GhostApplicationClockEvent } from "./application-frame-events";
import type { GhostReadCapsule } from "./capsule-reader";
import { stableVerificationHash } from "../replay/hash";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";

export interface GhostFinaleCompanionV1 {
  readonly format: "tearghost-finale-companion"; readonly version: 1;
  readonly parentId: string; readonly sourceRunId: string; readonly sourceSessionId: string;
  readonly parentContextHash: string;
  readonly origin: Readonly<{ tick: number; snapshotId: string; exactHash: string; input: AuthoritativeInputSnapshot;
    cursor: GhostApplicationFrameCursor; inherited: readonly GhostApplicationClockEvent[] }>;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.values(Object.getOwnPropertyDescriptors(value)).some((v) => !("value" in v))) throw new TypeError("Finale declaration requires plain data");
  return value as Record<string, unknown>;
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  const result = object(value);
  if (Reflect.ownKeys(result).length !== names.length || names.some((name) => !Object.hasOwn(result, name))) throw new TypeError("Unknown/missing finale declaration field");
  return result;
}
export function readGhostFinaleCompanion(provenance: unknown): GhostFinaleCompanionV1 | undefined {
  const raw = typeof provenance === "object" && provenance !== null ? Object.getOwnPropertyDescriptor(provenance, "finaleCompanion") : undefined;
  if (raw === undefined) return undefined;
  if (!("value" in raw)) throw new TypeError("Finale declaration must be data");
  const value = fields(raw.value, ["format", "version", "parentId", "sourceRunId", "sourceSessionId", "parentContextHash", "origin"]);
  const origin = fields(value.origin, ["tick", "snapshotId", "exactHash", "input", "cursor", "inherited"]);
  if (value.format !== "tearghost-finale-companion" || value.version !== 1 || !Number.isSafeInteger(origin.tick) || Number(origin.tick) < 0
    || [value.parentId, value.sourceRunId, value.sourceSessionId, value.parentContextHash, origin.snapshotId, origin.exactHash].some((v) => typeof v !== "string" || v.length === 0 || v.length > 256)
    || !Array.isArray(origin.inherited) || origin.inherited.length > 1 || object(origin.input).tick !== origin.tick) throw new TypeError("Unsupported/malformed finale companion");
  parseGhostApplicationFrameCursor(origin.cursor);
  return structuredClone(raw.value) as GhostFinaleCompanionV1;
}
export interface GhostFinaleFrameWitness {
  readonly format: "tearghost-finale-frame"; readonly version: 1; readonly tick: number;
  readonly cursor: GhostApplicationFrameCursor; readonly stateHash: string; readonly completed: boolean;
}
export function finaleFrameWitnesses(capsule: GhostReadCapsule): readonly GhostFinaleFrameWitness[] {
  const values = capsule.tracks.results.filter((entry) => typeof entry.value === "object" && entry.value !== null && Reflect.get(entry.value, "format") === "tearghost-finale-frame");
  let ordinal = -1;
  return values.map((entry) => {
    const value = fields(entry.value, ["format", "version", "tick", "cursor", "stateHash", "completed"]), cursor = parseGhostApplicationFrameCursor(value.cursor);
    if (value.version !== 1 || value.tick !== entry.tick || typeof value.stateHash !== "string" || !/^[a-f0-9]{16}$/iu.test(value.stateHash)
      || typeof value.completed !== "boolean" || cursor.open !== undefined || cursor.ordinal <= ordinal) throw new TypeError("Invalid finale frame witness");
    ordinal = cursor.ordinal; return structuredClone(value) as unknown as GhostFinaleFrameWitness;
  });
}
declare const permitBrand: unique symbol;
export interface GhostFinalePermit { readonly [permitBrand]: true }
const permits = new WeakMap<GhostFinalePermit, string>();
export function requireGhostFinalePermit(capsule: GhostReadCapsule, permit?: GhostFinalePermit): GhostFinaleCompanionV1 | undefined {
  const origin = readGhostFinaleCompanion(capsule.manifest.provenance);
  if (origin !== undefined && (permit === undefined || permits.get(permit) !== stableVerificationHash(capsule.manifest))) throw new TypeError("Exact finale parent custody is unavailable");
  return origin;
}
/** Parent is read afresh from the same Vault on every open; missing bytes never gain authority from an index. */
export function admitGhostFinaleCompanion(capsule: GhostReadCapsule, parent: GhostReadCapsule): GhostFinalePermit {
  const declaration = readGhostFinaleCompanion(capsule.manifest.provenance);
  if (declaration === undefined || capsule.manifest.status !== "complete" || parent.manifest.status !== "complete"
    || declaration.parentId !== parent.manifest.id || declaration.sourceSessionId !== parent.manifest.id
    || stableVerificationHash(parent.manifest.provenance?.replayContext) !== declaration.parentContextHash
    || stableVerificationHash(capsule.manifest.provenance?.replayContext) !== declaration.parentContextHash) throw new TypeError("Finale parent identity changed or is incomplete");
  const openings = capsule.tracks.events.filter((entry) => { const value = object(entry.value); return value.id === `finale-open-${capsule.manifest.id}`; });
  const opened = object(openings[0]?.value), openingPayload = object(opened.payload);
  if (openings.length !== 1 || opened.type !== "system.checkpoint" || opened.tick !== declaration.origin.tick || opened.sequence !== 0
    || opened.phase !== "post-simulation-commit" || openingPayload.boundary !== "v3-finale-sidecar-opened"
    || stableVerificationHash(openingPayload.provenance) !== stableVerificationHash(capsule.manifest.provenance)) throw new TypeError("Finale bootstrap is not bound to this origin");
  const anchors = capsule.tracks.keyframes.filter((e) => e.tick === declaration.origin.tick);
  const parentAnchors = parent.tracks.keyframes.filter((e) => e.tick === declaration.origin.tick);
  const anchor = anchors[0]?.value as TearSnapshotV1 | undefined;
  if (anchors.length !== 1 || parentAnchors.length !== 1 || anchor?.id !== declaration.origin.snapshotId || anchor.hashes.exact !== declaration.origin.exactHash
    || stableVerificationHash(anchor) !== stableVerificationHash(parentAnchors[0]?.value)) throw new TypeError("Finale origin does not match the scored source checkpoint");
  const parentReceipt = parent.tracks.results.map((e) => readGhostAuthoritativeReceipt(e.value)).find((r) => r?.tick === declaration.origin.tick);
  if (parentReceipt === undefined || stableVerificationHash(parentReceipt.input) !== stableVerificationHash(declaration.origin.input)
    || stableVerificationHash(parentReceipt.applicationFrames?.cursor) !== stableVerificationHash(declaration.origin.cursor)) throw new TypeError("Finale input/frame frontier differs from parent");
  for (const inherited of declaration.origin.inherited) {
    const originals = parent.tracks.events.filter((entry) => object(entry.value).sequence === inherited.sequence);
    if (originals.length !== 1 || stableVerificationHash(originals[0]?.value) !== stableVerificationHash(inherited)) throw new TypeError("Inherited finale frame differs from scored parent");
  }
  const terminals = parent.tracks.events.filter((e) => { const v = object(e.value); const p = typeof v.payload === "object" && v.payload !== null ? v.payload as Record<string, unknown> : {}; return v.type === "run.completed" && p.runId === declaration.sourceRunId && e.tick === declaration.origin.tick; });
  if (terminals.length !== 1) throw new TypeError("Finale origin lacks the unique original scored terminal");
  const links = capsule.tracks.results.filter((e) => typeof e.value === "object" && e.value !== null && Reflect.get(e.value, "format") === "tearghost-finale-parent");
  const link = fields(links[0]?.value, ["format", "version", "parentId", "manifestHash", "rootIntegrity", "originHash"]);
  if (links.length !== 1 || link.version !== 1 || link.parentId !== parent.manifest.id || link.rootIntegrity !== parent.manifest.rootIntegrity
    || link.manifestHash !== stableVerificationHash(parent.manifest) || link.originHash !== stableVerificationHash(declaration)) throw new TypeError("Finale resolved parent root differs");
  const witnesses = finaleFrameWitnesses(capsule);
  if (witnesses.length === 0 || witnesses.at(-1)?.completed !== true || witnesses.slice(0, -1).some((w) => w.completed)) throw new TypeError("Finale continuation has no unique completion witness");
  const permit = Object.freeze({}) as GhostFinalePermit; permits.set(permit, stableVerificationHash(capsule.manifest)); return permit;
}
