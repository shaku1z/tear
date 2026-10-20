import { stableVerificationHash } from "../replay/hash";
import { parseFinaleConfig } from "../gameplay/campaign/finale-binding";
import type { FinaleConfig } from "../gameplay/campaign/finale-controller";
import type { BossPracticeCandidate } from "../gameplay/training/practice-boss-catalog";
import type { CinematicDirectorBinding, CinematicDirectorPort } from
  "../gameplay/runtime/cinematic-director";
import { validateRunLifecycleSnapshot, type RunLifecycleSnapshot } from "../gameplay/run/lifecycle";
import type { GameEnemy, GameRun } from "./game-runtime-state";
import type { BossIntroState } from "./live-game-host-state";

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
  readonly finale?: Readonly<{ capture(): unknown; clear(): void; stage(value: unknown, config?: FinaleConfig): { binding: CinematicDirectorBinding; install(): void } | undefined }>;
  readonly tutorial?: Readonly<{
    captureSession(): unknown;
    validateSession(value: unknown, candidateWeaponId?: string, candidateEnemies?: readonly GameEnemy[], candidate?: BossPracticeCandidate): void;
    restoreSession(value: unknown): void;
  }>;
  readonly practiceWorld?: () => Readonly<{ run: GameRun; actors: readonly GameEnemy[]; platforms: readonly object[] }>;
  readonly practiceCinema?: Readonly<{ captureBinding(): unknown; stageBinding(value: unknown, owners: readonly object[]): CinematicDirectorBinding | undefined; restoreBinding(value: unknown): void }>;
  readonly captureBossIntro: () => BossIntroState | null;
  readonly restoreBossIntro: (intro: BossIntroState | null) => void;
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
  readonly cinema: Pick<CinematicDirectorPort, "captureState" | "restoreState" | "validateState"> & Partial<Pick<CinematicDirectorPort, "captureRecordedInput" | "restoreRecordedInput" | "validateRecordedInput">>;
}

export interface LiveStateForgeRuntimeBridge {
  readonly capture: () => Readonly<Record<string, unknown>>;
  readonly restore: (snapshot: Readonly<Record<string, unknown>>) => void;
  readonly validate: (
    snapshot: Readonly<Record<string, unknown>>,
    candidateRun: GameRun,
    candidateStageIndex: number,
    candidateEnemies?: readonly GameEnemy[],
    candidatePlatforms?: readonly object[],
    configuration?: unknown,
  ) => void;
}

function bossIntro(value: unknown, version: unknown): BossIntroState | null {
  if (version !== undefined && version !== 1) throw new RangeError("unsupported boss intro snapshot version");
  if (value === undefined || value === null) return null;
  if (version !== 1 || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("boss intro snapshot must be a versioned object");
  }
  const intro = value as Partial<Omit<BossIntroState, "boss">> & { boss?: GameEnemy | null };
  if (typeof intro.delay !== "number" || !Number.isFinite(intro.delay) || intro.delay < 0 ||
    typeof intro.t !== "number" || !Number.isFinite(intro.t) || intro.t < 0 ||
    typeof intro.dur !== "number" || !Number.isFinite(intro.dur) || intro.dur <= 0 || intro.t > intro.dur ||
    typeof intro.boss !== "object" || intro.boss?.isBoss !== true) {
    throw new TypeError("boss intro snapshot has invalid timers or actor");
  }
  return { boss: intro.boss, delay: intro.delay, t: intro.t, dur: intro.dur };
}

/** Resolve ownership against staged actors before either restore path mutates its world. */
export function resolveStateForgeBossIntro(
  snapshot: Readonly<Record<string, unknown>>,
  candidateEnemies: readonly GameEnemy[],
): BossIntroState | null {
  const intro = bossIntro(snapshot.bossIntro, snapshot.bossIntroVersion);
  if (intro !== null && !candidateEnemies.includes(intro.boss)) {
    throw new RangeError("boss intro actor is not owned by the restored world");
  }
  // Legacy snapshots must not inherit the current world's countdown controller.
  if (intro === null && candidateEnemies.some((enemy) => enemy.isBoss === true && (enemy.introT ?? 0) > 0)) {
    throw new RangeError("restored boss countdown is missing its intro binding");
  }
  return intro;
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

/** Non-entity nested records are encoded by value. Rebind only after exact structural agreement. */
function canonicalPracticeBinding(value: unknown, run: GameRun, platforms: readonly object[]): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid boss cinematic binding");
  const binding = value as Record<string, unknown>;
  if (binding.kind === "source-descent") {
    const transition: unknown = Reflect.get(run, "voidDescent");
    if (!transition || stableVerificationHash(binding.transition) !== stableVerificationHash(transition)) throw new RangeError("Source descent binding differs from canonical run transition");
    return { ...binding, transition };
  }
  if (binding.kind !== "boss-ritual" || !binding.context || typeof binding.context !== "object" || !binding.ritual || typeof binding.ritual !== "object") throw new TypeError("Invalid ritual binding");
  const context = binding.context as Record<string, unknown>, ritual = binding.ritual as { platforms?: readonly object[] };
  const idOf = (platform: object): string => {
    const id: unknown = Reflect.get(platform, "platformId"); if (typeof id !== "string" || id.length === 0) throw new RangeError("Ritual platform lacks canonical identity"); return id;
  };
  const byId = new Map<string, object>();
  for (const platform of platforms) { const id = idOf(platform); if (byId.has(id)) throw new RangeError("Ambiguous ritual platform identity"); byId.set(id, platform); }
  const resolve = (platform: object): object => {
    const match = byId.get(idOf(platform));
    if (!match || stableVerificationHash(match) !== stableVerificationHash(platform)) throw new RangeError("Ritual platform is not the canonical candidate record"); return match;
  };
  if (!Array.isArray(ritual.platforms) || ritual.platforms.length !== platforms.length || new Set(ritual.platforms.map(idOf)).size !== platforms.length) throw new RangeError("Ritual arena binding mismatch");
  return { ...binding, context: { ...context, crownPlatform: context.crownPlatform === null ? null : resolve(context.crownPlatform as object) },
    ritual: { ...ritual, platforms: ritual.platforms.map(resolve) } };
}

/** Owns the portable State Forge runtime payload and all pre-commit binding validation. */
export function createLiveStateForgeRuntimeBridge(
  options: LiveStateForgeRuntimeBridgeOptions,
): LiveStateForgeRuntimeBridge {
  const capture = (): Readonly<Record<string, unknown>> => {
    const tutorialSession = options.tutorial?.captureSession();
    return Object.freeze({ ...options.captureTransient(), bossIntroVersion: 1, bossIntro: options.captureBossIntro(), lifecycle: options.captureLifecycle(),
      chapterBinding: options.captureChapterBinding(), stageBanner: options.captureStageBanner(), cinemaProtection: options.captureCinemaProtection(),
      ...(tutorialSession === undefined ? {} : { tutorialSession }),
      ...(options.finale?.capture() == null ? {} : { finaleBinding: options.finale.capture() }),
      ...(options.finale?.capture() != null || (options.practiceCinema?.captureBinding() as { kind?: string } | null)?.kind === "source-descent"
        ? { cinemaInput: options.cinema.captureRecordedInput?.() } : {}),
      ...((typeof tutorialSession === "object" && tutorialSession !== null && "version" in tutorialSession && tutorialSession.version === 6) || options.practiceCinema?.captureBinding() != null
        ? { bossCinematicBinding: options.practiceCinema?.captureBinding() ?? null } : {}) });
  };
  const restore = (snapshot: Readonly<Record<string, unknown>>): void => {
    const intro = bossIntro(snapshot.bossIntro, snapshot.bossIntroVersion);
    const transient = normalizeTransient(snapshot);
    const banner = stageBanner(snapshot.stageBanner);
    const protection = cinemaProtection(snapshot.cinemaProtection);
    options.restoreTransient(transient);
    options.restoreStageBanner(banner.name, banner.seconds);
    options.restoreLifecycle(snapshot.lifecycle as RunLifecycleSnapshot);
    options.restoreCinemaProtection(protection);
    options.restoreBossIntro(intro);
    const world = options.practiceWorld?.();
    const practiceBinding = world ? canonicalPracticeBinding(snapshot.bossCinematicBinding, world.run, world.platforms) : snapshot.bossCinematicBinding;
    const finale = options.finale?.stage(snapshot.finaleBinding);
    if (finale === undefined) options.finale?.clear(); else finale.install();
    const binding = finale?.binding ?? options.installChapterBinding(snapshot.chapterBinding) ?? options.practiceCinema?.stageBinding(practiceBinding, world?.actors ?? []);
    options.practiceCinema?.restoreBinding(practiceBinding);
    options.cinema.restoreState(snapshot.cinema, binding);
    if (snapshot.cinemaInput !== undefined) options.cinema.restoreRecordedInput?.(snapshot.cinemaInput);
    options.tutorial?.restoreSession(snapshot.tutorialSession);
  };
  const validate = (
    snapshot: Readonly<Record<string, unknown>>,
    candidateRun: GameRun,
    candidateStageIndex: number,
    candidateEnemies: readonly GameEnemy[] = [],
    candidatePlatforms: readonly object[] = [],
    configuration?: unknown,
  ): void => {
    resolveStateForgeBossIntro(snapshot, candidateEnemies);
    validateTransient(normalizeTransient(snapshot));
    stageBanner(snapshot.stageBanner);
    cinemaProtection(snapshot.cinemaProtection);
    options.tutorial?.validateSession(snapshot.tutorialSession, candidateRun.weaponId, candidateEnemies, { run: candidateRun, actors: candidateEnemies, cinematicActive: activeCinema(snapshot.cinema).active === true });
    const tutorial = snapshot.tutorialSession;
    if (typeof tutorial === "object" && tutorial !== null && "active" in tutorial && tutorial.active === true && candidateRun.mode !== "tutorial") {
      throw new RangeError("active tutorial session requires a tutorial run");
    }
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
    const practice = typeof tutorial === "object" && tutorial !== null && "version" in tutorial && tutorial.version === 6;
    const canonicalBinding = canonicalPracticeBinding(snapshot.bossCinematicBinding, candidateRun, candidatePlatforms);
    if (practice && cinema.active === true) {
      const selected = tutorial as unknown as { bossPractice: { bossId: string } };
      const descriptor = canonicalBinding as { owner?: GameEnemy } | null;
      if (descriptor?.owner?.bossId !== selected.bossPractice.bossId || descriptor.owner.isBoss !== true) throw new RangeError("Boss practice cinematic candidate owner mismatch");
    }
    const practiceBinding = options.practiceCinema?.stageBinding(canonicalBinding, candidateEnemies);
    const values: unknown = configuration !== null && typeof configuration === "object" ? Reflect.get(configuration, "values") : undefined;
    const finaleConfig: unknown = values !== null && typeof values === "object" ? Reflect.get(values, "finale") : undefined;
    const finale = options.finale?.stage(snapshot.finaleBinding, finaleConfig === undefined ? undefined : parseFinaleConfig(finaleConfig));
    if (snapshot.finaleBinding != null && finale === undefined) throw new RangeError("Finale binding is unsupported");
    const savedState: unknown = snapshot.finaleBinding !== null && typeof snapshot.finaleBinding === "object" ? Reflect.get(snapshot.finaleBinding, "state") : undefined;
    if (finale !== undefined && (candidateRun.mode !== "campaign" || lifecycle.phase !== "finale" || cinema.scriptId !== "adventure-final-cut" || chapter !== null
      || savedState === null || typeof savedState !== "object" || Reflect.get(savedState, "phase") !== cinema.beatId)) throw new RangeError("Incoherent finale lifecycle");
    if (lifecycle.phase === "finale" && finale === undefined) throw new RangeError("Finale controller binding is missing");
    if (practice && cinema.active === true && !practiceBinding) throw new RangeError("Active boss practice cinema is missing its candidate binding");
    if (cinema.active === true && chapter === null && !practiceBinding && !finale && lifecycle.sessionId !== options.captureLifecycle().sessionId) {
      throw new RangeError("active cinematic belongs to a different run session");
    }
    options.cinema.validateState(snapshot.cinema, finale?.binding ?? chapter?.binding ?? practiceBinding);
    if (finale !== undefined || (canonicalBinding as { kind?: string } | null)?.kind === "source-descent") {
      if (options.cinema.validateRecordedInput === undefined || snapshot.cinemaInput === undefined) throw new RangeError("Source/finale input latch provenance is unavailable");
      options.cinema.validateRecordedInput(snapshot.cinemaInput);
    } else if (snapshot.cinemaInput !== undefined) throw new TypeError("Cinematic source input lacks its behavior binding");
  };
  return Object.freeze({ capture, restore, validate });
}
