import { buildLiveMusicObservation, type LiveMusicActor, type LiveMusicPlayer, type LiveMusicRun } from "../audio/live-music-observation";
import type { MusicContextObservation } from "../audio/music-director";
import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { AIM_MAGNITUDE_SCALE } from "../input/game-action";

export interface MutableBossIntro { delay: number; t: number; dur: number; boss: (LiveMusicActor & { introT: number }) | null }
export interface MutableFramePreludeState {
  slowMotion: number; timeScale: number; worldZoom: number; worldZoomTarget: number; zoom: number; flash: number;
  bannerTime: number; stageBannerSeconds: number; rankPopTime: number; bossIntro: MutableBossIntro | null;
  bossBeat: { t: number } | null;
}
export interface FramePreludeInput {
  dt: number; state: MutableFramePreludeState; parrySlowScale: number; cinemaActive: boolean;
  playgroundSlow: boolean; introScale: number; lerp(a: number, b: number, t: number): number;
  clamp(value: number, min: number, max: number): number;
}

export function advanceFramePrelude(input: FramePreludeInput): void {
  const { dt, state } = input;
  if (state.slowMotion > 0) { state.slowMotion -= dt; state.timeScale = input.parrySlowScale; }
  else state.timeScale = input.lerp(state.timeScale, 1, input.clamp(8 * dt, 0, 1));
  if (input.cinemaActive) state.timeScale = 1;
  if (input.playgroundSlow) state.timeScale = Math.min(state.timeScale, 0.35);
  const intro = state.bossIntro;
  if (intro) {
    if (intro.delay > 0) intro.delay = Math.max(0, intro.delay - dt); else intro.t += dt;
    if (intro.boss) intro.boss.introT = Math.max(0, intro.dur - intro.t);
    if (intro.t >= intro.dur || !intro.boss || intro.boss.dead || intro.boss.dying) state.bossIntro = null;
    else if (intro.delay <= 0) state.timeScale = Math.min(state.timeScale, input.introScale);
  }
  if (state.bossBeat) { state.bossBeat.t -= dt; if (state.bossBeat.t <= 0) state.bossBeat = null; }
  state.worldZoom = input.lerp(state.worldZoom, state.worldZoomTarget, input.clamp(3 * dt, 0, 1));
  state.zoom = input.lerp(state.zoom, state.worldZoom, input.clamp(9 * dt, 0, 1));
  if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 3.2);
  if (state.bannerTime > 0) state.bannerTime -= dt;
  if (state.stageBannerSeconds > 0) state.stageBannerSeconds -= dt;
  if (state.rankPopTime > 0) state.rankPopTime -= dt * 1.2;
}

export function commitBossIntroSnapshot<TBoss extends { introT?: number }>(
  current: Readonly<{ delay: number; t: number; dur: number; boss: TBoss }> | null,
  snapshot: MutableBossIntro | null,
): { delay: number; t: number; dur: number; boss: TBoss } | null {
  if (snapshot === null) {
    // advanceFramePrelude zeroes the detached actor snapshot before clearing the
    // terminal intro record. Preserve that final mutation on the live actor.
    if (current?.boss) current.boss.introT = 0;
    return null;
  }
  if (current === null) return null;
  if (typeof snapshot.boss?.introT === "number") current.boss.introT = snapshot.boss.introT;
  return { boss: current.boss, delay: snapshot.delay, t: snapshot.t, dur: snapshot.dur };
}

export interface FixedSimulationPort {
  readonly tick: number;
  advance(milliseconds: number, step: (seconds: number, tick: number) => void): Readonly<{
    tick: number; steps: number; droppedMilliseconds: number;
  }>;
}
export interface FixedSimulationInput {
  dt: number; timeScale: number; hitStop: number; state(): string; simulation: FixedSimulationPort;
  recording(): boolean; readonly aimRadius: number;
  sampleAim(): Readonly<{ x: number; y: number }>; pushAim(turn: number, magnitude: number): void;
  drainActions(tick: number): readonly CommandEnvelope<GameAction>[];
  authoritativeStep(tick: number, seconds: number, actions: readonly CommandEnvelope<GameAction>[]): void;
  clearOverrides(): void; step(seconds: number): void; gauge(name: "simulationTick" | "simulationSteps" | "simulationDroppedMs", value: number): void;
}
export function advanceFixedSimulation(input: FixedSimulationInput): number {
  if (input.hitStop > 0) return input.hitStop - input.dt;
  const advance = input.simulation.advance(input.dt * input.timeScale * 1000, (seconds, tick) => {
    if (input.state() !== "playing") return;
    // Recording is passive (source contract: GHOST observes the sim, never drives it).
    // The raw device input always runs the live step; the sealed envelopes exist only
    // for the replay file, so live feel is identical whether or not a ghost is taping.
    if (input.recording()) {
      const aim = input.sampleAim(), angle = Math.atan2(aim.y, aim.x), normalized = angle < 0 ? angle + Math.PI * 2 : angle;
      const magnitude = Math.round(Math.max(0, Math.min(1, Math.hypot(aim.x, aim.y) / input.aimRadius)) * AIM_MAGNITUDE_SCALE);
      input.pushAim(Math.round(normalized / (Math.PI * 2) * 1_000_000) % 1_000_000, magnitude);
      input.drainActions(tick);
    }
    input.clearOverrides(); input.step(seconds);
  });
  input.gauge("simulationTick", advance.tick); input.gauge("simulationSteps", advance.steps);
  input.gauge("simulationDroppedMs", advance.droppedMilliseconds); return input.hitStop;
}

export interface LiveMusicDirectorPort {
  readonly active: boolean; emit(timeSeconds: number, event: Readonly<Record<string, unknown>>): void;
  update(observation: MusicContextObservation): void;
}
export interface LiveMusicSyncInput {
  director: LiveMusicDirectorPort; appState: string; run: LiveMusicRun | null; player: LiveMusicPlayer | null;
  actors: readonly LiveMusicActor[]; projectiles: readonly Readonly<{ dead?: boolean }>[];
  stageName: string | null; stageIndex: number; totalWaves: number; waveActive: boolean; runPhase: string;
  topComboThreshold: number; bossIntroActor: LiveMusicActor | null;
}
export function emitLiveMusicEvent(director: LiveMusicDirectorPort, run: LiveMusicRun | null,
  type: string, detail?: Readonly<Record<string, unknown>>): void {
  if (run) director.emit(run.runTime, { type, ...(detail ?? {}) });
}
export function updateLiveMusicDirector(input: LiveMusicSyncInput): void {
  if (!input.director.active || !input.run) return;
  input.director.update(buildLiveMusicObservation({ appState: input.appState, run: input.run, player: input.player,
    actors: input.actors, projectiles: input.projectiles, stageName: input.stageName, stageIndex: input.stageIndex,
    totalWaves: input.totalWaves, waveActive: input.waveActive, runPhase: input.runPhase,
    topComboThreshold: input.topComboThreshold, bossIntroActor: input.bossIntroActor }));
}

export interface MusicThemePort { setMusicTheme(theme: string, boss: boolean): void }
export function syncMusicTheme(port: MusicThemePort | null, input: Readonly<{
  menu: boolean; attractReady: boolean; attractStage: string; runMode: string | null; stageName: string | null;
  bossWave: boolean; appState: string;
}>): void {
  if (!port) return;
  if (input.menu) port.setMusicTheme(input.attractReady ? input.attractStage : "menu", false);
  else if (input.stageName && input.runMode && ["campaign", "endless", "bossonly", "gauntlet", "tutorial", "playground"].includes(input.runMode))
    port.setMusicTheme(input.stageName, input.bossWave && input.appState !== "gameover" && input.appState !== "win");
  else port.setMusicTheme("menu", false);
}

export interface LiveFrameRuntimeOptions {
  readonly director: LiveMusicDirectorPort;
  getRun(): LiveMusicRun | null;
  readPreludeState(): MutableFramePreludeState;
  writePreludeState(state: MutableFramePreludeState): void;
  readonly parrySlowScale: number;
  cinemaActive(): boolean;
  playgroundSlow(): boolean;
  readonly introScale: number;
  lerp(a: number, b: number, t: number): number;
  clamp(value: number, min: number, max: number): number;
  timeScale(): number;
  hitStop(): number;
  setHitStop(value: number): void;
  fixedSimulationInput(): Omit<FixedSimulationInput, "dt" | "timeScale" | "hitStop">;
  musicInput(): LiveMusicSyncInput;
  musicThemePort(): MusicThemePort | null;
  musicThemeInput(): Readonly<{
    menu: boolean; attractReady: boolean; attractStage: string; runMode: string | null; stageName: string | null;
    bossWave: boolean; appState: string;
  }>;
}

/** Owns the mutable bridge between the real-time frame coordinator and typed frame/music runtimes. */
export class LiveFrameRuntime {
  readonly #options: LiveFrameRuntimeOptions;

  constructor(options: LiveFrameRuntimeOptions) { this.#options = options; }

  emitMusicEvent(type: string, detail?: Readonly<Record<string, unknown>>): void {
    emitLiveMusicEvent(this.#options.director, this.#options.getRun(), type, detail);
  }

  advancePrelude(dt: number): void {
    const state = this.#options.readPreludeState();
    advanceFramePrelude({ dt, state, parrySlowScale: this.#options.parrySlowScale,
      cinemaActive: this.#options.cinemaActive(), playgroundSlow: this.#options.playgroundSlow(),
      introScale: this.#options.introScale,
      lerp: (a, b, t) => this.#options.lerp(a, b, t),
      clamp: (value, minimum, maximum) => this.#options.clamp(value, minimum, maximum) });
    this.#options.writePreludeState(state);
  }

  advanceSimulation(dt: number): void {
    this.#options.setHitStop(advanceFixedSimulation({ ...this.#options.fixedSimulationInput(), dt,
      timeScale: this.#options.timeScale(), hitStop: this.#options.hitStop() }));
  }

  syncMusic(): void {
    syncMusicTheme(this.#options.musicThemePort(), this.#options.musicThemeInput());
    updateLiveMusicDirector(this.#options.musicInput());
  }
}
