import type { LegacyAppScreen } from "./legacy-state-controller";

export interface LiveInterfaceFrameState {
  readonly previousScreen: () => LegacyAppScreen;
  readonly setPreviousScreen: (value: LegacyAppScreen) => void;
  readonly seconds: () => number;
  readonly deltaSeconds: () => number;
  readonly advance: (deltaSeconds: number) => void;
  readonly enterSeconds: () => number;
  readonly setEnterSeconds: (value: number) => void;
  readonly enterAmount: () => number;
  readonly setEnterAmount: (value: number) => void;
  readonly uiZoom: () => number;
  readonly setUiZoom: (value: number) => void;
}

/** Owns menu-frame timing, previous-screen state, entrance state, and UI zoom. */
export function createLiveInterfaceFrameState(initialScreen: LegacyAppScreen): LiveInterfaceFrameState {
  let previousScreen = initialScreen;
  let seconds = 0;
  let deltaSeconds = 1 / 60;
  let enterSeconds = 0;
  let enterAmount = 1;
  let uiZoom = 1;
  return Object.freeze({
    previousScreen: (): LegacyAppScreen => previousScreen,
    setPreviousScreen: (value: LegacyAppScreen): void => { previousScreen = value; },
    seconds: (): number => seconds,
    deltaSeconds: (): number => deltaSeconds,
    advance: (value: number): void => { seconds += value; enterSeconds += value; deltaSeconds = value; },
    enterSeconds: (): number => enterSeconds,
    setEnterSeconds: (value: number): void => { enterSeconds = value; },
    enterAmount: (): number => enterAmount,
    setEnterAmount: (value: number): void => { enterAmount = value; },
    uiZoom: (): number => uiZoom,
    setUiZoom: (value: number): void => { uiZoom = value; },
  });
}
