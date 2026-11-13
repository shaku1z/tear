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
  if (controls.pressed.has("Space")) {
    input.toggle();
    input.consumeKey?.("Space");
  }
  if (controls.pressed.has("ArrowLeft")) {
    input.seek(input.currentTime - 5);
    input.consumeKey?.("ArrowLeft");
  }
  if (controls.pressed.has("ArrowRight")) {
    input.seek(input.currentTime + 5);
    input.consumeKey?.("ArrowRight");
  }
}
