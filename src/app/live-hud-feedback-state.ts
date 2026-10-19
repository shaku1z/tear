import { parseUiHudPresentationCheckpoint } from "../tearbench/ui-presentation-checkpoint";

export interface LiveHudFeedbackSnapshot {
  readonly lagHp: number;
  readonly multiplier: number;
  readonly multiplierPop: number;
}

export interface LiveHudFeedbackState {
  readonly snapshot: () => LiveHudFeedbackSnapshot;
  readonly set: (value: LiveHudFeedbackSnapshot) => void;
  readonly clockSeconds: () => number;
  readonly advance: (input: Readonly<{ hpFraction: number; multiplier: number; deltaSeconds: number }>) => void;
  readonly capture: () => LiveHudPresentationSnapshot;
  readonly restore: (value: unknown) => void;
}

export interface LiveHudPresentationSnapshot extends LiveHudFeedbackSnapshot {
  readonly version: 1;
  readonly clockSeconds: number;
}

/** Missing historical presentation data starts neutral; it never inherits another run. */
export function validateLiveHudPresentation(value: unknown): LiveHudPresentationSnapshot {
  return parseUiHudPresentationCheckpoint(value) ?? Object.freeze({ version: 1, clockSeconds: 0, lagHp: 1, multiplier: 1, multiplierPop: 0 });
}

/** Owns frame-presentation smoothing and combo feedback for the live HUD. */
export function createLiveHudFeedbackState(): LiveHudFeedbackState {
  let lagHp = 1;
  let multiplier = 1;
  let multiplierPop = 0;
  let clockSeconds = 0;
  return Object.freeze({
    snapshot: (): LiveHudFeedbackSnapshot => Object.freeze({ lagHp, multiplier, multiplierPop }),
    set: (value: LiveHudFeedbackSnapshot): void => {
      lagHp = value.lagHp;
      multiplier = value.multiplier;
      multiplierPop = value.multiplierPop;
    },
    clockSeconds: (): number => clockSeconds,
    advance: (input: Readonly<{ hpFraction: number; multiplier: number; deltaSeconds: number }>): void => {
      const nextClock = clockSeconds + input.deltaSeconds;
      const next = validateLiveHudPresentation({ version: 1, clockSeconds: nextClock,
        lagHp: input.hpFraction < lagHp ? lagHp + (input.hpFraction - lagHp) * 0.07 : input.hpFraction,
        multiplier: input.multiplier, multiplierPop: Math.max(0, (input.multiplier > multiplier ? 1 : multiplierPop) - 0.06) });
      if (!Number.isFinite(input.deltaSeconds) || input.deltaSeconds < 0) throw new RangeError("HUD frame delta must be finite and nonnegative");
      lagHp = next.lagHp; multiplier = next.multiplier; multiplierPop = next.multiplierPop; clockSeconds = next.clockSeconds;
    },
    capture: (): LiveHudPresentationSnapshot => Object.freeze({ version: 1, clockSeconds, lagHp, multiplier, multiplierPop }),
    restore: (value: unknown): void => {
      const next = validateLiveHudPresentation(value);
      lagHp = next.lagHp; multiplier = next.multiplier; multiplierPop = next.multiplierPop; clockSeconds = next.clockSeconds;
    },
  });
}
