import { INTERFACE_ACCESSIBILITY, cssToLogical } from "../domain/interface-accessibility";

/** One round on-screen control. `r` is both the drawn radius and the hit radius. */
export interface TouchControlCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface TouchControlButton extends TouchControlCircle {
  readonly label: string;
}

/**
 * The single owner of on-screen touch geometry. Input hit-tests these circles and
 * presentation draws exactly the same circles, so a control can never be drawn in
 * one place and pressed in another.
 */
export interface TouchControlLayout {
  readonly jump: TouchControlButton;
  readonly dash: TouchControlButton;
  readonly throwB: TouchControlButton;
  readonly pause: TouchControlButton;
  /** Resting position of the floating joystick ring (logical radius `r`). */
  readonly joystickHome: TouchControlCircle;
  /** Where the radial aim stick is drawn while a finger steers the blade. */
  readonly aimPad: TouchControlCircle;
  /** A touch left of this x (and not on a button) starts the joystick. */
  readonly joystickZoneRight: number;
}

export interface TouchControlViewport {
  /** Logical size of the authored layout (1600×900). */
  readonly width: number;
  readonly height: number;
  /** Aspect-ratio bleed on each side, in logical pixels. */
  readonly overscanX: number;
  readonly overscanY: number;
  /** Device safe-area insets, in logical pixels. */
  readonly safe: Readonly<{ l: number; r: number; t: number; b: number }>;
  readonly cssPerLogicalPixel: number;
}

/**
 * Thumb ergonomics are physical, so control diameters and edge margins are CSS
 * pixels converted at the live scale. The joystick ring keeps its logical radius
 * because its follow distance (`CONFIG.touch.joyFollow`) is a logical input rule.
 */
export const TOUCH_CONTROL_METRICS = Object.freeze({
  jumpCss: 96,
  dashCss: 80,
  throwCss: 76,
  pauseCss: 48,
  aimPadCss: 104,
  edgeCss: 18,
  gapCss: 14,
  joystickRing: 92,
  joystickZoneFraction: 0.42,
});

export function touchControlLayout(viewport: TouchControlViewport): TouchControlLayout {
  const m = TOUCH_CONTROL_METRICS,
    scale = viewport.cssPerLogicalPixel;
  const radius = (diameterCss: number): number => cssToLogical(diameterCss, scale) / 2;
  const edge = cssToLogical(m.edgeCss, scale),
    gap = cssToLogical(m.gapCss, scale);
  const left = -viewport.overscanX + viewport.safe.l + edge;
  const right = viewport.width + viewport.overscanX - viewport.safe.r - edge;
  const top = -viewport.overscanY + viewport.safe.t + edge;
  const bottom = viewport.height + viewport.overscanY - viewport.safe.b - edge;
  const jumpR = radius(m.jumpCss),
    dashR = radius(m.dashCss),
    throwR = radius(m.throwCss);
  const pauseR = radius(Math.max(m.pauseCss, INTERFACE_ACCESSIBILITY.minTouchTargetCssPx)),
    aimR = radius(m.aimPadCss);
  const jump = { x: right - jumpR, y: bottom - jumpR, r: jumpR, label: "JUMP" };
  const dash = { x: jump.x - jumpR - gap - dashR, y: bottom - dashR, r: dashR, label: "DASH" };
  const joystickHome = { x: left + m.joystickRing, y: bottom - m.joystickRing, r: m.joystickRing };
  return Object.freeze({
    jump,
    dash,
    throwB: { x: left + throwR, y: joystickHome.y - m.joystickRing - gap - throwR, r: throwR, label: "THROW" },
    pause: { x: right - pauseR, y: top + pauseR, r: pauseR, label: "▮▮" },
    joystickHome,
    aimPad: { x: jump.x - aimR, y: jump.y - jumpR - gap - aimR, r: aimR },
    joystickZoneRight: -viewport.overscanX + (viewport.width + viewport.overscanX * 2) * m.joystickZoneFraction,
  });
}

export type TouchControlName = "jump" | "dash" | "throwB" | "pause";
const CONTROL_NAMES: readonly TouchControlName[] = ["jump", "dash", "throwB", "pause"];

/** The control under a logical point, or null. Hit regions are the drawn circles. */
export function touchControlAt(layout: TouchControlLayout, x: number, y: number): TouchControlName | null {
  for (const name of CONTROL_NAMES) {
    const control = layout[name];
    if (Math.hypot(x - control.x, y - control.y) <= control.r) return name;
  }
  return null;
}
