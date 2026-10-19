import type { InputMode, LegacyGamepad } from "../../input/legacy-input-contracts";

export interface TutorialInputPrompt {
  readonly description: string;
  readonly keys: readonly string[];
}

const keyboardPrompt = (description: string, keys: readonly string[]): TutorialInputPrompt =>
  ({ description, keys });

/**
 * Projects a semantic tutorial block onto the device that currently owns input.
 * The lesson copy stays identical across devices: it describes the player goal,
 * while the keycaps describe the active control scheme. This keeps the counters
 * and wording truthful as the curriculum changes.
 */
export function tutorialInputPrompt(
  title: string,
  description: string,
  keys: readonly string[],
  mode: InputMode,
  gamepad: Pick<LegacyGamepad, "bindingLabel">,
): TutorialInputPrompt {
  if (mode === "keyboard" || mode === "mouse") return keyboardPrompt(description, keys);
  if (title.endsWith(" ANNEX")) {
    const projected = keys.map((key) => mode === "touch"
      ? ({ MOUSE: "DRAG — SWING", "MOUSE UP": "DRAG ↑", "MOUSE DOWN": "DRAG ↓", RMB: "THROW", LMB: "TETHER / FIRE", W: "JUMP" } as Readonly<Record<string, string>>)[key] ?? key
      : ({ MOUSE: "RS — SWING", "MOUSE UP": "RS ↑", "MOUSE DOWN": "RS ↓", RMB: gamepad.bindingLabel("throw"), LMB: gamepad.bindingLabel("tether"), W: gamepad.bindingLabel("jump") } as Readonly<Record<string, string>>)[key] ?? key);
    return { description, keys: projected };
  }
  if (title === "FIELD TEST" && keys.length === 0) return { description, keys: [] };
  if (title === "FIELD TEST" && keys.includes("MOUSE UP")) return {
    description, keys: mode === "touch" ? ["DRAG ↑", "DRAG — SWING"] : ["RS ↑", "RS — SWING"],
  };

  if (mode === "touch") {
    const prompts: Readonly<Record<string, TutorialInputPrompt>> = {
      MOVE: { description, keys: ["MOVE"] },
      JUMP: { description, keys: ["JUMP"] },
      DASH: { description, keys: ["DASH"] },
      CUT: { description, keys: ["DRAG — SWING"] },
      LAUNCH: { description, keys: ["DRAG ↑"] },
      JUGGLE: { description, keys: ["DRAG ↑", "DRAG — SWING"] },
      SLAM: { description, keys: ["JUMP", "DRAG ↓"] },
      "POWER SLAM": { description, keys: ["DOWN + DASH", "DRAG ↓"] },
      UPDRAFT: { description, keys: ["JUMP", "DRAG ↑"] },
      THROW: { description, keys: ["THROW"] },
      PARRY: { description, keys: ["DRAG — SWING"] },
      "READ THE CHARGE": { description, keys: ["DASH"] },
      "FIELD TEST": { description, keys: ["DASH", "DRAG SWING"] },
    };
    return prompts[title] ?? keyboardPrompt(description, keys);
  }

  const jump = gamepad.bindingLabel("jump");
  const dash = gamepad.bindingLabel("dash");
  const throwBlade = gamepad.bindingLabel("throw");
  const prompts: Readonly<Record<string, TutorialInputPrompt>> = {
    MOVE: { description, keys: ["LS ←", "LS →"] },
    JUMP: { description, keys: [jump] },
    DASH: { description, keys: [dash] },
    CUT: { description, keys: ["RS — SWING"] },
    LAUNCH: { description, keys: ["RS ↑"] },
    JUGGLE: { description, keys: ["RS ↑", "RS — SWING"] },
    SLAM: { description, keys: [jump, "RS ↓"] },
    "POWER SLAM": { description, keys: [`LS ↓ + ${dash}`, "RS ↓"] },
    UPDRAFT: { description, keys: [jump, "RS ↑"] },
    THROW: { description, keys: [throwBlade] },
    PARRY: { description, keys: ["RS — SWING"] },
    "READ THE CHARGE": { description, keys: [dash] },
    "FIELD TEST": { description, keys: [dash, "RS SWING"] },
  };
  return prompts[title] ?? keyboardPrompt(description, keys);
}
