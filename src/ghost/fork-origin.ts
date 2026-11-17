import { readGhostBossMemory } from "./boss-memory-origin";
import { stableVerificationHash } from "../domain/hash";
import { readGhostFinaleCompanion } from "./finale-companion";
import type { TearSnapshotV1 } from "../tearbench/contracts";
import { rebaseEnvironmentSnapshot } from "../tearbench/environment-codec";
import type { GhostReadCapsule } from "./capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";
import { createGhostProductionReplaySession } from "./production-replay-session";
import { ghostReplayContextFingerprint, readGhostReplayRunContext } from "./replay-admission";

export interface GhostForkOriginV1 {
  readonly format: "tearghost-fork-origin";
  readonly schemaVersion: 1;
  readonly parent: Readonly<{ capsuleId: string; rootIntegrity: string; replayRootHash: string; contextHash: string }>;
  readonly checkpoint: Readonly<{
    id: string;
    tick: number;
    exactHash: string;
    semanticHash: string;
    receiptHash: string;
  }>;
  readonly childAnchor: Readonly<{
    id: string;
    exactHash: string;
    semanticHash: string;
    inputHash: string;
    configurationHash: string;
    rngHash: string;
  }>;
  readonly inputPolicy: "release-all";
  readonly framePolicy: "fresh-child-frame-from-committed-frontier";
  readonly sourceFrameReceiptHash: string;
  readonly challengeHash: string;
}
function object(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new TypeError("Fork origin requires plain data.");
  return value as Record<string, unknown>;
}
function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  const result = object(value);
  if (
    Reflect.ownKeys(result).length !== names.length ||
    names.some((name) => !Object.hasOwn(result, name)) ||
    Object.values(Object.getOwnPropertyDescriptors(result)).some((descriptor) => !("value" in descriptor))
  )
    throw new TypeError("Unknown or missing fork-origin fields.");
  return result;
}
/** Absence is legacy; a present unknown declaration is never a legacy fallback. */
export function readGhostForkOrigin(provenance: unknown): GhostForkOriginV1 | undefined {
  if (typeof provenance !== "object" || provenance === null || !Object.hasOwn(provenance, "forkOrigin"))
    return undefined;
  const raw = fields(object(provenance).forkOrigin, [
    "format",
    "schemaVersion",
    "parent",
    "checkpoint",
    "childAnchor",
    "inputPolicy",
    "framePolicy",
    "sourceFrameReceiptHash",
    "challengeHash",
  ]);
  const parent = fields(raw.parent, ["capsuleId", "rootIntegrity", "replayRootHash", "contextHash"]);
  const checkpoint = fields(raw.checkpoint, ["id", "tick", "exactHash", "semanticHash", "receiptHash"]);
  const child = fields(raw.childAnchor, [
    "id",
    "exactHash",
    "semanticHash",
    "inputHash",
    "configurationHash",
    "rngHash",
  ]);
  if (
    raw.format !== "tearghost-fork-origin" ||
    raw.schemaVersion !== 1 ||
    raw.inputPolicy !== "release-all" ||
    raw.framePolicy !== "fresh-child-frame-from-committed-frontier" ||
    !Number.isSafeInteger(checkpoint.tick) ||
    Number(checkpoint.tick) < 0 ||
    [
      ...Object.values(parent),
      ...Object.entries(checkpoint)
        .filter(([key]) => key !== "tick")
        .map(([, value]) => value),
      ...Object.values(child),
      raw.sourceFrameReceiptHash,
      raw.challengeHash,
    ].some((value) => typeof value !== "string" || value.length === 0 || value.length > 256)
  )
    throw new TypeError("Unsupported or malformed fork origin.");
  return Object.freeze(structuredClone(raw)) as unknown as GhostForkOriginV1;
}
export function ghostRecordingFirstTick(capsule: GhostReadCapsule): number {
  return (
    readGhostBossMemory(capsule.manifest.provenance)?.origin.tick ??
    readGhostFinaleCompanion(capsule.manifest.provenance)?.origin.tick ??
    readGhostForkOrigin(capsule.manifest.provenance)?.checkpoint.tick ??
    0
  );
}
declare const brand: unique symbol;
export interface GhostForkPermit {
  readonly [brand]: true;
}
const permits = new WeakMap<GhostForkPermit, Readonly<{ root: string; originHash: string }>>();

/** Only recording/UI disposition changes; no actor/config/RNG/ritual transformation. */
function comparableState(snapshot: TearSnapshotV1): unknown {
  const state = structuredClone(snapshot.state) as Record<string, unknown>;
  const world = object(state["tear.world.v1"]),
    ui = object(state["tear.ui.v1"]);
  world.ghost = { ...object(world.ghost), recording: null };
  const hazard = object(state["tear.hazard.v1"]);
  state["tear.hazard.v1"] = { ...hazard, ...rebaseEnvironmentSnapshot(hazard, "fork-comparison") };
  if (!["playing", "paused"].includes(String(ui.screen)))
    throw new TypeError("Challenge origin requires a playable source checkpoint.");
  ui.screen = "playing";
  return state;
}

export function assertGhostForkAnchor(capsule: GhostReadCapsule, origin: GhostForkOriginV1): TearSnapshotV1 {
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule),
    tick = origin.checkpoint.tick;
  if (mapped.issues.length > 0 || capsule.manifest.status !== "complete")
    throw new TypeError("Fork recording is incomplete or malformed.");
  const anchors = mapped.ghost.snapshots.filter((snapshot) => snapshot.tick === tick),
    anchor = anchors[0];
  const receipts = capsule.tracks.results
      .map((entry) => readGhostAuthoritativeReceipt(entry.value))
      .filter((receipt) => receipt?.tick === tick),
    receipt = receipts[0];
  if (
    anchors.length !== 1 ||
    anchor === undefined ||
    receipts.length !== 1 ||
    receipt === undefined ||
    anchor.id !== origin.childAnchor.id ||
    anchor.hashes.exact !== origin.childAnchor.exactHash ||
    anchor.hashes.semantic !== origin.childAnchor.semanticHash ||
    stableVerificationHash(receipt.input) !== origin.childAnchor.inputHash ||
    receipt.input.moveX !== 0 ||
    receipt.input.moveY !== 0 ||
    receipt.input.primaryHeld ||
    receipt.input.aimMagnitude === undefined ||
    stableVerificationHash(anchor.state["tear.configuration.v1"]) !== origin.childAnchor.configurationHash ||
    stableVerificationHash(anchor.state["tear.rng.v1"]) !== origin.childAnchor.rngHash ||
    mapped.ghost.actions.some((action) => action.tick <= tick) ||
    mapped.ghost.snapshots.some((snapshot) => snapshot.tick < tick) ||
    capsule.tracks.events.some((entry) => entry.tick < tick)
  )
    throw new TypeError("Fork anchor/input/configuration/RNG/range binding failed.");
  const bootstrap = mapped.ghost.events.filter((event) => event.sequence === 0);
  if (
    bootstrap.length !== 1 ||
    bootstrap[0]?.tick !== tick ||
    bootstrap[0].type !== "system.checkpoint" ||
    bootstrap[0].source !== "engine" ||
    bootstrap[0].payload.boundary !== "v3-fork-sidecar-opened" ||
    stableVerificationHash(bootstrap[0].payload.provenance) !== stableVerificationHash(capsule.manifest.provenance) ||
    mapped.ghost.snapshots.some((snapshot) => snapshot.provenance.sourceId !== bootstrap[0]?.id)
  )
    throw new TypeError("Fork bootstrap is not bound to this recording.");
  return anchor;
}

/** Parent membership is checked through the real parent session, never a claimed root. */
export function issueGhostForkPermit(capsule: GhostReadCapsule, parent: GhostReadCapsule): GhostForkPermit {
  const origin = readGhostForkOrigin(capsule.manifest.provenance);
  if (origin === undefined || readGhostForkOrigin(parent.manifest.provenance) !== undefined)
    throw new TypeError("Missing fork origin or unsupported nested fork.");
  const parentContext = readGhostReplayRunContext(parent.manifest.provenance),
    childContext = readGhostReplayRunContext(capsule.manifest.provenance);
  const session = createGhostProductionReplaySession(parent),
    child = session.forkPractice(origin.checkpoint.tick, "race-practice");
  const receipt = parent.tracks.results
    .map((entry) => readGhostAuthoritativeReceipt(entry.value))
    .find((value) => value?.tick === origin.checkpoint.tick);
  const anchor = assertGhostForkAnchor(capsule, origin);
  if (
    parentContext === undefined ||
    childContext === undefined ||
    parent.manifest.id !== origin.parent.capsuleId ||
    parent.manifest.rootIntegrity !== origin.parent.rootIntegrity ||
    session.sourceRootHash !== origin.parent.replayRootHash ||
    ghostReplayContextFingerprint(parentContext) !== origin.parent.contextHash ||
    ghostReplayContextFingerprint(childContext) !== origin.parent.contextHash ||
    child.snapshot.id !== origin.checkpoint.id ||
    child.snapshot.hashes.exact !== origin.checkpoint.exactHash ||
    child.snapshot.hashes.semantic !== origin.checkpoint.semanticHash ||
    receipt === undefined ||
    stableVerificationHash(receipt) !== origin.checkpoint.receiptHash ||
    stableVerificationHash(receipt.applicationFrames ?? null) !== origin.sourceFrameReceiptHash ||
    stableVerificationHash(comparableState(child.snapshot)) !== stableVerificationHash(comparableState(anchor))
  )
    throw new TypeError("Parent checkpoint or actual restored fork world changed.");
  const permit = Object.freeze({}) as GhostForkPermit;
  permits.set(permit, { root: capsule.manifest.rootIntegrity, originHash: stableVerificationHash(origin) });
  return permit;
}
export function requireGhostForkPermit(
  capsule: GhostReadCapsule,
  permit?: GhostForkPermit,
): GhostForkOriginV1 | undefined {
  const origin = readGhostForkOrigin(capsule.manifest.provenance);
  if (origin === undefined) return undefined;
  const issued = permit === undefined ? undefined : permits.get(permit);
  if (issued?.root !== capsule.manifest.rootIntegrity || issued.originHash !== stableVerificationHash(origin))
    throw new TypeError("Exact parent/fork admission is unavailable.");
  assertGhostForkAnchor(capsule, origin);
  return origin;
}
