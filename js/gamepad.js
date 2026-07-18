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
  menuScrollDead: 0.25,   // right-stick deadzone before it scrolls a panel
  menuScrollMaxSpeed: 950,// px/sec at full right-stick deflection (curved response)
  activityBias: 0.12,     // stick must exceed dead+this to claim UI ownership (drift can't steal it)
  // user-tunable (written by applySettings from the settings object):
  deadL: 0.22,            // left-stick (movement) deadzone
  deadR: 0.22,            // right-stick (blade) deadzone
  aimSens: 1.0,           // controller blade-aim sensitivity multiplier
  tetherMode: "hold",     // "hold" | "toggle"
  doubleTapDash: false,   // directional double-tap dash (off by default — accessibility)
  doubleTapWindow: 0.25,  // seconds between the two taps
  vibration: "medium",    // "off" | "low" | "medium" | "high"
  glyphStyle: "auto",     // "auto" | "playstation" | "xbox" | "generic"
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
  _tetherLatched: false, _tetherWas: false,   // toggle-mode tether state
  _dtDir: 0, _dtLastDir: 0, _dtT: 999,        // directional double-tap-dash tracking

  init() {
    window.addEventListener("gamepadconnected", (e) => {
      this.index = e.gamepad.index; this.connected = true;
      this.toastT = 3; this.toastText = "CONTROLLER CONNECTED — " + (e.gamepad.id || "gamepad").split("(")[0].trim().slice(0, 28).toUpperCase();
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.index) {
        this.connected = false; this.index = -1; this.active = false;
        this.toastT = 2.4; this.toastText = "CONTROLLER DISCONNECTED";
        this._release(); Input.padTether = false; this._tetherLatched = false;   // never leave the tether stuck on after unplug
        Input.padScrollX = 0; Input.padScrollY = 0;
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
    Input.padTether = false; this._tetherLatched = false; this._dtDir = 0;
    this._resync = true;
    return this.preset;
  },

  // directional double-tap dash (opt-in). A tap is a rising edge from neutral;
  // the second same-direction tap within the window fires a dash (steered by the
  // held direction). Left/Right only — Up is Jump; Down needs an airborne check.
  _detectDoubleTapDash(gp, ax, dt) {
    const dpL = this._down(gp, 14), dpR = this._down(gp, 15);
    let dir = 0;
    if (dpL) dir = -1; else if (dpR) dir = 1;
    else if (ax <= -0.65) dir = -1; else if (ax >= 0.65) dir = 1;
    const nearNeutral = !dpL && !dpR && Math.abs(ax) < 0.25;
    this._dtT += dt;
    if (this._dtT > CONFIG.pad.doubleTapWindow) this._dtDir = 0;
    if (dir !== 0 && this._dtLastDir === 0) {   // rising edge from neutral
      if (dir === this._dtDir && this._dtT <= CONFIG.pad.doubleTapWindow) { Input.tDash = true; this._dtDir = 0; }
      else { this._dtDir = dir; this._dtT = 0; }
    }
    if (dir !== 0) this._dtLastDir = dir; else if (nearNeutral) this._dtLastDir = 0;
  },

  // rumble via the Gamepad haptics API (no-op where unsupported / when off).
  rumble(strength, ms) {
    if (CONFIG.pad.vibration === "off" || !this.connected) return;
    const scale = ({ low: 0.4, medium: 0.7, high: 1 })[CONFIG.pad.vibration] || 0.7;
    const gp = (navigator.getGamepads ? navigator.getGamepads()[this.index] : null);
    const act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
    if (!act) return;
    const mag = Math.max(0, Math.min((strength || 0.5) * scale, 1));
    try {
      if (act.playEffect) act.playEffect("dual-rumble", { duration: ms || 120, strongMagnitude: mag, weakMagnitude: mag * 0.7 });
      else if (act.pulse) act.pulse(mag, ms || 120);
    } catch (e) {}
  },

  // resolved glyph for a Gamepad-API button index, honouring the glyph-style setting.
  _glyphStyle() {
    const s = CONFIG.pad.glyphStyle;
    if (s && s !== "auto") return s;
    const gp = (navigator.getGamepads ? navigator.getGamepads()[this.index] : null);
    const id = ((gp && gp.id) || "").toLowerCase();
    if (/dualsense|dualshock|playstation|sony|054c/.test(id)) return "playstation";   // 054c = Sony vendor id
    return "xbox";   // best neutral fallback for web audiences
  },
  glyph(index) {
    const style = this._glyphStyle();
    const PS = { 0: "✕", 1: "◯", 2: "▢", 3: "△", 4: "L1", 5: "R1", 6: "L2", 7: "R2", 9: "Options" };
    const XB = { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 9: "Menu" };
    const GN = { 0: "South", 1: "East", 2: "West", 3: "North", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 9: "Start" };
    const map = style === "playstation" ? PS : style === "generic" ? GN : XB;
    return map[index] || ("#" + index);
  },
  // primary glyph for a preset action (prefers a shoulder so the right thumb stays
  // on the blade). Used by dynamic control prompts.
  bindingLabel(action) {
    const P = PAD_PRESETS[this.preset] || PAD_PRESETS.default;
    const arr = P[action]; if (!arr || !arr.length) return "";
    const shoulder = arr.find((i) => i >= 4 && i <= 7);
    return this.glyph(shoulder != null ? shoulder : arr[0]);
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

    // claim UI ownership on MEANINGFUL activity only — a firmer threshold than the
    // deadzone so resting-stick drift can never steal the cursor from mouse/touch.
    const actThresh = dead + CONFIG.pad.activityBias;
    if (anyBtn || lMag > actThresh || rMag > actThresh) Input.setMode("gamepad");

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
      // right stick = scroll intent for the active panel (px/frame, curved), axis-locked
      // to whichever direction dominates once past the scroll deadzone.
      const sDead = CONFIG.pad.menuScrollDead, sMax = CONFIG.pad.menuScrollMaxSpeed;
      let sx = 0, sy = 0;
      if (rMag > sDead) {
        const nx = Math.abs(rx), ny = Math.abs(ry);
        if (ny >= nx) { const n = Math.min((ny - sDead) / (1 - sDead), 1); sy = Math.sign(ry) * n * n * sMax * dt; }
        else { const n = Math.min((nx - sDead) / (1 - sDead), 1); sx = Math.sign(rx) * n * n * sMax * dt; }
      }
      Input.padScrollX = sx; Input.padScrollY = sy;
      // shoulders switch tabs, triggers page — fed to the unified UI action channel
      if (this._edge(gp, 4)) Input._uiTabPrev = true;            // L1 = previous tab
      if (this._edge(gp, 5)) Input._uiTabNext = true;            // R1 = next tab
      if (this._edge(gp, 6)) Input._uiPageUp = true;             // L2 = page up
      if (this._edge(gp, 7)) Input._uiPageDown = true;           // R2 = page down
      this._edge(gp, 9); this._edge(gp, 2);                      // keep prev[] fresh for shared buttons
      this._release(); Input.padTether = false; this._tetherLatched = false;   // no movement or tether while in menus
      return;
    }

    // ---- gameplay ----
    Input.padScrollX = 0; Input.padScrollY = 0;   // scroll intent is menu-only
    const deadL = CONFIG.pad.deadL, deadR = CONFIG.pad.deadR;
    // movement: left stick beyond the (tunable) left deadzone, or dpad, -> held keys
    this._setHeld("KeyA", ax < -deadL || this._down(gp, 14));
    this._setHeld("KeyD", ax > deadL || this._down(gp, 15));
    this._setHeld("KeyW", ay < -0.5 || this._down(gp, 12));     // up (dash aim / climbs)
    this._setHeld("KeyS", ay > 0.55 || this._down(gp, 13));     // hold to drop through platforms

    // actions resolved from the active preset (match the touch edges so every
    // consumer just works). Any button assigned to an action fires it.
    const P = PAD_PRESETS[this.preset] || PAD_PRESETS.default;
    if (this._edgeAny(gp, P.jump)) Input.tJump = true;
    if (this._edgeAny(gp, P.dash)) Input.tDash = true;
    if (this._edgeAny(gp, P.throw)) { Input.rmb = true; this._tetherLatched = false; }   // throwing releases a toggled tether
    if (this._edge(gp, 9)) Input.tPause = true;                                  // Start (universal pause)
    // optional directional double-tap dash (off by default) — never replaces the bound button
    if (CONFIG.pad.doubleTapDash) this._detectDoubleTapDash(gp, ax, dt);
    // tether-tighten: HOLD (held button) or TOGGLE (edge flips a latch). Its own channel,
    // so a real mouse hold is never overwritten.
    const tDown = this._downAny(gp, P.tether);
    if (CONFIG.pad.tetherMode === "toggle") {
      if (tDown && !this._tetherWas) this._tetherLatched = !this._tetherLatched;
      Input.padTether = this._tetherLatched;
    } else {
      Input.padTether = tDown; this._tetherLatched = false;
    }
    this._tetherWas = tDown;

    // right stick = radial blade aim, sharing the touch STICK channel (tunable deadzone + sensitivity)
    if (rMag > deadR) {
      const eff = Math.min((rMag - deadR) / (1 - deadR) * CONFIG.pad.aimSens, 1);
      Input.stickAim = { x: (rx / rMag) * eff, y: (ry / rMag) * eff };
      Input.touchAim = true; this._stickWas = true;
    } else if (this._stickWas) {
      Input.stickAim = null; Input.touchAim = false; this._stickWas = false;
    }
  },
};
PAD.init();
