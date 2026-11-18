import { stableVerificationHash, canonicalStringify } from "../domain/hash";
import type { ProductionGhostReplayCompositionOptions } from "../tearbench/production-replay-composition";
import { replayEngine } from "./replay-engine";
import { createDefaultStateCodecRegistry, restoreSnapshotTransactionally } from "../tearbench/state-codecs";
import type { TearSnapshotV1, TearCausalEventV1 } from "../tearbench/contracts";
import { TearGameplayEventBus } from "../gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../tearbench/gameplay-causal-events";
import { GhostCapsuleReader, type GhostReadCapsule, type GhostCapsuleEntry } from "./capsule-reader";
import { GhostStreamingRecorder, GhostLocalVault } from "./capsule-vault";
import { createMemoryGhostVaultBackend } from "./capsule-vault-backend";
import { GhostColdRestore } from "./cold-restore";
import { prepareCompleteGhostCapsuleArchive } from "./capsule-archive";
import { readGhostBossMemory, type GhostBossMemoryV1 } from "./boss-memory-origin";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostReplayRunContext } from "./replay-admission";
import {
  readGhostApplicationClockSchedule,
  type GhostApplicationClockSchedule,
  type GhostApplicationFrameCursor,
} from "./application-frame-events";
import { readGhostAuthoritativeReceipt, createGhostAuthoritativeReceipt } from "./authoritative-receipt";
import {
  verifyGhostCapsuleProductionReplay,
  type GhostProductionReplayVerification,
  type GhostProductionReceiptComparison,
} from "./production-replay-verification";
import { GhostProductionReplayWorld } from "./replay-world";
import { createGhostV3 } from "./truth-kernel";

const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new TypeError("Boss Memory requires object data");
  return v as Record<string, unknown>;
};
const eventKey = (e: TearCausalEventV1) =>
  stableVerificationHash({ type: e.type, tick: e.tick, actorId: e.actorId ?? null, payload: e.payload });
const receiptEntries = (c: GhostReadCapsule) =>
  c.tracks.results.flatMap((e) => {
    const r = readGhostAuthoritativeReceipt(e.value);
    return r?.tick === e.tick ? [r] : [];
  });
const bootstrapId = (id: string) => `boss-memory-open-${id}`;
/** Own derived hashes; original source hashes are references, never a membership certificate. */
export function recordingFreeBossSnapshot(snapshot: TearSnapshotV1, id: string): TearSnapshotV1 {
  const copy = structuredClone(snapshot),
    world = obj(copy.state["tear.world.v1"]);
  world.ghost = { ...obj(world.ghost), recording: null };
  const result = restoreSnapshotTransactionally(
    copy,
    createDefaultStateCodecRegistry(),
    { createEmpty: () => ({ components: new Map(), references: new Map(), entityIds: new Set() }), validate: () => [] },
    { replace: () => undefined },
  );
  if (!result.ok)
    throw new TypeError(`Boss Memory snapshot refuses: ${result.issues.map((i) => i.message).join("; ")}`);
  return {
    ...copy,
    id: `${id}-at-${String(copy.tick)}`,
    provenance: {
      ...copy.provenance,
      producer: "derived-boss-memory",
      sourceId: bootstrapId(id),
      trainingConsent: "no-training",
    },
    hashes: { ...copy.hashes, exact: result.exactHash, semantic: result.semanticHash },
  };
}
function intervalHash(tracks: GhostReadCapsule["tracks"], id: string): string {
  return stableVerificationHash({
    ...tracks,
    events: tracks.events.filter((e) => obj(e.value).id !== bootstrapId(id)),
  });
}
/** The admitted source frontier at a completed tick, without inventing a frame close. */
export function bossMemoryFrameFrontier(
  clock: GhostApplicationClockSchedule | undefined,
  tick: number,
  initial: GhostApplicationFrameCursor,
) {
  let cursor = initial;
  for (const event of clock?.events ?? []) {
    if (event.tick > tick || event.sequence <= initial.sequence) continue;
    const value = event.payload;
    if (value.format === "tearghost-application-frame")
      cursor =
        value.kind === "begin"
          ? {
              version: 1,
              ordinal: value.ordinal,
              sequence: event.sequence,
              open: { ordinal: value.ordinal, beginSequence: event.sequence, preludeApplied: true },
            }
          : { version: 1, ordinal: value.ordinal, sequence: event.sequence };
    else cursor = { ...cursor, sequence: event.sequence };
  }
  const closingFrame =
    cursor.open === undefined
      ? null
      : (clock?.events.find(
          (event) =>
            event.tick > tick &&
            event.payload.format === "tearghost-application-frame" &&
            event.payload.kind === "end" &&
            event.payload.beginSequence === cursor.open?.beginSequence,
        ) ?? null);
  if (cursor.open !== undefined && closingFrame === null)
    throw new TypeError("Boss Memory source lacks its original closing frame witness");
  return { cursor, closingFrame };
}
export function assertBossMemory(capsule: GhostReadCapsule): GhostBossMemoryV1 {
  const d = readGhostBossMemory(capsule.manifest.provenance);
  if (!d) throw new TypeError("Boss Memory origin required");
  if (
    capsule.manifest.status !== "complete" ||
    capsule.maxTick !== (d.closingFrame?.tick ?? d.endpoint.tick) ||
    capsule.manifest.provenance?.forkOrigin !== undefined ||
    capsule.manifest.provenance?.finaleCompanion !== undefined
  )
    throw new TypeError("Boss Memory range/category is invalid");
  if (d.intervalHash !== intervalHash(capsule.tracks, capsule.manifest.id))
    throw new TypeError("Boss Memory interval tracks changed or are missing");
  const context = readGhostReplayRunContext(capsule.manifest.provenance),
    mapped = mapGhostCapsuleToReplayEnvelope(capsule),
    receipts = receiptEntries(capsule);
  if (context?.run.id !== d.sourceRunId || stableVerificationHash(context) !== d.contextHash || mapped.issues.length)
    throw new TypeError("Boss Memory context/mapping is invalid");
  const anchor = mapped.ghost.snapshots.find((s) => s.tick === d.origin.tick),
    endpoint = receipts.find((r) => r.tick === d.endpoint.tick);
  if (
    anchor?.id !== d.origin.snapshotId ||
    anchor.hashes.exact !== d.origin.exactHash ||
    endpoint?.stateHash !== d.endpoint.stateHash ||
    canonicalStringify(receipts.find((r) => r.tick === d.origin.tick)?.input) !== canonicalStringify(d.origin.input)
  )
    throw new TypeError("Boss Memory entry/endpoint receipt is missing or changed");
  const boss = (anchor.state["tear.boss.v1"] as readonly Record<string, unknown>[]).find((b) => b.id === d.bossActorId);
  if (boss?.bossId !== d.bossId || Number(boss.hp) <= 0 || boss.dead === true)
    throw new TypeError("Boss Memory needs its living entry boss");
  for (const snapshot of mapped.ghost.snapshots) {
    if (
      obj(obj(snapshot.state["tear.world.v1"]).ghost).recording !== null ||
      snapshot.provenance.sourceId !== bootstrapId(capsule.manifest.id) ||
      snapshot.tick < d.origin.tick ||
      snapshot.tick > d.endpoint.tick ||
      snapshot.provenance.trainingConsent !== "no-training"
    )
      throw new TypeError("Boss Memory contains recording history or an invalid range");
  }
  if (
    mapped.ghost.actions.some((a) => a.tick <= d.origin.tick || a.tick > d.endpoint.tick) ||
    receipts.some((r) => r.tick < d.origin.tick || r.tick > d.endpoint.tick || r.input.aimMagnitude === undefined)
  )
    throw new TypeError("Boss Memory command/input range is invalid");
  const opened = mapped.ghost.events.filter((e) => e.id === bootstrapId(capsule.manifest.id));
  if (
    opened.length !== 1 ||
    opened[0]?.sequence !== 0 ||
    opened[0].tick !== d.origin.tick ||
    opened[0].type !== "system.checkpoint" ||
    opened[0].payload.boundary !== "boss-memory-derived-opened" ||
    stableVerificationHash(opened[0].payload.provenance) !== stableVerificationHash(capsule.manifest.provenance)
  )
    throw new TypeError("Boss Memory derived bootstrap is invalid");
  const closure = d.closingFrame,
    endpointCursor = endpoint.applicationFrames?.cursor;
  if (
    closure !== null &&
    (closure.payload.format !== "tearghost-application-frame" ||
      closure.payload.kind !== "end" ||
      closure.payload.beginSequence !== endpointCursor?.open?.beginSequence ||
      closure.payload.ordinal !== endpointCursor.ordinal ||
      closure.payload.beforeTick >= d.endpoint.tick ||
      closure.payload.runId !== d.sourceRunId ||
      closure.payload.sessionId !== d.sourceSessionId ||
      mapped.ghost.events.filter((e) => stableVerificationHash(e) === stableVerificationHash(closure)).length !== 1)
  )
    throw new TypeError("Boss Memory closing witness does not bind its endpoint frontier");
  if (
    mapped.ghost.events.some(
      (e) =>
        (e.tick < d.origin.tick &&
          !d.origin.inherited.some((i) => stableVerificationHash(i) === stableVerificationHash(e))) ||
        (e.tick > d.endpoint.tick &&
          (closure === null || stableVerificationHash(e) !== stableVerificationHash(closure))),
    ) ||
    !mapped.ghost.events.some((e) => eventKey(e) === eventKey(d.endpoint.event))
  )
    throw new TypeError("Boss Memory endpoint/event range is invalid");
  return d;
}
export function bossMemoryReplay(
  capsule: GhostReadCapsule,
  presentation: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> = {},
) {
  const d = assertBossMemory(capsule),
    mapped = mapGhostCapsuleToReplayEnvelope(capsule),
    context = readGhostReplayRunContext(capsule.manifest.provenance);
  const clock = readGhostApplicationClockSchedule(
    capsule,
    d.sourceRunId,
    context?.simulation.applicationFrames !== undefined,
  );
  return {
    d,
    mapped,
    clock,
    composition: replayEngine.loaded().createProductionGhostReplayComposition({
      ...presentation,
      seed: context?.run.seed ?? "",
      inputSnapshots: new Map([[d.origin.tick, d.origin.input]]),
      requireRecordedApplicationFrames: true,
      ...(clock ? { applicationClock: clock } : {}),
    }),
  };
}
/** One origin-only execution; later keyframes are comparisons, never correction authority. */
export function verifyBossMemory(capsule: GhostReadCapsule): GhostProductionReplayVerification {
  const comparisons: GhostProductionReceiptComparison[] = [];
  try {
    const { d, mapped, clock } = bossMemoryReplay(capsule),
      receipts = receiptEntries(capsule),
      bus = new TearGameplayEventBus(),
      events: TearCausalEventV1[] = [];
    let tick = d.origin.tick;
    bus.setTickSource(() => tick);
    bus.subscribe((e) => {
      events.push(createGameplayCausalEvent(e, events.length + 1, `derived-native-${String(events.length)}`, "engine"));
    });
    const composition = replayEngine.loaded().createProductionGhostReplayComposition({
      seed: mapped.ghost.snapshots[0]?.seed ?? "",
      inputSnapshots: new Map([[d.origin.tick, d.origin.input]]),
      gameplayEvents: bus,
      requireRecordedApplicationFrames: true,
      ...(clock ? { applicationClock: clock } : {}),
    });
    const compare = (session: ReturnType<typeof composition.create>) => {
      const expected = receipts.find((r) => r.tick === session.simulation.scheduler.tick);
      if (!expected) return;
      const actualHash = stableVerificationHash(session.semanticProjection()),
        input = session.simulation.input.snapshot(),
        original = { ...expected.input };
      if (original.aimMagnitude === 1000) delete original.aimMagnitude;
      comparisons.push({
        tick: expected.tick,
        expectedHash: expected.stateHash,
        actualHash,
        equal: actualHash === expected.stateHash && stableVerificationHash(input) === stableVerificationHash(original),
      });
    };
    const replay = new GhostProductionReplayWorld(
      createGhostV3({ ...mapped.ghost, snapshots: mapped.ghost.snapshots.filter((s) => s.tick === d.origin.tick) }),
      {
        create(snapshot) {
          const session = composition.create(snapshot);
          compare(session);
          return {
            ...session,
            beforeReplayAdvance(next) {
              tick = next;
              session.beforeReplayAdvance(next);
            },
            afterReplayAdvance() {
              compare(session);
            },
          };
        },
      },
    );
    replay.seek(d.endpoint.tick);
    if (comparisons.length !== receipts.length || !events.some((e) => eventKey(e) === eventKey(d.endpoint.event)))
      throw new TypeError("Boss Memory interval/endpoint was not reproduced by native execution");
    return { status: comparisons.every((c) => c.equal) ? "verified" : "mismatch", comparisons, mappingIssues: [] };
  } catch (error) {
    return {
      status: "unavailable",
      comparisons,
      mappingIssues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function saveBossMemory(
  vault: GhostLocalVault,
  source: GhostReadCapsule,
  entryTick: number,
  title: string,
  notes: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (
    source.manifest.provenance?.bossMemory !== undefined ||
    source.manifest.provenance?.forkOrigin !== undefined ||
    source.manifest.provenance?.seedRace !== undefined ||
    source.manifest.provenance?.beatThisRun !== undefined
  )
    throw new TypeError("Select an ordinary native source encounter");
  const verification = verifyGhostCapsuleProductionReplay(source);
  if (verification.status !== "verified") throw new TypeError("Boss Memory source replay is unavailable");
  const mapped = mapGhostCapsuleToReplayEnvelope(source),
    original = mapped.ghost.snapshots.find((s) => s.tick === entryTick),
    receipts = receiptEntries(source),
    initial = receipts.find((r) => r.tick === entryTick),
    context = readGhostReplayRunContext(source.manifest.provenance);
  if (!original || !initial || !context || initial.input.aimMagnitude === undefined)
    throw new TypeError("Select a verified checkpoint with explicit held input");
  if (obj(original.state["tear.hazard.v1"]).allocator === undefined)
    throw new TypeError(
      "Historical checkpoint lacks exact environment allocator continuation; choose a newly recorded source",
    );
  const bosses = original.state["tear.boss.v1"] as readonly Record<string, unknown>[],
    boss = bosses.find((b) => Number(b.hp) > 0 && b.dead !== true && typeof b.bossId === "string");
  if (!boss || typeof boss.id !== "string" || typeof boss.bossId !== "string")
    throw new TypeError("Select a checkpoint with a living boss");
  const terminal = mapped.ghost.events.find(
    (e) =>
      e.tick > entryTick &&
      ((e.type === "run.defeated" && e.payload.runId === context.run.id) ||
        (e.type === "enemy.defeated" && e.actorId === boss.id)),
  );
  if (!terminal || !title.trim() || title.length > 120 || notes.length > 2000)
    throw new TypeError("Boss Memory needs bounded annotations and a recorded native encounter result");
  const id = `boss-memory-${crypto.randomUUID()}`,
    clock = readGhostApplicationClockSchedule(
      source,
      context.run.id,
      context.simulation.applicationFrames !== undefined,
    ),
    cursor = initial.applicationFrames?.cursor ?? { version: 1 as const, ordinal: 0, sequence: 0 };
  const inherited = cursor.open ? (clock?.events.filter((e) => e.sequence === cursor.open?.beginSequence) ?? []) : [];
  const anchor = recordingFreeBossSnapshot(original, id),
    input = initial.input;
  const generated: TearSnapshotV1[] = [],
    ending: { snapshot: TearSnapshotV1; stateHash: string; input: typeof input }[] = [],
    actualEvents: TearCausalEventV1[] = [];
  const bus = new TearGameplayEventBus();
  let tick = entryTick;
  bus.setTickSource(() => tick);
  bus.subscribe((e) => {
    actualEvents.push(createGameplayCausalEvent(e, actualEvents.length + 1, "derived-result", "engine"));
  });
  const composition = replayEngine.loaded().createProductionGhostReplayComposition({
    seed: original.seed,
    inputSnapshots: new Map([[entryTick, input]]),
    gameplayEvents: bus,
    requireRecordedApplicationFrames: true,
    ...(clock ? { applicationClock: clock } : {}),
  });
  const replay = new GhostProductionReplayWorld(createGhostV3({ ...mapped.ghost, snapshots: [anchor] }), {
    create(snapshot) {
      const session = composition.create(snapshot);
      return {
        ...session,
        beforeReplayAdvance(next) {
          tick = next;
          session.beforeReplayAdvance(next);
        },
        afterReplayAdvance() {
          signal?.throwIfAborted();
          const receipt = receipts.find((r) => r.tick === tick);
          if (receipt && stableVerificationHash(session.semanticProjection()) !== receipt.stateHash)
            throw new TypeError(`Source encounter continuation mismatch at ${String(tick)}`);
          if (tick === terminal.tick) {
            const c = replayEngine.loaded().captureProductionReplayCheckpoint(
              session.replay,
              session.combat,
              session.waveReward,
              `${id}-endpoint`,
            );
            ending.push({
              snapshot: recordingFreeBossSnapshot(c.snapshot, id),
              stateHash: c.semanticHash,
              input: { ...c.input, aimMagnitude: c.input.aimMagnitude ?? 1000 },
            });
          }
        },
      };
    },
  });
  replay.seek(terminal.tick);
  if (!actualEvents.some((e) => eventKey(e) === eventKey(terminal)))
    throw new TypeError("Source native encounter result was not reproduced");
  const end = ending[0];
  if (!end) throw new TypeError("Derived endpoint unavailable");
  for (const snapshot of mapped.ghost.snapshots.filter((s) => s.tick >= entryTick && s.tick < terminal.tick))
    generated.push(recordingFreeBossSnapshot(snapshot, id));
  generated.push(end.snapshot);
  const endingFrame = bossMemoryFrameFrontier(clock, terminal.tick, cursor);
  let declaration: GhostBossMemoryV1 = {
    format: "tearghost-boss-memory",
    version: 1,
    title: title.trim(),
    notes,
    source: {
      capsule: source.manifest.id,
      root: source.manifest.rootIntegrity,
      checkpointHash: original.hashes.exact,
      receiptHash: stableVerificationHash(initial),
    },
    sourceSessionId: source.manifest.id,
    sourceRunId: context.run.id,
    contextHash: stableVerificationHash(context),
    intervalHash: "0".repeat(16),
    bossId: boss.bossId,
    bossActorId: boss.id,
    closingFrame: endingFrame.closingFrame,
    origin: { tick: entryTick, snapshotId: anchor.id, exactHash: anchor.hashes.exact, input, cursor, inherited },
    endpoint: {
      tick: terminal.tick,
      kind: terminal.type === "run.defeated" ? "player-defeat" : "boss-defeat",
      event: terminal,
      stateHash: end.stateHash,
    },
    disposition: "derived-unranked-no-training",
  };
  const entries: GhostCapsuleEntry[] = [];
  entries.push(
    ...source.tracks.commands.filter((e) => e.tick > entryTick && e.tick <= terminal.tick),
    ...source.tracks.events.filter(
      (e) =>
        (e.tick > entryTick && e.tick <= terminal.tick) ||
        (e.tick === entryTick &&
          clock?.events.some(
            (c) => c.sequence > cursor.sequence && stableVerificationHash(c) === stableVerificationHash(e.value),
          )),
    ),
    ...inherited.map((value) => ({ kind: "events" as const, tick: value.tick, value })),
  );
  if (endingFrame.closingFrame)
    entries.push({ kind: "events", tick: endingFrame.closingFrame.tick, value: endingFrame.closingFrame });
  for (const snapshot of generated) {
    entries.push(
      { kind: "keyframes", tick: snapshot.tick, value: snapshot },
      { kind: "rng", tick: snapshot.tick, value: snapshot.state["tear.rng.v1"] },
    );
    const originalReceipt = receipts.find((r) => r.tick === snapshot.tick),
      isEnd = snapshot.tick === end.snapshot.tick;
    const lastCursor = bossMemoryFrameFrontier(clock, snapshot.tick, cursor).cursor;
    const frame =
      originalReceipt?.applicationFrames ??
      (context.simulation.applicationFrames ? { version: 1 as const, cursor: lastCursor } : undefined);
    entries.push({
      kind: "results",
      tick: snapshot.tick,
      value: createGhostAuthoritativeReceipt(
        snapshot.tick,
        isEnd ? end.stateHash : (originalReceipt?.stateHash ?? ""),
        isEnd ? end.input : (originalReceipt?.input ?? input),
        frame ? { ...frame, keyframe: { id: snapshot.id, exactHash: snapshot.hashes.exact } } : undefined,
      ),
    });
  }
  const ordered = entries.sort((a, b) => a.tick - b.tick);
  const tracks: GhostReadCapsule["tracks"] = {
    commands: ordered.filter((e) => e.kind === "commands"),
    events: ordered.filter((e) => e.kind === "events"),
    rng: ordered.filter((e) => e.kind === "rng"),
    results: ordered.filter((e) => e.kind === "results"),
    keyframes: ordered.filter((e) => e.kind === "keyframes"),
    presentation: [],
  };
  declaration = { ...declaration, intervalHash: intervalHash(tracks, id) };
  readGhostBossMemory({ bossMemory: declaration });
  const provenance = {
      replayContext: context,
      bossMemory: declaration,
      trainingConsent: "no-training",
      captureDisposition: "derived-unranked-no-training",
    },
    memory = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({
    sessionId: id,
    createdAt: new Date().toISOString(),
    chunkEntries: 32,
    maxPendingWrites: 1,
    vault: memory,
    recordingProfile: "coaching",
    provenance,
  });
  await recorder.start();
  await recorder.append({
    kind: "events",
    tick: entryTick,
    value: {
      format: "tear-contract",
      kind: "event",
      schemaVersion: 1,
      id: bootstrapId(id),
      type: "system.checkpoint",
      tick: entryTick,
      sequence: 0,
      phase: "post-simulation-commit",
      source: "engine",
      payload: { boundary: "boss-memory-derived-opened", provenance },
    },
  });
  for (const entry of ordered) await recorder.append(entry);
  await recorder.finalize(new Date().toISOString());
  const derived = await new GhostCapsuleReader(memory).read(id);
  const checked = verifyBossMemory(derived);
  if (checked.status !== "verified")
    throw new TypeError(`Derived Boss Memory refuses: ${checked.mappingIssues.join("; ")}`);
  const exported = await prepareCompleteGhostCapsuleArchive(memory, id),
    restore = new GhostColdRestore(vault);
  signal?.throwIfAborted();
  const job = await restore.select(`save-memory-${id}`, exported.bytes);
  if (signal?.aborted) {
    await restore.cancel(job.id, job.revision);
    signal.throwIfAborted();
  }
  const cancel = () => {
    void restore
      .read(job.id)
      .then((current) =>
        current && current.state !== "complete" ? restore.cancel(job.id, current.revision) : undefined,
      )
      .catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    await restore.restore(job.id, exported.bytes, undefined, job);
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return new GhostCapsuleReader(vault).read(id);
}
