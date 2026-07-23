import type { GameAction } from "../input/game-action";

export type TearPhysicalEmission =
  | Readonly<{ device: "keyboard-mouse"; type: "key"; code: string; phase: "down" | "up" }>
  | Readonly<{ device: "keyboard-mouse"; type: "pointer"; turn: number }>
  | Readonly<{ device: "controller"; type: "axis" | "button"; control: string; value: number }>
  | Readonly<{ device: "touch"; type: "zone" | "aim"; control: string; value: number }>;

export interface TearPhysicalInputAdapter {
  translate(action: GameAction): readonly TearPhysicalEmission[];
}

export class KeyboardMouseAgentAdapter implements TearPhysicalInputAdapter {
  translate(action: GameAction): readonly TearPhysicalEmission[] {
    if (action.type === "move") {
      return Object.freeze([
        { device: "keyboard-mouse", type: "key", code: action.x < 0 ? "KeyA" : "KeyD", phase: action.x === 0 ? "up" : "down" },
      ]);
    }
    if (action.type === "aim") return [{ device: "keyboard-mouse", type: "pointer", turn: action.turn }];
    const code = action.type === "jump" ? "Space"
      : action.type === "dash" ? "ShiftLeft"
      : action.type === "pause" ? "KeyP"
      : action.type === "confirm" ? "Enter"
      : action.type === "cancel" ? "Escape"
      : "Mouse0";
    return [{ device: "keyboard-mouse", type: "key", code, phase: "down" }];
  }
}

export class ControllerAgentAdapter implements TearPhysicalInputAdapter {
  translate(action: GameAction): readonly TearPhysicalEmission[] {
    if (action.type === "move") return [{ device: "controller", type: "axis", control: "left-stick-x", value: action.x / 1_000 }];
    if (action.type === "aim") return [{ device: "controller", type: "axis", control: "right-stick-turn", value: action.turn / 1_000_000 }];
    return [{ device: "controller", type: "button", control: action.type, value: 1 }];
  }
}

export class TouchAgentAdapter implements TearPhysicalInputAdapter {
  translate(action: GameAction): readonly TearPhysicalEmission[] {
    if (action.type === "move") return [{ device: "touch", type: "zone", control: "movement-x", value: action.x / 1_000 }];
    if (action.type === "aim") return [{ device: "touch", type: "aim", control: "aim-turn", value: action.turn / 1_000_000 }];
    return [{ device: "touch", type: "zone", control: action.type, value: 1 }];
  }
}

export interface TearUiParityResult {
  readonly equal: boolean;
  readonly mismatches: readonly string[];
}

export function compareUiObservations(
  structured: Readonly<{ screen: string; focusedId?: string; actions: readonly string[] }>,
  semantic: Readonly<{ screen: string; focusedId?: string; actions: readonly string[] }>,
  pixel: Readonly<{ screen: string; focusedId?: string; actions: readonly string[] }>,
): TearUiParityResult {
  const mismatches: string[] = [];
  for (const [label, candidate] of [["semantic", semantic], ["pixel", pixel]] as const) {
    if (candidate.screen !== structured.screen) mismatches.push(`${label}.screen`);
    if (candidate.focusedId !== structured.focusedId) mismatches.push(`${label}.focusedId`);
    if (JSON.stringify(candidate.actions) !== JSON.stringify(structured.actions)) mismatches.push(`${label}.actions`);
  }
  return Object.freeze({ equal: mismatches.length === 0, mismatches: Object.freeze(mismatches) });
}
