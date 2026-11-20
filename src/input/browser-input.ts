import { discardScenePresses } from "./scene-release";
import type { BrowserInput, BrowserInputDependencies, Point } from "./browser-input-contracts";
import { mapClientPointerToLogical } from "./pointer-coordinate";
import {
  aimFollowsDevices,
  accumulateRelativeTravel,
  MEANINGFUL_POINTER_TRAVEL,
  ownedPointer,
  type RelativeTravel,
} from "../domain/pointer-ownership";
import { createBrowserTouch } from "./browser-touch";
import { anyContextKeyIn, anyKeyIn, bindsKey, type KeyboardAction } from "../domain/keyboard-bindings";

/** Keys the browser would otherwise use to scroll the page or move focus. */
const PAGE_KEYS: readonly KeyboardAction[] = [
  "jump",
  "move-up",
  "move-down",
  "move-left",
  "move-right",
  "playground-menu",
];
const MOVEMENT_KEYS: readonly KeyboardAction[] = ["move-left", "move-right", "move-up", "move-down"];
const bindsAny = (actions: readonly KeyboardAction[], code: string): boolean =>
  actions.some((action) => bindsKey(action, code));

interface ClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

// Temporary ESM browser adapter for the classic game shell. All formerly ambient
// dependencies are explicit so the adapter can be characterized independently.
export function createBrowserInput(dependencies: BrowserInputDependencies): BrowserInput {
  const { config: CONFIG, overscan: OVERSCAN, window, document, performance, semantic } = dependencies;
  // Touch for phones and tablets (browser-touch.ts). Production builds leave it out while mobile
  // is paused (plans/MOBILE_LATER.md); a touch there reaches the game as the browser's mouse emulation.
  const touch = __TEAR_MOBILE__ ? createBrowserTouch(dependencies) : null;

  const Input: BrowserInput = {
    semantic,
    held: new Set(),
    pressed: new Set(), // edge: pressed this frame (consume + clear each frame)
    mouseX: CONFIG.view.w * 0.5,
    mouseY: CONFIG.view.h * 0.5,
    dx: 0,
    dy: 0, // accumulated movement while pointer is locked
    locked: false, // pointer lock active?
    allowLock: false, // only request pointer lock while actually playing
    rmb: false, // right mouse button edge (throw / recall)
    lmb: false, // left mouse button held (draw tether in close)
    keyTether: false, // tether key held: its own channel, like the controller's
    padTether: false, // controller tether-tighten held (separate channel so the pad
    // never clobbers a real mouse hold — see tetherHeld getter)
    clicked: false, // left-click edge (for menu/UI)
    clickX: 0,
    clickY: 0,
    wheel: 0, // accumulated wheel delta (scrollable menus)

    // ---- input modality (the one coherent UI-input layer) ----
    // Which device currently OWNS the UI. Menus read this to decide cursor visibility,
    // focus-halo strength, and hover behaviour instead of each screen guessing.
    mode: "mouse", // "mouse" | "keyboard" | "gamepad" | "touch"
    modeChangedAt: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    clickSource: "mouse", // tags the active Input.clicked so a synthesized touch tap is never read as a mouse click
    padScrollX: 0,
    padScrollY: 0, // controller right-stick scroll intent (px/frame), written by gamepad.js
    padBack: false,
    padConfirmHeld: false,
    padMenuHeld: false,
    pointerInside: true, // the mouse is over the canvas (not over DOM chrome or outside the page)
    // one-frame UI edge flags the gamepad injects (consumed by updateUI):
    _uiTabPrev: false,
    _uiTabNext: false,
    _uiPageUp: false,
    _uiPageDown: false,
    _uiContext1: false,
    _uiContext2: false,
    pointer() {
      return ownedPointer(this.mode, this.pointerInside, this.mouseX, this.mouseY);
    },
    claimAim(device) {
      this.aimDevice = device;
    },
    steerAim(device) {
      this.touchAim = true;
      this.claimAim(device);
    },
    aimIsLive() {
      return aimFollowsDevices(this.aimDevice, this.touchAim);
    },
    setMode(m) {
      if (this.mode === m) return;
      this.mode = m;
      this.modeChangedAt = typeof performance !== "undefined" ? performance.now() : 0;
    },
    startSemanticRecording() {
      this.semantic.startRecording();
    },
    stopSemanticRecording() {
      this.semantic.stopRecording();
    },
    discardSemanticInput() {
      this.semantic.discardUnsealed();
      this.syncSemanticMovement();
    },
    returnControl() {
      this.discardSemanticInput();
      this.semantic.push({ type: "resume" });
    },
    discardScenePresses() {
      discardScenePresses(this);
    },
    drainSemanticActions(tick, aimTurn) {
      if (aimTurn != null) this.semantic.push({ type: "aim", turn: aimTurn });
      return this.semantic.drain(tick);
    },
    syncSemanticMovement() {
      const x = (this.right() ? 1 : 0) - (this.left() ? 1 : 0);
      const y = (this.down() ? 1 : 0) - (this.up() ? 1 : 0);
      this.semantic.setMovement(x, y);
    },
    setPadTether(held) {
      if (this.padTether === held) return;
      this.padTether = held;
      this.semantic.push({ type: "weapon", intent: "primary", phase: held ? "pressed" : "released" });
    },
    setKeyTether(held) {
      if (this.keyTether === held) return;
      this.keyTether = held;
      this.semantic.push({ type: "weapon", intent: "primary", phase: held ? "pressed" : "released" });
    },
    // explicit per-frame UI action snapshot. Screens read Input.ui.* instead of
    // re-deriving arrows / confirm / tabs / scroll. Populated by updateUI() each frame.
    ui: {
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: false,
      back: false,
      tabPrev: false,
      tabNext: false,
      pageUp: false,
      pageDown: false,
      scrollX: 0,
      scrollY: 0,
      context1: false,
      context2: false,
    },
    updateUI() {
      const u = this.ui;
      u.up = this.menuUp();
      u.down = this.menuDown();
      u.left = this.menuLeft();
      u.right = this.menuRight();
      u.confirm = this.confirmPressed();
      u.back = this.backPressed();
      // The tab and page keys are keyboard analogues of L1/R1 and L2/R2. Tab keys count only
      // while menus own input: in play the same keys throw and tether.
      u.tabPrev = this._uiTabPrev || (this.uiMode && anyKeyIn(this.pressed, "tab-prev"));
      u.tabNext = this._uiTabNext || (this.uiMode && anyKeyIn(this.pressed, "tab-next"));
      u.pageUp = this._uiPageUp || anyKeyIn(this.pressed, "page-up");
      u.pageDown = this._uiPageDown || anyKeyIn(this.pressed, "page-down");
      u.context1 = this._uiContext1;
      u.context2 = this._uiContext2;
      u.scrollX = this.padScrollX;
      u.scrollY = this.padScrollY;
      this._uiTabPrev =
        this._uiTabNext =
        this._uiPageUp =
        this._uiPageDown =
        this._uiContext1 =
        this._uiContext2 =
          false;
    },
    // unified scroll intake: mouse wheel + touch drag/flick (via takeWheel) + controller
    // right stick, tagged by source. Consumes the wheel; the pad channel is level-based.
    takeUIScroll() {
      const wheel = this.takeWheel();
      const y = wheel + this.padScrollY,
        x = this.padScrollX;
      let source: "mouse" | "touch" | "gamepad" | null = null;
      if (Math.abs(wheel) > 0.01) source = this.mode === "touch" ? "touch" : "mouse";
      else if (Math.abs(this.padScrollY) > 0.01 || Math.abs(x) > 0.01) source = "gamepad";
      return { x, y, source };
    },

    // ---- touch (mobile): floating joystick + aim-drag + action buttons ----
    touchOn: false, // a real touch has happened (device capability)
    forceMode: "auto", // settings: "auto" | "touch" | "desktop" (2-in-1s can force either)
    touchActive() {
      if (touch === null) return false;
      return this.forceMode === "touch" || (this.forceMode !== "desktop" && this.touchOn);
    },
    touchAim: false, // a finger is steering the blade
    aimDevice: null, // the device that last gave aim input
    touchAimMode: "stick", // "stick" (radial virtual stick) | "drag" (relative, mouse-like)
    stickAim: null, // stick mode: {x,y} deflection vector, each -1..1 (null = inactive)
    uiMode: false, // set by the game each frame: menus/overlays (taps + drag-scroll)
    tJump: false,
    tDash: false,
    tPause: false, // touch-button edges (cleared each frame)
    btnHeld: {}, // zone key -> true while a finger holds that on-screen button
    joy: { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 },
    _aimId: -1,
    _aimLX: 0,
    _aimLY: 0,
    _aimAX: 0,
    _aimAY: 0,
    _scrollId: -1,
    _scrollLY: 0,
    _scrollV: 0,
    scrollFlick: 0,
    // haptic tap — the tactile arm of the juice system (no-op where unsupported, e.g. iOS)
    buzz(p) {
      touch?.buzz(p);
    },
    // on-screen control layout: anchored to the real screen edges + safe area, sized in
    // physical pixels. touch-control-layout.ts owns the geometry; input hit-tests and the
    // renderer draws the same circles.
    // Only touch draws these controls, so only a build with touch asks for them (behind touchActive).
    touchLayout() {
      if (touch === null) throw new Error("this build has no touch controls (mobile is paused)");
      return touch.layout();
    },
    textEntryMode: false,

    init(canvas, requestPointerLock = () => undefined) {
      // Every key reads the binding table (src/domain/keyboard-bindings.ts). Auto-repeat of a
      // held key is not an edge, so holding the throw key throws once.
      window.addEventListener("keydown", (e) => {
        if (this.textEntryMode) return;
        const code = e.code;
        if (bindsAny(PAGE_KEYS, code)) e.preventDefault();
        const edge = !this.held.has(code);
        if (edge) this.pressed.add(code);
        this.held.add(code);
        this.setMode("keyboard"); // a real key press (gamepad-injected arrows never come through here)
        if (bindsAny(MOVEMENT_KEYS, code)) this.syncSemanticMovement();
        if (!edge) return;
        if (bindsKey("jump", code)) this.semantic.push({ type: "jump", phase: "pressed" });
        if (bindsKey("dash", code)) {
          this.semantic.push({
            type: "dash",
            x: ((this.right() ? 1 : 0) - (this.left() ? 1 : 0)) * 1000,
            y: ((this.down() ? 1 : 0) - (this.up() ? 1 : 0)) * 1000,
          });
        }
        // Escape is not a semantic pause: it also releases pointer lock and backs out of menus.
        if (bindsKey("pause", code) && !bindsKey("back", code)) this.semantic.push({ type: "pause" });
        // The throw and tether keys are the right and left mouse buttons, edge for edge, in play only:
        // while menus own input the same keys step tabs, and a key held into play acts only on a new press.
        if (this.uiMode) return;
        if (bindsKey("throw", code)) {
          this.rmb = true;
          this.semantic.push({ type: "weapon", intent: "throw", phase: "pressed" });
        }
        if (bindsKey("tether", code)) this.setKeyTether(true);
      });
      window.addEventListener("keyup", (e) => {
        if (this.textEntryMode) return;
        const code = e.code;
        this.held.delete(code);
        if (bindsAny(MOVEMENT_KEYS, code)) this.syncSemanticMovement();
        if (bindsKey("jump", code)) this.semantic.push({ type: "jump", phase: "released" });
        if (bindsKey("tether", code) && !anyKeyIn(this.held, "tether")) this.setKeyTether(false);
      });

      // element px -> logical px. The element spans the arena PLUS the fullscreen
      // overscan bleed, so subtract the overscan offset after scaling.
      const toLogical = (e: ClientPoint, r: DOMRect): Point =>
        mapClientPointerToLogical(e, r, {
          width: CONFIG.view.w,
          height: CONFIG.view.h,
          overscanX: OVERSCAN.x,
          overscanY: OVERSCAN.y,
        });
      const updateMouse = (e: MouseEvent): void => {
        if (this.locked) {
          // pointer-lock: accumulate raw movement, mapped to the reticle by the blade
          this.dx += e.movementX;
          this.dy += e.movementY;
        } else {
          const p = toLogical(e, canvas.getBoundingClientRect());
          this.mouseX = p.x;
          this.mouseY = p.y;
        }
      };
      // Only a MEANINGFUL move claims mouse ownership: sensor noise, stale coordinates and
      // mouseenter alone must not take the interface from a controller, the keyboard or touch.
      // Listening on the window keeps the same threshold over the canvas, the HTML controls and
      // the letterbox, in fullscreen and inside an embedding frame; under pointer lock the
      // mouse reports only relative movement, which is summed per gesture.
      let lockedTravel: RelativeTravel = { distance: 0, at: 0 };
      window.addEventListener("mousemove", (e) => {
        if (this.locked) {
          const step = accumulateRelativeTravel(lockedTravel, e.movementX, e.movementY, performance.now());
          lockedTravel = step.travel;
          if (step.meaningful) {
            this.setMode("mouse");
            this.claimAim("mouse");
          }
          return;
        }
        const travel = Math.hypot(e.clientX - this.lastPointerX, e.clientY - this.lastPointerY);
        if (this.mode !== "mouse" && travel <= MEANINGFUL_POINTER_TRAVEL) return;
        this.setMode("mouse");
        this.claimAim("mouse");
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      });
      canvas.addEventListener("mousemove", (e) => {
        this.pointerInside = true;
        updateMouse(e);
      });
      canvas.addEventListener("mouseenter", (e) => {
        this.pointerInside = true;
        updateMouse(e);
      });
      canvas.addEventListener("mouseleave", () => {
        this.pointerInside = false;
      });

      // left-click: capture the mouse while playing; otherwise it's a UI click
      canvas.addEventListener("click", (e) => {
        const p = toLogical(e, canvas.getBoundingClientRect());
        this.clickX = p.x;
        this.clickY = p.y;
        this.clicked = true;
        this.clickSource = "mouse";
        this.setMode("mouse");
        this.claimAim("mouse");
        if (this.allowLock && !this.locked) requestPointerLock();
      });
      // right-click = throw / recall the blade (no context menu)
      canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      canvas.addEventListener("mousedown", (e) => {
        if (e.button === 2) {
          this.rmb = true;
          this.semantic.push({ type: "weapon", intent: "throw", phase: "pressed" });
        }
        if (e.button === 0) {
          this.lmb = true;
          this.semantic.push({ type: "weapon", intent: "primary", phase: "pressed" });
        }
        this.setMode("mouse");
      });
      window.addEventListener("mouseup", (e) => {
        if (e.button === 0) {
          this.lmb = false;
          this.semantic.push({ type: "weapon", intent: "primary", phase: "released" });
        }
      });
      canvas.addEventListener(
        "wheel",
        (e) => {
          this.wheel += e.deltaY;
          this.setMode("mouse");
          e.preventDefault();
        },
        { passive: false },
      );

      touch?.attach(this, canvas, toLogical);
      document.addEventListener("pointerlockchange", () => {
        this.locked = document.pointerLockElement === canvas;
      });

      // lose focus or the screen -> drop held keys and fingers so the player doesn't run forever
      // (a phone may send no touchcancel for fingers that were down when the app went away), and
      // release any controller-held tether so the blade doesn't stay tightened after coming back
      const releaseAll = (): void => {
        this.held.clear();
        touch?.releaseAll();
        this.setPadTether(false);
        this.setKeyTether(false);
        this.syncSemanticMovement();
      };
      window.addEventListener("blur", releaseAll);
      window.addEventListener("pagehide", releaseAll);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) releaseAll();
      });
    },

    // read + clear accumulated locked-pointer movement
    consumeDelta() {
      const d = { x: this.dx, y: this.dy };
      this.dx = 0;
      this.dy = 0;
      return d;
    },

    // logical directional helpers (keyboard OR the touch joystick)
    left() {
      return anyKeyIn(this.held, "move-left") || (this.joy.active && this.joy.dx < -26);
    },
    right() {
      return anyKeyIn(this.held, "move-right") || (this.joy.active && this.joy.dx > 26);
    },
    up() {
      return anyKeyIn(this.held, "move-up") || (this.joy.active && this.joy.dy < -42);
    },
    down() {
      return anyKeyIn(this.held, "move-down") || (this.joy.active && this.joy.dy > 42);
    },

    jumpPressed() {
      if (this.tJump) {
        this.tJump = false;
        return true;
      }
      return anyKeyIn(this.pressed, "jump");
    },
    dashPressed() {
      if (this.tDash) {
        this.tDash = false;
        return true;
      }
      return anyKeyIn(this.pressed, "dash");
    },
    pausePressed() {
      if (this.tPause) {
        this.tPause = false;
        return true;
      }
      return anyKeyIn(this.pressed, "pause");
    },
    escapePressed() {
      return this.pressed.has("Escape");
    },

    // menu navigation edges. The four directional helpers are the primitives; screens
    // wanting true 2D grids read them directly, while linear menus keep using the
    // Prev/Next wrappers (which collapse Up+Left -> Prev, Down+Right -> Next exactly
    // as before, so existing screens are unchanged).
    menuUp() {
      return anyKeyIn(this.pressed, "menu-up");
    },
    menuDown() {
      return anyKeyIn(this.pressed, "menu-down");
    },
    menuLeft() {
      return anyKeyIn(this.pressed, "menu-left");
    },
    menuRight() {
      return anyKeyIn(this.pressed, "menu-right");
    },
    menuPrev() {
      return this.menuUp() || this.menuLeft();
    },
    menuNext() {
      return this.menuDown() || this.menuRight();
    },
    // unified tether hold: mouse, tether key OR controller. Consumers read this, not lmb,
    // so the input sources coexist without one clearing another.
    get tetherHeld() {
      return this.lmb || this.keyTether || this.padTether;
    },
    confirmPressed() {
      return anyKeyIn(this.pressed, "confirm");
    },
    // level state of every key or button that can confirm or choose on a menu; the UI
    // arms confirm on a newly opened screen only after all of these have been let go.
    confirmHeld() {
      return this.padConfirmHeld || anyKeyIn(this.held, "confirm") || anyKeyIn(this.held, "choose");
    },
    // level state of every menu key, controller button and stick; an end screen ignores
    // keyboard and controller input until all of these have been let go.
    menuInputHeld() {
      return this.padMenuHeld || anyContextKeyIn(this.held, "menu");
    },
    // semantic back: controller back or the back keys. Keydown is ignored while a text
    // field owns input (textEntryMode), so Backspace never leaves the rename field.
    backPressed() {
      return this.padBack || anyKeyIn(this.pressed, "back");
    },
    // one-shot: the loop may run several fixed substeps per frame, so this edge must
    // be consumed on first read or a single click would throw AND recall in one frame.
    consumeThrow() {
      const v = this.rmb;
      this.rmb = false;
      return v;
    },
    // one-shot UI click; returns {x,y} once then clears
    takeClick() {
      if (!this.clicked) return null;
      this.clicked = false;
      return { x: this.clickX, y: this.clickY };
    },
    takeWheel() {
      let w = this.wheel;
      this.wheel = 0;
      // flick momentum decays into the wheel channel (called once per frame)
      if (this.scrollFlick) {
        w += this.scrollFlick;
        this.scrollFlick *= 0.9;
        if (Math.abs(this.scrollFlick) < 0.5) this.scrollFlick = 0;
      }
      return w;
    },

    endFrame(preserveSimulationEdges = false) {
      if (!preserveSimulationEdges) {
        this.pressed.clear();
        this.rmb = false;
        this.tJump = false;
        this.tDash = false;
      }
      this.clicked = false;
      this.tPause = false;
      touch?.settle();
    },
  };
  return Input;
}
