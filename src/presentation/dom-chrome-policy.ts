/**
 * Visibility policy for the three HTML elements layered over the canvas
 * (#lockhint, #hint and #fs). Pure so every rule is unit-testable; the frame
 * host only applies the result to the DOM.
 */

/** The keyboard control legend is a first-moments aid, not permanent chrome. */
export const CONTROL_HINT_SECONDS = 12;
/** Profiles with this many completed runs know the controls. */
export const CONTROL_HINT_RUN_LIMIT = 3;

export interface DomChromeInput {
  readonly screen: string;
  /** Capture policy includes interface layers. */
  readonly uiIncluded: boolean;
  /** Capture policy includes the pointer-lock hint. */
  readonly pointerLockIncluded: boolean;
  readonly touch: boolean;
  readonly inputMode: "mouse" | "keyboard" | "gamepad" | "touch";
  readonly pointerLocked: boolean;
  /** Seconds of the current run; 0 outside a run. */
  readonly runSeconds: number;
  readonly completedRuns: number;
  /** The Tutorial or the Playground: its coach marks name the controls instead of the legend. */
  readonly coached?: boolean;
  /** A boss name card, chapter cinematic or finale prompt owns the screen. */
  readonly presentationBusy: boolean;
}

export interface DomChromeVisibility {
  readonly lockHint: boolean;
  readonly controlHint: boolean;
  readonly fullscreen: boolean;
}

export function domChromeVisibility(input: DomChromeInput): DomChromeVisibility {
  const playing = input.screen === "playing";
  const keyboardAndMouse = input.inputMode === "mouse" || input.inputMode === "keyboard";
  return Object.freeze({
    lockHint: input.pointerLockIncluded && playing && !input.pointerLocked && !input.touch,
    controlHint:
      input.uiIncluded &&
      playing &&
      !input.touch &&
      keyboardAndMouse &&
      !input.presentationBusy &&
      input.coached !== true &&
      input.completedRuns < CONTROL_HINT_RUN_LIMIT &&
      input.runSeconds < CONTROL_HINT_SECONDS,
    // Fullscreen lives on menus only; touch devices use the platform's own controls.
    fullscreen: input.uiIncluded && !playing && !input.touch,
  });
}
