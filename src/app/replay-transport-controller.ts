export interface ReplayTransportInput {
  readonly clicked: boolean; readonly clickX: number; readonly clickY: number;
  readonly pressed: ReadonlySet<string>;
  takeClick(): Readonly<{ x: number; y: number }> | null;
}

export function handleReplayTransport(input: {
  readonly controls: ReplayTransportInput;
  readonly currentTime: number;
  readonly duration: number;
  readonly scrub: Readonly<{ x: number; y: number; width: number }>;
  readonly seek: (seconds: number) => void;
  readonly toggle: () => void;
}): void {
  const { controls, scrub } = input;
  if (controls.clicked && controls.clickY > scrub.y - 22 && controls.clickY < scrub.y + 26
    && controls.clickX >= scrub.x - 10 && controls.clickX <= scrub.x + scrub.width + 10) {
    const click = controls.takeClick();
    if (click !== null) input.seek(((click.x - scrub.x) / scrub.width) * input.duration);
  }
  if (controls.pressed.has("Space")) input.toggle();
  if (controls.pressed.has("ArrowLeft")) input.seek(input.currentTime - 5);
  if (controls.pressed.has("ArrowRight")) input.seek(input.currentTime + 5);
}
