/**
 * The radial touch aim stick: where the thumb sits relative to where it landed.
 * Input reads it every touch move, and the touch overlay draws the same anchor
 * and reach, so the stick on screen is the stick that aims.
 */

export interface TouchAimStickPoint {
  readonly x: number;
  readonly y: number;
}

/** Distances in CSS pixels: the thumb's travel, not the game's logical pixels. */
export interface TouchAimStickShape {
  /** Thumb travel from the anchor for full deflection. */
  readonly reach: number;
  /** Thumb travel that still reads as resting. */
  readonly dead: number;
}

export interface TouchAimStickReading {
  /** The anchor after it follows a thumb that has gone past the reach. */
  readonly anchor: TouchAimStickPoint;
  /**
   * The deflection, each axis -1..1, or `null` while a new touch has not left the
   * dead zone: the blade then keeps the aim it already had, instead of dropping
   * onto the hand every time the thumb lands again after a jump or a dash.
   */
  readonly aim: TouchAimStickPoint | null;
  /** True once this touch has left the dead zone; it stays true until the finger lifts. */
  readonly engaged: boolean;
}

/** Past this multiple of the reach the anchor follows the thumb, like the movement stick. */
const FOLLOW_BEYOND_REACH = 1.3;

export function readTouchAimStick(
  shape: TouchAimStickShape,
  anchor: TouchAimStickPoint,
  thumb: TouchAimStickPoint,
  engaged: boolean,
): TouchAimStickReading {
  let ax = anchor.x,
    ay = anchor.y;
  let vx = thumb.x - ax,
    vy = thumb.y - ay;
  const follow = shape.reach * FOLLOW_BEYOND_REACH;
  const far = Math.hypot(vx, vy);
  if (far > follow) {
    const k = (far - follow) / far;
    ax += vx * k;
    ay += vy * k;
    vx = thumb.x - ax;
    vy = thumb.y - ay;
  }
  const length = Math.hypot(vx, vy);
  const nowEngaged = engaged || length > shape.dead;
  if (!nowEngaged) return Object.freeze({ anchor: { x: ax, y: ay }, aim: null, engaged: false });
  const amount = length <= shape.dead ? 0 : Math.min((length - shape.dead) / (shape.reach - shape.dead), 1);
  const aim = length > 0.001 ? { x: (vx / length) * amount, y: (vy / length) * amount } : { x: 0, y: 0 };
  return Object.freeze({ anchor: { x: ax, y: ay }, aim, engaged: true });
}
