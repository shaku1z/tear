export interface LiveReviveCountdownState {
  readonly seconds: () => number;
  readonly setSeconds: (value: number) => void;
  readonly elapse: (deltaSeconds: number) => number;
}

/** Owns the live rewarded-revive countdown without coupling it to the host closure. */
export function createLiveReviveCountdownState(): LiveReviveCountdownState {
  let seconds = 0;
  return Object.freeze({
    seconds: (): number => seconds,
    setSeconds: (value: number): void => { seconds = value; },
    elapse: (deltaSeconds: number): number => { seconds -= deltaSeconds; return seconds; },
  });
}
