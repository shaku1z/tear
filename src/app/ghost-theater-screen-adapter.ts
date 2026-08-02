import type { GhostReadCapsule } from "../ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../ghost/capsule-replay-envelope";
import { createGhostProductionReplaySession, type GhostVerifiedProductionReplaySession } from "../ghost/production-replay-session";
import { GhostTheaterTransport, type GhostTheaterState } from "../ghost/theater";
import type { GhostPracticeChild, GhostSeekResult } from "../ghost/replay-world";
import type { ReplayScreenView } from "../presentation/screens/contracts";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";

export interface GhostTheaterScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly width: () => number;
  readonly deltaSeconds: () => number;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}

export interface GhostTheaterScreenStatus {
  readonly paused: boolean;
  readonly speed: number;
  readonly infoVisible: boolean;
  readonly progress: number;
  readonly from: LegacyAppScreen;
}

interface GhostTheaterContext {
  readonly capsule: GhostReadCapsule;
  readonly session: GhostVerifiedProductionReplaySession;
  readonly transport: GhostTheaterTransport;
  readonly from: LegacyAppScreen;
  readonly checkpoints: readonly number[];
  result: GhostSeekResult;
  infoVisible: boolean;
  fractionalTicks: number;
  message?: string;
}

const TICKS_PER_SECOND = 120;
const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

function isSpeed(value: number): value is (typeof SPEEDS)[number] {
  return SPEEDS.includes(value as (typeof SPEEDS)[number]);
}

/**
 * App-side C29 Theater controller. It reads only a validated durable capsule,
 * then asks the source-owned production replay session for each shown state.
 * It owns transport state, not simulation, Vault writes, profile state, or UI.
 */
export function createGhostTheaterScreenAdapter(services: GhostTheaterScreenServices) {
  let context: GhostTheaterContext | undefined;

  const seek = (targetTick: number): void => {
    if (context === undefined) return;
    const bounded = Math.max(0, Math.min(context.capsule.maxTick, Math.floor(targetTick)));
    try {
      context.result = context.session.seek(bounded);
      context.transport.seek(bounded);
      delete context.message;
    } catch (error) {
      context.transport.pause();
      context.message = `Replay halted: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  const view = (): ReplayScreenView | undefined => {
    if (context === undefined) return undefined;
    const currentContext = context;
    const state = currentContext.transport.state();
    const current = currentContext.result.tick;
    return Object.freeze({
      id: "replay",
      title: "GHOST 3 THEATER",
      detail: `VERIFIED SOURCE SIMULATION · ${currentContext.capsule.manifest.recordingProfile.toUpperCase()}`,
      paused: !state.playing,
      speed: state.speed,
      elapsed: `TICK ${String(current)}`,
      duration: `TICK ${String(currentContext.capsule.maxTick)}`,
      progress: currentContext.capsule.maxTick === 0 ? 1 : current / currentContext.capsule.maxTick,
      score: `TICK ${String(current)}`,
      chapters: currentContext.checkpoints.map((tick) => Object.freeze({
        fraction: currentContext.capsule.maxTick === 0 ? 0 : tick / currentContext.capsule.maxTick,
        boss: false,
      })),
      infoVisible: currentContext.infoVisible,
      infoRows: Object.freeze([
        { label: "CAPSULE", value: currentContext.capsule.manifest.id },
        { label: "CUSTODY", value: currentContext.session.sourceRootHash },
        { label: "CHECKPOINT", value: currentContext.checkpoints.includes(current) ? "VERIFIED" : "REPLAYED" },
        { label: "STATE HASH", value: currentContext.result.semanticHash },
      ]),
      ...(currentContext.message === undefined ? {} : { notice: currentContext.message }),
      theater: true,
      practiceAvailable: currentContext.checkpoints.includes(current),
    });
  };

  const advance = (): void => {
    if (context === undefined) return;
    const state = context.transport.state();
    if (!state.playing) return;
    context.fractionalTicks += Math.max(0, services.deltaSeconds()) * TICKS_PER_SECOND * state.speed;
    const wholeTicks = Math.floor(context.fractionalTicks);
    context.fractionalTicks -= wholeTicks;
    if (wholeTicks <= 0) return;
    const target = Math.min(context.capsule.maxTick, state.tick + wholeTicks);
    seek(target);
    if (target === context.capsule.maxTick) context.transport.pause();
  };

  return Object.freeze({
    open(capsule: GhostReadCapsule, from: LegacyAppScreen): boolean {
      try {
        const session = createGhostProductionReplaySession(capsule);
        const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
        const transport = new GhostTheaterTransport(mapped.ghost.events, services.width());
        const result = session.seek(0);
        context = {
          capsule,
          session,
          transport,
          from,
          checkpoints: session.verifiedReceiptTicks,
          result,
          infoVisible: false,
          fractionalTicks: 0,
        };
        return true;
      } catch {
        context = undefined;
        return false;
      }
    },
    render(): void {
      advance();
      const snapshot = view();
      if (snapshot !== undefined) services.render(snapshot);
    },
    exit(): LegacyAppScreen | undefined {
      const from = context?.from;
      context = undefined;
      return from;
    },
    togglePause(): void {
      if (context === undefined) return;
      if (context.transport.state().playing) context.transport.pause(); else context.transport.play();
    },
    seekBy(seconds: number): void { seek((context?.transport.state().tick ?? 0) + Math.round(seconds * TICKS_PER_SECOND)); },
    seekToFraction(fraction: number): void { seek(Math.round((context?.capsule.maxTick ?? 0) * Math.max(0, Math.min(1, fraction)))); },
    jumpCheckpoint(direction: number): void {
      if (context === undefined) return;
      const current = context.transport.state().tick;
      const ordered = direction < 0 ? [...context.checkpoints].reverse() : context.checkpoints;
      const next = ordered.find((tick) => direction < 0 ? tick < current : tick > current) ?? current;
      seek(next);
    },
    restart(): void { seek(0); },
    practice(): void {
      if (context === undefined) return;
      const tick = context.result.tick;
      if (!context.checkpoints.includes(tick)) {
        context.message = "Practice requires a verified recorded checkpoint.";
        return;
      }
      try {
        const child = context.session.forkPractice(tick, "exact-practice");
        context.transport.pause();
        const launched = services.launchPractice(child);
        context.message = launched.ok
          ? "Practice child launched. This run is unranked and non-persistent."
          : launched.message;
      } catch (error) {
        context.message = `Practice unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    toggleInfo(): void { if (context !== undefined) context.infoVisible = !context.infoVisible; },
    setSpeed(value: number): void { if (context !== undefined && isSpeed(value)) context.transport.speed(value); },
    status(): GhostTheaterScreenStatus | null {
      if (context === undefined) return null;
      const state: GhostTheaterState = context.transport.state();
      return Object.freeze({ paused: !state.playing, speed: state.speed, infoVisible: context.infoVisible,
        progress: context.capsule.maxTick === 0 ? 1 : state.tick / context.capsule.maxTick, from: context.from });
    },
  });
}
