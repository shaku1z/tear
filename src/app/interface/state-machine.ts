export interface MenuState { readonly type: "menu" }
export interface SetupState { readonly type: "setup" }
export interface PlayingState { readonly type: "playing"; readonly runId: string }
export interface PausedState { readonly type: "paused"; readonly runId: string }
export interface DraftState { readonly type: "draft"; readonly runId: string }
export interface ReserveState { readonly type: "reserve"; readonly runId: string }
export interface TierUpState { readonly type: "tier-up"; readonly runId: string }
export interface ContinueState { readonly type: "continue"; readonly saveId: string }
export interface GameOverState { readonly type: "gameover"; readonly runId: string }
export interface VictoryState { readonly type: "victory"; readonly runId: string }
export interface ReplayState { readonly type: "replay"; readonly replayId: string; readonly paused: boolean }

export type NonSettingsAppState =
  | MenuState | SetupState | PlayingState | PausedState | DraftState | ReserveState
  | TierUpState | ContinueState | GameOverState | VictoryState | ReplayState;
export interface SettingsState { readonly type: "settings"; readonly returnTo: NonSettingsAppState }
export type AppState = NonSettingsAppState | SettingsState;
export type AppStateType = AppState["type"];

export type AppTransition =
  | Readonly<{ type: "open-setup" }>
  | Readonly<{ type: "show-continue"; saveId: string }>
  | Readonly<{ type: "start-run"; runId: string }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "resume" }>
  | Readonly<{ type: "open-draft" }>
  | Readonly<{ type: "resolve-draft" }>
  | Readonly<{ type: "open-reserve" }>
  | Readonly<{ type: "resolve-reserve" }>
  | Readonly<{ type: "open-tier-up" }>
  | Readonly<{ type: "resolve-tier-up" }>
  | Readonly<{ type: "open-settings" }>
  | Readonly<{ type: "close-settings" }>
  | Readonly<{ type: "game-over" }>
  | Readonly<{ type: "victory" }>
  | Readonly<{ type: "start-replay"; replayId: string }>
  | Readonly<{ type: "toggle-replay-pause" }>
  | Readonly<{ type: "return-menu" }>;

export class IllegalAppTransitionError extends Error {
  constructor(readonly state: AppStateType, readonly transition: AppTransition["type"]) {
    super(`Illegal application transition: ${state} -> ${transition}`);
    this.name = "IllegalAppTransitionError";
  }
}

function frozen<T extends AppState>(state: T): T {
  return Object.freeze(state);
}

function id(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new RangeError(`${label} must not be empty`);
  return normalized;
}

export const initialAppState = (): MenuState => frozen({ type: "menu" });

/** Pure application state transition. Illegal edges fail closed. */
export function transitionAppState(state: AppState, transition: AppTransition): AppState {
  if (transition.type === "return-menu" && state.type !== "settings") return initialAppState();
  if (transition.type === "open-settings" && state.type !== "settings") {
    return frozen({ type: "settings", returnTo: state });
  }

  switch (state.type) {
    case "menu":
      if (transition.type === "open-setup") return frozen({ type: "setup" });
      if (transition.type === "show-continue") return frozen({ type: "continue", saveId: id(transition.saveId, "saveId") });
      if (transition.type === "start-replay") return frozen({ type: "replay", replayId: id(transition.replayId, "replayId"), paused: false });
      break;
    case "setup":
      if (transition.type === "start-run") return frozen({ type: "playing", runId: id(transition.runId, "runId") });
      break;
    case "continue":
      if (transition.type === "start-run") return frozen({ type: "playing", runId: id(transition.runId, "runId") });
      break;
    case "playing":
      if (transition.type === "pause") return frozen({ type: "paused", runId: state.runId });
      if (transition.type === "open-draft") return frozen({ type: "draft", runId: state.runId });
      if (transition.type === "open-reserve") return frozen({ type: "reserve", runId: state.runId });
      if (transition.type === "open-tier-up") return frozen({ type: "tier-up", runId: state.runId });
      if (transition.type === "game-over") return frozen({ type: "gameover", runId: state.runId });
      if (transition.type === "victory") return frozen({ type: "victory", runId: state.runId });
      break;
    case "paused":
      if (transition.type === "resume") return frozen({ type: "playing", runId: state.runId });
      break;
    case "draft":
      if (transition.type === "resolve-draft") return frozen({ type: "playing", runId: state.runId });
      break;
    case "reserve":
      if (transition.type === "resolve-reserve") return frozen({ type: "playing", runId: state.runId });
      break;
    case "tier-up":
      if (transition.type === "resolve-tier-up") return frozen({ type: "playing", runId: state.runId });
      break;
    case "settings":
      if (transition.type === "close-settings") return state.returnTo;
      break;
    case "gameover":
    case "victory":
      if (transition.type === "start-replay") return frozen({ type: "replay", replayId: id(transition.replayId, "replayId"), paused: false });
      break;
    case "replay":
      if (transition.type === "toggle-replay-pause") return frozen({ ...state, paused: !state.paused });
      break;
  }
  throw new IllegalAppTransitionError(state.type, transition.type);
}

export function canTransitionAppState(state: AppState, transition: AppTransition): boolean {
  try {
    transitionAppState(state, transition);
    return true;
  } catch (error) {
    if (error instanceof IllegalAppTransitionError) return false;
    throw error;
  }
}
