/**
 * Visibility policy for the three HTML elements layered over the canvas
 * (#lockhint, #hint and #fs). Pure so every rule is unit-testable; the frame
 * host only applies the result to the DOM.
 */

import { promptLabel, type PromptAction } from "../domain/prompt-vocabulary";

/** The keyboard control legend (#hint), worded by the prompt vocabulary. */
const CONTROL_HINT: readonly Readonly<{ action: PromptAction; words: string }>[] = [
  { action: "move", words: "move" },
  { action: "jump", words: "jump" },
  { action: "drop", words: "drop through" },
  { action: "dash", words: "dash" },
  { action: "swing", words: "blade" },
  { action: "throw", words: "throw / recall" },
  { action: "tether", words: "tether" },
  { action: "pause", words: "pause" },
  { action: "fullscreen", words: "fullscreen" },
];

/** The legend's text; the fullscreen key is named only where the platform can go fullscreen. */
export function controlHintText(fullscreenAvailable: boolean): string {
  return CONTROL_HINT.filter((entry) => fullscreenAvailable || entry.action !== "fullscreen")
    .map((entry) => `${promptLabel(entry.action, "keyboard") ?? ""} ${entry.words}`)
    .join("  ·  ");
}

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
  /** The platform can go fullscreen (CrazyGames owns it; iPhone Safari has none). */
  readonly fullscreenAvailable: boolean;
  readonly inputMode: "mouse" | "keyboard" | "gamepad" | "touch";
  readonly pointerLocked: boolean;
  /** Seconds of the current run; 0 outside a run. */
  readonly runSeconds: number;
  readonly completedRuns: number;
  /** A chapter cinematic or finale prompt owns the screen. */
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
      input.completedRuns < CONTROL_HINT_RUN_LIMIT &&
      input.runSeconds < CONTROL_HINT_SECONDS,
    // Fullscreen lives on menus only; touch devices use the platform's own controls.
    fullscreen: input.uiIncluded && !playing && !input.touch && input.fullscreenAvailable,
  });
}
