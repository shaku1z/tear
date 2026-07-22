import type { ScreenAction } from "../presentation/screens/contracts";

export type ScreenActionHandlers = {
  readonly [Kind in ScreenAction["type"]]: (
    action: Extract<ScreenAction, Readonly<{ type: Kind }>>,
  ) => void;
};

/**
 * Exhaustive typed boundary between presentation intents and application commands.
 * Screen renderers cannot reach mutable game state; the application adapter must
 * deliberately provide one handler for every semantic action.
 */
export function createScreenActionRouter(
  handlers: ScreenActionHandlers,
): (action: ScreenAction) => void {
  return (action) => {
    const handler = handlers[action.type] as (value: ScreenAction) => void;
    handler(action);
  };
}
