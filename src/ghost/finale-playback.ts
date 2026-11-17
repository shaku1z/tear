import type { ProductionGhostReplayCompositionOptions } from "../tearbench/production-replay-composition";
import { replayEngine } from "./replay-engine";
import { mapGhostCapsuleToReplayEnvelope } from "./capsule-replay-envelope";
import { readGhostApplicationClockSchedule } from "./application-frame-events";
import { requireGhostFinalePermit, finaleFrameWitnesses, type GhostFinalePermit } from "./finale-companion";
import type { GhostReadCapsule } from "./capsule-reader";
import { stableVerificationHash } from "../domain/hash";
import type { GhostVerifiedReplayRenderView } from "./production-replay-session";

/** Source-time positions include zero-tick frames; ticks are never repurposed as a presentation counter. */
export function createGhostFinalePlayback(
  capsule: GhostReadCapsule,
  permit: GhostFinalePermit,
  presentation: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView"> = {},
) {
  const origin = requireGhostFinalePermit(capsule, permit);
  if (origin === undefined) throw new TypeError("Finale declaration is missing");
  const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
  if (mapped.issues.length > 0)
    throw new TypeError(`Finale source mapping: ${mapped.issues.map((v) => v.reason).join("; ")}`);
  const anchor = mapped.ghost.snapshots.find((snapshot) => snapshot.tick === origin.origin.tick);
  if (anchor?.hashes.exact !== origin.origin.exactHash) throw new TypeError("Finale origin changed");
  const schedule = readGhostApplicationClockSchedule(capsule, origin.sourceRunId, true);
  if (schedule === undefined) throw new TypeError("Finale clock unavailable");
  const witnesses = finaleFrameWitnesses(capsule);
  const ends = schedule.events.filter(
    (event) => event.payload.format === "tearghost-application-frame" && event.payload.kind === "end",
  );
  if (
    ends.length !== witnesses.length ||
    ends.some((event, index) => event.sequence !== witnesses[index]?.cursor.sequence) ||
    mapped.ghost.actions.some(
      (action) => action.tick <= origin.origin.tick || action.tick > (witnesses.at(-1)?.tick ?? -1),
    )
  )
    throw new TypeError("Finale frame coverage or command range is incomplete");
  const inputSnapshots = new Map([[anchor.tick, origin.origin.input]]);
  const composition = replayEngine().createProductionGhostReplayComposition({
    ...presentation,
    seed: anchor.seed,
    inputSnapshots,
    requireRecordedApplicationFrames: true,
  });
  let seconds = 0;
  const positions = witnesses.map((witness) => {
    const begin = schedule.events.find(
      (event) =>
        event.payload.format === "tearghost-application-frame" &&
        event.payload.kind === "begin" &&
        event.payload.ordinal === witness.cursor.ordinal,
    );
    if (begin?.payload.format !== "tearghost-application-frame" || begin.payload.kind !== "begin")
      throw new TypeError("Finale frame lacks real begin");
    // The inherited frame's director/prelude time already belongs to the origin state.
    if (begin.sequence > origin.origin.cursor.sequence) seconds += begin.payload.seconds;
    return Object.freeze({ ordinal: witness.cursor.ordinal, tick: witness.tick, seconds });
  });
  let session = composition.create(anchor),
    currentIndex = -1;
  const firstEventIndex = () => {
    const index = schedule.events.findIndex((event) => event.sequence > origin.origin.cursor.sequence);
    return index < 0 ? schedule.events.length : index;
  };
  let eventIndex = firstEventIndex();
  let cached:
    | Readonly<{
        result: Readonly<{ tick: number; semanticHash: string; usedSnapshotId: string; presentationFallback: boolean }>;
        frame: GhostVerifiedReplayRenderView | undefined;
      }>
    | undefined;
  const execute = (index: number, render: boolean) => {
    if (!Number.isInteger(index) || index < 0 || index >= witnesses.length)
      throw new RangeError("Finale frame is outside the captured continuation");
    if (index < currentIndex) {
      session = composition.create(anchor);
      currentIndex = -1;
      eventIndex = firstEventIndex();
      cached = undefined;
    }
    if (
      index === currentIndex &&
      cached !== undefined &&
      (!render || cached.frame !== undefined || presentation.renderView === undefined)
    )
      return cached;
    let actualHash = "";
    for (let position = currentIndex + 1; position <= index; position++) {
      const witness = witnesses[position];
      if (witness === undefined) throw new TypeError("Finale witness disappeared");
      for (; eventIndex < schedule.events.length; eventIndex++) {
        const event = schedule.events[eventIndex];
        if (event === undefined) throw new TypeError("Finale clock disappeared");
        const value = event.payload;
        if (value.format !== "tearghost-application-frame")
          throw new TypeError("Unexpected intro installation in a finale continuation");
        if (value.kind === "begin") {
          if (value.beforeTick !== session.simulation.scheduler.tick)
            throw new TypeError("Finale frame begins at a different committed frontier");
          session.advanceApplicationFrame(value.seconds, value.confirm);
          continue;
        }
        if (
          value.ordinal !== witness.cursor.ordinal ||
          value.afterTick !== witness.tick ||
          event.sequence !== witness.cursor.sequence
        )
          throw new TypeError("Finale frame/witness ordering differs");
        while (session.simulation.scheduler.tick < value.afterTick) {
          const tick = session.simulation.scheduler.tick + 1;
          const actions = mapped.ghost.actions.filter((action) => action.tick === tick);
          if (session.waveReward.screen() !== "playing")
            throw new TypeError("Finale declares gameplay ticks after leaving playing");
          const before = session.simulation.scheduler.tick;
          session.simulation.advanceOne(actions);
          if (session.simulation.scheduler.tick !== before + 1)
            throw new TypeError("Finale tick did not advance exactly once");
        }
        if (session.simulation.scheduler.tick !== value.afterTick) throw new TypeError("Finale frame moved backwards");
        eventIndex++;
        break;
      }
      const replay = session.replay;
      actualHash = stableVerificationHash({
        canonical: replayEngine().projectProductionReplayCanonicalState(
          replay,
          session.simulation.scheduler.tick,
          session.simulation.input,
        ),
        finale: replay.finale.runtime.captureBinding(),
        cinema: replay.world.context.cinema.captureState(),
        cinemaInput: replay.world.context.cinema.captureRecordedInput(),
        lifecycle: replay.world.lifecycle.snapshot(),
        rng: replay.world.context.services.random.snapshot(),
        seconds: replay.world.context.services.clock.seconds(),
        stage: replay.stage.index,
      });
      if (
        actualHash !== witness.stateHash ||
        witness.completed !==
          (session.waveReward.screen() === "win" && session.replay.world.lifecycle.snapshot().phase === "terminated")
      ) {
        throw new TypeError(
          `Finale continuation differs at frame ${String(witness.cursor.ordinal)} tick ${String(witness.tick)} (${witness.stateHash}/${actualHash})`,
        );
      }
    }
    currentIndex = index;
    if (actualHash === "") actualHash = witnesses[index]?.stateHash ?? "";
    const result = {
      tick: session.simulation.scheduler.tick,
      semanticHash: actualHash,
      usedSnapshotId: anchor.id,
      presentationFallback: false,
    };
    const frame: GhostVerifiedReplayRenderView | undefined =
      !render || session.renderView === undefined
        ? undefined
        : {
            ...session.renderView(),
            sourceId: capsule.manifest.id,
            sourceRootHash: mapped.ghost.rootHash,
            sourceCapsuleRootIntegrity: capsule.manifest.rootIntegrity,
            semanticHash: actualHash,
          };
    cached = Object.freeze({ result: Object.freeze(result), frame });
    return cached;
  };
  // Admission re-executes from the actual origin; no later archived state or receipt input is injected.
  execute(witnesses.length - 1, false);
  return Object.freeze({
    parentId: origin.parentId,
    positions: Object.freeze(positions),
    sourceRootHash: mapped.ghost.rootHash,
    seekFrame: (index: number) => execute(index, true),
  });
}
