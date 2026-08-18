/**
 * Per-world transient combat state. These fields belong to one running world,
 * are recreated with it, and are neither persisted configuration nor shared
 * application state. The module is deliberately free of rendering, browser,
 * persistence, and app types so a detached world can own the same values.
 */

/** Opening-phase protection captured from the active story/finale context. */
export interface TearWorldOpeningProtection {
  active: boolean;
  lastMode: string | null;
}

/** Opening-phase carry-over between fixed steps (cadence, cooldowns, landing). */
export interface TearWorldOpeningState {
  throwCooldown: number;
  wasDashing: boolean;
  wasSwinging: boolean;
  wasOnGround: boolean;
  dashGhostTime: number;
  landingVelocity: number;
}

/** Collision-phase impact feel that is not an entity collection. */
export interface TearWorldImpactState {
  hitStop: number;
  slowMotion: number;
  shake: number;
}

/**
 * Frame-feel values the prelude advances each step: time dilation, camera
 * framing, and the banner/rank readouts a presenter renders from.
 */
export interface TearWorldFeelState {
  timeScale: number;
  zoom: number;
  flash: number;
  bannerSeconds: number;
  worldZoom: number;
  worldZoomTarget: number;
  rankPopupSeconds: number;
  rankPopupText: string;
}

/**
 * One world's transient records. The records are mutable because the combat
 * phases write single fields per step; ownership is the world, not a closure.
 */
export interface TearWorldTransientState {
  readonly protection: TearWorldOpeningProtection;
  readonly opening: TearWorldOpeningState;
  readonly impact: TearWorldImpactState;
  readonly feel: TearWorldFeelState;
  assignProtection(value: Readonly<TearWorldOpeningProtection>): void;
  assignOpening(value: Readonly<TearWorldOpeningState>): void;
  assignImpact(value: Readonly<TearWorldImpactState>): void;
  /** Restores the neutral frame-feel values a fresh run starts from. */
  resetFeel(): void;
}

export interface TearWorldTransientStateOptions {
  readonly protection?: Readonly<TearWorldOpeningProtection>;
  readonly opening?: Readonly<TearWorldOpeningState>;
  readonly impact?: Readonly<TearWorldImpactState>;
  readonly feel?: Readonly<TearWorldFeelState>;
}

const NEUTRAL_FEEL: Readonly<TearWorldFeelState> = Object.freeze({
  timeScale: 1, zoom: 1, flash: 0, bannerSeconds: 0,
  worldZoom: 1, worldZoomTarget: 1, rankPopupSeconds: 0, rankPopupText: "",
});

/** Creates one isolated set of transient records; nothing is shared between worlds. */
export function createTearWorldTransientState(
  options: TearWorldTransientStateOptions = {},
): TearWorldTransientState {
  const protection: TearWorldOpeningProtection = { active: false, lastMode: null, ...options.protection };
  const opening: TearWorldOpeningState = {
    throwCooldown: 0, wasDashing: false, wasSwinging: false, wasOnGround: true,
    dashGhostTime: 0, landingVelocity: 0, ...options.opening,
  };
  const impact: TearWorldImpactState = { hitStop: 0, slowMotion: 0, shake: 0, ...options.impact };
  const feel: TearWorldFeelState = { ...NEUTRAL_FEEL, ...options.feel };
  return Object.freeze({
    protection, opening, impact, feel,
    assignProtection(value) { protection.active = value.active; protection.lastMode = value.lastMode; },
    assignOpening(value) {
      opening.throwCooldown = value.throwCooldown; opening.wasDashing = value.wasDashing;
      opening.wasSwinging = value.wasSwinging; opening.wasOnGround = value.wasOnGround;
      opening.dashGhostTime = value.dashGhostTime; opening.landingVelocity = value.landingVelocity;
    },
    assignImpact(value) {
      impact.hitStop = value.hitStop; impact.slowMotion = value.slowMotion; impact.shake = value.shake;
    },
    // Run reset deliberately restores dilation and framing without clearing the
    // rank popup, matching the live host's prior reset boundary exactly.
    resetFeel() {
      feel.timeScale = NEUTRAL_FEEL.timeScale; feel.zoom = NEUTRAL_FEEL.zoom; feel.flash = NEUTRAL_FEEL.flash;
      feel.bannerSeconds = NEUTRAL_FEEL.bannerSeconds; feel.worldZoom = NEUTRAL_FEEL.worldZoom;
      feel.worldZoomTarget = NEUTRAL_FEEL.worldZoomTarget;
    },
  } satisfies TearWorldTransientState);
}
