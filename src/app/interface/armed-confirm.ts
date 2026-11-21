/**
 * The two presses in front of anything a player cannot take back (erasing progress, deleting a loadout).
 * The first press on a target only asks; a later, deliberate press on the same target does it. The question
 * is time-boxed, so a confirmation left on screen is never one press from acting.
 */

/** Presses on an armed button are ignored for this long, so a double press cannot confirm what it just asked. */
export const ARMED_CONFIRM_DELAY_MS = 800;
/** An armed button disarms after this long. */
export const ARMED_CONFIRM_EXPIRY_MS = 10_000;

export interface ArmedConfirmView {
  readonly armed: boolean;
  /** Whether a press now confirms (false during the short delay after arming). */
  readonly confirmable: boolean;
}

export interface ArmedConfirm {
  /** The state of the button for `target`; another target's question leaves this one idle. */
  view(target?: string): ArmedConfirmView;
  /** Arms `target`, or confirms it when it is armed and confirmable: true exactly when this press confirms. */
  press(target?: string): boolean;
  cancel(): void;
}

const SINGLE_TARGET = "";

export function createArmedConfirm(now: () => number): ArmedConfirm {
  let armed: Readonly<{ target: string; at: number }> | null = null;
  const current = (): typeof armed => {
    if (armed && now() - armed.at > ARMED_CONFIRM_EXPIRY_MS) armed = null;
    return armed;
  };
  const confirmable = (at: number): boolean => now() - at >= ARMED_CONFIRM_DELAY_MS;
  return {
    view(target = SINGLE_TARGET) {
      const question = current();
      const mine = question?.target === target;
      return { armed: mine, confirmable: mine && confirmable(question.at) };
    },
    press(target = SINGLE_TARGET) {
      const question = current();
      if (question?.target !== target) {
        armed = { target, at: now() };
        return false;
      }
      if (!confirmable(question.at)) return false;
      armed = null;
      return true;
    },
    cancel() {
      armed = null;
    },
  };
}
