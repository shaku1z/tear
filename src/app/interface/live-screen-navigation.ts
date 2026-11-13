import type { AppStateController, AppTransitionContext } from "./app-state-controller";
import type { AppScreen } from "../../domain/screen-catalog";
import type { BrowserInput } from "../../input/browser-input-contracts";

/** Collaborators that react to a transition but are constructed after the navigation owner. */
export interface LiveScreenTransitionHooks {
  readonly cancelChase: (screen: string) => void;
  readonly cancelPendingReplayOpen: () => void;
  readonly leaveCareer: () => void;
  readonly interruptTutorialCoaching: () => void;
}

export interface LiveScreenNavigationOptions {
  readonly app: AppStateController;
  readonly input: Pick<BrowserInput, "allowLock" | "discardSemanticInput">;
  readonly beat: Readonly<{ screenChanged(next: AppScreen): void }>;
  readonly runScreenFact: (transition: "paused" | "resumed") => void;
}

export interface LiveScreenNavigation {
  readonly screen: () => AppScreen;
  readonly setScreen: (next: AppScreen, context?: AppTransitionContext) => AppScreen;
  /** Installs hooks as their owners are constructed; unbound hooks do nothing. */
  readonly bind: (hooks: Partial<LiveScreenTransitionHooks>) => void;
}

/** Owns the live application screen and the side effects of every transition. */
export function createLiveScreenNavigation(options: LiveScreenNavigationOptions): LiveScreenNavigation {
  const { app, input, beat } = options;
  let state: AppScreen = app.screen;
  let cancelChase: LiveScreenTransitionHooks["cancelChase"] = () => undefined;
  let cancelPendingReplayOpen: LiveScreenTransitionHooks["cancelPendingReplayOpen"] = () => {
    /* Replay is loaded later. */
  };
  let leaveCareer: LiveScreenTransitionHooks["leaveCareer"] = () => {
    /* Lazy library not loaded yet. */
  };
  let interruptTutorialCoaching: LiveScreenTransitionHooks["interruptTutorialCoaching"] = () => {
    /* Training is loaded later. */
  };
  function setScreen(next: AppScreen, context?: AppTransitionContext): AppScreen {
    beat.screenChanged(next);
    cancelChase(next);
    const prior = state;
    state = app.transition(next, context);
    cancelPendingReplayOpen();
    if (prior === "profile" && state !== "profile") leaveCareer();
    input.allowLock = state === "playing";
    if (prior === "playing" && state !== "playing") {
      interruptTutorialCoaching();
      input.discardSemanticInput();
    } else if (prior !== "playing" && state === "playing") input.discardSemanticInput();
    if (prior === "playing" && state === "paused") options.runScreenFact("paused");
    else if (prior === "paused" && state === "playing") options.runScreenFact("resumed");
    return state;
  }
  return Object.freeze({
    screen: () => state,
    setScreen,
    bind(hooks: Partial<LiveScreenTransitionHooks>): void {
      if (hooks.cancelChase !== undefined) cancelChase = hooks.cancelChase;
      if (hooks.cancelPendingReplayOpen !== undefined) cancelPendingReplayOpen = hooks.cancelPendingReplayOpen;
      if (hooks.leaveCareer !== undefined) leaveCareer = hooks.leaveCareer;
      if (hooks.interruptTutorialCoaching !== undefined) interruptTutorialCoaching = hooks.interruptTutorialCoaching;
    },
  });
}
