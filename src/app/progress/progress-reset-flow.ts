import { ARMED_CONFIRM_DELAY_MS, ARMED_CONFIRM_EXPIRY_MS, createArmedConfirm } from "../interface/armed-confirm";
import type { ProgressResetOutcome } from "./progress-reset";

/** The shared armed-button delay: a press this soon after arming does not erase. */
export const RESET_CONFIRM_DELAY_MS = ARMED_CONFIRM_DELAY_MS;
/** The shared armed-button expiry: an armed reset disarms after this long. */
export const RESET_ARMED_EXPIRY_MS = ARMED_CONFIRM_EXPIRY_MS;

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
  const confirm = createArmedConfirm(ports.now);
  let working = false;
  let failure: ResetFailure | null = null;
  return {
    view() {
      if (working) return { stage: "working", confirmable: false, failure };
      const button = confirm.view();
      return { stage: button.armed ? "armed" : "idle", confirmable: button.confirmable, failure };
    },
    press() {
      if (working) return;
      if (!confirm.view().armed) failure = null;
      if (!confirm.press()) return;
      working = true;
      void ports.reset().then(
        (outcome) => {
          if (outcome === "erased") {
            ports.reload();
            return;
          }
          failure = outcome;
          working = false;
        },
        () => {
          failure = "device-failed";
          working = false;
        },
      );
    },
    cancel() {
      confirm.cancel();
    },
  };
}
