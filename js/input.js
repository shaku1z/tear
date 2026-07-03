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
  touchOn: false,         // a real touch has happened -> draw the touch controls
  touchAim: false,        // a finger is steering the blade (delta mode, like pointer-lock)
  uiMode: false,          // set by the game each frame: menus/overlays (taps + drag-scroll)
  tJump: false, tDash: false, tPause: false,   // touch-button edges (cleared each frame)
  joy: { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 },
  _aimId: -1, _aimLX: 0, _aimLY: 0, _scrollId: -1, _scrollLY: 0,
  // on-screen control layout (logical px) — the game draws these, input hit-tests them
  touchLayout() {
    const vw = CONFIG.view.w, vh = CONFIG.view.h;
    return {
      jump: { x: vw - 150, y: vh - 150, r: 82, label: "JUMP" },
      dash: { x: vw - 330, y: vh - 118, r: 64, label: "DASH" },
      throwB: { x: vw - 150, y: vh - 338, r: 58, label: "THROW" },
      pause: { x: vw - 54, y: 52, r: 34, label: "▮▮" },
    };
  },

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => { this.held.delete(e.code); });

    // element px -> logical px. The element spans the arena PLUS the fullscreen
    // overscan bleed, so subtract the overscan offset after scaling.
    const toLogical = (e, r) => {
      const ox = (typeof OVERSCAN !== "undefined") ? OVERSCAN.x : 0;
      const oy = (typeof OVERSCAN !== "undefined") ? OVERSCAN.y : 0;
      return {
        x: (e.clientX - r.left) / r.width * (CONFIG.view.w + ox * 2) - ox,
        y: (e.clientY - r.top) / r.height * (CONFIG.view.h + oy * 2) - oy,
      };
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
    // on-screen buttons = jump/dash/throw/pause, menus = taps + vertical drag-scroll ----
    const hitZone = (p) => {
      const L = this.touchLayout();
      for (const k in L) { const z = L[k]; if (Math.hypot(p.x - z.x, p.y - z.y) <= z.r * 1.3) return k; }
      return null;
    };
    const btnTouches = {};   // touch id -> zone key (fingers on buttons never aim)
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault(); this.touchOn = true;
      const r = canvas.getBoundingClientRect();
      for (const t of e.changedTouches) {
        const p = toLogical(t, r);
        if (this.uiMode) {   // menus: track for drag-scroll (taps still land via the click event)
          if (this._scrollId === -1) { this._scrollId = t.identifier; this._scrollLY = t.clientY; }
          continue;
        }
        const z = hitZone(p);
        if (z) {
          btnTouches[t.identifier] = z;
          if (z === "jump") this.tJump = true;
          else if (z === "dash") this.tDash = true;
          else if (z === "throwB") this.rmb = true;
          else if (z === "pause") this.tPause = true;
        } else if (p.x < CONFIG.view.w * 0.42 && this.joy.id === -1) {
          this.joy = { active: true, id: t.identifier, ax: p.x, ay: p.y, dx: 0, dy: 0 };
        } else if (this._aimId === -1) {
          this._aimId = t.identifier; this._aimLX = t.clientX; this._aimLY = t.clientY; this.touchAim = true;
        }
      }
    }, { passive: false });
    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      for (const t of e.changedTouches) {
        if (t.identifier === this._scrollId) { this.wheel += (this._scrollLY - t.clientY) * 2.2; this._scrollLY = t.clientY; }
        else if (t.identifier === this.joy.id) { const p = toLogical(t, r); this.joy.dx = p.x - this.joy.ax; this.joy.dy = p.y - this.joy.ay; }
        else if (t.identifier === this._aimId) {
          this.dx += (t.clientX - this._aimLX) * 2.3;   // thumb-drag steers the blade like a captured mouse
          this.dy += (t.clientY - this._aimLY) * 2.3;
          this._aimLX = t.clientX; this._aimLY = t.clientY;
        }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) this.joy = { active: false, id: -1, ax: 0, ay: 0, dx: 0, dy: 0 };
        if (t.identifier === this._aimId) { this._aimId = -1; this.touchAim = false; }
        if (t.identifier === this._scrollId) this._scrollId = -1;
        delete btnTouches[t.identifier];
      }
    };
    canvas.addEventListener("touchend", touchEnd);
    canvas.addEventListener("touchcancel", touchEnd);
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
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; },

  endFrame() { this.pressed.clear(); this.rmb = false; this.clicked = false; this.tJump = false; this.tDash = false; this.tPause = false; },
};
