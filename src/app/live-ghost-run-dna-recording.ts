import { RunDnaObserver, type RunDnaBody, type RunDnaLoadout } from "../gameplay/runtime/run-dna-observer";
import type { LiveGhostRecordingSessionState } from "./live-ghost-recording-session-state";
import type { GhostReplayRunContextV1 } from "../ghost/replay-admission";

/** Recording owns its observer; replacement worlds cannot donate measurements. */
export function createLiveGhostRunDnaRecording(options: Readonly<{
  session: LiveGhostRecordingSessionState;
  player(): RunDnaBody; blade(): object; run(): RunDnaLoadout & object; tick(): number; practice(): boolean;
}>) {
  let owner: Readonly<{ observer: RunDnaObserver; sessionId: string; context: GhostReplayRunContextV1;
    player: RunDnaBody; blade: object; run: RunDnaLoadout & object }> | undefined;
  let inTick = false;
  let pending: (() => void) | undefined;
  const current = () => owner !== undefined && options.session.recorder()?.active === true
    && options.session.recorder()?.activeSessionId === owner.sessionId && options.session.replayContext() === owner.context
    && options.player() === owner.player && options.blade() === owner.blade && options.run() === owner.run;
  return Object.freeze({
    start(context: GhostReplayRunContextV1 | undefined) {
      owner?.observer.dispose(); owner = undefined; pending = undefined; inTick = false;
      const recorder = options.session.recorder();
      if (context === undefined || recorder?.active !== true || options.practice()) return;
      const observer = new RunDnaObserver(context.run.id, recorder.activeSessionId);
      const player = options.player(), blade = options.blade(), run = options.run();
      observer.bind(player, blade, run); observer.observeLoadout(player, run);
      owner = { observer, context, sessionId: recorder.activeSessionId, player, blade, run };
      if (options.tick() !== 0) observer.invalidate("capture does not start at whole-run origin");
    },
    beforeTick(tick: number) {
      if (!current() || owner === undefined) { owner?.observer.dispose(); owner = undefined; return; }
      if (options.practice()) owner.observer.invalidate("practice origin is not whole-run evidence");
      inTick = true; owner.observer.beginTick(tick, owner.player, owner.run);
    },
    afterTick(tick: number) {
      if (current() && owner !== undefined) owner.observer.completeTick(tick, owner.player);
      else owner?.observer.invalidate("world replaced before canonical commit");
      inTick = false; const finish = pending; pending = undefined; finish?.();
    },
    frameEnded() { if (current() && owner !== undefined && !inTick) owner.observer.frameEnded(options.tick()); },
    finish(complete: () => void) {
      const captured = owner, recorder = options.session.recorder(), context = options.session.replayContext();
      const sessionId = recorder?.active === true ? recorder.activeSessionId : undefined;
      const finish = () => {
        if (recorder?.active !== true || recorder.activeSessionId !== sessionId || options.session.replayContext() !== context) return;
        if (captured !== undefined && owner === captured && current()) {
          captured.observer.observeLoadout(captured.player, captured.run);
          const result = captured.observer.capture(captured.observer.committedTick, options.tick());
          options.session.recorder()?.record("results", result.capture.endTick, result);
          captured.observer.dispose(); owner = undefined;
        }
        complete();
      };
      // Outcomes can finish during collision/tail handling. Keep the recorder
      // active through its committed tick, then let frame ownership close too.
      if (inTick) pending = finish; else finish();
    },
  });
}
