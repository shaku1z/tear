import type { CinematicDirectorBinding, CinematicDirectorPort } from
  "../gameplay/runtime/cinematic-director";
import { validateRunLifecycleSnapshot, type RunLifecycleSnapshot } from "../gameplay/run/lifecycle";
import type { GameRun } from "./game-runtime-state";

interface StagedChapterBinding {
  readonly binding: CinematicDirectorBinding;
  readonly spec: Readonly<{
    stageIndex: number;
    prologueShownAfter: boolean;
    flowState: string;
    page: number;
  }>;
}

export interface LiveStateForgeRuntimeBridgeOptions {
  readonly captureTransient: () => Readonly<Record<string, unknown>>;
  readonly restoreTransient: (snapshot: Readonly<Record<string, unknown>>) => void;
  readonly captureLifecycle: () => RunLifecycleSnapshot;
  readonly restoreLifecycle: (snapshot: RunLifecycleSnapshot) => void;
  readonly captureChapterBinding: () => unknown;
  readonly stageChapterBinding: (value: unknown) => StagedChapterBinding | null;
  readonly installChapterBinding: (value: unknown) => CinematicDirectorBinding | undefined;
  readonly captureCinemaProtection: () => Readonly<{ active: boolean; lastMode: string | null }>;
  readonly restoreCinemaProtection: (value: Readonly<{ active: boolean; lastMode: string | null }>) => void;
  readonly captureStageBanner: () => Readonly<{ name: string; seconds: number }>;
  readonly restoreStageBanner: (name: string, seconds: number) => void;
  /** Clears canonical environment records before a committed restore applies. */
  readonly clearEnvironmentRestore?: () => void;
  readonly cinema: Pick<CinematicDirectorPort, "captureState" | "restoreState" | "validateState">;
}

export interface LiveStateForgeRuntimeBridge {
  readonly capture: () => Readonly<Record<string, unknown>>;
  readonly restore: (snapshot: Readonly<Record<string, unknown>>) => void;
  readonly validate: (
    snapshot: Readonly<Record<string, unknown>>,
    candidateRun: GameRun,
    candidateStageIndex: number,
  ) => void;
}

function stageBanner(value: unknown): Readonly<{ name: string; seconds: number }> {
  if (value === undefined) return Object.freeze({ name: "", seconds: 0 });
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("stage banner state must be an object");
  }
  const candidate = value as { name?: unknown; seconds?: unknown };
  if (typeof candidate.name !== "string" || typeof candidate.seconds !== "number" ||
    !Number.isFinite(candidate.seconds) || candidate.seconds < 0) {
    throw new TypeError("stage banner state is invalid");
  }
  return Object.freeze({ name: candidate.name, seconds: candidate.seconds });
}

function activeCinema(value: unknown): Readonly<{ active?: unknown; scriptId?: unknown; beatId?: unknown }> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

const transientNumberFields = Object.freeze(["hitStop", "shake", "timeScale", "slowmo", "zoom", "flash",
  "bannerT", "dashGhostT", "landingV", "worldZoom", "worldZoomTarget", "throwCd", "rankPopT"] as const);
const transientBooleanFields = Object.freeze(["wasDashing", "wasSwinging", "wasOnGround"] as const);

function validateTransient(snapshot: Readonly<Record<string, unknown>>): void {
  for (const field of transientNumberFields) {
    if (typeof snapshot[field] !== "number" || !Number.isFinite(snapshot[field])) {
      throw new TypeError(`State Forge runtime ${field} must be finite`);
    }
  }
  for (const field of transientBooleanFields) {
    if (typeof snapshot[field] !== "boolean") throw new TypeError(`State Forge runtime ${field} must be boolean`);
  }
  if (typeof snapshot.rankPopText !== "string") throw new TypeError("State Forge runtime rankPopText must be a string");
}

function normalizeTransient(snapshot: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...snapshot,
    landingV: snapshot.landingV === undefined ? 0 : snapshot.landingV,
    wasDashing: snapshot.wasDashing === undefined ? false : snapshot.wasDashing,
    wasSwinging: snapshot.wasSwinging === undefined ? false : snapshot.wasSwinging,
    wasOnGround: snapshot.wasOnGround === undefined ? true : snapshot.wasOnGround,
  });
}

function expectedChapterPosition(beatId: unknown): Readonly<{ state: string | undefined; page: number | undefined }> {
  if (typeof beatId !== "string") return Object.freeze({ state: undefined, page: undefined });
  if (beatId.startsWith("page-")) {
    return Object.freeze({ state: "LORE_READ", page: Number.parseInt(beatId.slice(5), 10) });
  }
  const states: Readonly<Record<string, string>> = Object.freeze({
    enter: "LORE_ENTER", exit: "LORE_EXIT", reveal: "BIOME_REVEAL", ready: "READY",
  });
  const state = states[beatId];
  return Object.freeze({ state, page: undefined });
}

function cinemaProtection(value: unknown): Readonly<{ active: boolean; lastMode: string | null }> {
  if (value === undefined) return Object.freeze({ active: false, lastMode: null });
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("cinematic protection state must be an object");
  }
  const candidate = value as { active?: unknown; lastMode?: unknown };
  if (typeof candidate.active !== "boolean" ||
    (candidate.lastMode !== null && typeof candidate.lastMode !== "string")) {
    throw new TypeError("cinematic protection state is invalid");
  }
  return Object.freeze({ active: candidate.active, lastMode: candidate.lastMode });
}

/** Owns the portable State Forge runtime payload and all pre-commit binding validation. */
export function createLiveStateForgeRuntimeBridge(
  options: LiveStateForgeRuntimeBridgeOptions,
): LiveStateForgeRuntimeBridge {
  const capture = (): Readonly<Record<string, unknown>> => Object.freeze({
    ...options.captureTransient(),
    lifecycle: options.captureLifecycle(),
    chapterBinding: options.captureChapterBinding(),
    stageBanner: options.captureStageBanner(),
    cinemaProtection: options.captureCinemaProtection(),
  });
  const restore = (snapshot: Readonly<Record<string, unknown>>): void => {
    const transient = normalizeTransient(snapshot);
    const banner = stageBanner(snapshot.stageBanner);
    const protection = cinemaProtection(snapshot.cinemaProtection);
    options.restoreTransient(transient);
    options.restoreStageBanner(banner.name, banner.seconds);
    options.restoreLifecycle(snapshot.lifecycle as RunLifecycleSnapshot);
    options.restoreCinemaProtection(protection);
    const binding = options.installChapterBinding(snapshot.chapterBinding);
    options.cinema.restoreState(snapshot.cinema, binding);
  };
  const validate = (
    snapshot: Readonly<Record<string, unknown>>,
    candidateRun: GameRun,
    candidateStageIndex: number,
  ): void => {
    validateTransient(normalizeTransient(snapshot));
    stageBanner(snapshot.stageBanner);
    cinemaProtection(snapshot.cinemaProtection);
    const cinema = activeCinema(snapshot.cinema);
    const lifecycle = validateRunLifecycleSnapshot(snapshot.lifecycle);
    const chapter = options.stageChapterBinding(snapshot.chapterBinding);
    const isActiveChapter = cinema.active === true && typeof cinema.scriptId === "string" &&
      cinema.scriptId.startsWith("chapter-");

    if (isActiveChapter && chapter === null) {
      throw new RangeError("active campaign chapter is missing its reconstructible binding");
    }
    if (chapter !== null) {
      const expected = expectedChapterPosition(cinema.beatId);
      if (cinema.active !== true || candidateRun.mode !== "campaign" ||
        chapter.spec.stageIndex !== candidateStageIndex || (candidateRun._biomeIdx ?? 0) !== candidateStageIndex ||
        candidateRun._prologueShown !== chapter.spec.prologueShownAfter ||
        candidateRun.chapterState !== chapter.spec.flowState || expected.state !== chapter.spec.flowState ||
        (expected.page !== undefined && expected.page !== chapter.spec.page) ||
        lifecycle.phase !== "wave-prepared" || !lifecycle.activationDeferred ||
        typeof lifecycle.sessionId !== "string" || lifecycle.sessionId.length === 0 ||
        lifecycle.wave !== candidateRun.wave || lifecycle.bossWave !== Boolean(candidateRun.isBossWave)) {
        throw new RangeError("active campaign chapter binding is inconsistent with candidate world state");
      }
    }
    if (cinema.active === true && chapter === null && lifecycle.sessionId !== options.captureLifecycle().sessionId) {
      throw new RangeError("active cinematic belongs to a different run session");
    }
    options.cinema.validateState(snapshot.cinema, chapter?.binding);
  };
  return Object.freeze({ capture, restore, validate });
}
