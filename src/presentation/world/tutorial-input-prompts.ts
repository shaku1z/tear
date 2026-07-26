import type { InputMode, LegacyGamepad } from "../../input/legacy-input-contracts";

export interface TutorialInputPrompt {
  readonly description: string;
  readonly keys: readonly string[];
}

const keyboardPrompt = (description: string, keys: readonly string[]): TutorialInputPrompt =>
  ({ description, keys });

/**
 * Projects the tutorial's semantic lesson onto the device that currently owns
 * input. Gamepad labels deliberately come from the configured preset/glyph
 * resolver instead of naming a particular console's buttons.
 */
export function tutorialInputPrompt(
  title: string,
  description: string,
  keys: readonly string[],
  mode: InputMode,
  gamepad: Pick<LegacyGamepad, "bindingLabel">,
): TutorialInputPrompt {
  if (mode === "keyboard" || mode === "mouse") return keyboardPrompt(description, keys);

  if (mode === "touch") {
    const prompts: Readonly<Record<string, TutorialInputPrompt>> = {
      MOVE: { description: "Use the left thumb zone. Warm up — move both ways.", keys: ["MOVE"] },
      JUMP: { description: "Tap JUMP twice. Hold down on a ledge to drop through it.", keys: ["JUMP"] },
      DASH: { description: "Tap DASH — steer it mid-flight with the movement zone.", keys: ["DASH"] },
      CUT: { description: "Drag through the blade zone — SPEED IS DAMAGE. Slash the dummy, fast.", keys: ["DRAG — SWING"] },
      LAUNCH: { description: "A fast UPWARD drag pops an enemy into the air.", keys: ["DRAG ↑"] },
      JUGGLE: { description: "Launch it — then drag through it again before it lands.", keys: ["DRAG ↑", "DRAG — SWING"] },
      SLAM: { description: "While airborne, drag DOWN through an enemy — a slam hits harder.", keys: ["JUMP", "DRAG ↓"] },
      "POWER SLAM": { description: "Steer DOWN and dash, then slam mid-fall — fast descent hits far harder.", keys: ["DOWN + DASH", "DRAG ↓"] },
      UPDRAFT: { description: "Launch WHILE RISING — jump first, then drag up hard.", keys: ["JUMP", "DRAG ↑"] },
      THROW: { description: "Tap THROW to hurl the blade through an enemy — tap again to recall it.", keys: ["THROW"] },
      PARRY: { description: "Drag FAST through an incoming shot to send it back. Perfect timing homes it.", keys: ["DRAG — SWING"] },
    };
    return prompts[title] ?? keyboardPrompt(description, keys);
  }

  const jump = gamepad.bindingLabel("jump");
  const dash = gamepad.bindingLabel("dash");
  const throwBlade = gamepad.bindingLabel("throw");
  const prompts: Readonly<Record<string, TutorialInputPrompt>> = {
    MOVE: { description: "Use the left stick. Warm up — move both ways.", keys: ["LS ←", "LS →"] },
    JUMP: { description: `${jump} to jump. Hold LS down on a ledge to drop through it.`, keys: [jump] },
    DASH: { description: `${dash} to dash — steer it mid-flight with the left stick.`, keys: [dash] },
    CUT: { description: "The blade follows the right stick — SPEED IS DAMAGE. Slash the dummy, fast.", keys: ["RS — SWING"] },
    LAUNCH: { description: "A fast UPWARD right-stick swing pops an enemy into the air.", keys: ["RS ↑"] },
    JUGGLE: { description: "Launch it — then cut it again before it lands.", keys: ["RS ↑", "RS — SWING"] },
    SLAM: { description: "While airborne, swing DOWN through an enemy — a slam hits harder.", keys: [jump, "RS ↓"] },
    "POWER SLAM": { description: "Steer DOWN and dash, then slam mid-fall — fast descent hits far harder.", keys: [`LS ↓ + ${dash}`, "RS ↓"] },
    UPDRAFT: { description: "Launch WHILE RISING — jump first, then swing up hard.", keys: [jump, "RS ↑"] },
    THROW: { description: `${throwBlade} hurls the blade through an enemy — press it again to recall.`, keys: [throwBlade] },
    PARRY: { description: "Swing FAST through an incoming shot to send it back. Perfect timing homes it.", keys: ["RS — SWING"] },
  };
  return prompts[title] ?? keyboardPrompt(description, keys);
}
