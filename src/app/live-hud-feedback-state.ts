export interface LiveHudFeedbackSnapshot {
  readonly lagHp: number;
  readonly multiplier: number;
  readonly multiplierPop: number;
}

export interface LiveHudFeedbackState {
  snapshot(): LiveHudFeedbackSnapshot;
  set(value: LiveHudFeedbackSnapshot): void;
}

/** Owns frame-presentation smoothing and combo feedback for the live HUD. */
export function createLiveHudFeedbackState(): LiveHudFeedbackState {
  let lagHp = 1;
  let multiplier = 1;
  let multiplierPop = 0;
  return Object.freeze({
    snapshot: (): LiveHudFeedbackSnapshot => Object.freeze({ lagHp, multiplier, multiplierPop }),
    set: (value: LiveHudFeedbackSnapshot): void => {
      lagHp = value.lagHp;
      multiplier = value.multiplier;
      multiplierPop = value.multiplierPop;
    },
  });
}
