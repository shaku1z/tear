import { AIM_TURN_SCALE, INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import type { PlayerInputPort } from "../gameplay/entities/player";

export interface TearLegacyControlProjection {
  readonly playerInput: PlayerInputPort;
  readonly primaryHeld: boolean;
  readonly aim: Readonly<{ x: number; y: number }>;
}

/**
 * Typed compatibility projection for the historical player.aiInput and
 * blade.aimOverride seams. Policies remain semantic-action producers.
 */
export function projectAgentActionsToLegacyControls(
  actions: readonly GameAction[],
): TearLegacyControlProjection {
  const movement = [...actions].reverse().find((action) => action.type === "move");
  const dash = actions.some((action) => action.type === "dash");
  const jump = actions.some((action) => action.type === "jump" && action.phase === "pressed");
  const aimAction = [...actions].reverse().find((action) => action.type === "aim");
  const angle = aimAction?.type === "aim" ? aimAction.turn / AIM_TURN_SCALE * Math.PI * 2 : 0;
  const magnitude = aimAction?.type === "aim" ? (aimAction.magnitude ?? INPUT_AXIS_SCALE) / INPUT_AXIS_SCALE : 1;
  return Object.freeze({
    playerInput: Object.freeze({
      right: () => movement?.type === "move" && movement.x > 0,
      left: () => movement?.type === "move" && movement.x < 0,
      up: () => movement?.type === "move" && movement.y < 0,
      down: () => movement?.type === "move" && movement.y > 0,
      dashPressed: () => dash,
      jumpPressed: () => jump,
    }),
    primaryHeld: actions.some((action) =>
      action.type === "weapon" && action.intent === "primary" && action.phase === "pressed"),
    aim: Object.freeze({ x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude }),
  });
}
