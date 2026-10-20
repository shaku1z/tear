import { handleReplayTransport, type ReplayNativeTransport } from "./replay-transport-controller";
import { recordedGhostChallengeChoices, type RecordedGhostChallenge, type RecordedGhostChallengeResult } from "../ghost/recorded-challenge";
import type { GhostForkPermit } from "../ghost/fork-origin";
import type { ProductionGhostReplayCompositionOptions } from "../tearbench/production-replay-composition";
import type { GhostStudioBrowserMediaPort, GhostStudioWebmArtifact } from "./browser-ghost-studio-media";
import type { GhostVerifiedReplayRenderView } from "../ghost/production-replay-session";
import { createStudioEdl } from "../ghost/player-experiences";
import type { GhostReadCapsule } from "../ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../ghost/capsule-replay-envelope";
import { createGhostProductionReplaySession, type GhostVerifiedProductionReplaySession } from "../ghost/production-replay-session";
import { GhostTheaterTransport, type GhostTheaterState } from "../ghost/theater";
import type { GhostPracticeChild, GhostSeekResult } from "../ghost/replay-world";
import type { ReplayScreenView } from "../presentation/screens/contracts";
import type { LegacyAppScreen } from "./legacy-state-controller";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";
import { ghostCoachCandidate } from "../ghost/coach-history";
import { createGhostCoachHistoryController, type GhostCoachHistoryPort } from "./ghost-coach-history-controller";
import { projectGhostRunDnaTheater } from "../ghost/run-dna-theater";
import { createGhostStudioCutListFromTheater } from "../ghost/studio-cut-list-theater";
import type { GhostStudioEditDecisionList } from "../ghost/player-experiences";
import { refuseGhostTheater, type GhostTheaterOpenResult } from "../ghost/theater-open-result";

export interface GhostTheaterScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly presentation?: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView">;
  readonly drawWorld?: (view: GhostVerifiedReplayRenderView) => void;
  readonly studioMedia?: GhostStudioBrowserMediaPort;
  readonly width: () => number;
  readonly deltaSeconds: () => number;
  readonly nativeTransport?: () => ReplayNativeTransport;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
  readonly coachHistory: GhostCoachHistoryPort;
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
  challengeOpen: boolean;
  challengeResult: RecordedGhostChallengeResult | undefined;
  challengeChoices: readonly RecordedGhostChallenge[];
  firstTick: number;
  lastTick: number;
  coachOpen: boolean;
  runDnaOpen: boolean;
  studioOpen: boolean;
  studioCutList: GhostStudioEditDecisionList | undefined;
  frame: GhostVerifiedReplayRenderView | undefined;
  coachScene: boolean;
  studioMark: number | undefined;
  studioAbort: AbortController | undefined;
  studioArtifact: GhostStudioWebmArtifact | undefined;
  studioStatus: "idle" | "rendering" | "ready" | "failed" | "cancelled" | "download-requested";
  finaleAvailable?: boolean;
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
  const history = createGhostCoachHistoryController(services.coachHistory);
  const invalidateStudio = (): void => {
    context?.studioAbort?.abort(); services.studioMedia?.dispose();
    if (context !== undefined) { context.studioAbort = undefined; context.studioArtifact = undefined; context.studioStatus = "idle"; }
  };

  const seek = (targetTick: number): boolean => {
    if (context === undefined) return false;
    const bounded = Math.max(context.firstTick, Math.min(context.lastTick, Math.floor(targetTick)));
    try {
      const result = context.session.seek(bounded);
      const frame = context.session.renderFrame?.(bounded);
      context.result = result;
      context.frame = frame;
      context.transport.seek(bounded);
      delete context.message;
      return context.result.tick === bounded;
    } catch (error) {
      context.transport.pause();
      context.message = `Replay halted: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    }
  };

  const challengeChoices = () => {
    if (!context?.checkpoints.includes(context.result.tick)) return [];
    const snapshot = mapGhostCapsuleToReplayEnvelope(context.capsule).ghost.snapshots.find((entry) => entry.tick === context?.result.tick);
    return snapshot === undefined ? [] : recordedGhostChallengeChoices(context.capsule, snapshot);
  };
  const view = (): ReplayScreenView | undefined => {
    if (context === undefined) return undefined;
    const currentContext = context;
    const state = currentContext.transport.state();
    const current = currentContext.result.tick;
    return Object.freeze({
      id: "replay",
      ...(currentContext.finaleAvailable ? { finaleNavigation: "FINALE CONTINUATION" as const } : {}),
      title: "GHOST 3 THEATER",
      detail: `VERIFIED SOURCE SIMULATION · ${currentContext.capsule.manifest.recordingProfile.toUpperCase()}${currentContext.capsule.manifest.provenance?.ghostAssistance === undefined ? "" : " · ASSISTED / NONCOMPETITIVE"}`,
      paused: !state.playing,
      speed: state.speed,
      elapsed: `TICK ${String(current)}`,
      duration: `TICK ${String(currentContext.lastTick)}`,
      progress: currentContext.lastTick === 0 ? 1 : (current - currentContext.firstTick) / Math.max(1, currentContext.lastTick - currentContext.firstTick),
      score: `TICK ${String(current)}`,
      chapters: currentContext.checkpoints.map((tick) => Object.freeze({
        fraction: currentContext.lastTick === 0 ? 0 : (tick - currentContext.firstTick) / Math.max(1, currentContext.lastTick - currentContext.firstTick),
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
      theater: true, worldVisible: currentContext.frame !== undefined, coachReturnAvailable: currentContext.coachScene,
      practiceAvailable: currentContext.challengeResult === undefined && currentContext.checkpoints.includes(current),
      ...(currentContext.challengeOpen ? { challenge: { choices: currentContext.challengeResult === undefined ? currentContext.challengeChoices.map((choice) => ({ id: choice.rule + ":" + choice.target, label: choice.label })) : [],
        tick: current, ...(currentContext.challengeResult === undefined ? {} : { result: currentContext.challengeResult.status, elapsedTicks: currentContext.challengeResult.elapsedTicks }) } } : {}),
      ...(currentContext.coachOpen ? { coach: history.snapshot() } : {}),
      ...(currentContext.runDnaOpen ? { runDna: projectGhostRunDnaTheater(currentContext.capsule) } : {}),
      ...(currentContext.studioOpen ? { studioCutList: currentContext.studioCutList === undefined
        ? Object.freeze({ available: context.checkpoints.includes(current), ...(context.checkpoints.includes(current)
          ? {} : { unavailable: "Replay Editor requires the current verified replay checkpoint." }) })
        : Object.freeze({ available: true, sourceGhostId: currentContext.studioCutList.sourceGhostId,
          sourceRootHash: currentContext.studioCutList.sourceRootHash, fromTick: currentContext.studioCutList.clips[0]?.sourceFromTick ?? 0,
          toTick: currentContext.studioCutList.clips.at(-1)?.sourceToTick ?? 0, edlHash: currentContext.studioCutList.edlHash, clipCount: currentContext.studioCutList.clips.length }) } : {}),
      ...(currentContext.studioOpen ? { studioMedia: { available: services.studioMedia?.available() === true, status: currentContext.studioStatus, markIn: currentContext.studioMark, thumbnail: currentContext.studioArtifact?.thumbnail, duration: currentContext.studioArtifact?.durationSeconds } } : {}),
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
    const target = Math.min(context.lastTick, state.tick + wholeTicks);
    seek(target);
    if (target === context.lastTick) context.transport.pause();
  };

  return Object.freeze({
    finaleLink(available: boolean) { if (context !== undefined) context.finaleAvailable = available; },
    sourceId: () => context?.capsule.manifest.id,
    open(capsule: GhostReadCapsule, from: LegacyAppScreen, evidence?: Readonly<{ permit: GhostForkPermit; result: RecordedGhostChallengeResult }>): GhostTheaterOpenResult {
      invalidateStudio();
      history.close();
      let mapped: ReturnType<typeof mapGhostCapsuleToReplayEnvelope>;
      try { mapped = mapGhostCapsuleToReplayEnvelope(capsule); }
      catch {
        context = undefined;
        return refuseGhostTheater("source-invalid", capsule.manifest.rootIntegrity);
      }
      const codecFailure = mapped.issues.find((entry) => entry.track === "keyframes" && entry.reason.includes("isolated codec preflight"));
      if (codecFailure !== undefined) {
        context = undefined;
        return refuseGhostTheater("codec-preflight", capsule.manifest.rootIntegrity, codecFailure.tick);
      }
      try {
        const session = createGhostProductionReplaySession(capsule, services.presentation, evidence?.permit);
        const transport = new GhostTheaterTransport(mapped.ghost.events, services.width());
        const firstTick = session.firstTick ?? 0;
        const result = session.seek(firstTick); transport.seek(firstTick);
        context = {
          capsule,
          session,
          transport,
          from,
          checkpoints: session.verifiedReceiptTicks,
          result,
          infoVisible: false,
          fractionalTicks: 0,
          firstTick, lastTick: session.lastTick ?? capsule.maxTick, challengeOpen: evidence !== undefined, challengeResult: evidence?.result, challengeChoices: [], coachOpen: false,
          runDnaOpen: false,
          studioOpen: false,
          studioCutList: undefined, frame: session.renderFrame?.(firstTick), coachScene: false, studioMark: undefined, studioAbort: undefined, studioArtifact: undefined, studioStatus: "idle",
        };
        return Object.freeze({ kind: "opened", root: capsule.manifest.rootIntegrity, tick: firstTick });
      } catch {
        context = undefined;
        return refuseGhostTheater("source-verification", capsule.manifest.rootIntegrity);
      }
    },
    render(): void {
      advance();
      if (context !== undefined && !context.coachOpen && !context.challengeOpen && !context.runDnaOpen && !context.studioOpen) {
        const native = services.nativeTransport?.(), current = context;
        if (native !== undefined) handleReplayTransport({ ...native,
          currentTime: (current.result.tick - current.firstTick) / TICKS_PER_SECOND,
          duration: (current.lastTick - current.firstTick) / TICKS_PER_SECOND,
          seek: (seconds) => { seek(current.firstTick + Math.round(seconds * TICKS_PER_SECOND)); },
          toggle: () => { if (current.transport.state().playing) current.transport.pause(); else current.transport.play(); } });
      }
      const snapshot = view();
      if (context?.frame !== undefined) services.drawWorld?.(context.frame);
      if (snapshot !== undefined) services.render(snapshot);
    },
    exit(): LegacyAppScreen | undefined {
      const from = context?.from;
      invalidateStudio(); context = undefined;
      history.close();
      return from;
    },
    togglePause(): void {
      if (context === undefined) return;
      if (context.transport.state().playing) context.transport.pause(); else context.transport.play();
    },
    seekBy(seconds: number): void { seek((context?.transport.state().tick ?? 0) + Math.round(seconds * TICKS_PER_SECOND)); },
    seekToFraction(fraction: number): void { seek(Math.round((context?.firstTick ?? 0) + ((context?.lastTick ?? 0) - (context?.firstTick ?? 0)) * Math.max(0, Math.min(1, fraction)))); },
    jumpCheckpoint(direction: number): void {
      if (context === undefined) return;
      const current = context.transport.state().tick;
      const ordered = direction < 0 ? [...context.checkpoints].reverse() : context.checkpoints;
      const next = ordered.find((tick) => direction < 0 ? tick < current : tick > current) ?? current;
      seek(next);
    },
    restart(): void { seek(context?.firstTick ?? 0); },
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
        invalidateStudio(); const launched = services.launchPractice(child);
        context.message = launched.ok
          ? "Practice child launched. This run is unranked and non-persistent."
          : launched.message;
      } catch (error) {
        context.message = `Practice unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    openChallenges(): void {
      if (context === undefined) return;
      context.challengeOpen = !context.challengeOpen; context.coachOpen = context.runDnaOpen = context.studioOpen = false;
      if (context.challengeOpen) context.challengeChoices = challengeChoices();
      context.transport.pause(); history.close();
    },
    startChallenge(id: string): void {
      const captured = context, choice = challengeChoices().find((entry) => entry.rule + ":" + entry.target === id);
      if (captured === undefined || choice === undefined) return;
      try {
        const child = captured.session.forkPractice(captured.result.tick, "race-practice");
        const launched = services.launchPractice({ ...child, challenge: choice });
        captured.message = launched.ok ? "Local challenge launched · no rewards or rankings." : launched.message;
        if (!launched.ok && launched.completion !== undefined) void launched.completion.then((result) => {
          if (context === captured) captured.message = result.ok ? "Local challenge launched · MAIN MENU → QUIT to stop." : result.message;
        });
      } catch (error) { captured.message = `Challenge unavailable: ${error instanceof Error ? error.message : String(error)}`; }
    },
    openCoach(): void {
      if (context === undefined) return;
      delete context.message;
      context.coachOpen = !context.coachOpen; context.challengeOpen = false;
      context.runDnaOpen = context.studioOpen = false;
      context.transport.pause();
      if (context.coachOpen) void history.open(ghostCoachCandidate(context.capsule.manifest)); else history.close();
    },
    selectCoachBaseline(id: string): void { if (context?.coachOpen) { delete context.message; void history.toggle(id); } },
    controlCoach(command: "close" | "scene" | "page" | "metric" | "moment" | "details" | "sources" | "rows" | "section", delta: number): void {
      if (context?.coachScene && command === "scene") { context.coachScene = false; context.coachOpen = true; return; }
      if (!context?.coachOpen) return;
      if (command === "scene") { context.coachOpen = false; context.coachScene = true; return; }
      if (command === "close") { context.coachOpen = false; history.close(); }
      else if (command === "details") history.details();
      else if (command === "sources") history.sources();
      else history[command](delta);
    },
    viewCoachMoment(id: string): void {
      const captured = context;
      if (!captured?.coachOpen) return;
      void history.action(id, (moment) => {
        if (context !== captured) return;
        captured.transport.pause();
        if (seek(moment.tick) && captured.result.tick === moment.tick) { captured.coachOpen = false; captured.coachScene = true; captured.message = `Reconstructed source scene · TICK ${String(moment.tick)} · return to Coach for practice.`; }
      });
    },
    practiceCoachFinding(id: string): void {
      const captured = context;
      if (!captured?.coachOpen) return;
      void history.action(id, (moment) => {
        if (context !== captured || moment.priorTick === undefined || !captured.checkpoints.includes(moment.priorTick)) return;
        try {
          const child = captured.session.forkPractice(moment.priorTick, "coach-assisted");
          captured.transport.pause();
          invalidateStudio(); const launched = services.launchPractice(child);
          captured.message = launched.ok ? "Practice launched before the cited moment · unranked and non-persistent." : launched.message;
          if (launched.ok) { history.close(); captured.coachOpen = false; }
        } catch (error) { captured.message = `Practice unavailable: ${error instanceof Error ? error.message : String(error)}`; }
      });
    },
    toggleRunDna(): void { if (context !== undefined) { context.runDnaOpen = !context.runDnaOpen; context.coachOpen = context.studioOpen = false; history.close(); } },
    toggleStudio(): void { if (context !== undefined) { context.studioOpen = !context.studioOpen; context.coachOpen = context.runDnaOpen = false; history.close(); } },
    markStudioIn(): void {
      if (!context?.checkpoints.includes(context.result.tick)) return;
      invalidateStudio(); context.studioMark = context.result.tick;
      context.message = `IN marked at verified TICK ${String(context.studioMark)}. Seek an OUT checkpoint and append.`;
    },
    clearStudioCuts(): void { if (context !== undefined) { invalidateStudio(); context.studioCutList = undefined; context.studioMark = undefined; } },
    createStudioCutList(): void {
      if (context === undefined) return;
      const projected = createGhostStudioCutListFromTheater(context.capsule, context.session, context.result.tick, context.studioMark, context.transport.state().speed);
      if (projected.edl === undefined) { context.message = projected.unavailable ?? "Replay Editor Cut List is unavailable."; return; }
      invalidateStudio(); const prior = context.studioCutList?.clips ?? [];
      context.studioCutList = createStudioEdl({ ...projected.edl, id: `studio-${context.session.sourceId}`, clips: [...prior,
        ...projected.edl.clips.map((clip) => ({ ...clip, id: `clip-${String(prior.length)}`, outputOrder: prior.length }))] });
      context.message = "Cut appended in chosen order · reconstructed player-follow · simulation time.";
    },
    exportStudio(): void {
      const captured = context, media = services.studioMedia;
      if (captured?.studioCutList === undefined || media?.available() !== true) return;
      invalidateStudio(); captured.transport.pause(); const operation = new AbortController(); captured.studioAbort = operation;
      captured.studioStatus = "rendering"; captured.message = "Encoding local replay canvas; the live game canvas is not recorded.";
      void media.render(captured.capsule, captured.session, captured.studioCutList, operation.signal).then((artifact) => {
        if (context !== captured || captured.studioAbort !== operation || operation.signal.aborted) return;
        captured.studioArtifact = artifact; captured.studioStatus = "ready"; captured.message = "WebM decoded locally. Click DOWNLOAD WEBM to request a browser save.";
      }).catch((error: unknown) => {
        if (context !== captured || captured.studioAbort !== operation || operation.signal.aborted) return;
        captured.studioStatus = "failed"; captured.message = `Studio export refused: ${error instanceof Error ? error.message : String(error)}`;
      });
    },
    cancelStudio(): void { if (context !== undefined) { invalidateStudio(); context.studioStatus = "cancelled"; context.message = "Studio export cancelled; source retained."; } },
    downloadStudio(): void {
      const captured = context, artifact = captured?.studioArtifact, operation = captured?.studioAbort;
      if (captured === undefined || artifact === undefined || operation === undefined || services.studioMedia === undefined) return;
      void services.studioMedia.download(artifact, operation.signal).then(() => {
        if (context === captured && captured.studioAbort === operation && !operation.signal.aborted) { captured.studioStatus = "download-requested"; captured.message = "WebM download requested; browser save is not confirmed."; }
      }).catch((error: unknown) => { if (context === captured && !operation.signal.aborted) captured.message = `Download refused: ${String(error)}`; });
    },
    toggleInfo(): void { if (context !== undefined) context.infoVisible = !context.infoVisible; },
    setSpeed(value: number): void { if (context !== undefined && isSpeed(value)) context.transport.speed(value); },
    status(): GhostTheaterScreenStatus | null {
      if (context === undefined) return null;
      const state: GhostTheaterState = context.transport.state();
      return Object.freeze({ paused: !state.playing, speed: state.speed, infoVisible: context.infoVisible,
        progress: context.lastTick === 0 ? 1 : (state.tick - context.firstTick) / Math.max(1, context.lastTick - context.firstTick), from: context.from });
    },
  });
}
