import type { ProgressResetOutcome } from "./progress-reset";

/** Presses on the armed button are ignored for this long, so a double press cannot confirm what it just asked. */
export const RESET_CONFIRM_DELAY_MS = 800;
/** An armed reset disarms after this long, so a confirmation left on screen is never one press from erasing. */
export const RESET_ARMED_EXPIRY_MS = 10_000;

export type ResetStage = "idle" | "armed" | "working";

/** Why the last attempt left everything as it was, for the row to say. */
export type ResetFailure = Exclude<ProgressResetOutcome, "erased">;

export interface ResetProgressView {
  readonly stage: ResetStage;
  /** Whether a press on the armed button erases now (false during the short delay after arming). */
  readonly confirmable: boolean;
  readonly failure: ResetFailure | null;
}

export interface ResetProgressFlowPorts {
  readonly now: () => number;
  readonly reset: () => Promise<ProgressResetOutcome>;
  /** Restarts the game on the erased save, so everything that read the old progress reads the new one. */
  readonly reload: () => void;
}

export interface ResetProgressFlow {
  view(): ResetProgressView;
  /** The reset button: the first press arms it, a later press (after the delay, before it expires) erases. */
  press(): void;
  /** Disarms an armed reset. */
  cancel(): void;
}

/**
 * The two steps in front of an erase. Nothing is erased by one press: the first only asks, the second
 * (a deliberate one, after a short delay) does it. The state is time-boxed, so leaving the screen with a
 * confirmation open cannot leave a loaded button behind.
 */
export function createResetProgressFlow(ports: ResetProgressFlowPorts): ResetProgressFlow {
  let stage: ResetStage = "idle";
  let armedAt = 0;
  let failure: ResetFailure | null = null;
  const expire = (): void => {
    if (stage === "armed" && ports.now() - armedAt > RESET_ARMED_EXPIRY_MS) stage = "idle";
  };
  return {
    view() {
      expire();
      return { stage, confirmable: stage === "armed" && ports.now() - armedAt >= RESET_CONFIRM_DELAY_MS, failure };
    },
    press() {
      expire();
      if (stage === "working") return;
      if (stage === "idle") {
        stage = "armed";
        armedAt = ports.now();
        failure = null;
        return;
      }
      if (ports.now() - armedAt < RESET_CONFIRM_DELAY_MS) return;
      stage = "working";
      void ports.reset().then(
        (outcome) => {
          if (outcome === "erased") {
            ports.reload();
            return;
          }
          failure = outcome;
          stage = "idle";
        },
        () => {
          failure = "device-failed";
          stage = "idle";
        },
      );
    },
    cancel() {
      if (stage === "armed") stage = "idle";
    },
  };
}
