// ------- controller support (HTML5 Gamepad API — no libraries) -------
// Polled once per frame from the main loop (PAD.poll()). It TRANSLATES the pad
// into the same Input channels keyboard/mouse/touch use, so the rest of the
// game never learns controllers exist:
//   left stick / dpad -> Input.held synthetic key codes (move / drop-through)
//   A -> jump edge     B / RT -> dash edge     X / RB / LT -> throw (rmb)
//   right stick -> radial blade aim via Input.stickAim (shared with touch STICK)
//   Start -> pause edge          menus: dpad/stick nav + A confirm + B back
CONFIG.pad = {
  dead: 0.22,        // radial deadzone, both sticks
  menuRepeat: 0.24,  // seconds between held-direction menu steps
};

const PAD = {
  connected: false,
  index: -1,
  toastT: 0,          // "CONTROLLER CONNECTED" toast clock (game draws it)
  toastText: "",
  active: false,      // a pad input happened recently (hides touch controls)
  _activeT: 0,
  _prev: {},          // button id -> was pressed last frame
  _navT: 0,           // menu-nav repeat timer
  _held: new Set(),   // synthetic key codes we injected into Input.held

  init() {
    window.addEventListener("gamepadconnected", (e) => {
      this.index = e.gamepad.index; this.connected = true;
      this.toastT = 3; this.toastText = "CONTROLLER CONNECTED — " + (e.gamepad.id || "gamepad").split("(")[0].trim().slice(0, 28).toUpperCase();
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.index) {
        this.connected = false; this.index = -1; this.active = false;
        this.toastT = 2.4; this.toastText = "CONTROLLER DISCONNECTED";
        this._release();
      }
    });
  },

  _release() {   // drop every synthetic key we injected
    for (const k of this._held) Input.held.delete(k);
    this._held.clear();
    if (this._stickWas) { Input.stickAim = null; Input.touchAim = false; this._stickWas = false; }
  },

  _setHeld(code, on) {
    if (on && !this._held.has(code)) { this._held.add(code); if (!Input.held.has(code)) { Input.pressed.add(code); } Input.held.add(code); }
    else if (!on && this._held.has(code)) { this._held.delete(code); Input.held.delete(code); }
  },

  // edge helper: fires once per press of pad button `i`
  _edge(gp, i) {
    const on = !!(gp.buttons[i] && gp.buttons[i].pressed);
    const was = !!this._prev[i];
    this._prev[i] = on;
    return on && !was;
  },
  _down(gp, i) { return !!(gp.buttons[i] && gp.buttons[i].pressed); },

  poll(dt, uiMode) {
    if (this.toastT > 0) this.toastT -= dt;
    if (!this.connected) return;
    const gp = (navigator.getGamepads ? navigator.getGamepads()[this.index] : null);
    if (!gp) return;
    const dead = CONFIG.pad.dead;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;    // left stick
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;    // right stick
    const lMag = Math.hypot(ax, ay), rMag = Math.hypot(rx, ry);

    // pad-activity detector (hides the on-screen touch controls while padding)
    const anyBtn = gp.buttons.some((b) => b && b.pressed);
    if (anyBtn || lMag > dead || rMag > dead) this._activeT = 2.5;
    this._activeT = Math.max(0, this._activeT - dt);
    this.active = this._activeT > 0;

    if (uiMode) {
      // ---- menus: dpad / left stick step focus, A confirms, B backs out ----
      this._navT -= dt;
      const dirY = (this._down(gp, 12) ? -1 : 0) + (this._down(gp, 13) ? 1 : 0) + (Math.abs(ay) > 0.5 ? Math.sign(ay) : 0);
      if (dirY !== 0 && this._navT <= 0) {
        Input.pressed.add(dirY < 0 ? "ArrowUp" : "ArrowDown");   // menuPrev/menuNext read these
        this._navT = CONFIG.pad.menuRepeat;
      } else if (dirY === 0) this._navT = 0;
      if (this._edge(gp, 0)) Input.pressed.add("Enter");         // A = confirm
      if (this._edge(gp, 1)) Input.padBack = true;               // B = back (game routes to BACK)
      // keep prev[] fresh for buttons we also use in gameplay
      this._edge(gp, 9); this._edge(gp, 2); this._edge(gp, 5); this._edge(gp, 7);
      this._release();   // no movement injection while in menus
      return;
    }

    // ---- gameplay ----
    // movement: left stick beyond the deadzone (or dpad) becomes held keys
    this._setHeld("KeyA", ax < -dead || this._down(gp, 14));
    this._setHeld("KeyD", ax > dead || this._down(gp, 15));
    this._setHeld("KeyW", ay < -0.5 || this._down(gp, 12));     // up (dash aim / climbs)
    this._setHeld("KeyS", ay > 0.55 || this._down(gp, 13));     // hold to drop through platforms

    // actions (match the touch edges so every consumer just works)
    if (this._edge(gp, 0)) Input.tJump = true;                                   // A
    if (this._edge(gp, 1) || this._edge(gp, 7)) Input.tDash = true;              // B / RT
    if (this._edge(gp, 2) || this._edge(gp, 5) || this._edge(gp, 6)) Input.rmb = true;   // X / RB / LT = throw
    if (this._edge(gp, 9)) Input.tPause = true;                                  // Start

    // right stick = radial blade aim, sharing the touch STICK channel
    if (rMag > dead) {
      const eff = Math.min((rMag - dead) / (1 - dead), 1);
      Input.stickAim = { x: (rx / rMag) * eff, y: (ry / rMag) * eff };
      Input.touchAim = true; this._stickWas = true;
    } else if (this._stickWas) {
      Input.stickAim = null; Input.touchAim = false; this._stickWas = false;
    }
  },
};
PAD.init();
