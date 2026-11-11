/**
 * Cinematic scripts author touch-first prompts ("TAP TO REVEAL · HOLD TO SKIP").
 * This rewrites them for the device that owns input so the prompt only promises
 * what works there: the cinematic latch reveals on a click, Space/Enter, a tap or
 * controller confirm, and skips on a held keyboard or controller confirm. Mouse
 * buttons and menu-mode touches never feed the hold, so neither advertises it.
 */
export type CinematicPromptDevice = "mouse" | "keyboard" | "gamepad" | "touch";

const HOLD_TO_SKIP = /HOLD TO SKIP/gu;
const TAP = /\bTAP\b/gu;
const TOUCH_HOLD_CLAUSE = /\s*·\s*HOLD TO SKIP(?: CHAPTER)?/gu;

export function cinematicPromptForDevice(text: string, device: CinematicPromptDevice, confirmGlyph = "A"): string {
  if (text === "") return text;
  if (device === "touch") return text.replace(TOUCH_HOLD_CLAUSE, "");
  const press = device === "mouse" ? "CLICK" : device === "keyboard" ? "SPACE" : confirmGlyph;
  const hold = device === "gamepad" ? `HOLD ${confirmGlyph} TO SKIP` : "HOLD SPACE TO SKIP";
  return text.replace(HOLD_TO_SKIP, hold).replace(TAP, press);
}
