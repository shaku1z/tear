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

async function chapterOpeningCarriesThroughOnEveryDevice(browser, configure) {
  for (const device of DEVICES) {
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
    // Every frame once the scene is over: did the player receive a jump, a dash or a throw?
    await page.evaluate(() => {
      const reached = { jump: 0, dash: 0, thrown: 0, frames: 0 };
      window.__SCENE_PRESS_REACHED__ = reached;
      const look = () => {
        const now = window.__PANTHEON_TEST.state();
        if (!now.active && now.game === "playing" && now.playerTrace) {
          reached.frames += 1;
          if (now.playerTrace.jumpBuffer > 0 || now.playerTrace.vy < 0) reached.jump += 1;
          if (now.playerTrace.dashTimer > 0) reached.dash += 1;
          if (now.blade && now.blade.state !== "held") reached.thrown += 1;
        }
        if (reached.frames < 45) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    const pressed = new Set();
    const hurried = await watchToPlay(page, where, async (now) => {
      if ((now.beat !== "reveal" && now.beat !== "ready") || now.cinemaElapsed < 0.3 || pressed.has(now.beat)) return;
      pressed.add(now.beat);
      await device.press(page, cdp);
    });
    assert.deepEqual([...pressed], ["reveal", "ready"], `${where}: both beats took a press`);
    for (const beat of ["reveal", "ready"]) {
      assert.ok(
        hurried[beat] < AUTHORED[beat] - 0.3,
        `${where}: the press was swallowed; ${beat} still ran ${hurried[beat].toFixed(2)} s`,
      );
    }
    await page.waitForFunction(() => window.__SCENE_PRESS_REACHED__.frames >= 45, undefined, {
      timeout: STATE_WAIT_MS,
    });
    assert.deepEqual(
      await page.evaluate(() => ({ ...window.__SCENE_PRESS_REACHED__, frames: 45 })),
      { jump: 0, dash: 0, thrown: 0, frames: 45 },
      `${where}: the press that ended the scene reached the player`,
    );
    assert.deepEqual(errors, [], `${device.name}: the opening raises no page errors`);
    await context.close();
  }
}

module.exports = { chapterOpeningCarriesThroughOnEveryDevice };
