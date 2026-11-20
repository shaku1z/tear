/** A screen rectangle in logical pixels. */
export interface KeepOutArea {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Room left between a control's edge and the nearest ledge or fighter of the live demo. */
const KEEP_OUT_PAD = 16;

/**
 * The area a screen's controls cover, padded, or undefined when it has none. The live menu demo
 * keeps its play layer (ledges, fighters, shots, effects) out of this area, so nothing in the
 * demo ever runs behind a control. Its sky and backdrop still show, so the scene stays open.
 */
export function controlsKeepOut(controls: readonly KeepOutArea[]): KeepOutArea | undefined {
  if (controls.length === 0) return undefined;
  const left = Math.min(...controls.map((control) => control.x)) - KEEP_OUT_PAD,
    top = Math.min(...controls.map((control) => control.y)) - KEEP_OUT_PAD,
    right = Math.max(...controls.map((control) => control.x + control.w)) + KEEP_OUT_PAD,
    bottom = Math.max(...controls.map((control) => control.y + control.h)) + KEEP_OUT_PAD;
  return { x: left, y: top, w: right - left, h: bottom - top };
}
