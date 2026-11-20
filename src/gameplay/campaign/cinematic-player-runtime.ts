export type CinematicPlayerMode = string;

export interface CinematicRuntimePlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hw: number;
  hh: number;
  onGround: boolean;
  facing: number;
  updateSafetyTimers(dt: number): void;
}

export interface CinematicRuntimeBlade {
  /** The trigger the blade reads in place of the player's input; see `stepCinematicPlayer`. */
  lmbOverride?: boolean;
  prevTipX: number;
  prevTipY: number;
  tipX: number;
  tipY: number;
  tipSpeed: number;
  update(dt: number, player: CinematicRuntimePlayer, platforms: readonly CinematicRuntimePlatform[]): void;
}

export interface CinematicRuntimePlatform {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly floor?: boolean;
  readonly oneway?: boolean;
  readonly void?: boolean;
  readonly materializationState?: string;
}

export interface CinematicFinaleSnapshot {
  readonly phase: string;
  readonly severed: number;
  readonly anchors: readonly unknown[];
  readonly landed: boolean;
}

export interface CinematicPlayerRuntimeOptions {
  readonly dt: number;
  readonly mode: CinematicPlayerMode;
  readonly player: CinematicRuntimePlayer;
  readonly blade: CinematicRuntimeBlade | null;
  readonly platforms: readonly CinematicRuntimePlatform[];
  readonly gravity: number;
  readonly maxFall: number;
  readonly descentLiftVelocity: number;
  readonly viewportWidth: number;
  readonly finale: CinematicFinaleSnapshot | null;
  readonly lerp: (from: number, to: number, amount: number) => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  onFinaleLanded(): void;
  onFinaleBladeCut(
    blade: Readonly<{ previousX: number; previousY: number; x: number; y: number; speed: number }>,
  ): void;
  onLanding(x: number, y: number): void;
}

export function stepCinematicPlayer(options: CinematicPlayerRuntimeOptions): void {
  const { player, mode, dt } = options;
  if (mode === "locked") {
    player.vx *= Math.exp(-10 * dt);
    player.vy = 0;
  } else if (mode === "float") {
    player.onGround = false;
    player.vx *= Math.exp(-5 * dt);
    player.vy = options.lerp(player.vy, options.descentLiftVelocity, options.clamp(3.5 * dt, 0, 1));
    player.x = options.clamp(player.x + player.vx * dt, player.hw, options.viewportWidth - player.hw);
    player.y = Math.max(player.hh + 50, player.y + player.vy * dt);
  } else if (mode === "landing" || mode === "finalLanding") {
    const priorBottom = player.y + player.hh;
    player.vx *= Math.exp(-7 * dt);
    player.x = options.clamp(player.x + player.vx * dt, player.hw, options.viewportWidth - player.hw);
    player.vy = Math.min(options.maxFall, player.vy + options.gravity * dt);
    player.y += player.vy * dt;
    player.onGround = false;
    const landing = landingPlatform(mode, player, priorBottom, options.platforms);
    if (landing) {
      player.y = landing.y - player.hh;
      player.vy = 0;
      player.onGround = true;
      if (mode === "finalLanding" && options.finale && !options.finale.landed) {
        options.onFinaleLanded();
        options.onLanding(player.x, landing.y);
      }
    }
  } else if (mode === "finalBlade") {
    player.onGround = false;
    player.vx = 0;
    player.vy = 0;
  }
  player.updateSafetyTimers(dt);
  if (options.blade) updateBladeInCinematic(options.blade, mode, dt, player, options.platforms);
  if (
    mode === "finalBlade" &&
    options.finale?.phase === "cut" &&
    options.finale.severed < options.finale.anchors.length &&
    options.blade
  ) {
    options.onFinaleBladeCut({
      previousX: options.blade.prevTipX,
      previousY: options.blade.prevTipY,
      x: options.blade.tipX,
      y: options.blade.tipY,
      speed: options.blade.tipSpeed,
    });
  }
}

/**
 * The blade goes on moving in a cinematic, but only the finale's blade cut hands it the player's trigger. In
 * every other beat the player is not in control, so the weapon sees the trigger released: a shot fired there
 * (Riftlock's recoil) would move the player the cinematic is placing.
 */
function updateBladeInCinematic(
  blade: CinematicRuntimeBlade,
  mode: CinematicPlayerMode,
  dt: number,
  player: CinematicRuntimePlayer,
  platforms: readonly CinematicRuntimePlatform[],
): void {
  if (mode === "finalBlade") {
    blade.update(dt, player, platforms);
    return;
  }
  const trigger = blade.lmbOverride;
  blade.lmbOverride = false;
  blade.update(dt, player, platforms);
  if (trigger === undefined) delete blade.lmbOverride;
  else blade.lmbOverride = trigger;
}

const LANDING_TOLERANCE = 2;

/**
 * What a landing beat puts the player on this step: the platform their feet passed through. A landing beat
 * waits for the player to stand, so when no platform is left below their feet (knocked beside or below every
 * one) they are brought to the nearest: moved over it while they are still above it, so they fall onto it,
 * and set on it when they are already lower. They never fall for ever and hold the cinematic open.
 */
function landingPlatform(
  mode: "landing" | "finalLanding",
  player: CinematicRuntimePlayer,
  priorBottom: number,
  platforms: readonly CinematicRuntimePlatform[],
): CinematicRuntimePlatform | undefined {
  const eligible = platforms.filter((platform) =>
    mode === "landing"
      ? platform.void === true && platform.oneway === true && platform.materializationState !== "gone"
      : platform.floor === true || platform.oneway === true,
  );
  const under = (platform: CinematicRuntimePlatform): boolean =>
    player.x + player.hw > platform.x && player.x - player.hw < platform.x + platform.w;
  const bottom = player.y + player.hh;
  const passed = eligible.find(
    (platform) => under(platform) && priorBottom <= platform.y + LANDING_TOLERANCE && bottom >= platform.y,
  );
  if (passed) return passed;
  if (eligible.some((platform) => under(platform) && priorBottom <= platform.y + LANDING_TOLERANCE)) return undefined;
  let nearest: CinematicRuntimePlatform | undefined;
  let nearestDistance = Infinity;
  for (const platform of eligible) {
    const distance = Math.max(platform.x - player.x, 0, player.x - (platform.x + platform.w));
    if (distance < nearestDistance) {
      nearest = platform;
      nearestDistance = distance;
    }
  }
  if (nearest === undefined) return undefined;
  player.x = Math.min(Math.max(player.x, nearest.x + player.hw), nearest.x + nearest.w - player.hw);
  return bottom >= nearest.y ? nearest : undefined;
}
