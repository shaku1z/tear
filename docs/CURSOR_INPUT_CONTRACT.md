# Cursor and Pointer Contract

The behavioral and visual baseline for Tear's cursor is commit
`ee5e93141d67cc02505b2227b3be0b10d1819e1c`. The modular runtime must preserve
that build's drawn arrow, immediate hover, click targeting, pointer-lock aim,
lock-loss pause, fullscreen behavior, and fixed 1600 × 900 arena mapping.

## Ownership states

Only one device owns menu focus and only one surface owns cursor presentation.

| Situation | Cursor surface | Hover owns focus | Pointer movement |
| --- | --- | --- | --- |
| Mouse in a menu or overlay | Tear canvas arrow | Yes | Absolute logical coordinates |
| Mouse in gameplay, not captured | Native browser arrow | No menu UI | Click reacquires pointer lock |
| Mouse in gameplay, captured | Hidden | No menu UI | Relative deltas steer the blade |
| Keyboard owns input | Hidden | No | Directional input owns focus |
| Gamepad owns input | Hidden | No | D-pad/stick input owns focus |
| Touch owns input | Hidden | No hover | Taps use logical hit testing |

The native and canvas arrows must never render together. A keyboard, controller,
or touch action must immediately suppress stale mouse hover. A meaningful mouse
move or click returns ownership to the mouse.

## Coordinate pipeline

Browser points are transformed once through `mapClientPointerToLogical`:

1. Normalize the client point inside the canvas rectangle.
2. Expand that normalized point across the logical arena plus fullscreen bleed.
3. Subtract horizontal or vertical overscan to recover arena coordinates.
4. Invert centered overlay zoom for enlarged touch overlays.

This keeps drawing, hover, clicks, touch taps, 16:9, laptop displays,
ultrawide displays, high-DPI backing stores, and fullscreen on the same coordinate
system. Presentation code must never invent a second client-to-canvas formula.

## Pointer-lock lifecycle

Entering a run requests capture but safely tolerates browser gesture rejection.
While gameplay is uncaptured, the native arrow and lock hint remain available so
the player can click the canvas. A successful capture hides the browser cursor and
feeds relative motion to blade aim. Escape or unexpected capture loss pauses the
run; menus and reward screens release capture. Returning from a reward selection
flushes accumulated deltas before requesting capture again.

Pointer-lock capability and rejection handling remain isolated behind the browser
adapter. Game state owns when capture is allowed; input owns whether capture is
currently active; presentation owns how that state is communicated.

## Visual source of truth

The menu arrow remains the original compact ink pointer from the baseline commit:
a 14 × 16 logical-pixel asymmetric arrow filled and stroked with the active Tear
ink color. It is a UI affordance, not a new decorative effect. It renders above
screen content and global post layers, below controller notices and the portrait
rotation gate, matching the original composition order.

## Regression evidence

Permanent checks cover:

- the complete cursor ownership truth table;
- standard, ultrawide, and centered zoom coordinate mapping;
- stale-pointer suppression in focus and button presentation;
- browser-computed cursor style in menus, uncaptured gameplay, and capture;
- keyboard-to-mouse and mouse-to-gamepad ownership handoff;
- pointer-lock acquisition, Escape release, and lock-loss pause;
- touch/controller behavior and existing responsive/fullscreen journeys.

Any future cursor visual change should be reviewed against the baseline commit and
validated with before/after screenshots. Behavior changes belong in this contract
and its tests before they are wired into a screen.
