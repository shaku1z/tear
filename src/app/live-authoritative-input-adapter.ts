import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import type { AuthoritativeInputState } from "../gameplay/runtime/authoritative-input";
import type { TearSimulationActionPort } from "../gameplay/runtime/tear-simulation-runtime";
import type { BladePlayerPort, BladePoint } from "../gameplay/entities/blade-contracts";
import type { PlayerInputPort } from "../gameplay/entities/player";

interface LiveInputPlayer extends BladePlayerPort { aiInput?: PlayerInputPort }
interface LiveInputBlade {
  lmbOverride?: boolean;
  aimOverride?: BladePoint;
  handPos(player: BladePlayerPort): BladePoint;
}

export interface LiveAuthoritativeInputAdapter {
  readonly actionPort: TearSimulationActionPort;
  consumeThrow(fallback: () => boolean): boolean;
  clear(): void;
}

export interface LiveAuthoritativeInputAdapterOptions {
  player(): LiveInputPlayer;
  blade(): LiveInputBlade;
  aimRadius(): number;
}

/**
 * Browser-world projection for canonical actions. The portable simulation
 * runtime sees only TearSimulationActionPort; legacy AI/blade overrides stay
 * confined to this outward live adapter.
 */
export function createLiveAuthoritativeInputAdapter(
  options: LiveAuthoritativeInputAdapterOptions,
): LiveAuthoritativeInputAdapter {
  const apply = (input: AuthoritativeInputState, tick: number,
    actions: readonly CommandEnvelope<GameAction>[]): void => {
    input.beginTick(tick, actions);
    const player = options.player();
    const blade = options.blade();
    player.aiInput = input;
    blade.lmbOverride = input.primaryHeld;
    const aim = input.aimVector();
    const hand = blade.handPos(player);
    blade.aimOverride = {
      x: hand.x + aim.x * options.aimRadius(),
      y: hand.y + aim.y * options.aimRadius(),
    };
  };
  return Object.freeze({
    actionPort: Object.freeze({ apply }),
    consumeThrow(fallback: () => boolean): boolean {
      return options.player().aiInput?.consumeThrow?.() ?? fallback();
    },
    clear(): void {
      delete options.player().aiInput;
      delete options.blade().lmbOverride;
      delete options.blade().aimOverride;
    },
  });
}
