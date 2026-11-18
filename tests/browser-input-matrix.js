const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chapterOpeningCarriesThroughOnEveryDevice } = require("./browser-chapter-opening");
const { STATE_WAIT_MS, clickTarget, holdFor, notWithin, pollEvery } = require("./browser-waits");

async function moveCapturedPointer(page, from, to) {
  await page.evaluate(
    ({ previous, next }) => {
      const canvas = document.querySelector("canvas");
      const event = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: next.x,
        clientY: next.y,
      });
      Object.defineProperties(event, {
        movementX: { value: next.x - previous.x },
        movementY: { value: next.y - previous.y },
      });
      canvas.dispatchEvent(event);
    },
    { previous: from, next: to },
  );
}

/** Records where the draft cards draw their touch hint and the menu its PLAY label, in CSS px, for the newest frame. */
function observeDraftHints() {
  const hints = [];
  let frame = 0;
  let seq = 0;
  window.__DRAFT_HINT_SEQ__ = () => seq;
  window.__DRAFT_HINTS__ = () => hints.filter((hint) => hint.frame >= frame - 1);
  window.__DRAFT_HINT_LOG__ = hints;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      frame += 1;
      callback(time);
    });
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
    const text = String(value);
    if (/^(TAP (TO READ|AGAIN)|PLAY$)/u.test(text)) {
      const matrix = this.getTransform();
      const box = this.canvas.getBoundingClientRect();
      const ratio = box.height / this.canvas.height;
      hints.push({
        text,
        frame,
        seq: ++seq,
        at: performance.now(),
        x: box.left + (matrix.a * x + matrix.c * y + matrix.e) * ratio,
        y: box.top + (matrix.b * x + matrix.d * y + matrix.f) * ratio,
      });
      if (hints.length > 400) hints.splice(0, 200);
    }
    return fillText.call(this, value, x, y, ...rest);
  };
}

/**
 * iOS browsers and Android Chrome before 144 have no document.exitPointerLock. A direct call
 * there once threw inside the wave-clear intents, so the upgrade draft never opened on phones.
 * This removes the method, clears a wave through the test hook (the game's own wave-clear path
 * runs from there) and takes a card by touch, in Adventure and in Endless.
 */
async function phoneWithoutPointerLockOpensTheDraft(browser, configure) {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    const errors = [];
    phone.on("pageerror", (error) => errors.push(error.message));
    await phone.addInitScript(() => {
      delete Document.prototype.exitPointerLock;
    });
    await phone.addInitScript(observeDraftHints);
    await configure(phone);
    assert.equal(
      await phone.evaluate(() => typeof document.exitPointerLock),
      "undefined",
      "the phone has no exitPointerLock",
    );
    const cdp = await context.newCDPSession(phone);
    const tap = async (point) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: point.x, y: point.y, id: 1 }],
      });
      await phone.waitForTimeout(holdFor(60));
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    // Taps, then looks for the result; taps again while the screen is still ignoring input.
    const tapUntil = async (point, predicate, argument, what) => {
      const deadline = Date.now() + STATE_WAIT_MS;
      for (;;) {
        // Each predicate sees what was drawn after this tap (seq), so an older frame cannot pass it.
        const since = await phone.evaluate(() => window.__DRAFT_HINT_SEQ__());
        await tap(point);
        try {
          await phone.waitForFunction(predicate, { argument, since }, { timeout: pollEvery(2000) });
          return;
        } catch (error) {
          if (error?.name !== "TimeoutError") throw error;
          if (Date.now() > deadline) throw new Error(`${what} never happened`, { cause: error });
          // Tap again only while the draft is still open: a second tap on a read card takes it.
          const screen = await phone.evaluate(() => window.__PANTHEON_TEST.state().game);
          if (screen !== "draft") throw new Error(`${what}: the draft closed (now ${screen})`, { cause: error });
        }
      }
    };
    const label = `${String(viewport.width)}x${String(viewport.height)}`;
    for (const mode of ["campaign", "endless"]) {
      const where = `${label} ${mode}`;
      await phone.evaluate((selected) => window.__PANTHEON_TEST.startMode(selected, "easy"), mode);
      await phone.waitForFunction(() => {
        const state = window.__PANTHEON_TEST.state();
        if (state.active) window.__PANTHEON_TEST.skip();
        return state.game === "playing" && !state.active;
      });
      // The first touch makes touch the owning device (a corner of the movement zone).
      await tap({ x: 6, y: viewport.height - 6 });
      await phone.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "touch");
      // Only hints drawn by this draft count; the log still holds the previous mode's cards.
      const draftStart = await phone.evaluate(() => window.__DRAFT_HINT_SEQ__());
      await phone.evaluate(() => window.__PANTHEON_TEST.prepareNaturalWaveClearScenario());
      await phone.waitForFunction(() => window.__PANTHEON_TEST.state().game === "draft", undefined, {
        timeout: STATE_WAIT_MS,
      });
      // Cards deal in from below one after another and ease, and the game can draw the same
      // animation step twice, so equal positions in two frames do not mean the deal is over. It is
      // over when every card has stayed exactly where it is for notWithin(200) ms of drawn frames.
      const restingHint = await phone.waitForFunction(
        ({ since, stillFor }) => {
          const unread = window.__DRAFT_HINT_LOG__.filter((hint) => hint.seq > since && hint.text === "TAP TO READ");
          const frames = [...new Set(unread.map((hint) => hint.frame))];
          const at = (frame) => unread.filter((hint) => hint.frame === frame);
          const now = at(frames.at(-1));
          if (now.length === 0) return null;
          const same = (frame) => {
            const then = at(frame);
            return then.length === now.length && then.every((hint, i) => hint.x === now[i].x && hint.y === now[i].y);
          };
          let earliest = now[0].at;
          for (let index = frames.length - 2; index >= 0 && same(frames[index]); index -= 1)
            earliest = at(frames[index])[0].at;
          return now[0].at - earliest >= stillFor ? now.at(-1) : null;
        },
        { since: draftStart, stillFor: notWithin(200) },
        { timeout: STATE_WAIT_MS },
      );
      const unread = await restingHint.jsonValue();
      assert.ok(unread, `${where}: the draft shows a card to read`);
      // The draft ignores input for a moment after it opens, so a tap is repeated until it lands.
      await tapUntil(
        unread,
        ({ argument: x, since }) =>
          window.__DRAFT_HINT_LOG__.some(
            (hint) => hint.seq > since && hint.text.startsWith("TAP AGAIN") && Math.abs(hint.x - x) < 4,
          ),
        unread.x,
        `${where}: reading the card`,
      );
      assert.equal(
        await phone.evaluate(() => window.__PANTHEON_TEST.state().game),
        "draft",
        `${where}: the first tap reads the card without taking it`,
      );
      await tapUntil(
        unread,
        () => window.__PANTHEON_TEST.state().game === "playing",
        undefined,
        `${where}: taking the card`,
      );
    }
    assert.deepEqual(errors, [], `${label}: a phone without exitPointerLock raises no page errors`);
    await context.close();
  }
}

/**
 * docs/CURSOR_INPUT_CONTRACT.md: the system cursor, the canvas arrow and hover exist only while
 * the mouse owns the interface, and come back only with a meaningful mouse movement, over the
 * canvas and over the HTML fullscreen button alike.
 */
async function pointerBelongsToTheMouseAlone(browser, configure) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await configure(page);
  const input = () => page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot());
  const cursorOf = (selector) => page.locator(selector).evaluate((element) => getComputedStyle(element).cursor);
  const mode = (expected) => page.waitForFunction((value) => document.body.dataset.imode === value, expected);
  await page.mouse.move(600, 300);
  await page.mouse.move(640, 360, { steps: 4 });
  await mode("mouse");
  assert.notEqual((await input()).ownedPointer, null, "the mouse owns the pointer after moving");
  assert.equal(await cursorOf("#fs"), "default");

  await page.keyboard.press("ArrowDown");
  await mode("keyboard");
  assert.equal((await input()).ownedPointer, null, "a key press takes the pointer away");
  assert.equal(await cursorOf("#fs"), "none", "the hardware cursor hides over the HTML button too");
  assert.equal(await cursorOf("body"), "none", "the hardware cursor hides over the letterbox");

  // Sensor noise: a few pixels of drift must not bring the pointer back.
  await page.mouse.move(642, 361);
  await page.mouse.move(641, 362);
  await page.waitForTimeout(notWithin(150));
  assert.equal((await input()).mode, "keyboard", "mouse jitter does not reclaim the interface");
  assert.equal((await input()).ownedPointer, null);

  // A slow, deliberate movement does, even though no single event travels far.
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(641 + step * 2, 362);
  await mode("mouse");
  assert.notEqual((await input()).ownedPointer, null, "a meaningful movement returns the pointer");

  // The same threshold holds over the HTML fullscreen button, where the canvas hears nothing.
  await page.keyboard.press("ArrowDown");
  await mode("keyboard");
  const button = await page.locator("#fs").boundingBox();
  assert.ok(button, "the fullscreen button is shown on a mouse-first device");
  const inside = { x: button.x + button.width / 2, y: button.y + button.height / 2 };
  await page.mouse.move(inside.x - 12, inside.y, { steps: 1 });
  await page.mouse.move(inside.x + 12, inside.y, { steps: 6 });
  await mode("mouse");
  assert.equal(await cursorOf("#fs"), "default");
  await page.close();
}

/**
 * A tablet starts on touch, so its first tap meets the touch layout it was drawn. A laptop with
 * a touch screen starts on the mouse; its first tap is resolved against the mouse layout the
 * player saw, and the menu changes to its touch layout only afterwards. Either way the first
 * tap on PLAY opens the run setup (it once opened the Shop, which sat under the moved layout).
 */
async function firstTapLandsOnTheControlsThePlayerSaw(browser, configure) {
  for (const device of [
    { name: "tablet", isMobile: true, startsOn: "touch" },
    { name: "touch laptop", isMobile: false, startsOn: "mouse" },
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
      isMobile: device.isMobile,
    });
    const page = await context.newPage();
    await page.addInitScript(observeDraftHints);
    // Touch emulation reports a coarse primary pointer; a laptop with a touch screen has a fine one.
    if (!device.isMobile) {
      await page.addInitScript(() => {
        const matchMedia = window.matchMedia.bind(window);
        window.matchMedia = (query) =>
          query === "(pointer: coarse)"
            ? { ...matchMedia("not all"), media: query, matches: false }
            : matchMedia(query);
      });
    }
    await configure(page);
    const input = () => page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot());
    await page.waitForFunction(() => window.__DRAFT_HINTS__().some((hint) => hint.text === "PLAY"));
    // The menu slides in: wait until PLAY is drawn in the same place on two looks in a row.
    await page.waitForFunction(
      () => {
        const play = window.__DRAFT_HINTS__().findLast((hint) => hint.text === "PLAY");
        const last = window.__PLAY_AT__;
        window.__PLAY_AT__ = play;
        return Boolean(play && last && play.x === last.x && play.y === last.y);
      },
      undefined,
      { timeout: STATE_WAIT_MS, polling: pollEvery(250) },
    );
    const start = await input();
    assert.equal(start.mode, device.startsOn, `${device.name}: the owning device at load`);
    assert.equal(start.touchLayout, device.isMobile, `${device.name}: the layout at load`);
    assert.equal(start.ownedPointer === null, device.isMobile, `${device.name}: the pointer at load`);
    const play = (await page.evaluate(() => window.__DRAFT_HINTS__())).filter((hint) => hint.text === "PLAY").at(-1);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: play.x + 12, y: play.y - 4, id: 1 }],
    });
    await page.waitForTimeout(holdFor(60));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen !== "menu", undefined, {
      timeout: STATE_WAIT_MS,
    });
    assert.equal(
      await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen),
      "setup",
      `${device.name}: the first tap on PLAY opens the run setup`,
    );
    const after = await input();
    assert.equal(after.mode, "touch", `${device.name}: touch owns the interface after a tap`);
    assert.equal(after.touchLayout, true, `${device.name}: the touch layout follows the first tap`);
    assert.equal(after.ownedPointer, null, `${device.name}: no pointer while touch owns the interface`);
    await context.close();
  }
}

/**
 * docs/CURSOR_INPUT_CONTRACT.md: aim belongs to the device that last aimed. A controller's right
 * stick aims the blade away from a resting mouse; letting go keeps that aim; only moving the mouse
 * takes it back. It runs without pointer lock, where the mouse aims at its absolute position.
 */
async function aimStaysWithTheDeviceThatLastAimed(browser, configure) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__testGamepad = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (window.__testGamepad ? [window.__testGamepad] : []),
    });
  });
  await configure(page);
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
  await page.evaluate(() => window.__PANTHEON_TEST.resume());
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  assert.equal(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked), false);
  // The mouse rests far to the left of the player and owns the aim.
  await page.mouse.move(400, 360);
  await page.mouse.move(60, 360, { steps: 6 });
  const aim = () => page.evaluate(() => window.__PANTHEON_TEST.state().bladeAim);
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().bladeAim?.x < -40, undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.evaluate(() => {
    window.__testGamepad = {
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      connected: true,
      id: "Aim Matrix Pad",
      index: 0,
      mapping: "standard",
      timestamp: 1,
    };
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: window.__testGamepad });
    window.dispatchEvent(event);
  });
  const stick = (x) =>
    page.evaluate((value) => {
      window.__testGamepad.axes = [0, 0, value, 0];
      window.__testGamepad.timestamp += 1;
    }, x);
  await stick(1);
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().bladeAim?.x > 40, undefined, {
    timeout: STATE_WAIT_MS,
  });
  await stick(0);
  await page.waitForTimeout(notWithin(500));
  const released = await aim();
  assert.ok(released.x > 40, `a released stick keeps its aim, not the resting mouse's (aim x ${released.x})`);
  await page.mouse.move(80, 380, { steps: 6 });
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().bladeAim?.x < -40, undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.close();
}

/** Headless pages never lose visibility or focus, so the test sends what a phone or browser would. */
async function leaveTheScreen(page, how) {
  await page.evaluate((kind) => {
    if (kind === "blur") {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      return;
    }
    const set = (hidden) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (hidden ? "hidden" : "visible"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    set(true);
    set(false);
  }, how);
}

/**
 * docs/CURSOR_INPUT_CONTRACT.md "Losing the screen": a run in play pauses when the page is hidden
 * (every device) or loses focus while touch owns the input; a desktop blur does not pause, and a
 * screen that is not play keeps its screen. The finger that was down is let go.
 */
async function aRunPausesWhenTheGameLosesTheScreen(browser, configure) {
  const screen = (page) => page.evaluate(() => window.__PANTHEON_TEST.state().game);
  const play = async (page) => {
    await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  };

  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const phone = await context.newPage();
  await configure(phone);
  const cdp = await context.newCDPSession(phone);
  await play(phone);
  // A thumb rests on the movement stick when the phone locks.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 120, y: 300, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 190, y: 300, id: 1 }] });
  await phone.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "touch");
  const travel = async () => {
    const from = await phone.evaluate(() => window.__PANTHEON_TEST.state().playerTrace?.x);
    await phone.waitForTimeout(notWithin(500));
    return (await phone.evaluate(() => window.__PANTHEON_TEST.state().playerTrace?.x)) - from;
  };
  const held = await travel();
  assert.ok(held > 40, `the held stick walks the player (moved ${held})`);
  await leaveTheScreen(phone, "hide");
  await phone.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
  await phone.evaluate(() => window.__PANTHEON_TEST.resume());
  // A few pixels of slide are left from the walk; a stick still held would walk as far as before.
  const after = await travel();
  assert.ok(after < held / 4, `the finger down when the screen went away is let go (moved ${after}, held ${held})`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  // A notification shade over a page that stays visible.
  await phone.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await leaveTheScreen(phone, "blur");
  await phone.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");

  // A draft keeps its screen, and the run after it is not paused by the old loss.
  await phone.evaluate(() => window.__PANTHEON_TEST.startMode("endless", "easy"));
  await phone.waitForFunction(() => {
    const state = window.__PANTHEON_TEST.state();
    if (state.active) window.__PANTHEON_TEST.skip();
    return state.game === "playing" && !state.active;
  });
  await phone.evaluate(() => window.__PANTHEON_TEST.openDraft({ preserveRun: true }));
  await phone.waitForFunction(() => window.__PANTHEON_TEST.state().game === "draft");
  await leaveTheScreen(phone, "hide");
  await phone.waitForTimeout(notWithin(300));
  assert.equal(await screen(phone), "draft", "a draft keeps its screen when the page is hidden");
  await context.close();

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await configure(desktop);
  await play(desktop);
  await desktop.mouse.move(400, 360);
  await desktop.mouse.move(600, 360, { steps: 4 });
  await leaveTheScreen(desktop, "blur");
  await desktop.waitForTimeout(notWithin(400));
  assert.equal(await screen(desktop), "playing", "devtools or a second monitor taking focus does not pause");
  await leaveTheScreen(desktop, "hide");
  await desktop.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
  await desktop.close();
}

async function main() {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
  const port = Number(process.env.TEAR_INPUT_TEST_PORT || 8128);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const file = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream",
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });

  async function configure(page) {
    await page.route("**/*", (route) =>
      route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort(),
    );
    await page.goto(`${baseUrl}/?test=1&bossdebug=1`, { timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ && window.__PANTHEON_TEST);
  }

  const touch = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true });
  await configure(touch);
  await touch.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await touch.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  assert.equal(
    await touch.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording),
    true,
    "playground uses the normal shared canonical input session",
  );
  const touchStartX = await touch.evaluate(() => window.__PANTHEON_TEST.state().playerTrace?.x);
  assert.equal(typeof touchStartX, "number", "touch journey requires a live player position");
  await touch.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const send = (type, x, y) => {
      const point = new Touch({
        identifier: 17,
        target: canvas,
        clientX: x,
        clientY: y,
        pageX: x,
        pageY: y,
        radiusX: 8,
        radiusY: 8,
        force: 1,
      });
      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [point],
          changedTouches: [point],
        }),
      );
    };
    send("touchstart", 200, 450);
    send("touchmove", 290, 450);
  });
  // The normal physical frame loop now owns draining the shared canonical
  // stream. Verify the player-visible result instead of competing with it for
  // buffer ownership; C27A separately captures the sealed envelopes.
  await touch.waitForFunction((startX) => {
    const trace = window.__PANTHEON_TEST.state().playerTrace;
    return trace && trace.x > startX + 1;
  }, touchStartX);
  const touchMove = await touch.evaluate(() => ({
    input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
    player: window.__PANTHEON_TEST.state().playerTrace,
  }));
  assert.equal(touchMove.input.mode, "touch");
  assert.ok(touchMove.player.x > touchStartX + 1, "touch movement did not reach the live player");
  await touch.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const point = new Touch({ identifier: 17, target: canvas, clientX: 290, clientY: 450, pageX: 290, pageY: 450 });
    canvas.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [point] }),
    );
  });
  await touch.waitForFunction(
    () => {
      const trace = window.__PANTHEON_TEST.state().playerTrace;
      return trace && Math.abs(trace.vx) < 1;
    },
    undefined,
    { timeout: STATE_WAIT_MS },
  );
  await touch.close();

  const ultrawide = await browser.newPage({ viewport: { width: 1920, height: 800 } });
  await configure(ultrawide);
  await ultrawide.waitForFunction(() => document.body.dataset.imode === "mouse");
  assert.equal(await ultrawide.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "none");
  // #fs sits above the canvas, where the canvas arrow cannot reach, so it carries the hardware
  // arrow; the canvas hides its own arrow while the pointer is off the canvas (no double cursor).
  assert.equal(await ultrawide.locator("#fs").evaluate((button) => getComputedStyle(button).cursor), "default");
  await ultrawide.mouse.move(480, 400);
  await ultrawide.waitForFunction(() => {
    const pointer = window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointer;
    return Math.abs(pointer.x - 260) < 1 && Math.abs(pointer.y - 450) < 1;
  });
  await ultrawide.keyboard.press("ArrowDown");
  await ultrawide.waitForFunction(() => document.body.dataset.imode === "keyboard");
  assert.equal(await ultrawide.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "none");
  await ultrawide.mouse.move(600, 400);
  await ultrawide.waitForFunction(() => document.body.dataset.imode === "mouse");
  assert.equal(await ultrawide.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "none");
  await ultrawide.close();

  const controller = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await controller.addInitScript(() => {
    window.__testGamepad = null;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (window.__testGamepad ? [window.__testGamepad] : []),
    });
  });
  await configure(controller);
  await controller.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    window.__testGamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "PlayStation Browser Matrix",
      index: 0,
      mapping: "standard",
      timestamp: 1,
    };
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: window.__testGamepad });
    window.dispatchEvent(event);
  });
  await controller.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await clickTarget(controller, "menu", "PLAY");
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "setup");
  // A fresh profile is preselected onto the Tutorial; pick Endless the way a player would.
  await clickTarget(controller, "setup", "ENDLESS");
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().setup.mode === "endless");
  await controller.evaluate(() => {
    window.__testGamepad.buttons[2] = { pressed: true, touched: true, value: 1 };
    window.__testGamepad.timestamp = 2;
  });
  await controller.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await controller.evaluate(() => {
    window.__testGamepad.buttons[2] = { pressed: false, touched: false, value: 0 };
    window.__testGamepad.timestamp = 3;
  });
  await controller.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await controller.evaluate(() => {
    window.__testGamepad.buttons[2] = { pressed: true, touched: true, value: 1 };
    window.__testGamepad.timestamp = 4;
  });
  await controller.waitForTimeout(holdFor(500));
  const squareState = await controller.evaluate(() => ({
    game: window.__PANTHEON_TEST.state().game,
    input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
  }));
  assert.equal(
    squareState.game,
    "playing",
    `Square shortcut did not start the run: ${JSON.stringify(squareState.input)}`,
  );
  assert.equal(
    (await controller.evaluate(() => window.__PANTHEON_TEST.state().setup)).mode,
    "endless",
    "Square starts the selected setup directly without moving focus to START",
  );
  await configure(controller);
  await controller.locator("#fs").click();
  await controller.waitForFunction(() => document.fullscreenElement?.id === "wrap");
  await controller.evaluate(() => document.exitFullscreen());
  await controller.waitForFunction(() => document.fullscreenElement === null);
  await controller.evaluate(() => window.__PANTHEON_TEST.startMode("endless"));
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLockAllowed);
  if (await controller.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked)) {
    await controller.keyboard.press("Escape");
    await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
    await controller.mouse.move(880, 440);
    await controller.mouse.move(900, 450);
    await controller.waitForFunction(() => document.body.dataset.imode === "mouse");
    await controller.evaluate(() => window.__PANTHEON_TEST.resume());
    await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  }
  await controller.waitForFunction(() => document.body.dataset.imode === "mouse");
  assert.equal(await controller.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "none");
  assert.equal(await controller.locator("#lockhint").evaluate((hint) => getComputedStyle(hint).display), "block");
  await controller.mouse.click(800, 450);
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked);
  assert.equal(await controller.locator("#lockhint").evaluate((hint) => getComputedStyle(hint).display), "none");
  assert.equal(
    await controller.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording),
    true,
    "every live run owns one shared canonical device-input session independently of Ghost 2",
  );
  for (const mode of ["campaign", "endless", "gauntlet", "bossonly", "sandbox"]) {
    await controller.evaluate((selectedMode) => window.__PANTHEON_TEST.startMode(selectedMode), mode);
    await controller.waitForFunction((selectedMode) => {
      const state = window.__PANTHEON_TEST.state();
      return state.game === "playing" && state.mode === selectedMode;
    }, mode);
    assert.equal(
      await controller.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording),
      true,
      `${mode} must keep the shared canonical device-input session active`,
    );
  }
  await controller.evaluate(() => window.__PANTHEON_TEST.startMode("endless"));
  await controller.waitForFunction(
    () => window.__PANTHEON_TEST.state().game === "playing" && window.__PANTHEON_TEST.state().mode === "endless",
  );
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLockAllowed);
  await controller.mouse.click(800, 450);
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked);
  const aimBeforeMove = await controller.evaluate(() => window.__PANTHEON_TEST.state().bladeAim);
  assert.ok(aimBeforeMove, "recorded live play exposes the physical blade aim");
  const reachBeforeMove = Math.hypot(aimBeforeMove.x, aimBeforeMove.y);
  await moveCapturedPointer(controller, { x: 800, y: 450 }, { x: 800, y: 475 });
  const aimAfterShortMoveHandle = await controller.waitForFunction(
    (before) => {
      const after = window.__PANTHEON_TEST.state().bladeAim;
      return after && Math.hypot(after.x, after.y) < before - 8 ? { x: after.x, y: after.y } : false;
    },
    reachBeforeMove,
    { timeout: STATE_WAIT_MS },
  );
  const aimAfterShortMove = await aimAfterShortMoveHandle.jsonValue();
  await aimAfterShortMoveHandle.dispose();
  assert.ok(
    aimAfterShortMove && Math.hypot(aimAfterShortMove.x, aimAfterShortMove.y) < reachBeforeMove - 8,
    "a short captured movement preserves the source reticle distance instead of expanding to full reach",
  );
  await moveCapturedPointer(controller, { x: 800, y: 475 }, { x: 1_050, y: 475 });
  await controller.waitForFunction(
    (before) => {
      const after = window.__PANTHEON_TEST.state().bladeAim;
      return after && after.x > before.x + 10;
    },
    aimBeforeMove,
    { timeout: STATE_WAIT_MS },
  );
  await controller.keyboard.press("Escape");
  await controller.waitForFunction(() => !window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked);
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
  await controller.keyboard.press("KeyK");
  await controller.waitForFunction(() => document.body.dataset.imode === "keyboard");
  assert.equal(await controller.evaluate(() => document.body.dataset.imode), "keyboard");
  await controller.mouse.move(880, 440);
  await controller.mouse.move(900, 450);
  await controller.waitForFunction(() => document.body.dataset.imode === "mouse");
  await controller.evaluate(() => {
    if (window.__PANTHEON_TEST.state().game === "paused") window.__PANTHEON_TEST.resume();
  });
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await controller.waitForFunction(() => document.body.dataset.imode === "mouse");
  assert.equal(await controller.locator("#lockhint").evaluate((hint) => getComputedStyle(hint).display), "block");
  await controller.mouse.click(800, 450);
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked);
  await controller.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().mode === "playground");
  await controller.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    window.__testGamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "Xbox Browser Matrix",
      index: 0,
      mapping: "standard",
      timestamp: 1,
    };
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: window.__testGamepad });
    window.dispatchEvent(event);
  });
  // Let the controller resynchronise against a neutral physical state before
  // introducing activity. A gamepad that is already holding A at connection
  // time must not synthesize a gameplay edge.
  await controller.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const gamepadStart = await controller.evaluate(() => window.__PANTHEON_TEST.state().playerTrace);
  await controller.evaluate(() => {
    window.__testGamepad.axes = [0.8, 0, 0.7, 0];
    window.__testGamepad.buttons[0] = { pressed: true, touched: true, value: 1 };
    window.__testGamepad.timestamp = 2;
  });
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "gamepad");
  await controller.waitForFunction((before) => {
    const trace = window.__PANTHEON_TEST.state().playerTrace;
    return trace && trace.x > before.x + 1 && trace.y < before.y - 1;
  }, gamepadStart);
  const gamepadResult = await controller.evaluate(() => window.__PANTHEON_TEST.state().playerTrace);
  assert.ok(gamepadResult.x > gamepadStart.x + 1, "gamepad movement did not reach the live player");
  assert.ok(gamepadResult.y < gamepadStart.y - 1, "gamepad A press did not make the live player jump");
  await controller.evaluate(() => {
    const disconnected = window.__testGamepad;
    window.__testGamepad = null;
    const event = new Event("gamepaddisconnected");
    Object.defineProperty(event, "gamepad", { value: disconnected });
    window.dispatchEvent(event);
  });
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen === "paused");
  await controller.close();

  await phoneWithoutPointerLockOpensTheDraft(browser, configure);
  await pointerBelongsToTheMouseAlone(browser, configure);
  await firstTapLandsOnTheControlsThePlayerSaw(browser, configure);
  await chapterOpeningCarriesThroughOnEveryDevice(browser, configure);
  await aimStaysWithTheDeviceThatLastAimed(browser, configure);
  await aRunPausesWhenTheGameLosesTheScreen(browser, configure);

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("browser touch/controller input matrix passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
