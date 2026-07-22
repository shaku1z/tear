export type CinematicPlayerMode = string;

export interface CinematicRuntimePlayer {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number; onGround: boolean; facing: number;
  updateSafetyTimers(dt: number): void;
}

export interface CinematicRuntimeBlade {
  prevTipX: number; prevTipY: number; tipX: number; tipY: number; tipSpeed: number;
  update(dt: number, player: CinematicRuntimePlayer, platforms: readonly CinematicRuntimePlatform[]): void;
}

export interface CinematicRuntimePlatform {
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly floor?: boolean; readonly oneway?: boolean; readonly void?: boolean;
  readonly materializationState?: string;
}

export interface CinematicFinaleSnapshot {
  readonly phase: string; readonly severed: number; readonly anchors: readonly unknown[]; readonly landed: boolean;
}

export interface CinematicPlayerRuntimeOptions {
  readonly dt: number; readonly mode: CinematicPlayerMode;
  readonly player: CinematicRuntimePlayer; readonly blade: CinematicRuntimeBlade | null;
  readonly platforms: readonly CinematicRuntimePlatform[];
  readonly gravity: number; readonly maxFall: number; readonly descentLiftVelocity: number;
  readonly viewportWidth: number;
  readonly finale: CinematicFinaleSnapshot | null;
  readonly lerp: (from: number, to: number, amount: number) => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  onFinaleLanded(): void;
  onFinaleBladeCut(blade: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>): void;
  onLanding(x: number, y: number): void;
}

export function stepCinematicPlayer(options: CinematicPlayerRuntimeOptions): void {
  const { player, mode, dt } = options;
  if (mode === "locked") {
    player.vx *= Math.exp(-10 * dt); player.vy = 0;
  } else if (mode === "float") {
    player.onGround = false; player.vx *= Math.exp(-5 * dt);
    player.vy = options.lerp(player.vy, options.descentLiftVelocity, options.clamp(3.5 * dt, 0, 1));
    player.x = options.clamp(player.x + player.vx * dt, player.hw, options.viewportWidth - player.hw);
    player.y = Math.max(player.hh + 50, player.y + player.vy * dt);
  } else if (mode === "landing" || mode === "finalLanding") {
    const priorBottom = player.y + player.hh;
    player.vx *= Math.exp(-7 * dt);
    player.x = options.clamp(player.x + player.vx * dt, player.hw, options.viewportWidth - player.hw);
    player.vy = Math.min(options.maxFall, player.vy + options.gravity * dt);
    player.y += player.vy * dt; player.onGround = false;
    const landing = options.platforms.find((platform) => {
      const eligible = mode === "landing"
        ? platform.void && platform.oneway && platform.materializationState !== "gone"
        : platform.floor === true || platform.oneway === true;
      return eligible && player.x + player.hw > platform.x && player.x - player.hw < platform.x + platform.w &&
        priorBottom <= platform.y + 2 && player.y + player.hh >= platform.y;
    });
    if (landing) {
      player.y = landing.y - player.hh; player.vy = 0; player.onGround = true;
      if (mode === "finalLanding" && options.finale && !options.finale.landed) {
        options.onFinaleLanded(); options.onLanding(player.x, landing.y);
      }
    }
  } else if (mode === "finalBlade") {
    player.onGround = false; player.vx = 0; player.vy = 0;
  }
  player.updateSafetyTimers(dt);
  options.blade?.update(dt, player, options.platforms);
  if (mode === "finalBlade" && options.finale?.phase === "cut" && options.finale.severed < options.finale.anchors.length && options.blade) {
    options.onFinaleBladeCut({ previousX: options.blade.prevTipX, previousY: options.blade.prevTipY,
      x: options.blade.tipX, y: options.blade.tipY, speed: options.blade.tipSpeed });
  }
}
