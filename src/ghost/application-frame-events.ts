import { isRecord } from "../domain/records";
import { ghostRecordingFirstTick } from "./fork-origin";
import { readGhostFinaleCompanion } from "./finale-companion";
import { stableVerificationHash } from "../domain/hash";
import type { TearCausalEventV1 } from "../tearbench/contracts";
import type { GhostReadCapsule } from "./capsule-reader";

export const GHOST_APPLICATION_FRAMES_V1 = Object.freeze({
  version: 1 as const,
  coverage: "cinema-and-boss-intro" as const,
});
export interface GhostApplicationFrameCursor {
  readonly version: 1;
  readonly ordinal: number;
  readonly sequence: number;
  readonly open?: Readonly<{ ordinal: number; beginSequence: number; preludeApplied: boolean }>;
}
export interface GhostApplicationFrameReceipt {
  readonly version: 1;
  readonly cursor: GhostApplicationFrameCursor;
  readonly keyframe?: Readonly<{ id: string; exactHash: string }>;
}
export type GhostFrameConfirm = Readonly<{ key: boolean; touch: boolean; pad: boolean; click: boolean }>;
interface ClockIdentity {
  readonly version: 1;
  readonly runId: string;
  readonly sessionId: string;
}
export type GhostApplicationClockValue =
  | (ClockIdentity & Readonly<{ format: "tearghost-intro-install"; actorId: string; duration: number; delay: number }>)
  | (ClockIdentity &
      Readonly<{
        format: "tearghost-application-frame";
        kind: "begin";
        ordinal: number;
        beforeTick: number;
        seconds: number;
        confirm: GhostFrameConfirm;
      }>)
  | (ClockIdentity &
      Readonly<{
        format: "tearghost-application-frame";
        kind: "end";
        ordinal: number;
        beginSequence: number;
        beforeTick: number;
        afterTick: number;
        steps: number;
        introActive: boolean;
      }>);
export type GhostApplicationClockEvent = TearCausalEventV1 & Readonly<{ payload: GhostApplicationClockValue }>;

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
export function parseGhostApplicationFrameCursor(value: unknown): GhostApplicationFrameCursor {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !integer(value.ordinal) ||
    !integer(value.sequence) ||
    !keys(value, ["version", "ordinal", "sequence", "open"])
  )
    throw new TypeError("invalid application-frame cursor");
  if (
    value.open !== undefined &&
    (!isRecord(value.open) ||
      !keys(value.open, ["ordinal", "beginSequence", "preludeApplied"]) ||
      value.open.ordinal !== value.ordinal ||
      !integer(value.open.beginSequence, 1) ||
      value.open.beginSequence > value.sequence ||
      typeof value.open.preludeApplied !== "boolean")
  )
    throw new TypeError("invalid open application-frame cursor");
  return Object.freeze({
    version: 1,
    ordinal: value.ordinal,
    sequence: value.sequence,
    ...(value.open === undefined ? {} : { open: Object.freeze({ ...value.open }) }),
  }) as GhostApplicationFrameCursor;
}
export function parseGhostApplicationFrameReceipt(value: unknown): GhostApplicationFrameReceipt {
  if (!isRecord(value) || value.version !== 1 || !keys(value, ["version", "cursor", "keyframe"]))
    throw new TypeError("invalid application-frame receipt");
  const cursor = parseGhostApplicationFrameCursor(value.cursor);
  if (
    value.keyframe !== undefined &&
    (!isRecord(value.keyframe) ||
      !keys(value.keyframe, ["id", "exactHash"]) ||
      !text(value.keyframe.id) ||
      typeof value.keyframe.exactHash !== "string" ||
      !/^[a-f0-9]{16}$/iu.test(value.keyframe.exactHash))
  )
    throw new TypeError("invalid frame keyframe binding");
  return Object.freeze({
    version: 1,
    cursor,
    ...(value.keyframe === undefined
      ? {}
      : {
          keyframe: Object.freeze({ id: value.keyframe.id as string, exactHash: value.keyframe.exactHash as string }),
        }),
  });
}
export function parseGhostApplicationClockEvent(value: unknown): GhostApplicationClockEvent | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.payload) ||
    !["tearghost-application-frame", "tearghost-intro-install"].includes(String(value.payload.format))
  )
    return undefined;
  const payload = value.payload,
    base = ["format", "version", "runId", "sessionId"];
  if (
    value.format !== "tear-contract" ||
    value.kind !== "event" ||
    value.schemaVersion !== 1 ||
    value.type !== "system.checkpoint" ||
    !integer(value.tick) ||
    !integer(value.sequence, 1) ||
    !text(value.id) ||
    value.source !== "engine" ||
    payload.version !== 1 ||
    !text(payload.runId) ||
    !text(payload.sessionId)
  )
    throw new TypeError("invalid application-clock event identity");
  if (payload.format === "tearghost-intro-install") {
    if (
      !keys(payload, [...base, "actorId", "duration", "delay"]) ||
      !text(payload.actorId) ||
      typeof payload.duration !== "number" ||
      !Number.isFinite(payload.duration) ||
      payload.duration <= 0 ||
      payload.duration > 120 ||
      typeof payload.delay !== "number" ||
      !Number.isFinite(payload.delay) ||
      payload.delay < 0 ||
      payload.delay > 120
    )
      throw new TypeError("invalid intro installation witness");
  } else if (payload.kind === "begin") {
    if (
      !keys(payload, [...base, "kind", "ordinal", "beforeTick", "seconds", "confirm"]) ||
      !integer(payload.ordinal, 1) ||
      payload.beforeTick !== value.tick ||
      typeof payload.seconds !== "number" ||
      !Number.isFinite(payload.seconds) ||
      payload.seconds < 0 ||
      payload.seconds > 0.1 ||
      !isRecord(payload.confirm) ||
      !keys(payload.confirm, ["key", "touch", "pad", "click"]) ||
      ["key", "touch", "pad", "click"].some(
        (key) => typeof (payload.confirm as Record<string, unknown>)[key] !== "boolean",
      )
    )
      throw new TypeError("invalid application-frame begin");
  } else if (payload.kind === "end") {
    if (
      !keys(payload, [
        ...base,
        "kind",
        "ordinal",
        "beginSequence",
        "beforeTick",
        "afterTick",
        "steps",
        "introActive",
      ]) ||
      !integer(payload.ordinal, 1) ||
      !integer(payload.beginSequence, 1) ||
      !integer(payload.beforeTick) ||
      payload.afterTick !== value.tick ||
      !integer(payload.afterTick) ||
      !integer(payload.steps) ||
      payload.steps > 12 ||
      payload.afterTick - payload.beforeTick !== payload.steps ||
      typeof payload.introActive !== "boolean"
    )
      throw new TypeError("invalid application-frame end");
  } else throw new TypeError("unsupported application-frame event kind");
  const copy = structuredClone(value) as unknown as GhostApplicationClockEvent;
  if (copy.payload.format === "tearghost-application-frame" && copy.payload.kind === "begin")
    Object.freeze(copy.payload.confirm);
  Object.freeze(copy.payload);
  return Object.freeze(copy);
}
export function createGhostApplicationClockEvent(
  sequence: number,
  tick: number,
  payload: GhostApplicationClockValue,
): GhostApplicationClockEvent {
  const event = parseGhostApplicationClockEvent({
    format: "tear-contract",
    kind: "event",
    schemaVersion: 1,
    id: `ghost-clock-${String(sequence)}`,
    type: "system.checkpoint",
    tick,
    // Frame facts are between-tick inputs anchored after the last committed tick.
    // Installation is observed in the source content/wave transition itself.
    phase: payload.format === "tearghost-intro-install" ? "wave-draft-and-state-transitions" : "post-simulation-commit",
    sequence,
    source: "engine",
    payload,
  });
  if (event === undefined) throw new TypeError("application-clock event missing");
  return event;
}

export interface GhostApplicationClockSchedule {
  readonly events: readonly GhostApplicationClockEvent[];
  readonly receipts: ReadonlyMap<number, GhostApplicationFrameReceipt>;
}

export function createGhostApplicationClockPlayback(
  schedule: GhostApplicationClockSchedule,
  origin: GhostApplicationFrameCursor,
  ports: Readonly<{
    tick(): number;
    introActive(): boolean;
    advance(seconds: number, confirm: GhostFrameConfirm): void;
  }>,
) {
  let index = schedule.events.findIndex((event) => event.sequence > origin.sequence);
  if (index < 0) index = schedule.events.length;
  let open =
    origin.open === undefined
      ? undefined
      : schedule.events.find((event) => event.sequence === origin.open?.beginSequence);
  if (origin.open !== undefined && (!origin.open.preludeApplied || open === undefined))
    throw new TypeError("snapshot has no applied frame frontier");
  return Object.freeze({
    installedDelay(actorId: string, duration: number): number {
      const event = schedule.events[index],
        value = event?.payload;
      if (
        value?.format !== "tearghost-intro-install" ||
        event?.tick !== ports.tick() ||
        value.actorId !== actorId ||
        value.duration !== duration
      )
        throw new TypeError("natural intro installation disagrees with source witness");
      index++;
      return value.delay;
    },
    beforeTick(nextTick: number) {
      if (nextTick !== ports.tick() + 1)
        throw new TypeError("application-clock playback requires the next canonical tick");
      while (index < schedule.events.length) {
        const event = schedule.events[index];
        if (event === undefined) throw new TypeError("application-clock event disappeared");
        const value = event.payload;
        if (value.format === "tearghost-intro-install") {
          if (event.tick < nextTick)
            throw new TypeError("source intro installation was not consumed by the real spawn owner");
          break;
        }
        if (value.kind === "begin") {
          if (value.beforeTick > ports.tick()) break;
          if (value.beforeTick !== ports.tick() || open !== undefined)
            throw new TypeError("application-frame begin is not at its canonical boundary");
          // Cinema callbacks can consume the following installation witness.
          // Publish this frame's frontier before invoking that real owner.
          open = event;
          index++;
          ports.advance(value.seconds, value.confirm);
        } else {
          if (value.afterTick > ports.tick()) break;
          if (
            value.afterTick !== ports.tick() ||
            open?.sequence !== value.beginSequence ||
            ports.introActive() !== value.introActive
          )
            throw new TypeError("application-frame completion disagrees with actual continuation");
          open = undefined;
          index++;
        }
      }
      if (ports.introActive() && open === undefined)
        throw new TypeError("active intro lacks recorded application-frame input before the next tick");
    },
  });
}

/** Admit the full immutable clock stream before any detached world consumes it. */
export function readGhostApplicationClockSchedule(
  capsule: GhostReadCapsule,
  runId: string,
  declared: boolean,
): GhostApplicationClockSchedule | undefined {
  const finale = readGhostFinaleCompanion(capsule.manifest.provenance);
  const events = capsule.tracks.events.flatMap((entry) => {
    const event = parseGhostApplicationClockEvent(entry.value);
    if (event !== undefined && event.tick !== entry.tick) throw new TypeError("application clock entry tick mismatch");
    return event === undefined ? [] : [event];
  });
  if (!declared) {
    if (
      events.length !== 0 ||
      capsule.tracks.results.some((entry) => isRecord(entry.value) && entry.value.applicationFrames !== undefined)
    )
      throw new TypeError("application frames lack immutable bootstrap declaration");
    return undefined;
  }
  const firstTick = ghostRecordingFirstTick(capsule);
  if (
    events.some(
      (event) =>
        event.tick < firstTick &&
        !finale?.origin.inherited.some(
          (inherited) => stableVerificationHash(inherited) === stableVerificationHash(event),
        ),
    ) ||
    capsule.tracks.results.some((entry) => entry.tick < firstTick)
  )
    throw new TypeError("Application clock precedes recording origin.");
  const clockSequences = new Set(events.map((event) => event.sequence)),
    seenSequences = new Set<number>();
  for (const entry of capsule.tracks.events) {
    const value = entry.value;
    if (
      !isRecord(value) ||
      value.source !== "engine" ||
      !integer(value.sequence) ||
      !clockSequences.has(value.sequence)
    )
      continue;
    if (seenSequences.has(value.sequence))
      throw new TypeError("application-clock sequence collides with another engine event");
    seenSequences.add(value.sequence);
  }
  let ordinal = finale === undefined ? 0 : finale.origin.cursor.ordinal - (finale.origin.inherited.length > 0 ? 1 : 0),
    sequence = 0;
  let open: GhostApplicationClockEvent | undefined;
  const cursors = new Map<number, GhostApplicationFrameCursor>([
    [0, Object.freeze({ version: 1, ordinal: 0, sequence: 0 })],
  ]);
  if (finale !== undefined) cursors.set(finale.origin.cursor.sequence, finale.origin.cursor);
  for (const event of events) {
    const value = event.payload;
    if (
      value.runId !== runId ||
      value.sessionId !== (finale?.sourceSessionId ?? capsule.manifest.id) ||
      event.sequence <= sequence
    )
      throw new TypeError("application clock run/session/causal sequence mismatch");
    sequence = event.sequence;
    if (value.format === "tearghost-application-frame") {
      if (value.kind === "begin") {
        if (open !== undefined || value.ordinal !== ordinal + 1)
          throw new TypeError("noncontiguous application-frame begin");
        ordinal = value.ordinal;
        open = event;
      } else {
        const begin = open?.payload;
        if (
          begin?.format !== "tearghost-application-frame" ||
          begin.kind !== "begin" ||
          value.ordinal !== ordinal ||
          value.beginSequence !== open?.sequence ||
          value.beforeTick !== begin.beforeTick
        )
          throw new TypeError("application-frame end lacks matching begin");
        open = undefined;
      }
    }
    cursors.set(
      sequence,
      Object.freeze({
        version: 1,
        ordinal,
        sequence,
        ...(open === undefined
          ? {}
          : {
              open: Object.freeze({ ordinal, beginSequence: open.sequence, preludeApplied: true }),
            }),
      }),
    );
  }
  if (open !== undefined) throw new TypeError("fresh recording has incomplete application-frame terminal witness");
  const receipts = new Map<number, GhostApplicationFrameReceipt>();
  for (const entry of capsule.tracks.results) {
    if (!isRecord(entry.value) || entry.value.format !== "tearghost-authoritative-receipt") continue;
    const value = parseGhostApplicationFrameReceipt(entry.value.applicationFrames),
      cursor = value.cursor;
    const expected = cursors.get(cursor.sequence);
    if (
      receipts.has(entry.tick) ||
      cursor.ordinal !== expected?.ordinal ||
      cursor.sequence !== expected.sequence ||
      cursor.open?.ordinal !== expected.open?.ordinal ||
      cursor.open?.beginSequence !== expected.open?.beginSequence ||
      cursor.open?.preludeApplied !== expected.open?.preludeApplied
    )
      throw new TypeError("receipt application-frame cursor is not an admitted frontier");
    const frontier = events.find((event) => event.sequence === cursor.sequence);
    if (frontier !== undefined && frontier.tick > entry.tick)
      throw new TypeError("receipt application-frame cursor is in the future");
    const snapshots = capsule.tracks.keyframes.filter((candidate) => candidate.tick === entry.tick);
    if (snapshots.length !== 0) {
      const snapshot = snapshots[0]?.value;
      if (
        snapshots.length !== 1 ||
        !isRecord(snapshot) ||
        !isRecord(snapshot.hashes) ||
        value.keyframe?.id !== snapshot.id ||
        value.keyframe?.exactHash !== snapshot.hashes.exact
      )
        throw new TypeError("frame receipt does not bind its unique exact keyframe");
    } else if (value.keyframe !== undefined) throw new TypeError("frame receipt references an absent keyframe");
    receipts.set(entry.tick, value);
  }
  if (capsule.tracks.keyframes.some((entry) => !receipts.has(entry.tick)))
    throw new TypeError("fresh keyframe lacks an application-frame receipt");
  return Object.freeze({ events: Object.freeze(events), receipts });
}
