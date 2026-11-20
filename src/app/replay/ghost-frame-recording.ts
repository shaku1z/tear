import {
  GHOST_APPLICATION_FRAMES_V1,
  createGhostApplicationClockEvent,
  type GhostApplicationClockEvent,
  type GhostApplicationFrameCursor,
  type GhostApplicationFrameReceipt,
  type GhostFrameConfirm,
} from "../../ghost/application-frame-events";
import type { LiveGhostRecordingSessionState } from "./ghost-recording-session-state";
import type { GhostReplayRunContextV1 } from "../../ghost/replay-admission";

export function declareGhostApplicationFrames(context: GhostReplayRunContextV1): GhostReplayRunContextV1 {
  return Object.freeze({
    ...context,
    simulation: Object.freeze({ ...context.simulation, applicationFrames: GHOST_APPLICATION_FRAMES_V1 }),
  });
}

export function createLiveGhostFrameRecording(
  options: Readonly<{
    session: LiveGhostRecordingSessionState;
    tick(): number;
    introActive(): boolean;
    afterFrame?(): void;
    closedFrame?(): void;
    interceptFinish?(result: Readonly<Record<string, unknown>>): boolean;
  }>,
) {
  let cursor: GhostApplicationFrameCursor = Object.freeze({ version: 1, ordinal: 0, sequence: 0 });
  let open: GhostApplicationClockEvent | undefined;
  let pendingFinish: (() => void) | undefined;
  let chosen:
    | Readonly<{
        seconds: number;
        confirm: GhostFrameConfirm;
        tick: number;
        sequence: number;
        binding: { version: 1; runId: string; sessionId: string };
      }>
    | undefined;
  let preludeApplied = false;
  let tail:
    ((entries: readonly { kind: "events"; tick: number; value: GhostApplicationClockEvent }[]) => void) | undefined;
  const identity = () => {
    const recorder = options.session.recorder(),
      context = options.session.replayContext();
    return recorder?.active === true && context?.simulation.applicationFrames?.version === 1
      ? {
          version: 1 as const,
          runId: context.run.id,
          sessionId: options.session.clockSessionId?.() ?? recorder.activeSessionId,
        }
      : undefined;
  };
  const record = (event: GhostApplicationClockEvent) => {
    const recorder = options.session.recorder();
    if (
      recorder?.active === true &&
      (options.session.clockSessionId?.() ?? recorder.activeSessionId) === event.payload.sessionId &&
      options.session.replayContext()?.run.id === event.payload.runId
    )
      recorder.record("events", event.tick, event);
  };
  const activate = (handoff = false) => {
    if (chosen === undefined || open !== undefined || (preludeApplied && !handoff)) return;
    const ordinal = cursor.ordinal + 1;
    open = createGhostApplicationClockEvent(chosen.sequence, chosen.tick, {
      ...chosen.binding,
      format: "tearghost-application-frame",
      kind: "begin",
      ordinal,
      beforeTick: chosen.tick,
      seconds: chosen.seconds,
      confirm: chosen.confirm,
    });
    record(open);
    cursor = Object.freeze({
      version: 1,
      ordinal,
      sequence: chosen.sequence,
      open: Object.freeze({ ordinal, beginSequence: chosen.sequence, preludeApplied }),
    });
  };
  return Object.freeze({
    reset() {
      // A replaced source run cannot inherit a previous run's frontier. An
      // interrupted clock remains incomplete evidence rather than invented time.
      pendingFinish?.();
      pendingFinish = undefined;
      open = undefined;
      chosen = undefined;
      preludeApplied = false;
      tail?.([]);
      tail = undefined;
      cursor = Object.freeze({ version: 1, ordinal: 0, sequence: 0 });
    },
    begin(seconds: number, confirm: GhostFrameConfirm, cinemaActive = false) {
      const binding = identity();
      chosen = undefined;
      preludeApplied = false;
      if (binding === undefined) return;
      if (open !== undefined) throw new Error("application-frame recording is reentrant");
      // Reserve causal order now, before cinema callbacks can install an intro.
      // Storage remains bounded to cinema/intro frames, including cinema that
      // naturally installs the next intro from an earlier source anchor.
      chosen = { seconds, confirm, tick: options.tick(), sequence: options.session.nextEventSequence(), binding };
      if (options.introActive() || cinemaActive) activate();
    },
    preludeApplied() {
      preludeApplied = true;
      if (cursor.open !== undefined)
        cursor = Object.freeze({ ...cursor, open: Object.freeze({ ...cursor.open, preludeApplied: true }) });
    },
    end(steps: number) {
      options.afterFrame?.();
      const before = open?.payload;
      chosen = undefined;
      if (open === undefined || before?.format !== "tearghost-application-frame" || before.kind !== "begin") {
        options.closedFrame?.();
        return;
      }
      const sequence = options.session.nextEventSequence();
      const event = createGhostApplicationClockEvent(sequence, options.tick(), {
        version: 1,
        runId: before.runId,
        sessionId: before.sessionId,
        format: "tearghost-application-frame",
        kind: "end",
        ordinal: before.ordinal,
        beginSequence: open.sequence,
        beforeTick: before.beforeTick,
        afterTick: options.tick(),
        steps,
        introActive: options.introActive(),
      });
      record(event);
      cursor = Object.freeze({ version: 1, ordinal: before.ordinal, sequence });
      open = undefined;
      tail?.([{ kind: "events", tick: event.tick, value: event }]);
      tail = undefined;
      const finish = pendingFinish;
      pendingFinish = undefined;
      finish?.();
      options.closedFrame?.();
    },
    installed(actorId: string, duration: number, delay: number) {
      const binding = identity();
      if (binding === undefined) return;
      // The witness belongs to the application clock. Raw fixed ticks driven
      // outside any application frame (State Setup source discovery, whose
      // timeline the forged origin rebases away) are not clock facts.
      if (chosen === undefined && open === undefined) return;
      // Cinema callbacks run before this frame's prelude; simulation installs do not.
      activate();
      const event = createGhostApplicationClockEvent(options.session.nextEventSequence(), options.tick(), {
        ...binding,
        format: "tearghost-intro-install",
        actorId,
        duration,
        delay,
      });
      record(event);
      cursor = Object.freeze({ ...cursor, sequence: event.sequence });
    },
    receipt(keyframe?: Readonly<{ id: string; exactHash: string }>): GhostApplicationFrameReceipt {
      return Object.freeze({
        version: 1,
        cursor: structuredClone(cursor),
        ...(keyframe === undefined ? {} : { keyframe }),
      });
    },
    prepareHandoff() {
      activate(true);
    },
    handoff(result: Readonly<Record<string, unknown>>) {
      activate(true);
      const recorder = options.session.recorder();
      if (recorder?.active !== true) throw new Error("Finale parent recorder unavailable");
      const sessionId = recorder.activeSessionId;
      const inherited = open === undefined ? [] : [structuredClone(open)];
      const closing =
        open === undefined
          ? undefined
          : new Promise<readonly { kind: "events"; tick: number; value: GhostApplicationClockEvent }[]>((resolve) => {
              tail = resolve;
            });
      options.session.setClockSessionId?.(sessionId);
      return { sessionId, inherited, cursor: structuredClone(cursor), parent: recorder.finish(result, closing) };
    },
    finish(result: Readonly<Record<string, unknown>>) {
      if (options.interceptFinish?.(result)) return;
      const recorder = options.session.recorder(),
        context = options.session.replayContext();
      const sessionId = recorder?.active === true ? recorder.activeSessionId : undefined;
      const finish = () => {
        if (
          recorder?.active !== true ||
          recorder.activeSessionId !== sessionId ||
          options.session.replayContext() !== context
        )
          return;
        options.session.setReplayContext(undefined);
        void recorder.finish(result);
      };
      if (open === undefined) finish();
      else pendingFinish = finish;
    },
  });
}
