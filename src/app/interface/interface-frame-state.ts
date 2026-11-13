import type { AppScreen } from "../../domain/screen-catalog";

export interface LiveInterfaceFrameState {
  readonly previousScreen: () => AppScreen;
  readonly setPreviousScreen: (value: AppScreen) => void;
  readonly seconds: () => number;
  readonly deltaSeconds: () => number;
  readonly advance: (deltaSeconds: number) => void;
  readonly enterSeconds: () => number;
  readonly setEnterSeconds: (value: number) => void;
  readonly enterAmount: () => number;
  readonly setEnterAmount: (value: number) => void;
}

/** Owns menu-frame timing, previous-screen state, and entrance state. */
export function createLiveInterfaceFrameState(initialScreen: AppScreen): LiveInterfaceFrameState {
  let previousScreen = initialScreen;
  let seconds = 0;
  let deltaSeconds = 1 / 60;
  let enterSeconds = 0;
  let enterAmount = 1;
  return Object.freeze({
    previousScreen: (): AppScreen => previousScreen,
    setPreviousScreen: (value: AppScreen): void => { previousScreen = value; },
    seconds: (): number => seconds,
    deltaSeconds: (): number => deltaSeconds,
    advance: (value: number): void => { seconds += value; enterSeconds += value; deltaSeconds = value; },
    enterSeconds: (): number => enterSeconds,
    setEnterSeconds: (value: number): void => { enterSeconds = value; },
    enterAmount: (): number => enterAmount,
    setEnterAmount: (value: number): void => { enterAmount = value; },
  });
}
