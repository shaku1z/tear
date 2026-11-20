import type { AppScreen } from "../../domain/screen-catalog";

export interface LiveInterfaceFrameState {
  /** The screen the last frame drew; undefined before the first frame, so the first screen is entered too. */
  readonly previousScreen: () => AppScreen | undefined;
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
export function createLiveInterfaceFrameState(): LiveInterfaceFrameState {
  let previousScreen: AppScreen | undefined;
  let seconds = 0;
  let deltaSeconds = 1 / 60;
  let enterSeconds = 0;
  let enterAmount = 1;
  return Object.freeze({
    previousScreen: (): AppScreen | undefined => previousScreen,
    setPreviousScreen: (value: AppScreen): void => {
      previousScreen = value;
    },
    seconds: (): number => seconds,
    deltaSeconds: (): number => deltaSeconds,
    advance: (value: number): void => {
      seconds += value;
      enterSeconds += value;
      deltaSeconds = value;
    },
    enterSeconds: (): number => enterSeconds,
    setEnterSeconds: (value: number): void => {
      enterSeconds = value;
    },
    enterAmount: (): number => enterAmount,
    setEnterAmount: (value: number): void => {
      enterAmount = value;
    },
  });
}
