/**
 * The one rule for who owns the pointer (docs/CURSOR_INPUT_CONTRACT.md).
 *
 * The pointer is every surface a mouse drives: the system cursor, the drawn canvas arrow, hover
 * highlights and hover focus. It exists only while the mouse owns the interface. A key press, a
 * controller input or a touch takes ownership away, and only a meaningful mouse movement or a
 * mouse button gives it back. Every consumer asks here instead of reading the raw mouse position.
 */
export type InputDevice = "mouse" | "keyboard" | "gamepad" | "touch";

export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

/** Mouse travel, in CSS px, that counts as the player reaching for the mouse (not sensor noise). */
export const MEANINGFUL_POINTER_TRAVEL = 5;

/** Relative movement events this far apart, in ms, belong to separate gestures. */
export const POINTER_GESTURE_GAP_MS = 150;

export function pointerOwnsInterface(device: InputDevice): boolean {
  return device === "mouse";
}

/** The mouse position, or null while another device owns the interface or the mouse is off the canvas. */
export function ownedPointer(device: InputDevice, inside: boolean, x: number, y: number): PointerPoint | null {
  return pointerOwnsInterface(device) && inside ? { x, y } : null;
}

/** A point no control can contain: what renderers that need coordinates get when nothing points. */
export const NO_POINTER: PointerPoint = Object.freeze({ x: -1e6, y: -1e6 });

/**
 * A phone or tablet (its primary pointer is coarse) starts on touch, so the first frame already
 * has the touch layout and no cursor. A laptop with a touch screen has a fine primary pointer and
 * starts on the mouse.
 */
export function startsOnTouch(matchMedia: ((query: string) => { readonly matches: boolean }) | undefined): boolean {
  try {
    return matchMedia?.("(pointer: coarse)").matches === true;
  } catch {
    return false;
  }
}

export interface RelativeTravel {
  readonly distance: number;
  readonly at: number;
}

/**
 * Under pointer lock the mouse reports only relative movement, so travel is summed within one
 * gesture. Returns the new sum and whether it now counts as reaching for the mouse.
 */
export function accumulateRelativeTravel(
  previous: RelativeTravel,
  movementX: number,
  movementY: number,
  now: number,
): Readonly<{ travel: RelativeTravel; meaningful: boolean }> {
  const carried = now - previous.at > POINTER_GESTURE_GAP_MS ? 0 : previous.distance;
  const distance = carried + Math.hypot(movementX, movementY);
  const meaningful = distance > MEANINGFUL_POINTER_TRAVEL;
  return { travel: { distance: meaningful ? 0 : distance, at: now }, meaningful };
}

/** The devices that can aim the blade. */
export type AimDevice = "mouse" | "touch" | "gamepad";

/**
 * Aim belongs to the device that last gave aim input: the mouse when it moves or clicks, the touch
 * aim pad while a finger steers it, the controller while its right stick is deflected. The input
 * layer records that owner (`BrowserInputState.aimDevice`) and every aim consumer reads it.
 *
 * Aim follows the devices while the owner is the mouse (its pointer stays where it is) or while the
 * owner is still steering. When a stick or finger lets go, the aim holds where it left it; releasing
 * a device never hands the aim to another one resting somewhere else. Only the next device to aim
 * takes it.
 */
export function aimFollowsDevices(owner: AimDevice | null, steering: boolean): boolean {
  return owner === null || owner === "mouse" || steering;
}
