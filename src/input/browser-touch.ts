import type {
  BrowserInput,
  BrowserInputDependencies,
  Point,
  TouchLayout,
  TouchZoneName,
} from "./browser-input-contracts";
import { startsOnTouch } from "../domain/pointer-ownership";
import { touchControlAt, touchControlLayout } from "./touch-control-layout";

interface ClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

interface TapTrack extends Point {
  readonly cx: number;
  readonly cy: number;
  readonly t: number;
  moved: boolean;
}

/** The touch layer of the browser input: on-screen controls, touch aim, taps, haptics. */
export interface BrowserTouch {
  /** The on-screen control layout for the current canvas size. */
  layout(): TouchLayout;
  /** A haptic tap, where the browser supports it. */
  buzz(pattern: number | number[]): void;
  /** Listens to the canvas; `toLogical` is the input's one client-to-logical mapping. */
  attach(input: BrowserInput, canvas: HTMLCanvasElement, toLogical: (e: ClientPoint, r: DOMRect) => Point): void;
  /** Lets go of every finger (the window lost focus or the screen). */
  releaseAll(): void;
  /** Applies a touch layout change that waited for its tap to be handled (end of frame). */
  settle(): void;
}

/**
 * Touch for phones and tablets. Mobile-only (`release.mobile-only` in
 * config/architecture-roles.json): the input creates it only behind `__TEAR_MOBILE__`, so
 * production builds leave it out and a touch there is handled as the browser's own mouse emulation.
 *
 * Left zone = floating joystick, right zone = blade aim, on-screen buttons = jump/dash/throw/pause,
 * menus = taps + vertical drag-scroll. preventDefault kills the browser's synthetic click, so TAPS
 * ARE SYNTHESIZED here: a short, still touch becomes Input.clicked at its point. Hit zones are
 * exactly the drawn controls (touch-control-layout.ts).
 */
export function createBrowserTouch(
  dependencies: Pick<
    BrowserInputDependencies,
    "config" | "safeArea" | "overscan" | "window" | "navigator" | "performance"
  >,
): BrowserTouch {
  const { config: CONFIG, safeArea: SAFE, overscan: OVERSCAN, window, navigator, performance } = dependencies;
  // The canvas the layout is measured against; its CSS size sets the physical scale of the controls.
  let layoutCanvas: HTMLCanvasElement | null = null;
  let releaseFinger: (id: number) => void = () => undefined;
  const touchesDown = new Set<number>();
  let touchLayoutPending = false;
  let owner: BrowserInput | null = null;

  const touch: BrowserTouch = {
    layout() {
      const span = CONFIG.view.h + OVERSCAN.y * 2;
      const cssPerLogicalPixel = layoutCanvas && layoutCanvas.clientHeight > 0 ? layoutCanvas.clientHeight / span : 1;
      return touchControlLayout({
        width: CONFIG.view.w,
        height: CONFIG.view.h,
        overscanX: OVERSCAN.x,
        overscanY: OVERSCAN.y,
        safe: SAFE,
        cssPerLogicalPixel,
      });
    },
    // the tactile arm of the juice system (no-op where unsupported, e.g. iOS)
    buzz(pattern) {
      if (owner?.touchActive() !== true) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        /* Haptics are optional. */
      }
    },
    releaseAll() {
      for (const id of [...touchesDown]) releaseFinger(id);
    },
    settle() {
      if (owner === null || !touchLayoutPending || touchesDown.size > 0) return;
      touchLayoutPending = false;
      owner.touchOn = true;
    },
    attach(input, canvas, toLogical) {
      owner = input;
      layoutCanvas = canvas;
      // A phone or tablet starts on touch: the first frame has the touch layout and no cursor.
      if (startsOnTouch((query) => window.matchMedia(query))) {
        input.touchOn = true;
        input.setMode("touch");
      }
      const btnTouches: Record<number, TouchZoneName | undefined> = {}; // touch id -> zone key (fingers on buttons never aim)
      const tapTrack: Record<number, TapTrack | undefined> = {}; // touch id -> { x, y, cx, cy, t, moved } for tap->click synthesis
      canvas.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          // The first touch on a mouse-first device changes the menus to their touch layout.
          // In a menu that change waits until the finger has lifted and its tap has been
          // handled (endFrame), so the tap lands on the controls the player saw.
          if (input.uiMode && !input.touchOn) touchLayoutPending = true;
          else input.touchOn = true;
          input.setMode("touch");
          const r = canvas.getBoundingClientRect();
          for (const t of e.changedTouches) {
            touchesDown.add(t.identifier);
            const p = toLogical(t, r);
            tapTrack[t.identifier] = {
              x: p.x,
              y: p.y,
              cx: t.clientX,
              cy: t.clientY,
              t: performance.now(),
              moved: false,
            };
            if (input.forceMode === "desktop") continue; // desktop mode: taps click, nothing else
            if (input.uiMode) {
              // menus: track for drag-scroll (tap->click synthesized on release)
              if (input._scrollId === -1) {
                input._scrollId = t.identifier;
                input._scrollLY = t.clientY;
                input._scrollV = 0;
                input.scrollFlick = 0;
              }
              continue;
            }
            const layout = touch.layout();
            const z = touchControlAt(layout, p.x, p.y);
            if (z) {
              btnTouches[t.identifier] = z;
              input.btnHeld[z] = true;
              touch.buzz(8); // tactile press
              if (z === "jump") input.tJump = true;
              else if (z === "dash") {
                input.tDash = true;
                input.semantic.push({ type: "dash", x: 0, y: 0 });
              } else if (z === "throwB") {
                input.rmb = true;
                input.semantic.push({ type: "weapon", intent: "throw", phase: "pressed" });
              } else {
                input.tPause = true;
                input.semantic.push({ type: "pause" });
              }
              if (z === "jump") input.semantic.push({ type: "jump", phase: "pressed" });
            } else if (p.x < layout.joystickZoneRight && input.joy.id === -1) {
              input.joy = { active: true, id: t.identifier, ax: p.x, ay: p.y, dx: 0, dy: 0 };
            } else if (input._aimId === -1) {
              input._aimId = t.identifier;
              input._aimLX = t.clientX;
              input._aimLY = t.clientY;
              input._aimAX = t.clientX;
              input._aimAY = t.clientY; // stick anchor
              input.steerAim("touch");
              if (input.touchAimMode === "stick") input.stickAim = { x: 0, y: 0 };
            } else {
              // a SECOND finger in the aim zone = THROW, so the right thumb never has to stop
              // sweeping (the throw inherits the blade's live momentum)
              input.rmb = true;
              input.semantic.push({ type: "weapon", intent: "throw", phase: "pressed" });
            }
          }
        },
        { passive: false },
      );
      canvas.addEventListener(
        "touchmove",
        (e) => {
          e.preventDefault();
          const r = canvas.getBoundingClientRect();
          const boost = 1.6 * (CONFIG.touch?.aimBoost ?? 1.5);
          for (const t of e.changedTouches) {
            const tk = tapTrack[t.identifier];
            // thumbs are sloppier than mice: 18px of wander still counts as a tap
            if (tk && Math.hypot(t.clientX - tk.cx, t.clientY - tk.cy) > 18) tk.moved = true;
            if (t.identifier === input._scrollId) {
              const dyy = (input._scrollLY - t.clientY) * 2.2;
              input.wheel += dyy;
              input._scrollV = dyy; // remember velocity for flick momentum
              input._scrollLY = t.clientY;
            } else if (t.identifier === input.joy.id) {
              const p = toLogical(t, r);
              input.joy.dx = p.x - input.joy.ax;
              input.joy.dy = p.y - input.joy.ay;
              // DYNAMIC follow: past the max radius the anchor chases the thumb, so
              // the neutral point is always one small motion away (no thumb drift)
              const fm = CONFIG.touch?.joyFollow ?? 96;
              const jm = Math.hypot(input.joy.dx, input.joy.dy);
              if (jm > fm) {
                const k = (jm - fm) / jm;
                input.joy.ax += input.joy.dx * k;
                input.joy.ay += input.joy.dy * k;
                input.joy.dx = p.x - input.joy.ax;
                input.joy.dy = p.y - input.joy.ay;
              }
              input.syncSemanticMovement();
            } else if (t.identifier === input._aimId) {
              if (input.touchAimMode === "stick") {
                // RADIAL STICK: the blade reticle sits where the stick points — flicks
                // teleport the aim across the arc, and the blade spring supplies the whip
                const sr2 = CONFIG.touch?.stickRadius ?? 130;
                const dead = CONFIG.touch?.stickDead ?? 10;
                let vx = t.clientX - input._aimAX,
                  vy = t.clientY - input._aimAY;
                const m = Math.hypot(vx, vy);
                if (m > sr2 * 1.3) {
                  // follow past full deflection, like the joystick
                  const k = (m - sr2 * 1.3) / m;
                  input._aimAX += vx * k;
                  input._aimAY += vy * k;
                  vx = t.clientX - input._aimAX;
                  vy = t.clientY - input._aimAY;
                }
                const m2 = Math.hypot(vx, vy);
                const eff = m2 <= dead ? 0 : Math.min((m2 - dead) / (sr2 - dead), 1);
                input.stickAim = m2 > 0.001 ? { x: (vx / m2) * eff, y: (vy / m2) * eff } : { x: 0, y: 0 };
                if (m2 > 0.001) input.semantic.setAimVector(vx, vy);
              } else {
                input.dx += (t.clientX - input._aimLX) * boost; // thumb-drag steers the blade like a captured mouse
                input.dy += (t.clientY - input._aimLY) * boost;
                input._aimLX = t.clientX;
                input._aimLY = t.clientY;
              }
            }
          }
        },
        { passive: false },
      );
      /** Lets go of one finger: its stick, aim, button or scroll. */
      releaseFinger = (id: number): void => {
        touchesDown.delete(id);
        Reflect.deleteProperty(tapTrack, id);
        if (id === input.joy.id) {
          input.joy = { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 };
          input.syncSemanticMovement();
        }
        if (id === input._aimId) {
          input._aimId = -1;
          input.touchAim = false;
          input.stickAim = null;
        }
        const button = btnTouches[id];
        if (button === "jump") input.semantic.push({ type: "jump", phase: "released" });
        if (button !== undefined) Reflect.deleteProperty(input.btnHeld, button);
        if (id === input._scrollId) {
          input._scrollId = -1;
          // flick momentum: carry the last drag velocity into the wheel channel
          if (Math.abs(input._scrollV || 0) > 6) input.scrollFlick = input._scrollV;
          input._scrollV = 0;
        }
        Reflect.deleteProperty(btnTouches, id);
      };
      const touchEnd = (e: TouchEvent): void => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const tk = tapTrack[t.identifier];
          if (tk && !tk.moved && performance.now() - tk.t < 450 && !btnTouches[t.identifier]) {
            // a clean tap -> a synthesized UI click (preventDefault suppressed the native one)
            input.clickX = tk.x;
            input.clickY = tk.y;
            input.clicked = true;
            input.clickSource = "touch";
          }
          releaseFinger(t.identifier);
        }
      };
      canvas.addEventListener("touchend", touchEnd, { passive: false });
      canvas.addEventListener("touchcancel", touchEnd, { passive: false });
    },
  };
  return touch;
}
