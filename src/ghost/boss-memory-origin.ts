import type { AuthoritativeInputSnapshot } from "../gameplay/runtime/authoritative-input";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import {
  parseGhostApplicationFrameCursor,
  parseGhostApplicationClockEvent,
  type GhostApplicationFrameCursor,
  type GhostApplicationClockEvent,
} from "./application-frame-events";
import { readGhostAuthoritativeReceipt } from "./authoritative-receipt";

export interface GhostBossMemoryV1 {
  readonly format: "tearghost-boss-memory";
  readonly version: 1;
  readonly title: string;
  readonly notes: string;
  readonly source: Readonly<{ capsule: string; root: string; checkpointHash: string; receiptHash: string }>;
  readonly sourceSessionId: string;
  readonly sourceRunId: string;
  readonly contextHash: string;
  readonly intervalHash: string;
  readonly bossId: string;
  readonly bossActorId: string;
  readonly origin: Readonly<{
    tick: number;
    snapshotId: string;
    exactHash: string;
    input: AuthoritativeInputSnapshot;
    cursor: GhostApplicationFrameCursor;
    inherited: readonly GhostApplicationClockEvent[];
  }>;
  readonly endpoint: Readonly<{
    tick: number;
    kind: "player-defeat" | "boss-defeat";
    event: TearCausalEventV1;
    stateHash: string;
  }>;
  /** Original frame housekeeping only; never extends the playable encounter. */
  readonly closingFrame: GhostApplicationClockEvent | null;
  readonly disposition: "derived-unranked-no-training";
}
function fields(value: unknown, names: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null) ||
    Object.keys(value).sort().join() !== names.split(",").sort().join() ||
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => !("value" in d))
  )
    throw new TypeError("Malformed Boss Memory descriptor");
  return value as Record<string, unknown>;
}
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{16}$/u.test(v);
export function readGhostBossMemory(provenance: unknown): GhostBossMemoryV1 | undefined {
  if (!provenance || typeof provenance !== "object" || !Object.hasOwn(provenance, "bossMemory")) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(provenance, "bossMemory");
  if (!descriptor || !("value" in descriptor)) throw new TypeError("Boss Memory must be data");
  const v = fields(
    descriptor.value,
    "format,version,title,notes,source,sourceSessionId,sourceRunId,contextHash,intervalHash,bossId,bossActorId,origin,endpoint,closingFrame,disposition",
  );
  const source = fields(v.source, "capsule,root,checkpointHash,receiptHash"),
    origin = fields(v.origin, "tick,snapshotId,exactHash,input,cursor,inherited"),
    end = fields(v.endpoint, "tick,kind,event,stateHash");
  if (
    v.format !== "tearghost-boss-memory" ||
    v.version !== 1 ||
    v.disposition !== "derived-unranked-no-training" ||
    !text(v.title, 120) ||
    typeof v.notes !== "string" ||
    v.notes.length > 2000 ||
    !text(source.capsule, 256) ||
    ![
      source.root,
      source.checkpointHash,
      source.receiptHash,
      v.contextHash,
      v.intervalHash,
      origin.exactHash,
      end.stateHash,
    ].every(hash) ||
    ![v.sourceSessionId, v.sourceRunId, v.bossId, v.bossActorId, origin.snapshotId].every((x) => text(x, 256)) ||
    !Number.isSafeInteger(origin.tick) ||
    Number(origin.tick) < 0 ||
    !Number.isSafeInteger(end.tick) ||
    Number(end.tick) <= Number(origin.tick) ||
    !["player-defeat", "boss-defeat"].includes(String(end.kind)) ||
    !Array.isArray(origin.inherited) ||
    origin.inherited.length > 1
  )
    throw new TypeError("Unsupported Boss Memory descriptor");
  const event = end.event as Record<string, unknown> | undefined;
  const payload = event?.payload as Record<string, unknown> | undefined;
  if (
    event?.format !== "tear-contract" ||
    event.kind !== "event" ||
    event.schemaVersion !== 1 ||
    event.source !== "engine" ||
    event.tick !== end.tick ||
    (end.kind === "player-defeat"
      ? event.type !== "run.defeated" || payload?.runId !== v.sourceRunId
      : event.type !== "enemy.defeated" || event.actorId !== v.bossActorId)
  )
    throw new TypeError("Boss Memory native endpoint is invalid");
  const input = readGhostAuthoritativeReceipt({
    format: "tearghost-authoritative-receipt",
    schemaVersion: 1,
    kind: "authoritative-hash",
    tick: origin.tick,
    stateHash: end.stateHash,
    input: origin.input,
  });
  if (input?.input.aimMagnitude === undefined) throw new TypeError("Boss Memory needs explicit entry held input");
  parseGhostApplicationFrameCursor(origin.cursor);
  if (v.closingFrame !== null) {
    const close = parseGhostApplicationClockEvent(v.closingFrame);
    if (
      close?.payload.format !== "tearghost-application-frame" ||
      close.payload.kind !== "end" ||
      close.tick <= Number(end.tick)
    )
      throw new TypeError("Boss Memory closing frame is invalid");
  }
  if (origin.inherited.some((e) => parseGhostApplicationClockEvent(e) === undefined))
    throw new TypeError("Boss Memory inherited frame is malformed");
  return structuredClone(v) as unknown as GhostBossMemoryV1;
}
