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
  clicked: false,         // left-click edge (for menu/UI)
  clickX: 0, clickY: 0,

  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => { this.held.delete(e.code); });

    const updateMouse = (e) => {
      if (this.locked) {
        // pointer-lock: accumulate raw movement, mapped to the reticle by the blade
        this.dx += e.movementX;
        this.dy += e.movementY;
      } else {
        const r = canvas.getBoundingClientRect();
        this.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
        this.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
      }
    };
    canvas.addEventListener("mousemove", updateMouse);
    canvas.addEventListener("mouseenter", updateMouse);

    // left-click: capture the mouse while playing; otherwise it's a UI click
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      this.clickX = (e.clientX - r.left) * (canvas.width / r.width);
      this.clickY = (e.clientY - r.top) * (canvas.height / r.height);
      this.clicked = true;
      if (this.allowLock && !this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    // right-click = throw / recall the blade (no context menu)
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mousedown", (e) => { if (e.button === 2) this.rmb = true; });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
    });

    // lose focus -> drop held keys so the player doesn't run forever
    window.addEventListener("blur", () => { this.held.clear(); });
  },

  // read + clear accumulated locked-pointer movement
  consumeDelta() { const d = { x: this.dx, y: this.dy }; this.dx = 0; this.dy = 0; return d; },

  // logical directional helpers
  left()  { return this.held.has("KeyA") || this.held.has("ArrowLeft"); },
  right() { return this.held.has("KeyD") || this.held.has("ArrowRight"); },
  up()    { return this.held.has("KeyW") || this.held.has("ArrowUp"); },
  down()  { return this.held.has("KeyS") || this.held.has("ArrowDown"); },

  jumpPressed() { return this.pressed.has("Space"); },
  dashPressed() { return this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"); },
  pausePressed() { return this.pressed.has("KeyP"); },

  // menu navigation edges
  menuPrev() { return this.pressed.has("ArrowUp") || this.pressed.has("ArrowLeft") || this.pressed.has("KeyW") || this.pressed.has("KeyA"); },
  menuNext() { return this.pressed.has("ArrowDown") || this.pressed.has("ArrowRight") || this.pressed.has("KeyS") || this.pressed.has("KeyD"); },
  confirmPressed() { return this.pressed.has("Enter") || this.pressed.has("NumpadEnter") || this.pressed.has("Space"); },
  // one-shot: the loop may run several fixed substeps per frame, so this edge must
  // be consumed on first read or a single click would throw AND recall in one frame.
  consumeThrow() { const v = this.rmb; this.rmb = false; return v; },
  // one-shot UI click; returns {x,y} once then clears
  takeClick() { if (!this.clicked) return null; this.clicked = false; return { x: this.clickX, y: this.clickY }; },

  endFrame() { this.pressed.clear(); this.rmb = false; this.clicked = false; },
};
