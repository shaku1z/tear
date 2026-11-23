import { replayClock } from "../../presentation/replay-snapshots";
import {
  handleReplayTransport,
  REPLAY_SPEEDS,
  ReplayTransport,
  type ReplayNativeTransport,
  type ReplaySpeed,
} from "./replay-transport-controller";
import type { ReplayClipExportPort, ReplayClipWebm } from "../replay/browser-replay-clip-export";
import type { GhostVerifiedReplayRenderView } from "../../ghost/production-replay-session";
import type { GhostReadCapsule } from "../../ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../../ghost/capsule-replay-envelope";
import {
  createGhostProductionReplaySession,
  type GhostVerifiedProductionReplaySession,
} from "../../ghost/production-replay-session";
import type { GhostPracticeChild, GhostSeekResult } from "../../ghost/replay-world";
import type { ReplayScreenView } from "../../presentation/screens/contracts";
import type { AppScreen } from "../../domain/screen-catalog";
import type { GhostPracticeLaunchResult } from "../replay/ghost-practice-launch";
import { appendTheaterClip, type ReplayCutList } from "../../ghost/replay-cut-list";
import { refuseGhostTheater, type GhostTheaterOpenResult } from "../../ghost/theater-open-result";
import { readGhostReplayRunContext } from "../../ghost/replay-admission";
import { rulesetRefusal } from "../../gameplay/run/ruleset-version";
import { replayPlaybackRefusal, type ReplayRecord } from "../../replay/record";
import { createRecordWatchSession, type RecordWatchSession } from "../replay/record-watch-session";
import type { CardView } from "../../presentation/screens/contracts";
import { formatRunClock } from "../../gameplay/scoring/style-runtime";
import type { RecordWorldEngine, RecordWorldPresentation } from "../replay/record-world";

export interface GhostTheaterScreenServices {
  readonly render: (view: ReplayScreenView) => void;
  readonly presentation?: RecordWorldPresentation;
  readonly drawWorld?: (view: GhostVerifiedReplayRenderView) => void;
  readonly clipExport?: ReplayClipExportPort;
  readonly deltaSeconds: () => number;
  readonly nativeTransport?: () => ReplayNativeTransport;
  readonly launchPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
  /** The INFO panel's cards for a run's upgrades. */
  readonly loadoutCards?: LoadoutCards;
}

export interface GhostTheaterScreenStatus {
  readonly paused: boolean;
  readonly speed: number;
  readonly infoVisible: boolean;
  readonly progress: number;
  readonly from: AppScreen;
}

interface GhostTheaterContext {
  /** The Vault capsule played; absent for a kept record, which has no clip editor yet. */
  readonly capsule?: GhostReadCapsule;
  readonly sourceId: string;
  readonly assisted: boolean;
  /** The stage the shown world is in; a kept record's world reports it. */
  readonly stage?: () => number;
  /** A kept record and its run's upgrades at the shown tick; INFO lists both. */
  readonly kept?: KeptRun;
  readonly session: GhostVerifiedProductionReplaySession;
  readonly transport: ReplayTransport;
  readonly from: AppScreen;
  readonly checkpoints: readonly number[];
  result: GhostSeekResult;
  infoVisible: boolean;
  fractionalTicks: number;
  message?: string;
  firstTick: number;
  lastTick: number;
  editorOpen: boolean;
  cutList: ReplayCutList | undefined;
  frame: GhostVerifiedReplayRenderView | undefined;
  clipMark: number | undefined;
  exportAbort: AbortController | undefined;
  exportedClip: ReplayClipWebm | undefined;
  exportStatus: "idle" | "rendering" | "ready" | "failed" | "cancelled" | "download-requested";
}

const TICKS_PER_SECOND = 120;

const RESULT_WORDS = Object.freeze({ victory: "VICTORY", defeat: "FELL ON WAVE", quit: "LEFT ON WAVE" });

/** The INFO panel's cards for a run's upgrades. */
type LoadoutCards = (items: ReturnType<RecordWatchSession["loadout"]>) => readonly CardView[];
/** A kept record and its run's upgrades at the shown tick; INFO lists both. */
type KeptRun = Readonly<{ record: ReplayRecord; loadout: RecordWatchSession["loadout"] }>;

/** INFO for a kept run: who played what and how it ended, and the upgrades held at the shown moment. */
function keptInfo(
  kept: KeptRun,
  cards: LoadoutCards | undefined,
): Pick<ReplayScreenView, "infoRows" | "loadout" | "loadoutHeading"> {
  const { run, summary, look } = kept.record,
    outcome = run.result.outcome;
  return Object.freeze({
    infoRows: Object.freeze([
      { label: "PLAYER", value: look.playerName || "Player" },
      { label: "RUN", value: `${run.start.mode} · ${run.start.difficulty} · ${run.start.weapon}`.toUpperCase() },
      {
        label: "RESULT",
        value: outcome === "victory" ? RESULT_WORDS.victory : `${RESULT_WORDS[outcome]} ${String(summary.wave)}`,
      },
      { label: "SCORE", value: summary.score.toLocaleString("en-US") },
      { label: "KILLS", value: summary.kills.toLocaleString("en-US") },
      { label: "TIME", value: formatRunClock(summary.time) },
    ]),
    loadout: cards?.(kept.loadout()) ?? [],
    loadoutHeading: Object.freeze({ title: "LOADOUT AT THIS MOMENT", empty: "No upgrades taken yet." }),
  });
}

function isSpeed(value: number): value is ReplaySpeed {
  return REPLAY_SPEEDS.includes(value as ReplaySpeed);
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

  const view = (): ReplayScreenView | undefined => {
    if (context === undefined) return undefined;
    const currentContext = context;
    const state = currentContext.transport.state();
    const current = currentContext.result.tick;
    const kept = currentContext.kept;
    return Object.freeze({
      id: "replay",
      title: kept === undefined ? "SAVED REPLAY" : kept.record.look.playerName || "Player",
      detail:
        kept === undefined
          ? `RECORDED RUN${currentContext.assisted ? " · ASSISTED · UNRANKED" : ""}`
          : `${kept.record.run.start.mode} · reached wave ${String(kept.record.summary.wave)} · ${kept.record.summary.score.toLocaleString("en-US")} pts`.toUpperCase(),
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
      ...(currentContext.kept === undefined
        ? {
            infoRows: Object.freeze([
              {
                label: "POSITION",
                value: `${replayClock(current - currentContext.firstTick)} / ${replayClock(currentContext.lastTick - currentContext.firstTick)}`,
              },
              { label: "SAVED POINTS", value: String(currentContext.checkpoints.length) },
              { label: "HERE", value: currentContext.checkpoints.includes(current) ? "AT A SAVED POINT" : "PLAYING" },
              { label: "STORED", value: "ON THIS DEVICE" },
            ]),
          }
        : keptInfo(currentContext.kept, services.loadoutCards)),
      ...(currentContext.message === undefined ? {} : { notice: currentContext.message }),
      theater: true,
      worldVisible: currentContext.frame !== undefined,
      practiceAvailable: currentContext.checkpoints.includes(current),
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
    sourceId: () => context?.sourceId,
    /** The stage the replay screen shows now, when its source reports one. */
    shownStage: () => context?.stage?.(),
    /** The tick the replay screen shows now. */
    shownTick: () => context?.result.tick,
    /** Opens a kept record: the run re-simulated from its seed and drawn by the game's own renderer. */
    openRecord(record: ReplayRecord, key: string, from: AppScreen, engine: RecordWorldEngine): GhostTheaterOpenResult {
      invalidateExport();
      const refusal = replayPlaybackRefusal(record.run);
      if (refusal !== null) {
        context = undefined;
        return refuseGhostTheater("ruleset-retired", key, 0, refusal);
      }
      try {
        const session = createRecordWatchSession(record, key, engine, services.presentation);
        const transport = new ReplayTransport();
        const result = session.seek(0);
        transport.seek(0);
        // WATCH plays the run at once, as a video player does.
        transport.play();
        context = {
          sourceId: key,
          assisted: false,
          stage: session.stage,
          kept: Object.freeze({ record, loadout: session.loadout }),
          session,
          transport,
          from,
          checkpoints: session.verifiedReceiptTicks,
          result,
          infoVisible: false,
          fractionalTicks: 0,
          firstTick: 0,
          lastTick: session.lastTick,
          editorOpen: false,
          cutList: undefined,
          frame: session.renderFrame?.(0),
          clipMark: undefined,
          exportAbort: undefined,
          exportedClip: undefined,
          exportStatus: "idle",
        };
        return Object.freeze({ kind: "opened", root: key, tick: 0 });
      } catch {
        context = undefined;
        return refuseGhostTheater("source-verification", key);
      }
    },
    open(capsule: GhostReadCapsule, from: AppScreen): GhostTheaterOpenResult {
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
        const session = createGhostProductionReplaySession(capsule, services.presentation);
        const transport = new ReplayTransport();
        const firstTick = session.firstTick ?? 0;
        const result = session.seek(firstTick);
        transport.seek(firstTick);
        context = {
          capsule,
          sourceId: capsule.manifest.id,
          assisted: capsule.manifest.provenance?.ghostAssistance !== undefined,
          session,
          transport,
          from,
          checkpoints: session.verifiedReceiptTicks,
          result,
          infoVisible: false,
          fractionalTicks: 0,
          firstTick,
          lastTick: session.lastTick ?? capsule.maxTick,
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
      if (context !== undefined && !context.editorOpen) {
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
    toggleReplayEditor(): void {
      if (context !== undefined) context.editorOpen = !context.editorOpen;
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
      if (context.capsule === undefined) {
        context.message = "Clips come from a Vault replay.";
        return;
      }
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
      if (captured?.cutList === undefined || captured.capsule === undefined || media?.available() !== true) return;
      const capsule = captured.capsule;
      invalidateExport();
      captured.transport.pause();
      const operation = new AbortController();
      captured.exportAbort = operation;
      captured.exportStatus = "rendering";
      captured.message = "Encoding local replay canvas; the live game canvas is not recorded.";
      void media
        .render(capsule, captured.session, captured.cutList, operation.signal)
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
      const state = context.transport.state();
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
