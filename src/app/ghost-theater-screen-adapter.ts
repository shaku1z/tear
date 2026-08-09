import type { GhostReadCapsule } from "../ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../ghost/capsule-replay-envelope";
import { createGhostProductionReplaySession, type GhostVerifiedProductionReplaySession } from "../ghost/production-replay-session";
import { GhostTheaterTransport, type GhostTheaterState } from "../ghost/theater";
import type { GhostPracticeChild, GhostSeekResult } from "../ghost/replay-world";
import type { ReplayScreenView } from "../presentation/screens/contracts";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";
import { projectGhostCoachPractice, type GhostCoachPracticeProjection } from "../ghost/coach-practice";
import { projectGhostRunDnaTheater } from "../ghost/run-dna-theater";

export interface GhostTheaterScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly width: () => number;
  readonly deltaSeconds: () => number;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
  readonly loadCoachCandidates: () => Promise<readonly GhostReadCapsule[]>;
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
  coachOpen: boolean;
  coachCandidates: readonly GhostReadCapsule[];
  coach: GhostCoachPracticeProjection | undefined;
  runDnaOpen: boolean;
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
      ...(currentContext.coachOpen ? { coach: Object.freeze({
        targetId: currentContext.capsule.manifest.id,
        ...(currentContext.coach === undefined ? {} : { baselineId: currentContext.coach.baselineId, buildId: currentContext.coach.buildId, provenanceHash: currentContext.coach.provenanceHash }),
        candidates: currentContext.coachCandidates.filter((candidate) => candidate.manifest.id !== currentContext.capsule.manifest.id).map((candidate) => Object.freeze({
          id: candidate.manifest.id, enabled: true, detail: candidate.manifest.recordingProfile.toUpperCase(),
        })),
        findings: (currentContext.coach?.findings ?? []).map((finding) => Object.freeze({ id: finding.id, domain: finding.domain,
          detail: `${finding.suggestedDrill.title} · TICK ${String(finding.range.fromTick)}–${String(finding.range.toTick)}`,
          practiceAvailable: currentContext.checkpoints.includes(current),
        })), unavailable: currentContext.coach?.unavailable ?? Object.freeze(["select one distinct healthy same-build baseline"]),
      }) } : {}),
      ...(currentContext.runDnaOpen ? { runDna: projectGhostRunDnaTheater(currentContext.capsule) } : {}),
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
          coachOpen: false,
          coachCandidates: Object.freeze([]),
          coach: undefined,
          runDnaOpen: false,
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
    openCoach(): void {
      if (context === undefined) return;
      context.coachOpen = true;
      context.message = "Coach: select a distinct healthy local baseline.";
      void services.loadCoachCandidates().then((candidates) => {
        if (context !== undefined) context.coachCandidates = candidates;
      }).catch(() => { if (context !== undefined) context.message = "Coach baseline list is unavailable in this browser."; });
    },
    selectCoachBaseline(id: string): void {
      if (!context?.coachOpen) return;
      const baseline = context.coachCandidates.find((candidate) => candidate.manifest.id === id);
      if (baseline === undefined) { context.message = "Coach baseline is not available."; return; }
      try { context.coach = projectGhostCoachPractice(context.capsule, baseline); context.message = "Coach findings use only the selected verified same-build pair."; }
      catch (error) { context.coach = undefined; context.message = `Coach unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    },
    practiceCoachFinding(findingId: string): void {
      if (context?.coach === undefined) return;
      const finding = context.coach.findings.find((candidate) => candidate.id === findingId);
      if (finding === undefined) return;
      const tick = context.result.tick;
      if (!context.checkpoints.includes(tick)) { context.message = "Coach practice requires the current verified checkpoint."; return; }
      try {
        const child = context.session.forkPractice(tick, "coach-assisted");
        context.transport.pause();
        const launched = services.launchPractice(child);
        context.message = launched.ok ? `Coach practice launched for ${finding.domain}; it is unranked and non-persistent.` : launched.message;
      } catch (error) { context.message = `Coach practice unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    },
    toggleRunDna(): void { if (context !== undefined) context.runDnaOpen = !context.runDnaOpen; },
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
