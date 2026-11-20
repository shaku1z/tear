import { anyKeyIn, keyCodes } from "../../domain/keyboard-bindings";

export interface ReplayTransportInput {
  readonly clicked: boolean;
  readonly clickX: number;
  readonly clickY: number;
  readonly pressed: ReadonlySet<string>;
  takeClick(): Readonly<{ x: number; y: number }> | null;
}

export interface ReplayTransportScrub {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}
export interface ReplayNativeTransport {
  readonly controls: ReplayTransportInput;
  readonly scrub: ReplayTransportScrub;
  readonly consumeKey?: (key: string) => void;
}

export function replayTransportScrub(
  width: number,
  height: number,
  safe: Readonly<{ l: number; r: number; b: number }>,
): ReplayTransportScrub {
  return { x: 220 + safe.l, y: height - 96 - safe.b, width: width - 440 - safe.l - safe.r };
}

export function handleReplayTransport(input: {
  readonly controls: ReplayTransportInput;
  readonly currentTime: number;
  readonly duration: number;
  readonly scrub: ReplayTransportScrub;
  readonly seek: (seconds: number) => void;
  readonly toggle: () => void;
  readonly consumeKey?: (key: string) => void;
}): void {
  const { controls, scrub } = input;
  if (
    controls.clicked &&
    controls.clickY > scrub.y - 22 &&
    controls.clickY < scrub.y + 26 &&
    controls.clickX >= scrub.x - 10 &&
    controls.clickX <= scrub.x + scrub.width + 10
  ) {
    const click = controls.takeClick();
    if (click !== null) input.seek(((click.x - scrub.x) / scrub.width) * input.duration);
  }
  const transportKey = (action: "replay-toggle" | "replay-back" | "replay-forward", act: () => void): void => {
    if (!anyKeyIn(controls.pressed, action)) return;
    act();
    for (const code of keyCodes(action)) input.consumeKey?.(code);
  };
  transportKey("replay-toggle", () => {
    input.toggle();
  });
  transportKey("replay-back", () => {
    input.seek(input.currentTime - 5);
  });
  transportKey("replay-forward", () => {
    input.seek(input.currentTime + 5);
  });
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];
export interface ReplayTransportState {
  readonly playing: boolean;
  readonly tick: number;
  readonly speed: ReplaySpeed;
}

/** Play, pause, position and speed of one open replay. */
export class ReplayTransport {
  #state: ReplayTransportState = Object.freeze({ playing: false, tick: 0, speed: 1 });

  state(): ReplayTransportState {
    return this.#state;
  }
  play(): void {
    this.#state = Object.freeze({ ...this.#state, playing: true });
  }
  pause(): void {
    this.#state = Object.freeze({ ...this.#state, playing: false });
  }
  seek(tick: number): void {
    this.#state = Object.freeze({ ...this.#state, tick: Math.max(0, Math.floor(tick)) });
  }
  speed(value: ReplaySpeed): void {
    this.#state = Object.freeze({ ...this.#state, speed: value });
  }
}
