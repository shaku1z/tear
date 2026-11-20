import { replayClock } from "../../presentation/replay-snapshots";
import { handleReplayTransport, type ReplayNativeTransport } from "./replay-transport-controller";
import {
  recordedGhostChallengeChoices,
  type RecordedGhostChallenge,
  type RecordedGhostChallengeResult,
} from "../../ghost/recorded-challenge";
import type { GhostForkPermit } from "../../ghost/fork-origin";
import type { ProductionGhostReplayCompositionOptions } from "../../tearbench/production-replay-composition";
import type { ReplayClipExportPort, ReplayClipWebm } from "../replay/browser-replay-clip-export";
import type { GhostVerifiedReplayRenderView } from "../../ghost/production-replay-session";
import type { GhostReadCapsule } from "../../ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../../ghost/capsule-replay-envelope";
import {
  createGhostProductionReplaySession,
  type GhostVerifiedProductionReplaySession,
} from "../../ghost/production-replay-session";
import { GhostTheaterTransport, type GhostTheaterState } from "../../ghost/theater";
import type { GhostPracticeChild, GhostSeekResult } from "../../ghost/replay-world";
import type { ReplayScreenView } from "../../presentation/screens/contracts";
import type { AppScreen } from "../../domain/screen-catalog";
import type { GhostPracticeLaunchResult } from "../replay/ghost-practice-launch";
import { projectGhostRunDnaTheater } from "../../ghost/run-dna-theater";
import { appendTheaterClip, type ReplayCutList } from "../../ghost/replay-cut-list";
import { refuseGhostTheater, type GhostTheaterOpenResult } from "../../ghost/theater-open-result";
import { readGhostReplayRunContext } from "../../ghost/replay-admission";
import { rulesetRefusal } from "../../gameplay/run/ruleset-version";

export interface GhostTheaterScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly presentation?: Pick<ProductionGhostReplayCompositionOptions, "presentation" | "renderView">;
  readonly drawWorld?: (view: GhostVerifiedReplayRenderView) => void;
  readonly clipExport?: ReplayClipExportPort;
  readonly width: () => number;
  readonly deltaSeconds: () => number;
  readonly nativeTransport?: () => ReplayNativeTransport;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}

export interface GhostTheaterScreenStatus {
  readonly paused: boolean;
  readonly speed: number;
  readonly infoVisible: boolean;
  readonly progress: number;
  readonly from: AppScreen;
}

interface GhostTheaterContext {
  readonly capsule: GhostReadCapsule;
  readonly session: GhostVerifiedProductionReplaySession;
  readonly transport: GhostTheaterTransport;
  readonly from: AppScreen;
  readonly checkpoints: readonly number[];
  result: GhostSeekResult;
  infoVisible: boolean;
  fractionalTicks: number;
  message?: string;
  challengeOpen: boolean;
  challengeResult: RecordedGhostChallengeResult | undefined;
  challengeChoices: readonly RecordedGhostChallenge[];
  readonly choiceCache: Map<number, readonly RecordedGhostChallenge[]>;
  firstTick: number;
  lastTick: number;
  runDnaOpen: boolean;
  editorOpen: boolean;
  cutList: ReplayCutList | undefined;
  frame: GhostVerifiedReplayRenderView | undefined;
  clipMark: number | undefined;
  exportAbort: AbortController | undefined;
  exportedClip: ReplayClipWebm | undefined;
  exportStatus: "idle" | "rendering" | "ready" | "failed" | "cancelled" | "download-requested";
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
  const invalidateExport = (): void => {
    context?.exportAbort?.abort();
    services.clipExport?.dispose();
    if (context !== undefined) {
      context.exportAbort = undefined;
      context.exportedClip = undefined;
      context.exportStatus = "idle";
    }
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
    const cached = context.choiceCache.get(context.result.tick);
    if (cached) return cached;
    const snapshot = mapGhostCapsuleToReplayEnvelope(context.capsule).ghost.snapshots.find(
      (entry) => entry.tick === context?.result.tick,
    );
    const choices = snapshot === undefined ? [] : recordedGhostChallengeChoices(context.capsule, snapshot);
    context.choiceCache.set(context.result.tick, choices);
    return choices;
  };
  const view = (): ReplayScreenView | undefined => {
    if (context === undefined) return undefined;
    const currentContext = context;
    const state = currentContext.transport.state();
    const current = currentContext.result.tick;
    return Object.freeze({
      id: "replay",
      ...(currentContext.finaleAvailable ? { finaleNavigation: "FINALE CONTINUATION" as const } : {}),
      title: "SAVED REPLAY",
      detail: `RECORDED RUN${currentContext.capsule.manifest.provenance?.ghostAssistance === undefined ? "" : " · ASSISTED · UNRANKED"}`,
      paused: !state.playing,
      speed: state.speed,
      // Players read time, not simulation ticks (120 per second).
      elapsed: replayClock(current - currentContext.firstTick),
      duration: replayClock(currentContext.lastTick - currentContext.firstTick),
      progress:
        currentContext.lastTick === 0
          ? 1
          : (current - currentContext.firstTick) / Math.max(1, currentContext.lastTick - currentContext.firstTick),
      score: "",
      chapters: currentContext.checkpoints.map((tick) =>
        Object.freeze({
          fraction:
            currentContext.lastTick === 0
              ? 0
              : (tick - currentContext.firstTick) / Math.max(1, currentContext.lastTick - currentContext.firstTick),
          boss: false,
        }),
      ),
      infoVisible: currentContext.infoVisible,
      infoRows: Object.freeze([
        {
          label: "POSITION",
          value: `${replayClock(current - currentContext.firstTick)} / ${replayClock(currentContext.lastTick - currentContext.firstTick)}`,
        },
        { label: "SAVED POINTS", value: String(currentContext.checkpoints.length) },
        { label: "HERE", value: currentContext.checkpoints.includes(current) ? "AT A SAVED POINT" : "PLAYING" },
        { label: "STORED", value: "ON THIS DEVICE" },
      ]),
      ...(currentContext.message === undefined ? {} : { notice: currentContext.message }),
      theater: true,
      worldVisible: currentContext.frame !== undefined,
      practiceAvailable: currentContext.challengeResult === undefined && currentContext.checkpoints.includes(current),
      ...(currentContext.challengeOpen
        ? {
            challenge: {
              choices:
                currentContext.challengeResult === undefined
                  ? currentContext.challengeChoices.map((choice) => ({
                      id: choice.rule + ":" + choice.target,
                      label: choice.label,
                    }))
                  : [],
              tick: current,
              ...(currentContext.challengeResult === undefined
                ? {}
                : {
                    result: currentContext.challengeResult.status,
                    elapsedTicks: currentContext.challengeResult.elapsedTicks,
                  }),
            },
          }
        : {}),
      ...(currentContext.runDnaOpen ? { runDna: projectGhostRunDnaTheater(currentContext.capsule) } : {}),
      ...(currentContext.editorOpen
        ? {
            cutList:
              currentContext.cutList === undefined
                ? Object.freeze({
                    available: context.checkpoints.includes(current),
                    ...(context.checkpoints.includes(current)
                      ? {}
                      : { unavailable: "Replay Editor requires the current verified replay checkpoint." }),
                  })
                : Object.freeze({
                    available: true,
                    sourceGhostId: currentContext.cutList.sourceGhostId,
                    sourceRootHash: currentContext.cutList.sourceRootHash,
                    fromTick: currentContext.cutList.clips[0]?.sourceFromTick ?? 0,
                    toTick: currentContext.cutList.clips.at(-1)?.sourceToTick ?? 0,
                    cutListHash: currentContext.cutList.cutListHash,
                    clipCount: currentContext.cutList.clips.length,
                  }),
          }
        : {}),
      ...(currentContext.editorOpen
        ? {
            clipExport: {
              available: services.clipExport?.available() === true,
              status: currentContext.exportStatus,
              markIn: currentContext.clipMark,
              thumbnail: currentContext.exportedClip?.thumbnail,
              duration: currentContext.exportedClip?.durationSeconds,
            },
          }
        : {}),
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
    finaleLink(available: boolean) {
      if (context !== undefined) context.finaleAvailable = available;
    },
    sourceId: () => context?.capsule.manifest.id,
    open(
      capsule: GhostReadCapsule,
      from: AppScreen,
      evidence?: Readonly<{ permit: GhostForkPermit; result: RecordedGhostChallengeResult }>,
    ): GhostTheaterOpenResult {
      invalidateExport();
      const recorded = readGhostReplayRunContext(capsule.manifest.provenance);
      const retired = rulesetRefusal(recorded?.build.rulesetVersion);
      if (retired !== null) {
        context = undefined;
        return refuseGhostTheater("ruleset-retired", capsule.manifest.rootIntegrity, 0, retired);
      }
      let mapped: ReturnType<typeof mapGhostCapsuleToReplayEnvelope>;
      try {
        mapped = mapGhostCapsuleToReplayEnvelope(capsule);
      } catch {
        context = undefined;
        return refuseGhostTheater("source-invalid", capsule.manifest.rootIntegrity);
      }
      const codecFailure = mapped.issues.find(
        (entry) => entry.track === "keyframes" && entry.reason.includes("isolated codec preflight"),
      );
      if (codecFailure !== undefined) {
        context = undefined;
        return refuseGhostTheater("codec-preflight", capsule.manifest.rootIntegrity, codecFailure.tick);
      }
      try {
        const session = createGhostProductionReplaySession(capsule, services.presentation, evidence?.permit);
        const transport = new GhostTheaterTransport(mapped.ghost.events, services.width());
        const firstTick = session.firstTick ?? 0;
        const result = session.seek(firstTick);
        transport.seek(firstTick);
        context = {
          capsule,
          session,
          transport,
          from,
          checkpoints: session.verifiedReceiptTicks,
          result,
          infoVisible: false,
          fractionalTicks: 0,
          firstTick,
          lastTick: session.lastTick ?? capsule.maxTick,
          challengeOpen: evidence !== undefined,
          challengeResult: evidence?.result,
          challengeChoices: [],
          choiceCache: new Map(),
          runDnaOpen: false,
          editorOpen: false,
          cutList: undefined,
          frame: session.renderFrame?.(firstTick),
          clipMark: undefined,
          exportAbort: undefined,
          exportedClip: undefined,
          exportStatus: "idle",
        };
        return Object.freeze({ kind: "opened", root: capsule.manifest.rootIntegrity, tick: firstTick });
      } catch {
        context = undefined;
        return refuseGhostTheater("source-verification", capsule.manifest.rootIntegrity);
      }
    },
    render(): void {
      advance();
      if (context !== undefined && !context.challengeOpen && !context.runDnaOpen && !context.editorOpen) {
        const native = services.nativeTransport?.(),
          current = context;
        if (native !== undefined)
          handleReplayTransport({
            ...native,
            currentTime: (current.result.tick - current.firstTick) / TICKS_PER_SECOND,
            duration: (current.lastTick - current.firstTick) / TICKS_PER_SECOND,
            seek: (seconds) => {
              seek(current.firstTick + Math.round(seconds * TICKS_PER_SECOND));
            },
            toggle: () => {
              if (current.transport.state().playing) current.transport.pause();
              else current.transport.play();
            },
          });
      }
      const snapshot = view();
      if (context?.frame !== undefined) services.drawWorld?.(context.frame);
      if (snapshot !== undefined) services.render(snapshot);
    },
    exit(): AppScreen | undefined {
      const from = context?.from;
      invalidateExport();
      context = undefined;
      return from;
    },
    togglePause(): void {
      if (context === undefined) return;
      if (context.transport.state().playing) context.transport.pause();
      else context.transport.play();
    },
    seekBy(seconds: number): void {
      seek((context?.transport.state().tick ?? 0) + Math.round(seconds * TICKS_PER_SECOND));
    },
    seekToFraction(fraction: number): void {
      seek(
        Math.round(
          (context?.firstTick ?? 0) +
            ((context?.lastTick ?? 0) - (context?.firstTick ?? 0)) * Math.max(0, Math.min(1, fraction)),
        ),
      );
    },
    jumpCheckpoint(direction: number): void {
      if (context === undefined) return;
      const current = context.transport.state().tick;
      const ordered = direction < 0 ? [...context.checkpoints].reverse() : context.checkpoints;
      const next = ordered.find((tick) => (direction < 0 ? tick < current : tick > current)) ?? current;
      seek(next);
    },
    restart(): void {
      seek(context?.firstTick ?? 0);
    },
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
        invalidateExport();
        const launched = services.launchPractice(child);
        context.message = launched.ok
          ? "Practice child launched. This run is unranked and non-persistent."
          : launched.message;
      } catch (error) {
        context.message = `Practice unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    openChallenges(): void {
      if (context === undefined) return;
      context.challengeOpen = !context.challengeOpen;
      context.runDnaOpen = context.editorOpen = false;
      if (context.challengeOpen) context.challengeChoices = challengeChoices();
      context.transport.pause();
    },
    startChallenge(id: string): void {
      const captured = context,
        choice = challengeChoices().find((entry) => entry.rule + ":" + entry.target === id);
      if (captured === undefined || choice === undefined) return;
      try {
        const child = captured.session.forkPractice(captured.result.tick, "race-practice");
        const launched = services.launchPractice({ ...child, challenge: choice });
        captured.message = launched.ok ? "Local challenge launched · no rewards or rankings." : launched.message;
        if (!launched.ok && launched.completion !== undefined)
          void launched.completion.then((result) => {
            if (context === captured)
              captured.message = result.ok ? "Local challenge launched · MAIN MENU → QUIT to stop." : result.message;
          });
      } catch (error) {
        captured.message = `Challenge unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    toggleRunDna(): void {
      if (context !== undefined) {
        context.runDnaOpen = !context.runDnaOpen;
        context.editorOpen = false;
      }
    },
    toggleReplayEditor(): void {
      if (context !== undefined) {
        context.editorOpen = !context.editorOpen;
        context.runDnaOpen = false;
      }
    },
    markClipIn(): void {
      if (!context?.checkpoints.includes(context.result.tick)) return;
      invalidateExport();
      context.clipMark = context.result.tick;
      context.message = `IN marked at verified TICK ${String(context.clipMark)}. Seek an OUT checkpoint and append.`;
    },
    clearClips(): void {
      if (context !== undefined) {
        invalidateExport();
        context.cutList = undefined;
        context.clipMark = undefined;
      }
    },
    appendClip(): void {
      if (context === undefined) return;
      const appended = appendTheaterClip(
        context.cutList,
        context.capsule,
        context.session,
        context.result.tick,
        context.clipMark,
        context.transport.state().speed,
      );
      if (appended.cutList === undefined) {
        context.message = appended.unavailable;
        return;
      }
      invalidateExport();
      context.cutList = appended.cutList;
      context.message = "Cut appended in chosen order · reconstructed player-follow · simulation time.";
    },
    exportClips(): void {
      const captured = context,
        media = services.clipExport;
      if (captured?.cutList === undefined || media?.available() !== true) return;
      invalidateExport();
      captured.transport.pause();
      const operation = new AbortController();
      captured.exportAbort = operation;
      captured.exportStatus = "rendering";
      captured.message = "Encoding local replay canvas; the live game canvas is not recorded.";
      void media
        .render(captured.capsule, captured.session, captured.cutList, operation.signal)
        .then((artifact) => {
          if (context !== captured || captured.exportAbort !== operation || operation.signal.aborted) return;
          captured.exportedClip = artifact;
          captured.exportStatus = "ready";
          captured.message = "WebM decoded locally. Click DOWNLOAD WEBM to request a browser save.";
        })
        .catch((error: unknown) => {
          if (context !== captured || captured.exportAbort !== operation || operation.signal.aborted) return;
          captured.exportStatus = "failed";
          captured.message = `Clip export refused: ${error instanceof Error ? error.message : String(error)}`;
        });
    },
    cancelClipExport(): void {
      if (context !== undefined) {
        invalidateExport();
        context.exportStatus = "cancelled";
        context.message = "Clip export cancelled; source retained.";
      }
    },
    downloadClip(): void {
      const captured = context,
        artifact = captured?.exportedClip,
        operation = captured?.exportAbort;
      if (
        captured === undefined ||
        artifact === undefined ||
        operation === undefined ||
        services.clipExport === undefined
      )
        return;
      void services.clipExport
        .download(artifact, operation.signal)
        .then(() => {
          if (context === captured && captured.exportAbort === operation && !operation.signal.aborted) {
            captured.exportStatus = "download-requested";
            captured.message = "WebM download requested; browser save is not confirmed.";
          }
        })
        .catch((error: unknown) => {
          if (context === captured && !operation.signal.aborted)
            captured.message = `Download refused: ${String(error)}`;
        });
    },
    toggleInfo(): void {
      if (context !== undefined) context.infoVisible = !context.infoVisible;
    },
    setSpeed(value: number): void {
      if (context !== undefined && isSpeed(value)) context.transport.speed(value);
    },
    status(): GhostTheaterScreenStatus | null {
      if (context === undefined) return null;
      const state: GhostTheaterState = context.transport.state();
      return Object.freeze({
        paused: !state.playing,
        speed: state.speed,
        infoVisible: context.infoVisible,
        progress:
          context.lastTick === 0
            ? 1
            : (state.tick - context.firstTick) / Math.max(1, context.lastTick - context.firstTick),
        from: context.from,
      });
    },
  });
}
