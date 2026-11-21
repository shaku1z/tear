import type { ProductionHeadlessEnvironment } from "./production-headless-environment";

/** The chapter state in which the story has handed over to the wave. */
export const CHAPTER_WAVE_LIVE = "WAVE_LIVE";

/** How a chapter is skipped. In application frames of a sixtieth of a second. */
export const CHAPTER_SKIP = Object.freeze({
  frameSeconds: 1 / 60,
  /** Confirm is released for this many frames first, which arms the hold. */
  releaseFrames: 12,
  /** The state is looked at once in this many frames. */
  sampleEveryFrames: 8,
  /** A chapter that has not handed over after this many frames is not going to. */
  limitFrames: 600,
});

/** The run's lifecycle phase while the Adventure's closing scene plays, after its last boss falls. */
export const FINALE_PHASE = "finale";

/** How the closing scene is skipped. It takes longer than a chapter: the player is set down before the run is won. */
export const FINALE_SKIP = Object.freeze({
  /** Simulation ticks in one application frame, as the game runs: 120 ticks and 60 frames a second. */
  ticksPerFrame: 2,
  /** A closing scene that has not ended the run after this many frames (30 s) is not going to. */
  limitFrames: 1800,
});

/**
 * The state of the story chapter the run is showing, read from the running world; undefined in a mode with no
 * chapters and in a run opened where the stage shows none (the Grounds after its first wave). A checkpoint holds
 * the same field but hashes the whole game to get it.
 */
export function chapterState(environment: Pick<ProductionHeadlessEnvironment, "world">): string | undefined {
  return (environment.world().run() as { chapterState?: string | null } | undefined)?.chapterState ?? undefined;
}

/** True while a story chapter holds the run: one is showing and has not handed over to the wave. */
export function chapterHolds(environment: Pick<ProductionHeadlessEnvironment, "world">): boolean {
  const state = chapterState(environment);
  return state !== undefined && state !== CHAPTER_WAVE_LIVE;
}

/**
 * Skips the story chapter the run is showing, as a player does: the Adventure opens each stage with one, with the
 * player locked, and fixed ticks neither time nor confirm its pages. Confirm is released long enough to arm the
 * hold, then held (HOLD TO SKIP CHAPTER) through real application frames until the chapter hands over to the wave.
 * Returns whether it did.
 */
export function skipChapter(
  environment: Pick<ProductionHeadlessEnvironment, "world" | "advanceApplicationFrame">,
): boolean {
  const { frameSeconds, releaseFrames, sampleEveryFrames, limitFrames } = CHAPTER_SKIP;
  for (
    let frame = 0;
    frame < limitFrames && (frame % sampleEveryFrames !== 0 || chapterState(environment) !== CHAPTER_WAVE_LIVE);
    frame += 1
  ) {
    environment.advanceApplicationFrame(frameSeconds, { key: frame >= releaseFrames });
  }
  const live = chapterState(environment) === CHAPTER_WAVE_LIVE;
  if (live) environment.advanceApplicationFrame(frameSeconds, { key: false });
  return live;
}

/** True while the Adventure's closing scene holds the run. */
export function finaleHolds(environment: Pick<ProductionHeadlessEnvironment, "policyObservation">): boolean {
  return environment.policyObservation().diagnostics?.lifecyclePhase === FINALE_PHASE;
}

/**
 * Skips the Adventure's closing scene, as a player does, by holding confirm. Unlike a chapter, the scene waits on
 * the simulation too (the player is set down and has to land), so each application frame is followed by its
 * simulation ticks, as the game runs them. Returns whether the run ended.
 */
export function skipFinale(
  environment: Pick<ProductionHeadlessEnvironment, "advanceApplicationFrame" | "step">,
): boolean {
  const { frameSeconds, releaseFrames } = CHAPTER_SKIP;
  for (let frame = 0; frame < FINALE_SKIP.limitFrames; frame += 1) {
    environment.advanceApplicationFrame(frameSeconds, { key: frame >= releaseFrames });
    for (let tick = 0; tick < FINALE_SKIP.ticksPerFrame; tick += 1) if (environment.step([]).terminated) return true;
  }
  return false;
}
