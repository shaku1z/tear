// ------- keyboard + mouse input -------
const Input = {
  held: new Set(),
  pressed: new Set(),     // edge: pressed this frame (consume + clear each frame)
  mouseX: CONFIG.view.w * 0.5,
  mouseY: CONFIG.view.h * 0.5,
  dx: 0, dy: 0,           // accumulated movement while pointer is locked
  locked: false,          // pointer lock active?
  allowLock: false,       // only request pointer lock while actually playing
  rmb: false,             // right mouse button edge (throw / recall)
  lmb: false,             // left mouse button held (draw tether in close)
  clicked: false,         // left-click edge (for menu/UI)
  clickX: 0, clickY: 0,
  wheel: 0,               // accumulated wheel delta (scrollable menus)

  // ---- touch (mobile): floating joystick + aim-drag + action buttons ----
  touchOn: false,         // a real touch has happened (device capability)
  forceMode: "auto",      // settings: "auto" | "touch" | "desktop" (2-in-1s can force either)
  touchActive() { return this.forceMode === "touch" || (this.forceMode !== "desktop" && this.touchOn); },
  touchAim: false,        // a finger is steering the blade
  touchAimMode: "stick",  // "stick" (radial virtual stick) | "drag" (relative, mouse-like)
  stickAim: null,         // stick mode: {x,y} deflection vector, each -1..1 (null = inactive)
  uiMode: false,          // set by the game each frame: menus/overlays (taps + drag-scroll)
  tJump: false, tDash: false, tPause: false,   // touch-button edges (cleared each frame)
  btnHeld: {},            // zone key -> true while a finger holds that on-screen button
  joy: { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 },
  _aimId: -1, _aimLX: 0, _aimLY: 0, _aimAX: 0, _aimAY: 0, _scrollId: -1, _scrollLY: 0,
  // haptic tap — the tactile arm of the juice system (no-op where unsupported, e.g. iOS)
  buzz(p) { if (this.touchActive() && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } },
  // on-screen control layout (logical px, inside the hardware safe area).
  // THROW lives on the LEFT above the joystick: the right thumb must never leave the
  // aim zone, or the blade's tip speed (and the throw's momentum bonus) dies mid-gesture.
  touchLayout() {
    const vw = CONFIG.view.w, vh = CONFIG.view.h;
    const sl = (typeof SAFE !== "undefined") ? SAFE.l : 0, sr = (typeof SAFE !== "undefined") ? SAFE.r : 0, sb = (typeof SAFE !== "undefined") ? SAFE.b : 0, st = (typeof SAFE !== "undefined") ? SAFE.t : 0;
    return {
      jump: { x: vw - 150 - sr, y: vh - 150 - sb, r: 82, label: "JUMP" },
      dash: { x: vw - 330 - sr, y: vh - 118 - sb, r: 64, label: "DASH" },
      throwB: { x: 150 + sl, y: vh - 370 - sb, r: 60, label: "THROW" },
      pause: { x: vw - 54 - sr, y: 52 + st, r: 34, label: "▮▮" },
    };
  },
  textEntryMode: false,

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (this.textEntryMode) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => { 
      if (this.textEntryMode) return;
      this.held.delete(e.code); 
    });

    // element px -> logical px. The element spans the arena PLUS the fullscreen
    // overscan bleed, so subtract the overscan offset after scaling. When the
    // overlay zoom is up (small touch screens), invert it around the view center
    // so taps land where the zoomed pixels actually are.
    const toLogical = (e, r) => {
      const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
      const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
      let x = (e.clientX - r.left) / r.width * (CONFIG.view.w + ox * 2) - ox;
      let y = (e.clientY - r.top) / r.height * (CONFIG.view.h + oy * 2) - oy;
      const z = this.uiZoom || 1;
      if (z > 1.001) {
        x = CONFIG.view.w / 2 + (x - CONFIG.view.w / 2) / z;
        y = CONFIG.view.h / 2 + (y - CONFIG.view.h / 2) / z;
      }
      return { x, y };
    };
    const updateMouse = (e) => {
      if (this.locked) {
        // pointer-lock: accumulate raw movement, mapped to the reticle by the blade
        this.dx += e.movementX;
        this.dy += e.movementY;
      } else {
        const p = toLogical(e, canvas.getBoundingClientRect());
        this.mouseX = p.x; this.mouseY = p.y;
      }
    };
    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mouseenter", updateMouse);

    // left-click: capture the mouse while playing; otherwise it's a UI click
    canvas.addEventListener("click", (e) => {
      const p = toLogical(e, canvas.getBoundingClientRect());
      this.clickX = p.x; this.clickY = p.y;
      this.clicked = true;
      if (this.allowLock && !this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    // right-click = throw / recall the blade (no context menu)
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2) this.rmb = true;
      if (e.button === 0) this.lmb = true;
    });
    window.addEventListener("mouseup", (e) => { if (e.button === 0) this.lmb = false; });
    canvas.addEventListener("wheel", (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });

    // ---- touch: left zone = floating joystick, right zone = blade aim (drag deltas),
    // on-screen buttons = jump/dash/throw/pause, menus = taps + vertical drag-scroll.
    // preventDefault kills the browser's synthetic click, so TAPS ARE SYNTHESIZED here:
    // a short, still touch becomes Input.clicked at its point — this is what makes every
    // menu work on mobile. Fat-finger forgiveness: hit zones are ~1.6x their visual size.
    const hitZone = (p) => {
      const L = this.touchLayout();
      for (const k in L) { const z = L[k]; if (Math.hypot(p.x - z.x, p.y - z.y) <= z.r * 1.6) return k; }
      return null;
    };
    const btnTouches = {};   // touch id -> zone key (fingers on buttons never aim)
    const tapTrack = {};     // touch id -> { x, y, cx, cy, t, moved } for tap->click synthesis
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault(); this.touchOn = true;
      const r = canvas.getBoundingClientRect();
      for (const t of e.changedTouches) {
        const p = toLogical(t, r);
        tapTrack[t.identifier] = { x: p.x, y: p.y, cx: t.clientX, cy: t.clientY, t: performance.now(), moved: false };
        if (this.forceMode === "desktop") continue;   // desktop mode: taps click, nothing else
        if (this.uiMode) {   // menus: track for drag-scroll (tap->click synthesized on release)
          if (this._scrollId === -1) { this._scrollId = t.identifier; this._scrollLY = t.clientY; this._scrollV = 0; this.scrollFlick = 0; }
          continue;
        }
        const z = hitZone(p);
        if (z) {
          btnTouches[t.identifier] = z;
          this.btnHeld[z] = true;
          this.buzz(8);   // tactile press
          if (z === "jump") this.tJump = true;
          else if (z === "dash") this.tDash = true;
          else if (z === "throwB") this.rmb = true;
          else if (z === "pause") this.tPause = true;
        } else if (p.x < CONFIG.view.w * 0.42 && this.joy.id === -1) {
          this.joy = { active: true, id: t.identifier, ax: p.x, ay: p.y, dx: 0, dy: 0 };
        } else if (this._aimId === -1) {
          this._aimId = t.identifier; this._aimLX = t.clientX; this._aimLY = t.clientY;
          this._aimAX = t.clientX; this._aimAY = t.clientY;   // stick anchor
          this.touchAim = true;
          if (this.touchAimMode === "stick") this.stickAim = { x: 0, y: 0 };
        } else {
          // a SECOND finger in the aim zone = THROW, so the right thumb never has to stop
          // sweeping (the throw inherits the blade's live momentum)
          this.rmb = true;
        }
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const boost = 1.6 * ((typeof CONFIG !== "undefined" && CONFIG.touch) ? CONFIG.touch.aimBoost : 1.5);
      for (const t of e.changedTouches) {
        const tk = tapTrack[t.identifier];
        // thumbs are sloppier than mice: 18px of wander still counts as a tap
        if (tk && Math.hypot(t.clientX - tk.cx, t.clientY - tk.cy) > 18) tk.moved = true;
        if (t.identifier === this._scrollId) {
          const dyy = (this._scrollLY - t.clientY) * 2.2;
          this.wheel += dyy; this._scrollV = dyy;   // remember velocity for flick momentum
          this._scrollLY = t.clientY;
        }
        else if (t.identifier === this.joy.id) {
          const p = toLogical(t, r);
          this.joy.dx = p.x - this.joy.ax; this.joy.dy = p.y - this.joy.ay;
          // DYNAMIC follow: past the max radius the anchor chases the thumb, so
          // the neutral point is always one small motion away (no thumb drift)
          const fm = (CONFIG.touch && CONFIG.touch.joyFollow) || 96;
          const jm = Math.hypot(this.joy.dx, this.joy.dy);
          if (jm > fm) {
            const k = (jm - fm) / jm;
            this.joy.ax += this.joy.dx * k; this.joy.ay += this.joy.dy * k;
            this.joy.dx = p.x - this.joy.ax; this.joy.dy = p.y - this.joy.ay;
          }
        }
        else if (t.identifier === this._aimId) {
          if (this.touchAimMode === "stick") {
            // RADIAL STICK: the blade reticle sits where the stick points — flicks
            // teleport the aim across the arc, and the blade spring supplies the whip
            const sr2 = (CONFIG.touch && CONFIG.touch.stickRadius) || 130;
            const dead = (CONFIG.touch && CONFIG.touch.stickDead) || 10;
            let vx = t.clientX - this._aimAX, vy = t.clientY - this._aimAY;
            const m = Math.hypot(vx, vy);
            if (m > sr2 * 1.3) {   // follow past full deflection, like the joystick
              const k = (m - sr2 * 1.3) / m;
              this._aimAX += vx * k; this._aimAY += vy * k;
              vx = t.clientX - this._aimAX; vy = t.clientY - this._aimAY;
            }
            const m2 = Math.hypot(vx, vy);
            const eff = m2 <= dead ? 0 : Math.min((m2 - dead) / (sr2 - dead), 1);
            this.stickAim = m2 > 0.001 ? { x: (vx / m2) * eff, y: (vy / m2) * eff } : { x: 0, y: 0 };
          } else {
            this.dx += (t.clientX - this._aimLX) * boost;   // thumb-drag steers the blade like a captured mouse
            this.dy += (t.clientY - this._aimLY) * boost;
            this._aimLX = t.clientX; this._aimLY = t.clientY;
          }
        }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const tk = tapTrack[t.identifier];
        if (tk && !tk.moved && performance.now() - tk.t < 450 && !btnTouches[t.identifier]) {
          // a clean tap -> a synthesized UI click (preventDefault suppressed the native one)
          this.clickX = tk.x; this.clickY = tk.y; this.clicked = true;
        }
        delete tapTrack[t.identifier];
        if (t.identifier === this.joy.id) this.joy = { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 };
        if (t.identifier === this._aimId) { this._aimId = -1; this.touchAim = false; this.stickAim = null; }
        if (btnTouches[t.identifier]) delete this.btnHeld[btnTouches[t.identifier]];
        if (t.identifier === this._scrollId) {
          this._scrollId = -1;
          // flick momentum: carry the last drag velocity into the wheel channel
          if (Math.abs(this._scrollV || 0) > 6) this.scrollFlick = this._scrollV;
          this._scrollV = 0;
        }
        delete btnTouches[t.identifier];
      }
    };
    canvas.addEventListener("touchend", touchEnd, { passive: false });
    canvas.addEventListener("touchcancel", touchEnd, { passive: false });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });

    // lose focus -> drop held keys so the player doesn't run forever
    window.addEventListener("blur", () => { this.held.clear(); });
  },

  // read + clear accumulated locked-pointer movement
  consumeDelta() { const d = { x: this.dx, y: this.dy }; this.dx = 0; this.dy = 0; return d; },

  // logical directional helpers (keyboard OR the touch joystick)
  left()  { return this.held.has("KeyA") || this.held.has("ArrowLeft") || (this.joy.active && this.joy.dx < -26); },
  right() { return this.held.has("KeyD") || this.held.has("ArrowRight") || (this.joy.active && this.joy.dx > 26); },
  up()    { return this.held.has("KeyW") || this.held.has("ArrowUp") || (this.joy.active && this.joy.dy < -42); },
  down()  { return this.held.has("KeyS") || this.held.has("ArrowDown") || (this.joy.active && this.joy.dy > 42); },

  jumpPressed() { if (this.tJump) { this.tJump = false; return true; } return this.pressed.has("Space") || this.pressed.has("KeyW") || this.pressed.has("ArrowUp"); },
  dashPressed() { if (this.tDash) { this.tDash = false; return true; } return this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"); },
  pausePressed() { if (this.tPause) { this.tPause = false; return true; } return this.pressed.has("KeyP"); },
  escapePressed() { return this.pressed.has("Escape"); },

  // menu navigation edges
  menuPrev() { return this.pressed.has("ArrowUp") || this.pressed.has("ArrowLeft") || this.pressed.has("KeyW") || this.pressed.has("KeyA"); },
  menuNext() { return this.pressed.has("ArrowDown") || this.pressed.has("ArrowRight") || this.pressed.has("KeyS") || this.pressed.has("KeyD"); },
  confirmPressed() { return this.pressed.has("Enter") || this.pressed.has("NumpadEnter") || this.pressed.has("Space"); },
  // one-shot: the loop may run several fixed substeps per frame, so this edge must
  // be consumed on first read or a single click would throw AND recall in one frame.
  consumeThrow() { const v = this.rmb; this.rmb = false; return v; },
  // one-shot UI click; returns {x,y} once then clears
  takeClick() { if (!this.clicked) return null; this.clicked = false; return { x: this.clickX, y: this.clickY }; },
  takeWheel() {
    let w = this.wheel; this.wheel = 0;
    // flick momentum decays into the wheel channel (called once per frame)
    if (this.scrollFlick) {
      w += this.scrollFlick;
      this.scrollFlick *= 0.90;
      if (Math.abs(this.scrollFlick) < 0.5) this.scrollFlick = 0;
    }
    return w;
  },

  endFrame() { this.pressed.clear(); this.rmb = false; this.clicked = false; this.tJump = false; this.tDash = false; this.tPause = false; },
};
