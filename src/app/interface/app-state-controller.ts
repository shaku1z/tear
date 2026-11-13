import { screenSurface, type SurfaceAvailability } from "../../domain/surface-availability";
import { isAppScreen, LEGAL_TRANSITIONS, type AppScreen } from "../../domain/screen-catalog";

export interface AppStateSnapshot {
  readonly screen: AppScreen;
  readonly previous: AppScreen | null;
  readonly runId: string | null;
  readonly settingsReturn: AppScreen;
  readonly replayReturn: AppScreen;
  readonly revision: number;
}

export interface AppTransitionContext {
  readonly runId?: string;
  readonly returnTo?: AppScreen;
  /** A verified Ghost Theater checkpoint may enter its explicitly unranked child. */
  readonly practiceLaunch?: boolean;
}

export class IllegalLegacyAppTransitionError extends Error {
  constructor(readonly from: AppScreen, readonly to: AppScreen) {
    super(`Illegal legacy application transition: ${from} -> ${to}`);
    this.name = "IllegalLegacyAppTransitionError";
  }
}

/** Refusal for an engineering screen requested in a build whose surface policy does not admit it. */
export class UnavailableLegacyAppScreenError extends IllegalLegacyAppTransitionError {
  constructor(from: AppScreen, to: AppScreen) {
    super(from, to);
    this.message = `Unavailable application screen in this build: ${from} -> ${to}`;
    this.name = "UnavailableLegacyAppScreenError";
  }
}

function ensureScreen(value: AppScreen, label: string): AppScreen {
  if (!isAppScreen(value)) throw new TypeError(`${label} is not a recognized application screen`);
  return value;
}

/** Authoritative owner for the classic shell while its render functions remain string-oriented. */
export class AppStateController {
  readonly #surfaces: SurfaceAvailability;
  #snapshot: AppStateSnapshot = Object.freeze({
    screen: "menu",
    previous: null,
    runId: null,
    settingsReturn: "menu",
    replayReturn: "menu",
    revision: 0,
  });

  /** The surface policy is the single entry guard: no path (including `rename -> *`) enters an unavailable screen. */
  constructor(surfaces: SurfaceAvailability) {
    this.#surfaces = surfaces;
  }

  get screen(): AppScreen { return this.#snapshot.screen; }
  get settingsReturn(): AppScreen { return this.#snapshot.settingsReturn; }
  get replayReturn(): AppScreen { return this.#snapshot.replayReturn; }
  snapshot(): AppStateSnapshot { return this.#snapshot; }

  transition(to: AppScreen, context: AppTransitionContext = {}): AppScreen {
    ensureScreen(to, "to");
    const current = this.#snapshot;
    if (to === current.screen) return current.screen;
    if (!this.canEnter(to)) throw new UnavailableLegacyAppScreenError(current.screen, to);
    if (!LEGAL_TRANSITIONS[current.screen].includes(to)) {
      throw new IllegalLegacyAppTransitionError(current.screen, to);
    }
    let settingsReturn = current.settingsReturn;
    let replayReturn = current.replayReturn;
    if (to === "settings") {
      const requested = context.returnTo;
      settingsReturn = requested === undefined
        ? (current.screen === "rename" ? current.settingsReturn : current.screen)
        : ensureScreen(requested, "settings return");
    } else if (current.screen === "settings" && to === settingsReturn) {
      settingsReturn = "menu";
    }
    if (to === "replay") replayReturn = ensureScreen(context.returnTo ?? current.screen, "replay return");
    else if (current.screen === "replay" && to !== "rename") {
      const practiceLaunch = to === "playing" && context.practiceLaunch === true;
      if (!practiceLaunch && to !== replayReturn) throw new IllegalLegacyAppTransitionError(current.screen, to);
      replayReturn = "menu";
    }
    const runId = context.runId ?? current.runId;
    this.#snapshot = Object.freeze({
      screen: to,
      previous: current.screen,
      runId,
      settingsReturn,
      replayReturn,
      revision: current.revision + 1,
    });
    return to;
  }

  canTransition(to: AppScreen): boolean {
    return to === this.screen || (this.canEnter(to) && LEGAL_TRANSITIONS[this.screen].includes(to));
  }

  /** False for an engineering screen that this build's surface policy does not admit. */
  canEnter(screen: AppScreen): boolean {
    const surface = screenSurface(screen);
    return surface === undefined || this.#surfaces.allows(surface);
  }
}
