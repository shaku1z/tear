import type { TearGameplayEvent } from "../../gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../../tearbench/gameplay-causal-events";
import type { GhostPracticeChild } from "../../ghost/replay-world";
import { challengeGoal, type RecordedGhostChallengeResult } from "../../ghost/recorded-challenge";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";

export interface LiveGhostChallengePorts {
  prepare(child: GhostPracticeChild, signal: AbortSignal): Promise<GhostPracticeLaunchResult>;
  finish(reason: "goal" | "abandoned" | "defeated", tick: number): Promise<RecordedGhostChallengeResult>;
  captureEndpoint?(tick: number): void;
  pause(): void;
  notice(message: string): void;
}
/** Native events choose an endpoint; only a committed step may seal a goal. */
export function createLiveGhostChallengeController(ports: LiveGhostChallengePorts) {
  let child: GhostPracticeChild | undefined, generation = 0, busy = false, ending: "goal" | "abandoned" | "defeated" | undefined;
  let finishing = false, lastStep = 0;
  let preparation: AbortController | undefined;
  const events: ReturnType<typeof createGameplayCausalEvent>[] = [];
  const finish = (reason: "goal" | "abandoned" | "defeated", tick: number, defer = true) => {
    if (finishing || child === undefined) return;
    finishing = true; ports.captureEndpoint?.(tick); ports.pause(); const ticket = generation;
    // Leave the authoritative execute and application-frame end before capture/seal.
    const execute = async () => {
      try { const result = await ports.finish(reason, tick); if (ticket === generation) ports.notice(`LOCAL CHALLENGE · ${result.status.toUpperCase()} · ${String(result.elapsedTicks)} TICKS`); }
      catch (error) { if (ticket === generation) ports.notice(`Challenge result unavailable: ${error instanceof Error ? error.message : String(error)}`); }
      finally { if (ticket === generation) { child = undefined; busy = finishing = false; ending = undefined; } }
    };
    if (defer) void Promise.resolve().then(execute); else void execute();
  };
  return Object.freeze({
    launch(request: GhostPracticeChild): GhostPracticeLaunchResult {
      if (busy || child !== undefined || request.challenge === undefined) return { ok: false, message: "A local challenge is already active or the request is unsupported." };
      busy = true; const ticket = ++generation, owner = new AbortController(); preparation = owner;
      const completion = ports.prepare(request, owner.signal).then((result) => {
        if (ticket !== generation) return { ok: false as const, message: "Challenge start cancelled." };
        busy = false; preparation = undefined;
        if (result.ok) { child = request; lastStep = request.forkTick; events.length = 0; ending = undefined; finishing = false; }
        return result;
      }).catch((error: unknown) => { if (ticket === generation) { busy = false; preparation = undefined; } return { ok: false as const, message: error instanceof Error ? error.message : "Challenge preparation failed." }; });
      return { ok: false, message: "Preparing the verified local challenge…", completion };
    },
    observe(event: TearGameplayEvent): void {
      if (child?.challenge === undefined || finishing || event.tick <= child.forkTick) return;
      events.push(createGameplayCausalEvent(event, events.length + 1, `observed-${String(events.length)}`, "engine"));
      if (event.kind === "run" && (event.transition === "abandoned" || event.transition === "defeated")) {
        ending = event.transition === "defeated" ? "defeated" : "abandoned";
        if (event.transition === "abandoned") finish("abandoned", event.tick);
      } else if (challengeGoal(child.challenge, events) !== undefined) ending = "goal";
    },
    afterStep(tick: number): void {
      if (child?.challenge === undefined || finishing) return;
      lastStep = tick;
      if (ending !== undefined) finish(ending, tick);
      else if (tick - child.forkTick >= child.challenge.limitTicks) finish("abandoned", tick);
    },
    stop(): boolean { if (child === undefined || finishing) return false; finish("abandoned", lastStep, false); return true; },
    reset(): void { preparation?.abort(); preparation = undefined; if (child !== undefined && !finishing) finish("abandoned", lastStep, false); generation++; child = undefined; busy = finishing = false; ending = undefined; events.length = 0; },
    active(): boolean { return busy || child !== undefined; },
  });
}
