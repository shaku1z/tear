import { createBrowserBossMemory } from "./browser-boss-memory";
import { replayTransportScrub } from "../library/replay-transport-controller";
import { reopenGhostFinaleCompanion } from "../../ghost/browser-finale-companion";
import { createGhostFinaleScreenAdapter } from "./ghost-finale-screen-adapter";
import { readGhostFinaleCompanion } from "../../ghost/finale-companion";
import { reopenRecordedGhostChallenge } from "../../ghost/browser-recorded-challenge";
import { createBrowserGhostReplayPresentation, createBrowserGhostStudioMedia } from "./browser-ghost-studio-media";
import { stableVerificationHash } from "../../replay/hash";
import { createBrowserGhostCoachHistoryPort } from "./browser-ghost-coach-history";
import type { GameRuntimeDependencies } from "../shell/game-runtime-dependencies";
import type { createLiveScreenRenderers } from "../../presentation/screens/live-screen-renderers";
import type { AppScreen } from "../../domain/screen-catalog";
import { readBrowserGhostCapsule, listBrowserGhostCapsuleManifests } from "../../ghost/browser-capsule-vault";
import { createGhostComparisonScreenAdapter } from "./ghost-comparison-screen-adapter";
import { createGhostTheaterScreenAdapter } from "../library/ghost-theater-screen-adapter";
import type { GhostPracticeChild } from "../../ghost/replay-world";
import type { GhostPracticeLaunchResult } from "./ghost-practice-launch";
import { refuseGhostTheater, type GhostTheaterOpenResult } from "../../ghost/theater-open-result";

type Dependencies = Pick<
  GameRuntimeDependencies,
  | "A11Y"
  | "APP"
  | "Armored"
  | "Backdrop"
  | "Bomber"
  | "Charger"
  | "Chimera"
  | "CONFIG"
  | "FX"
  | "Flyer"
  | "GFX"
  | "GHOST"
  | "Input"
  | "Ranged"
  | "Rootbinder"
  | "SAFE"
  | "STAGES"
  | "Support"
  | "THEME"
  | "UI"
  | "UPGRADES"
  | "VARIANTS"
  | "Wraith"
  | "applyVariant"
  | "stageAt"
  | "stagePlatforms"
>;
type Renderers = ReturnType<typeof createLiveScreenRenderers>;

export interface ReplayStatus {
  readonly paused: boolean;
  readonly speed: number;
  readonly infoVisible: boolean;
  readonly progress: number;
  readonly from: AppScreen;
}
export interface ReplayScreenServices {
  readonly dependencies: Dependencies;
  readonly renderers: Renderers;
  readonly canvas: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly screenRectangle: () => Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly time: () => number;
  readonly deltaSeconds: () => number;
  readonly fallbackPlayer: () => unknown;
  readonly bossById: (id: string) => unknown;
  readonly setScreen: (screen: AppScreen, context?: Readonly<{ returnTo: AppScreen }>) => void;
  readonly categories: () => Readonly<Record<string, Readonly<{ name: string; color: string }>>>;
  readonly fallbackCategory: () => Readonly<{ name: string; color: string }>;
  readonly specialColor: () => string;
  readonly formatTime: (seconds: number) => string;
  readonly document: Document;
  readonly browserIndexedDb: IDBFactory | undefined;
  readonly launchGhostPractice: (child: GhostPracticeChild) => GhostPracticeLaunchResult;
}
export interface ReplayScreenAdapter {
  readonly cancelPendingOpen: () => void;
  readonly openFinale?: () => void;
  readonly enter: (data: unknown, from?: AppScreen) => boolean;
  readonly exit: () => void;
  readonly render: () => void;
  readonly enterGhostCapsule: (id: string, from?: AppScreen) => Promise<GhostTheaterOpenResult>;
  readonly enterGhostComparison: (ids: readonly string[], from?: AppScreen) => Promise<boolean>;
  readonly togglePause: () => void;
  readonly seekBy: (delta: number) => void;
  readonly seekToFraction: (fraction: number) => void;
  readonly jumpChapter: (direction: number) => void;
  readonly restart: () => void;
  readonly toggleInfo: () => void;
  readonly practice: () => void;
  readonly openChallenges: () => void;
  readonly startChallenge: (id: string) => void;
  readonly openCoach: () => void;
  readonly selectCoachBaseline: (id: string) => void;
  readonly practiceCoachFinding: (findingId: string) => void;
  readonly viewCoachMoment: (id: string) => void;
  readonly controlCoach: (
    command: "close" | "scene" | "page" | "metric" | "moment" | "details" | "sources" | "rows" | "section",
    delta: number,
  ) => void;
  readonly toggleRunDna: () => void;
  readonly toggleStudio: () => void;
  readonly createStudioCutList: () => void;
  readonly markStudioIn: () => void;
  readonly clearStudioCuts: () => void;
  readonly exportStudio: () => void;
  readonly cancelStudio: () => void;
  readonly downloadStudio: () => void;
  readonly setSpeed: (value: number) => void;
  readonly status: () => ReplayStatus | null;
}

type LegacyReplayScreenAdapter = Omit<
  ReplayScreenAdapter,
  | "cancelPendingOpen"
  | "openFinale"
  | "openChallenges"
  | "startChallenge"
  | "enterGhostCapsule"
  | "enterGhostComparison"
  | "practice"
  | "openCoach"
  | "selectCoachBaseline"
  | "practiceCoachFinding"
  | "viewCoachMoment"
  | "controlCoach"
  | "toggleRunDna"
  | "toggleStudio"
  | "createStudioCutList"
  | "markStudioIn"
  | "clearStudioCuts"
  | "exportStudio"
  | "cancelStudio"
  | "downloadStudio"
>;
type DeferredAction = (adapter: LegacyReplayScreenAdapter) => void;

/** Route-triggered replay facade; heavyweight world playback loads only when a replay is opened. */
export function createLiveReplayScreenAdapter(services: ReplayScreenServices): ReplayScreenAdapter {
  const d = services.dependencies;
  let runtime: LegacyReplayScreenAdapter | undefined;
  const studioMedia = createBrowserGhostStudioMedia(services.document, async (id, hash) => {
    const source = await readBrowserGhostCapsule(services.browserIndexedDb, id);
    return source !== undefined && stableVerificationHash(source.manifest) === hash;
  });
  const theater = createGhostTheaterScreenAdapter({
    bossMemory: createBrowserBossMemory(services.browserIndexedDb, services.document),
    presentation: createBrowserGhostReplayPresentation(services.document, d.UI),
    studioMedia,
    drawWorld: (frame) => {
      frame.draw(services.canvas, { x: 0, y: 56, w: services.width, h: services.height - 172 });
    },
    render: (view) => {
      services.renderers.replay(view);
      if (view.studioMedia?.thumbnail !== undefined)
        studioMedia.drawThumbnail?.(services.canvas, { x: services.width / 2 + 260, y: 220, w: 160, h: 90 });
    },
    width: () => services.width,
    deltaSeconds: services.deltaSeconds,
    nativeTransport: () => ({
      controls: d.Input,
      scrub: replayTransportScrub(services.width, services.height, d.SAFE),
      consumeKey: (key) => {
        d.Input.pressed.delete(key);
      },
    }),
    launchPractice: services.launchGhostPractice,
    coachHistory: createBrowserGhostCoachHistoryPort(services.browserIndexedDb),
  });
  const comparison = createGhostComparisonScreenAdapter({ render: services.renderers.replay });
  const createFinaleAdapter = () =>
    createGhostFinaleScreenAdapter({
      presentation: createBrowserGhostReplayPresentation(services.document, d.UI),
      drawWorld: (frame) => {
        frame.draw(services.canvas, { x: 0, y: 56, w: services.width, h: services.height - 172 });
      },
      render: services.renderers.replay,
      width: () => services.width,
      deltaSeconds: services.deltaSeconds,
      nativeTransport: () => ({
        controls: d.Input,
        scrub: replayTransportScrub(services.width, services.height, d.SAFE),
        consumeKey: (key) => {
          d.Input.pressed.delete(key);
        },
      }),
      launchPractice: services.launchGhostPractice,
      coachHistory: createBrowserGhostCoachHistoryPort(services.browserIndexedDb),
    });
  let finale = createFinaleAdapter();
  let active: "legacy" | "theater" | "comparison" | "finale" | undefined;
  let finalLink: string | undefined;
  let sourceRequest = 0;
  let loading: Promise<void> | undefined;
  let pending: Readonly<{ data: unknown; from: AppScreen }> | undefined;
  const deferred: DeferredAction[] = [];

  function ensureLoaded(): void {
    loading ??= import("./replay-screen-adapter-runtime").then((module) => {
      runtime = module.createLiveReplayScreenAdapterRuntime(services);
      const request = pending;
      pending = undefined;
      const loaded = runtime;
      if (request !== undefined) loaded.enter(request.data, request.from);
      for (const action of deferred.splice(0)) action(loaded);
    });
  }
  function invoke(action: DeferredAction): void {
    if (runtime) action(runtime);
    else {
      deferred.push(action);
      ensureLoaded();
    }
  }
  function enter(data: unknown, from: AppScreen = "menu"): boolean {
    sourceRequest++;
    if (active === "finale") {
      finale.exit();
      active = undefined;
    }
    if (active === "theater") theater.exit();
    if (active === "comparison") comparison.exit();
    if (active === "theater" || active === "comparison") active = undefined;
    if (runtime) {
      active = "legacy";
      return runtime.enter(data, from);
    }
    const playback = d.GHOST.begin(data);
    if (playback === null) return false;
    d.GHOST.end();
    pending = { data, from };
    active = "legacy";
    ensureLoaded();
    return true;
  }
  function renderLoading(): void {
    ensureLoaded();
    const ui = d.UI;
    ui.header(services.canvas, "LOADING REPLAY", "preparing the recorded run", 1, ui.t.color.accent);
    ui.text(services.canvas, "◇", services.width / 2, services.height / 2, 36, "center", 0.5);
  }
  function exit(): void {
    sourceRequest++;
    if (active === "finale") {
      const destination = finale.exit() ?? "profile";
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "theater") {
      const destination = theater.exit() ?? d.APP.replayReturn;
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "comparison") {
      const destination = comparison.exit() ?? d.APP.replayReturn;
      active = undefined;
      services.setScreen(destination);
      return;
    }
    if (active === "legacy" && runtime) {
      runtime.exit();
      active = undefined;
      return;
    }
    const destination = pending?.from ?? d.APP.replayReturn;
    pending = undefined;
    deferred.splice(0);
    active = undefined;
    d.GHOST.end();
    services.setScreen(destination);
  }

  async function enterGhostCapsule(id: string, from: AppScreen = "profile"): Promise<GhostTheaterOpenResult> {
    const request = ++sourceRequest;
    const capsule = await readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined);
    if (request !== sourceRequest) return refuseGhostTheater("source-invalid");
    if (capsule === undefined) return refuseGhostTheater("capsule-unavailable");
    let finaleOrigin: ReturnType<typeof readGhostFinaleCompanion>;
    try {
      finaleOrigin = readGhostFinaleCompanion(capsule.manifest.provenance);
    } catch {
      return refuseGhostTheater("source-invalid", capsule.manifest.rootIntegrity);
    }
    if (finaleOrigin !== undefined) {
      const candidate = createFinaleAdapter();
      try {
        const { parent, permit, confirm } = await reopenGhostFinaleCompanion(services.browserIndexedDb, capsule);
        if (request !== sourceRequest) return refuseGhostTheater("source-invalid");
        candidate.open(capsule, permit, from);
        await confirm();
        if (request !== sourceRequest) {
          candidate.exit();
          return refuseGhostTheater("source-invalid");
        }
        finale.exit();
        finale = candidate;
        if (active === "legacy" && runtime !== undefined) runtime.exit();
        if (active === "comparison") comparison.exit();
        theater.exit();
        active = "finale";
        pending = undefined;
        finalLink = parent.manifest.id;
        services.setScreen("replay", { returnTo: from });
        return { kind: "opened", root: capsule.manifest.rootIntegrity, tick: finaleOrigin.origin.tick };
      } catch {
        candidate.exit();
        return refuseGhostTheater("source-verification", capsule.manifest.rootIntegrity);
      }
    }
    let evidence: Awaited<ReturnType<typeof reopenRecordedGhostChallenge>>;
    try {
      evidence = await reopenRecordedGhostChallenge(services.browserIndexedDb, capsule);
    } catch {
      return refuseGhostTheater("source-verification", capsule.manifest.rootIntegrity);
    }
    const manifests = await listBrowserGhostCapsuleManifests(services.browserIndexedDb);
    if (request !== sourceRequest) return refuseGhostTheater("source-invalid");
    const opened = theater.open(capsule, from, evidence);
    if (opened.kind === "refused") return opened;
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    if (active === "comparison") comparison.exit();
    if (active === "finale") finale.exit();
    pending = undefined;
    active = "theater";
    finalLink = manifests.find((manifest) => {
      try {
        return readGhostFinaleCompanion(manifest.provenance)?.parentId === id;
      } catch {
        return false;
      }
    })?.id;
    theater.finaleLink(finalLink !== undefined);
    services.setScreen("replay", { returnTo: from });
    return opened;
  }

  async function enterGhostComparison(ids: readonly string[], from: AppScreen = "profile"): Promise<boolean> {
    const request = ++sourceRequest;
    if (ids.length < 2 || new Set(ids).size !== ids.length) return false;
    const capsules = await Promise.all(
      ids.map((id) => readBrowserGhostCapsule(services.browserIndexedDb, id).catch(() => undefined)),
    );
    if (request !== sourceRequest) return false;
    if (
      capsules.some((capsule) => capsule === undefined) ||
      !comparison.open(
        capsules.filter((capsule): capsule is NonNullable<typeof capsule> => capsule !== undefined),
        from,
      )
    ) {
      return false;
    }
    if (active === "legacy" && runtime !== undefined) runtime.exit();
    if (active === "theater") theater.exit();
    if (active === "finale") finale.exit();
    pending = undefined;
    active = "comparison";
    services.setScreen("replay", { returnTo: from });
    return true;
  }

  const adapter: ReplayScreenAdapter = {
    cancelPendingOpen: () => {
      sourceRequest++;
      pending = undefined;
      deferred.splice(0);
    },
    enter,
    enterGhostCapsule,
    enterGhostComparison,
    exit,
    openFinale: () => {
      if (finalLink !== undefined) {
        const promise = enterGhostCapsule(finalLink, theater.status()?.from ?? finale.status()?.from ?? "profile"),
          request = sourceRequest;
        void promise.then((result) => {
          if (request === sourceRequest && result.kind === "refused" && active === "finale")
            finale.notice(result.detail);
        });
      }
    },
    render: () => {
      if (active === "finale") finale.render();
      else if (active === "theater") theater.render();
      else if (active === "comparison") comparison.render();
      else if (runtime) runtime.render();
      else renderLoading();
    },
    togglePause: () => {
      if (active === "finale") finale.togglePause();
      else if (active === "theater") theater.togglePause();
      else if (active !== "comparison")
        invoke((value) => {
          value.togglePause();
        });
    },
    seekBy: (delta) => {
      if (active === "finale") finale.seekBy(delta);
      else if (active === "theater") theater.seekBy(delta);
      else if (active !== "comparison")
        invoke((value) => {
          value.seekBy(delta);
        });
    },
    seekToFraction: (fraction) => {
      if (active === "finale") finale.seekToFraction(fraction);
      else if (active === "theater") theater.seekToFraction(fraction);
      else if (active !== "comparison")
        invoke((value) => {
          value.seekToFraction(fraction);
        });
    },
    jumpChapter: (direction) => {
      if (active === "finale") finale.jumpCheckpoint(direction);
      else if (active === "theater") theater.jumpCheckpoint(direction);
      else if (active === "comparison") comparison.stepOccurrence(direction < 0 ? -1 : 1);
      else
        invoke((value) => {
          value.jumpChapter(direction);
        });
    },
    restart: () => {
      if (active === "finale") finale.restart();
      else if (active === "theater") theater.restart();
      else if (active === "comparison") comparison.restart();
      else
        invoke((value) => {
          value.restart();
        });
    },
    practice: () => {
      if (active === "theater") theater.practice();
    },
    openChallenges: () => {
      if (active === "theater") theater.openChallenges();
    },
    startChallenge: (id) => {
      if (active === "theater") theater.startChallenge(id);
    },
    openCoach: () => {
      if (active === "theater") theater.openCoach();
    },
    selectCoachBaseline: (id) => {
      if (active === "theater") theater.selectCoachBaseline(id);
    },
    practiceCoachFinding: (findingId) => {
      if (active === "theater") theater.practiceCoachFinding(findingId);
    },
    viewCoachMoment: (id) => {
      if (active === "theater") theater.viewCoachMoment(id);
    },
    controlCoach: (command, delta) => {
      if (active === "theater") theater.controlCoach(command, delta);
    },
    toggleRunDna: () => {
      if (active === "theater") theater.toggleRunDna();
    },
    toggleStudio: () => {
      if (active === "theater") theater.toggleStudio();
    },
    createStudioCutList: () => {
      if (active === "theater") theater.createStudioCutList();
    },
    markStudioIn: () => {
      if (active === "theater") theater.markStudioIn();
    },
    clearStudioCuts: () => {
      if (active === "theater") theater.clearStudioCuts();
    },
    exportStudio: () => {
      if (active === "theater") theater.exportStudio();
    },
    cancelStudio: () => {
      if (active === "theater") theater.cancelStudio();
    },
    downloadStudio: () => {
      if (active === "theater") theater.downloadStudio();
    },
    toggleInfo: () => {
      if (active === "finale") finale.toggleInfo();
      else if (active === "theater") theater.toggleInfo();
      else if (active !== "comparison")
        invoke((value) => {
          value.toggleInfo();
        });
    },
    setSpeed: (speed) => {
      if (active === "finale") finale.setSpeed(speed);
      else if (active === "theater") theater.setSpeed(speed);
      else if (active !== "comparison")
        invoke((value) => {
          value.setSpeed(speed);
        });
    },
    status: () =>
      finale.status() ??
      theater.status() ??
      comparison.status() ??
      runtime?.status() ??
      (pending === undefined
        ? null
        : {
            paused: true,
            speed: 1,
            infoVisible: false,
            progress: 0,
            from: pending.from,
          }),
  };
  return Object.freeze(adapter);
}
