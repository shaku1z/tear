import type { LiveGhostRecordingSessionState } from "./live-ghost-recording-session-state";
import type { createLiveGhostFrameRecording } from "./live-ghost-frame-recording";
import type { TearSnapshotV1 } from "../tearbench/contracts";
import type { GhostAuthoritativeReceiptV1 } from "../ghost/authoritative-receipt";
import type { GhostFinaleCompanionV1, GhostFinaleFrameWitness } from "../ghost/finale-companion";
import { stableVerificationHash } from "../replay/hash";

/** One source identity owns the asynchronous handoff. It never owns gameplay or durable rewards. */
export function createLiveGhostFinaleCompanion(options: Readonly<{
  session: LiveGhostRecordingSessionState; frames: ReturnType<typeof createLiveGhostFrameRecording>;
  tick(): number; run(): object; finaleActive(): boolean; completed(): boolean;
  captureReceipt(tick: number): TearSnapshotV1 | undefined;
  witness(): unknown;
}>) {
  let pending: { result: Readonly<Record<string, unknown>>; run: object; sessionId: string;
    recorder: NonNullable<ReturnType<LiveGhostRecordingSessionState["recorder"]>>;
    context: ReturnType<LiveGhostRecordingSessionState["replayContext"]> } | undefined;
  let observed: { snapshot: TearSnapshotV1; receipt: GhostAuthoritativeReceiptV1 } | undefined;
  let active: { id: string; run: object; declaration: GhostFinaleCompanionV1;
    recorder: NonNullable<ReturnType<LiveGhostRecordingSessionState["recorder"]>>; lastClosedSequence: number;
    parent: ReturnType<ReturnType<typeof createLiveGhostFrameRecording>["handoff"]>["parent"] } | undefined;
  const current = () => active?.run === options.run() && options.session.recorder()?.active === true && options.session.recorder()?.activeSessionId === active.id;
  return Object.freeze({
    observed(snapshot: TearSnapshotV1 | undefined, receipt: GhostAuthoritativeReceiptV1) { if (snapshot !== undefined) observed = { snapshot, receipt }; },
    interceptFinish(result: Readonly<Record<string, unknown>>) {
      if (!options.finaleActive()) return false;
      const recorder = options.session.recorder(), context = options.session.replayContext();
      if (recorder?.active !== true || context === undefined) return false;
      options.frames.prepareHandoff();
      pending = { result, run: options.run(), recorder, context, sessionId: recorder.activeSessionId }; return true;
    },
    reset() { if (active?.recorder.active === true && active.recorder.activeSessionId === active.id) active.recorder.interrupt("Finale capture interrupted by run replacement"); pending = undefined; observed = undefined; active = undefined; },
    afterTick() {
      if (pending === undefined || !options.finaleActive()) return;
      const recorder = options.session.recorder(), context = options.session.replayContext(), owner = pending, result = owner.result;
      pending = undefined;
      if (recorder?.active !== true || context === undefined || owner.run !== options.run() || recorder !== owner.recorder
        || context !== owner.context || recorder.activeSessionId !== owner.sessionId) return;
      if (observed?.snapshot.tick !== options.tick()) options.captureReceipt(options.tick());
      if (observed?.snapshot.tick !== options.tick()) { recorder.interrupt("Finale committed origin was not captured"); options.session.setReplayContext(undefined); return; }
      const origin = observed, handoff = options.frames.handoff(result);
      const declaration: GhostFinaleCompanionV1 = { format: "tearghost-finale-companion", version: 1,
        parentId: handoff.sessionId, sourceSessionId: handoff.sessionId, sourceRunId: context.run.id,
        parentContextHash: stableVerificationHash(context), origin: { tick: origin.snapshot.tick, snapshotId: origin.snapshot.id,
          exactHash: origin.snapshot.hashes.exact, input: origin.receipt.input, cursor: handoff.cursor, inherited: handoff.inherited } };
      const id = `${handoff.sessionId}:finale`;
      recorder.start({ sessionId: id, createdAt: new Date().toISOString(), provenance: { replayContext: context, finaleCompanion: declaration } });
      active = { id, run: options.run(), declaration, parent: handoff.parent, recorder, lastClosedSequence: handoff.cursor.open === undefined ? handoff.cursor.sequence : -1 };
      for (const event of handoff.inherited) recorder.record("events", event.tick, event);
      recorder.record("keyframes", origin.snapshot.tick, origin.snapshot);
      recorder.record("results", origin.receipt.tick, origin.receipt);
    },
    frameEnded() {
      if (!current() || active === undefined) { active = undefined; return; }
      const recorder = options.session.recorder(); if (recorder === null) return;
      if (!options.finaleActive() && !options.completed()) { recorder.interrupt("Finale cancelled before completion"); active = undefined; return; }
      const owner = active, cursor = options.frames.receipt().cursor;
      if (cursor.open !== undefined || cursor.sequence === owner.lastClosedSequence) return;
      owner.lastClosedSequence = cursor.sequence;
      const witness: GhostFinaleFrameWitness = { format: "tearghost-finale-frame", version: 1, tick: options.tick(), cursor,
        stateHash: stableVerificationHash(options.witness()), completed: options.completed() };
      recorder.record("results", witness.tick, witness);
      if (!witness.completed) return;
      active = undefined;
      const parent = owner.parent.then((manifest) => {
        if (manifest === null) throw new Error("Finale scored parent did not finalize");
        return [{ kind: "results" as const, tick: witness.tick, value: { format: "tearghost-finale-parent", version: 1,
          parentId: manifest.id, rootIntegrity: manifest.rootIntegrity, manifestHash: stableVerificationHash(manifest), originHash: stableVerificationHash(owner.declaration) } }];
      });
      void recorder.finish({ boundary: "finale-completed", tick: witness.tick, cursor }, parent);
      options.session.setReplayContext(undefined);
    },
  });
}
