// The Adventure opening, on each input device: after the last lore page, the biome name and READY
// play for their authored time and hand over to the first wave with no further input; a press
// during them moves them on instead of being swallowed, and never reaches the player as a jump,
// a dash or a throw. Called from tests/browser-input-matrix.js.
const assert = require("node:assert/strict");
const { STATE_WAIT_MS, holdFor, pollEvery } = require("./browser-waits");

// Authored lengths, in simulation seconds (src/presentation/ui-tokens.ts: biomeRevealFull, readyFull).
// The checks read the director's own clock, so a slow machine cannot change the result.
const AUTHORED = { reveal: 1.8, ready: 1.5 };
const SLACK = 0.25;

const state = (page) => page.evaluate(() => window.__PANTHEON_TEST.state());

function gamepadStub() {
  window.__testGamepad = null;
  Object.defineProperty(navigator, "getGamepads", {
    configurable: true,
    value: () => (window.__testGamepad ? [window.__testGamepad] : []),
  });
}

async function connectGamepad(page) {
  await page.evaluate(() => {
    window.__testGamepad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      connected: true,
      id: "Chapter Opening Pad",
      index: 0,
      mapping: "standard",
      timestamp: 1,
    };
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: window.__testGamepad });
    window.dispatchEvent(event);
  });
}

const DEVICES = [
  {
    name: "mouse",
    context: { viewport: { width: 1280, height: 720 } },
    press: async (page) => page.mouse.click(640, 400),
  },
  {
    name: "keyboard",
    context: { viewport: { width: 1280, height: 720 } },
    press: async (page) => page.keyboard.press("Space", { delay: holdFor(60) }),
  },
  {
    name: "touch",
    context: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
    press: async (page, cdp) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 420, y: 200, id: 1 }] });
      await page.waitForTimeout(holdFor(60));
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
  },
  {
    name: "controller",
    context: { viewport: { width: 1280, height: 720 } },
    gamepad: true,
    press: async (page) => {
      const set = (pressed) =>
        page.evaluate((down) => {
          window.__testGamepad.buttons[0] = { pressed: down, touched: down, value: down ? 1 : 0 };
          window.__testGamepad.timestamp += 1;
        }, pressed);
      await set(true);
      await page.waitForTimeout(holdFor(80));
      await set(false);
    },
  },
];

/** Starts Adventure and confirms each lore page once it can be confirmed, until the pages are over. */
async function readThePages(page, cdp, device, where) {
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("campaign", "easy"));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().beat?.startsWith("page-"), undefined, {
    timeout: STATE_WAIT_MS,
  });
  const deadline = Date.now() + STATE_WAIT_MS;
  for (;;) {
    assert.ok(Date.now() < deadline, `${where}: the lore pages never ended`);
    const now = await state(page);
    if (!now.active || !String(now.beat).startsWith("page-")) return;
    // A page takes a press once it is fully shown (0.6 s reveal); pressing again is harmless.
    if (now.cinemaElapsed > 0.9) await device.press(page, cdp);
    await page.waitForTimeout(pollEvery(120));
  }
}

/** Watches the rest of the opening; `act` may press. Returns the longest time seen in each beat. */
async function watchToPlay(page, where, act = async () => undefined) {
  const longest = {};
  const deadline = Date.now() + STATE_WAIT_MS;
  for (;;) {
    assert.ok(Date.now() < deadline, `${where}: the opening never reached play (${JSON.stringify(longest)})`);
    const now = await state(page);
    if (!now.active) break;
    longest[now.beat] = Math.max(longest[now.beat] ?? 0, now.cinemaElapsed);
    await act(now);
    await page.waitForTimeout(pollEvery(40));
  }
  assert.equal((await state(page)).game, "playing", `${where}: the run is in play`);
  return longest;
}

/**
 * Runs in the page. Each frame: while the biome name or READY is 0.3 s in and not yet pressed, press
 * with the device (down now, up two frames later, a quick tap); records each beat's longest time; then counts,
 * for 45 frames of play, any jump, dash or throw that reached the player.
 */
function pressEachClosingBeatInPage(deviceName) {
  const canvas = document.querySelector("canvas");
  const box = canvas.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height * 0.55;
  let touch = null;
  const press = {
    mouse: () => {
      const at = { clientX: x, clientY: y, bubbles: true, button: 0 };
      canvas.dispatchEvent(new MouseEvent("mousedown", at));
      window.dispatchEvent(new MouseEvent("mouseup", at));
      canvas.dispatchEvent(new MouseEvent("click", at));
      return () => undefined;
    },
    keyboard: () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
      return () => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " ", bubbles: true }));
    },
    touch: () => {
      touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
      const start = {
        touches: [touch],
        targetTouches: [touch],
        changedTouches: [touch],
        cancelable: true,
        bubbles: true,
      };
      canvas.dispatchEvent(new TouchEvent("touchstart", start));
      return () => {
        const end = { touches: [], targetTouches: [], changedTouches: [touch], cancelable: true, bubbles: true };
        canvas.dispatchEvent(new TouchEvent("touchend", end));
      };
    },
    controller: () => {
      const set = (down) => {
        window.__testGamepad.buttons[0] = { pressed: down, touched: down, value: down ? 1 : 0 };
        window.__testGamepad.timestamp += 1;
      };
      set(true);
      return () => set(false);
    },
  }[deviceName];
  const seen = {
    longest: {},
    pressedAt: {},
    reached: { jump: 0, dash: 0, thrown: 0, frames: 0 },
    evidence: [],
    done: false,
  };
  window.__CLOSING_PRESSES__ = seen;
  let release = null;
  let releaseIn = 0;
  // The game must see the button up for at least one frame before the next press, as with a player.
  let upFrames = 0;
  const frame = () => {
    if (release && --releaseIn <= 0) {
      release();
      release = null;
      upFrames = 2;
    } else if (upFrames > 0) upFrames -= 1;
    const now = window.__PANTHEON_TEST.state();
    if (now.active) {
      seen.longest[now.beat] = Math.max(seen.longest[now.beat] ?? 0, now.cinemaElapsed);
      const closing = now.beat === "reveal" || now.beat === "ready";
      if (closing && now.cinemaElapsed >= 0.3 && !(now.beat in seen.pressedAt) && !release && upFrames === 0) {
        seen.pressedAt[now.beat] = now.cinemaElapsed;
        release = press();
        releaseIn = 2;
      }
    } else if (now.game === "playing" && now.playerTrace) {
      const reached = seen.reached;
      reached.frames += 1;
      const trace = now.playerTrace;
      const hit = [
        // A jump buffers the press or launches at -920 px/s (CONFIG.player.jumpSpeed). A grounded
        // player on a slow frame jitters by up to about -100 px/s, which is not a jump.
        trace.jumpBuffer > 0 || trace.vy < -460 ? "jump" : null,
        trace.dashTimer > 0 ? "dash" : null,
        now.blade && now.blade.state !== "held" ? "thrown" : null,
      ].filter(Boolean);
      for (const kind of hit) reached[kind] += 1;
      if (hit.length > 0 && seen.evidence.length < 6)
        seen.evidence.push({
          frame: reached.frames,
          hit,
          vy: trace.vy,
          y: trace.y,
          onGround: trace.onGround,
          jumpBuffer: trace.jumpBuffer,
        });
      if (reached.frames >= 45 && !release) {
        seen.done = true;
        return;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** `want` picks the desktop devices (mouse, keyboard, controller), the touch device, or both. */
async function chapterOpeningCarriesThroughOnEveryDevice(browser, configure, want = { desktop: true, touch: true }) {
  for (const device of DEVICES.filter((entry) => (entry.context.hasTouch === true ? want.touch : want.desktop))) {
    const context = await browser.newContext(device.context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (device.gamepad) await page.addInitScript(gamepadStub);
    await configure(page);
    if (device.gamepad) await connectGamepad(page);
    const cdp = await context.newCDPSession(page);

    // 1. The last press is the one on the last page. Nothing afterwards waits for another.
    let where = `${device.name}, no input after the last page`;
    await readThePages(page, cdp, device, where);
    const untouched = await watchToPlay(page, where);
    for (const beat of ["reveal", "ready"]) {
      assert.ok(untouched[beat] > 0, `${where}: the ${beat} beat was shown`);
      assert.ok(
        untouched[beat] <= AUTHORED[beat] + SLACK,
        `${where}: ${beat} held for ${untouched[beat].toFixed(2)} s; it is authored at ${String(AUTHORED[beat])} s`,
      );
    }

    // 2. A press during the biome name or READY is honoured: it moves that beat on at once.
    where = `${device.name}, a press during each closing beat`;
    await configure(page);
    if (device.gamepad) await connectGamepad(page);
    await readThePages(page, cdp, device, where);
    // The presses are made inside the page, in the frame where the beat is 0.3 s in, and every
    // measure is read from the page's own frames. A press sent from the test process could arrive
    // after a slow runner had already let the beat end on its clock, and a press after the scene
    // is a real gameplay press, so the test would then be checking the wrong thing.
    await page.evaluate(pressEachClosingBeatInPage, device.name);
    await page.waitForFunction(() => window.__CLOSING_PRESSES__.done, undefined, { timeout: STATE_WAIT_MS });
    const seen = await page.evaluate(() => window.__CLOSING_PRESSES__);
    assert.deepEqual(Object.keys(seen.pressedAt), ["reveal", "ready"], `${where}: both beats took a press`);
    for (const beat of ["reveal", "ready"]) {
      assert.ok(
        seen.longest[beat] < AUTHORED[beat] - 0.3,
        `${where}: the press was swallowed; ${beat} still ran ${seen.longest[beat].toFixed(2)} s`,
      );
    }
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "playing", `${where}: in play`);
    assert.deepEqual(
      seen.reached,
      { jump: 0, dash: 0, thrown: 0, frames: 45 },
      `${where}: the press that ended the scene reached the player ${JSON.stringify(seen.evidence)}`,
    );
    assert.deepEqual(errors, [], `${device.name}: the opening raises no page errors`);
    await context.close();
  }
}

module.exports = { chapterOpeningCarriesThroughOnEveryDevice };
