import type { CommandEnvelope } from "../../domain/envelopes";
import { AIM_MAGNITUDE_SCALE, AIM_TURN_SCALE, INPUT_AXIS_SCALE, type GameAction } from "../../input/game-action";

export interface AuthoritativeInputSnapshot {
  readonly tick: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly aimTurn: number;
  readonly primaryHeld: boolean;
}

export class AuthoritativeInputState {
  #tick = 0; #moveX = 0; #moveY = 0; #aimTurn = 0; #aimMagnitude = AIM_MAGNITUDE_SCALE; #primaryHeld = false;
  #jumpPressed = false; #dashPressed = false; #dashX = 0; #dashY = 0; #throwPressed = false;

  beginTick(tick: number, envelopes: readonly CommandEnvelope<GameAction>[]): void {
    if (!Number.isSafeInteger(tick) || tick < this.#tick) throw new RangeError("authoritative input ticks must be monotonic");
    this.#tick = tick; this.#jumpPressed = false; this.#dashPressed = false; this.#dashX = 0; this.#dashY = 0; this.#throwPressed = false;
    for (const envelope of envelopes) {
      if (envelope.tick !== tick) throw new RangeError("action envelope tick does not match the authoritative step");
      const action = envelope.command;
      switch (action.type) {
        case "move": this.#moveX = action.x; this.#moveY = action.y; break;
        case "aim": this.#aimTurn = action.turn; this.#aimMagnitude = action.magnitude ?? AIM_MAGNITUDE_SCALE; break;
        case "weapon":
          if (action.intent === "primary") this.#primaryHeld = action.phase === "pressed";
          if ((action.intent === "throw" || action.intent === "recall") && action.phase === "pressed") this.#throwPressed = true;
          break;
        case "jump": this.#jumpPressed = action.phase === "pressed"; break;
        case "dash": this.#dashPressed = true; this.#dashX = action.x; this.#dashY = action.y; break;
        default: break;
      }
    }
  }

  #directionX(): number { return this.#dashPressed && this.#dashX !== 0 ? this.#dashX : this.#moveX; }
  #directionY(): number { return this.#dashPressed && this.#dashY !== 0 ? this.#dashY : this.#moveY; }
  right(): boolean { return this.#directionX() > 0; }
  left(): boolean { return this.#directionX() < 0; }
  up(): boolean { return this.#directionY() < 0; }
  down(): boolean { return this.#directionY() > 0; }
  jumpPressed(): boolean { return this.#jumpPressed; }
  dashPressed(): boolean { return this.#dashPressed; }
  consumeThrow(): boolean { const value = this.#throwPressed; this.#throwPressed = false; return value; }
  buzz(): void { /* haptics stay in the device adapter */ }
  get primaryHeld(): boolean { return this.#primaryHeld; }

  aimVector(): Readonly<{ x: number; y: number }> {
    const angle = this.#aimTurn / AIM_TURN_SCALE * Math.PI * 2;
    const magnitude = this.#aimMagnitude / AIM_MAGNITUDE_SCALE;
    return Object.freeze({ x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude });
  }

  snapshot(): AuthoritativeInputSnapshot {
    return Object.freeze({ tick: this.#tick, moveX: this.#moveX / INPUT_AXIS_SCALE,
      moveY: this.#moveY / INPUT_AXIS_SCALE, aimTurn: this.#aimTurn, primaryHeld: this.#primaryHeld });
  }

  reset(): void {
    this.#tick = 0; this.#moveX = 0; this.#moveY = 0; this.#aimTurn = 0;
    this.#aimMagnitude = AIM_MAGNITUDE_SCALE; this.#primaryHeld = false;
    this.#jumpPressed = false; this.#dashPressed = false; this.#dashX = 0; this.#dashY = 0; this.#throwPressed = false;
  }
}
