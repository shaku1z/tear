// ------- controller support (HTML5 Gamepad API — no libraries) -------
// Polled once per frame from the main loop (PAD.poll()). It TRANSLATES the pad
// into the same Input channels keyboard/mouse/touch use, so the rest of the
// game never learns controllers exist:
//   left stick / dpad -> Input.held synthetic key codes (move / drop-through)
//   A -> jump edge     B / RT -> dash edge     X / RB / LT -> throw (rmb)
//   right stick -> radial blade aim via Input.stickAim (shared with touch STICK)
//   Start -> pause edge          menus: dpad/stick nav + A confirm + B back
CONFIG.pad = {
  dead: 0.22,             // radial deadzone, both sticks
  menuRepeat: 0.24,       // seconds between held-direction menu steps
  triggerThreshold: 0.35, // L2/R2 count as "pressed" at this analog value (many pads never latch .pressed)
};

// Controller presets (standard Gamepad API indices): 0 Cross/A · 1 Circle/B ·
// 2 Square/X · 3 Triangle/Y · 4 L1 · 5 R1 · 6 L2 · 7 R2. Each action lists every
// button assigned to it; an edge on ANY fires the action. This table is the single
// source of truth for input, diagrams, prompts, and previews.
const PAD_PRESETS = {
  default:  { jump: [0],    dash: [1, 7], throw: [2, 5, 6], tether: [4] },   // shipped layout + L1 tether
  standard: { jump: [0, 4], dash: [1, 6], throw: [2, 5],    tether: [7] },   // recommended: L shoulders=player, R=blade
  tear:     { jump: [4],    dash: [6],    throw: [5],       tether: [7] },   // expert twin-stick: no face-button gameplay
  classic:  { jump: [0, 4], dash: [1, 7], throw: [2, 5],    tether: [6] },   // face-first + shoulder shortcuts
  split:    { jump: [0, 5], dash: [1, 7], throw: [2, 4],    tether: [6] },   // blade utility on the left hand
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
  preset: "default",  // active controller preset (key into PAD_PRESETS)
  _resync: false,     // snapshot physical buttons without firing edges (post preset-switch)

  init() {
    window.addEventListener("gamepadconnected", (e) => {
      this.index = e.gamepad.index; this.connected = true;
      this.toastT = 3; this.toastText = "CONTROLLER CONNECTED — " + (e.gamepad.id || "gamepad").split("(")[0].trim().slice(0, 28).toUpperCase();
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.index) {
        this.connected = false; this.index = -1; this.active = false;
        this.toastT = 2.4; this.toastText = "CONTROLLER DISCONNECTED";
        this._release(); Input.padTether = false;   // never leave the tether stuck on after unplug
      }
    });
  },

  _release() {   // drop every synthetic key we injected
    for (const k of this._held) Input.held.delete(k);
    this._held.clear();
    if (this._stickWas) { Input.stickAim = null; Input.touchAim = false; this._stickWas = false; }
  },

  // Switch preset safely: drop synthetic movement, release the held tether (never
  // inherit it into the new map), and flag a resync so a button already held across
  // the switch is not read as a fresh press in the new layout.
  setPreset(name) {
    this.preset = PAD_PRESETS[name] ? name : "default";
    this._release();
    Input.padTether = false;
    this._resync = true;
    return this.preset;
  },

  _setHeld(code, on) {
    if (on && !this._held.has(code)) { this._held.add(code); if (!Input.held.has(code)) { Input.pressed.add(code); } Input.held.add(code); }
    else if (!on && this._held.has(code)) { this._held.delete(code); Input.held.delete(code); }
  },

  // is button `i` active this frame? Triggers (L2/R2 = 6/7) count via the analog
  // threshold too, since many browser pads never latch `.pressed` on a trigger.
  _isDown(gp, i) {
    const b = gp.buttons[i]; if (!b) return false;
    if (i === 6 || i === 7) return b.pressed || b.value >= CONFIG.pad.triggerThreshold;
    return !!b.pressed;
  },
  // edge helper: fires once per press of pad button `i`
  _edge(gp, i) {
    const on = this._isDown(gp, i);
    const was = !!this._prev[i];
    this._prev[i] = on;
    return on && !was;
  },
  _down(gp, i) { return this._isDown(gp, i); },
  // fire if ANY assigned button produced a rising edge (updates _prev for all of
  // them so no assigned button goes stale); held if ANY assigned button is down.
  _edgeAny(gp, arr) { let fired = false; for (const i of arr) { if (this._edge(gp, i)) fired = true; } return fired; },
  _downAny(gp, arr) { return arr.some((i) => this._isDown(gp, i)); },

  poll(dt, uiMode) {
    if (this.toastT > 0) this.toastT -= dt;
    if (!this.connected) return;
    const gp = (navigator.getGamepads ? navigator.getGamepads()[this.index] : null);
    if (!gp) return;
    // post preset-switch: adopt the current physical button states as the baseline so
    // a button held across the switch is not read as a fresh press in the new map.
    if (this._resync) { for (let i = 0; i < gp.buttons.length; i++) this._prev[i] = this._isDown(gp, i); this._resync = false; }
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
      // ---- menus: dpad / left stick step focus in ALL FOUR directions, A confirms,
      // B backs out. Left/Right were previously dropped; now emitted with dominant-
      // axis resolution so a diagonal never fires two nav events in one repeat.
      this._navT -= dt;
      const menuDead = 0.5;   // firmer than gameplay so stick drift never navigates
      const dx = (this._down(gp, 14) ? -1 : 0) + (this._down(gp, 15) ? 1 : 0) + (Math.abs(ax) > menuDead ? Math.sign(ax) : 0);
      const dy = (this._down(gp, 12) ? -1 : 0) + (this._down(gp, 13) ? 1 : 0) + (Math.abs(ay) > menuDead ? Math.sign(ay) : 0);
      let navKey = null;
      if (dx !== 0 || dy !== 0) {
        // dominant axis: the analog stick compares magnitudes; a d-pad diagonal (no
        // strong analog) falls back to vertical, the safer default for lists.
        const horiz = Math.abs(ax) > Math.abs(ay) && Math.abs(ax) > menuDead;
        if (dy !== 0 && !horiz) navKey = dy < 0 ? "ArrowUp" : "ArrowDown";
        else if (dx !== 0) navKey = dx < 0 ? "ArrowLeft" : "ArrowRight";
        else navKey = dy < 0 ? "ArrowUp" : "ArrowDown";
      }
      if (navKey && this._navT <= 0) {
        Input.pressed.add(navKey);   // menuUp/Down/Left/Right (and the Prev/Next wrappers) read these
        this._navT = CONFIG.pad.menuRepeat;
      } else if (!navKey) this._navT = 0;
      if (this._edge(gp, 0)) Input.pressed.add("Enter");         // A = confirm
      if (this._edge(gp, 1)) Input.padBack = true;               // B = back (game routes to BACK)
      // keep prev[] fresh for buttons we also use in gameplay
      this._edge(gp, 9); this._edge(gp, 2); this._edge(gp, 5); this._edge(gp, 7); this._edge(gp, 4); this._edge(gp, 6);
      this._release(); Input.padTether = false;   // no movement or tether while in menus
      return;
    }

    // ---- gameplay ----
    // movement: left stick beyond the deadzone (or dpad) becomes held keys
    this._setHeld("KeyA", ax < -dead || this._down(gp, 14));
    this._setHeld("KeyD", ax > dead || this._down(gp, 15));
    this._setHeld("KeyW", ay < -0.5 || this._down(gp, 12));     // up (dash aim / climbs)
    this._setHeld("KeyS", ay > 0.55 || this._down(gp, 13));     // hold to drop through platforms

    // actions resolved from the active preset (match the touch edges so every
    // consumer just works). Any button assigned to an action fires it.
    const P = PAD_PRESETS[this.preset] || PAD_PRESETS.default;
    if (this._edgeAny(gp, P.jump)) Input.tJump = true;
    if (this._edgeAny(gp, P.dash)) Input.tDash = true;
    if (this._edgeAny(gp, P.throw)) Input.rmb = true;
    if (this._edge(gp, 9)) Input.tPause = true;                                  // Start (universal pause)
    // held tether-tighten: written every frame from the preset's tether button(s),
    // on its own channel so a real mouse hold is never overwritten.
    Input.padTether = this._downAny(gp, P.tether);

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
