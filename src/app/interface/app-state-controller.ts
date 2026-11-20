import { screenSurface, type SurfaceAvailability } from "../../domain/surface-availability";
import { isAppScreen, LEGAL_TRANSITIONS, type AppScreen } from "../../domain/screen-catalog";
import { createScreenHistory, type ScreenPlace, type ScreenVisit } from "./screen-history";

export interface AppStateSnapshot {
  readonly screen: AppScreen;
  readonly previous: AppScreen | null;
  readonly runId: string | null;
  readonly replayReturn: AppScreen;
  /** The screen BACK returns to from this one, if it was opened from another. */
  readonly back: AppScreen | null;
  /** Where the player was on this screen when they last left it, when this transition returned here. */
  readonly arrival: ScreenVisit<AppScreen> | null;
  readonly revision: number;
}

export interface AppTransitionContext {
  readonly runId?: string;
  readonly returnTo?: AppScreen;
  /** Where the player was on the screen being left, so a return lands there. */
  readonly leaving?: ScreenPlace;
  /** A verified Ghost Theater checkpoint may enter its explicitly unranked child. */
  readonly practiceLaunch?: boolean;
}

export class IllegalLegacyAppTransitionError extends Error {
  constructor(
    readonly from: AppScreen,
    readonly to: AppScreen,
  ) {
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
  /** The main menu and play start the chain of opened screens over. */
  readonly #history = createScreenHistory<AppScreen>(["menu", "playing"]);
  readonly #listeners: ((screen: AppScreen) => void)[] = [];
  #snapshot: AppStateSnapshot = Object.freeze({
    screen: "menu",
    previous: null,
    runId: null,
    replayReturn: "menu",
    back: null,
    arrival: null,
    revision: 0,
  });

  /** The surface policy is the single entry guard: no path (including `rename -> *`) enters an unavailable screen. */
  constructor(surfaces: SurfaceAvailability) {
    this.#surfaces = surfaces;
  }

  get screen(): AppScreen {
    return this.#snapshot.screen;
  }
  get replayReturn(): AppScreen {
    return this.#snapshot.replayReturn;
  }
  snapshot(): AppStateSnapshot {
    return this.#snapshot;
  }

  /** Calls `listener` with the new screen after every change of screen. */
  subscribe(listener: (screen: AppScreen) => void): void {
    this.#listeners.push(listener);
  }

  transition(to: AppScreen, context: AppTransitionContext = {}): AppScreen {
    ensureScreen(to, "to");
    const current = this.#snapshot;
    if (to === current.screen) return current.screen;
    if (!this.canEnter(to)) throw new UnavailableLegacyAppScreenError(current.screen, to);
    // Every screen may return to the one it was opened from; the catalog lists the forward edges.
    if (!LEGAL_TRANSITIONS[current.screen].includes(to) && to !== current.back) {
      throw new IllegalLegacyAppTransitionError(current.screen, to);
    }
    let replayReturn = current.replayReturn;
    if (to === "replay") replayReturn = ensureScreen(context.returnTo ?? current.screen, "replay return");
    else if (current.screen === "replay" && to !== "rename") {
      const practiceLaunch = to === "playing" && context.practiceLaunch === true;
      if (!practiceLaunch && to !== replayReturn) throw new IllegalLegacyAppTransitionError(current.screen, to);
      replayReturn = "menu";
    }
    const runId = context.runId ?? current.runId;
    const leaving = context.leaving ?? { focus: -1, scroll: 0 };
    const arrival = this.#history.move({ screen: current.screen, ...leaving }, to) ?? null;
    this.#snapshot = Object.freeze({
      screen: to,
      previous: current.screen,
      runId,
      replayReturn,
      back: this.#history.backTarget() ?? null,
      arrival,
      revision: current.revision + 1,
    });
    for (const listener of this.#listeners) listener(to);
    return to;
  }

  canTransition(to: AppScreen): boolean {
    const legal = LEGAL_TRANSITIONS[this.screen].includes(to) || to === this.#snapshot.back;
    return to === this.screen || (this.canEnter(to) && legal);
  }

  /** False for an engineering screen that this build's surface policy does not admit. */
  canEnter(screen: AppScreen): boolean {
    const surface = screenSurface(screen);
    return surface === undefined || this.#surfaces.allows(surface);
  }
}
