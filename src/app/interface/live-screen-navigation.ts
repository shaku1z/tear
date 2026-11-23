import type { AppStateController, AppTransitionContext } from "./app-state-controller";
import type { ScreenPlace } from "./screen-history";
import type { AppScreen } from "../../domain/screen-catalog";
import type { BrowserInput } from "../../input/browser-input-contracts";
import { setMusicPreview } from "../../audio/music/preview";
import { retryFailedCoverPaintings } from "../../presentation/music-cover-art";

/** Collaborators that react to a transition but are constructed after the navigation owner. */
export interface LiveScreenTransitionHooks {
  readonly cancelChase: (screen: string) => void;
  readonly cancelPendingReplayOpen: () => void;
  readonly leaveShop: () => void;
  readonly interruptTutorialCoaching: () => void;
}

export interface LiveScreenNavigationOptions {
  readonly app: AppStateController;
  readonly input: Pick<BrowserInput, "allowLock" | "discardSemanticInput" | "returnControl">;
  readonly runScreenFact: (transition: "paused" | "resumed") => void;
  /** Where the player is on the current screen, recorded when they leave it so a return lands there. */
  readonly place: () => ScreenPlace;
}

export interface LiveScreenNavigation {
  readonly screen: () => AppScreen;
  readonly setScreen: (next: AppScreen, context?: AppTransitionContext) => AppScreen;
  /** Returns to the screen the current one was opened from, or the main menu when it has none. */
  readonly back: () => AppScreen;
  /** Where the player was on the current screen, when the last change returned to it. */
  readonly arrival: () => ScreenPlace | undefined;
  /** Installs hooks as their owners are constructed; unbound hooks do nothing. */
  readonly bind: (hooks: Partial<LiveScreenTransitionHooks>) => void;
}

/** Owns the live application screen and the side effects of every transition. */
export function createLiveScreenNavigation(options: LiveScreenNavigationOptions): LiveScreenNavigation {
  const { app, input } = options;
  let state: AppScreen = app.screen;
  let cancelChase: LiveScreenTransitionHooks["cancelChase"] = () => undefined;
  let cancelPendingReplayOpen: LiveScreenTransitionHooks["cancelPendingReplayOpen"] = () => {
    /* Replay is loaded later. */
  };
  let leaveShop: LiveScreenTransitionHooks["leaveShop"] = () => {
    /* The Shop is loaded later. */
  };
  let interruptTutorialCoaching: LiveScreenTransitionHooks["interruptTutorialCoaching"] = () => {
    /* Training is loaded later. */
  };
  function setScreen(next: AppScreen, context?: AppTransitionContext): AppScreen {
    cancelChase(next);
    const prior = state;
    state = app.transition(next, { ...context, leaving: options.place() });
    cancelPendingReplayOpen();
    if (prior === "shop" && state !== "shop") leaveShop();
    // A song previewed on the MUSIC screen stops when the player leaves it (rename sits over it).
    if (prior === "music" && state !== "music" && state !== "rename") setMusicPreview(null);
    // Opening it gives cover paintings that failed to load (offline, say) another try.
    else if (prior !== "music" && prior !== "rename" && state === "music") retryFailedCoverPaintings();
    input.allowLock = state === "playing";
    if (prior === "playing" && state !== "playing") {
      interruptTutorialCoaching();
      input.discardSemanticInput();
    } else if (prior !== "playing" && state === "playing") input.returnControl();
    if (prior === "playing" && state === "paused") options.runScreenFact("paused");
    else if (prior === "paused" && state === "playing") options.runScreenFact("resumed");
    return state;
  }
  return Object.freeze({
    screen: () => state,
    setScreen,
    back: () => setScreen(app.snapshot().back ?? "menu"),
    arrival: () => app.snapshot().arrival ?? undefined,
    bind(hooks: Partial<LiveScreenTransitionHooks>): void {
      if (hooks.cancelChase !== undefined) cancelChase = hooks.cancelChase;
      if (hooks.cancelPendingReplayOpen !== undefined) cancelPendingReplayOpen = hooks.cancelPendingReplayOpen;
      if (hooks.leaveShop !== undefined) leaveShop = hooks.leaveShop;
      if (hooks.interruptTutorialCoaching !== undefined) interruptTutorialCoaching = hooks.interruptTutorialCoaching;
    },
  });
}
