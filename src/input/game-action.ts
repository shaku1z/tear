export const INPUT_AXIS_SCALE = 1_000;
export const AIM_TURN_SCALE = 1_000_000;

export type InputPhase = "pressed" | "released";
export type WeaponIntent = "primary" | "secondary" | "throw" | "recall";

/**
 * Device-independent intents consumed by the deterministic game layer.
 * Analog values are fixed-point integers so recorded input does not depend on
 * floating-point noise from a keyboard, pointer, gamepad, or touch adapter.
 */
export type GameAction =
  | Readonly<{ type: "move"; x: number; y: number }>
  | Readonly<{ type: "aim"; turn: number }>
  | Readonly<{ type: "weapon"; intent: WeaponIntent; phase: InputPhase }>
  | Readonly<{ type: "ability"; abilityId: string; phase: InputPhase }>
  | Readonly<{ type: "jump"; phase: InputPhase }>
  | Readonly<{ type: "dash"; x: number; y: number }>
  | Readonly<{ type: "interact" }>
  | Readonly<{ type: "pause" }>
  | Readonly<{ type: "confirm" }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "draft-choice"; choiceId: string }>
  | Readonly<{ type: "reserve-choice"; choiceId: string }>
  | Readonly<{ type: "tier-up-choice"; choiceId: string }>;

export type GameActionNormalizationResult =
  | Readonly<{ ok: true; action: GameAction }>
  | Readonly<{ ok: false; reason: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fixedInteger(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function identifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : undefined;
}

function phase(value: unknown): InputPhase | undefined {
  return value === "pressed" || value === "released" ? value : undefined;
}

function failure(reason: string): GameActionNormalizationResult {
  return Object.freeze({ ok: false, reason });
}

function success(action: GameAction): GameActionNormalizationResult {
  return Object.freeze({ ok: true, action: Object.freeze(action) });
}

/** Validates and canonicalizes a semantic action. Unknown adapter metadata is discarded. */
export function normalizeGameAction(candidate: unknown): GameActionNormalizationResult {
  if (!isRecord(candidate) || typeof candidate.type !== "string") return failure("action must be an object with a type");

  switch (candidate.type) {
    case "move":
    case "dash": {
      const x = fixedInteger(candidate.x, -INPUT_AXIS_SCALE, INPUT_AXIS_SCALE);
      const y = fixedInteger(candidate.y, -INPUT_AXIS_SCALE, INPUT_AXIS_SCALE);
      if (x === undefined || y === undefined) return failure("direction values must be fixed-point integers from -1000 to 1000");
      return success({ type: candidate.type, x, y });
    }
    case "aim": {
      const turn = fixedInteger(candidate.turn, 0, AIM_TURN_SCALE - 1);
      return turn === undefined
        ? failure("aim turn must be an integer from 0 to 999999")
        : success({ type: "aim", turn });
    }
    case "weapon": {
      const intent = candidate.intent;
      const normalizedPhase = phase(candidate.phase);
      if (intent !== "primary" && intent !== "secondary" && intent !== "throw" && intent !== "recall") {
        return failure("unknown weapon intent");
      }
      return normalizedPhase === undefined
        ? failure("weapon phase must be pressed or released")
        : success({ type: "weapon", intent, phase: normalizedPhase });
    }
    case "jump": {
      const normalizedPhase = phase(candidate.phase);
      return normalizedPhase === undefined
        ? failure("jump phase must be pressed or released")
        : success({ type: "jump", phase: normalizedPhase });
    }
    case "ability": {
      const abilityId = identifier(candidate.abilityId);
      const normalizedPhase = phase(candidate.phase);
      if (abilityId === undefined) return failure("abilityId must be a non-empty identifier");
      return normalizedPhase === undefined
        ? failure("ability phase must be pressed or released")
        : success({ type: "ability", abilityId, phase: normalizedPhase });
    }
    case "draft-choice":
    case "reserve-choice":
    case "tier-up-choice": {
      const choiceId = identifier(candidate.choiceId);
      return choiceId === undefined
        ? failure("choiceId must be a non-empty identifier")
        : success({ type: candidate.type, choiceId });
    }
    case "interact":
    case "pause":
    case "confirm":
    case "cancel":
      return success({ type: candidate.type });
    default:
      return failure(`unknown action type: ${candidate.type}`);
  }
}

export function isGameAction(candidate: unknown): candidate is GameAction {
  return normalizeGameAction(candidate).ok;
}
