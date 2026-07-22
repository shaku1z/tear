const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function main() {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  const port = Number(process.env.TEAR_INPUT_TEST_PORT || 8128);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const file = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });

  async function configure(page) {
    await page.route("**/*", (route) => route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort());
    await page.goto(`${baseUrl}/?test=1&bossdebug=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ && window.__PANTHEON_TEST);
  }

  const touch = await browser.newPage({ viewport: { width: 960, height: 540 }, hasTouch: true, isMobile: true });
  await configure(touch);
  await touch.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await touch.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing");
  await touch.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.startRecording());
  await touch.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const send = (type, x, y) => {
      const point = new Touch({ identifier: 17, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 8, radiusY: 8, force: 1 });
      canvas.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [point], changedTouches: [point] }));
    };
    send("touchstart", 200, 450);
    send("touchmove", 290, 450);
  });
  const touchMove = await touch.evaluate(() => ({
    input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
    actions: window.__TEAR_CATALOG_DEBUG__.input.drain(10),
  }));
  assert.equal(touchMove.input.mode, "touch");
  assert.deepEqual(touchMove.actions.map((entry) => entry.command), [{ type: "move", x: 1000, y: 0 }]);
  await touch.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const point = new Touch({ identifier: 17, target: canvas, clientX: 290, clientY: 450, pageX: 290, pageY: 450 });
    canvas.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [point] }));
  });
  const touchRelease = await touch.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(11));
  assert.deepEqual(touchRelease.map((entry) => entry.command), [{ type: "move", x: 0, y: 0 }]);
  await touch.close();

  const ultrawide = await browser.newPage({ viewport: { width: 1920, height: 800 } });
  await configure(ultrawide);
  await ultrawide.waitForFunction(() => document.body.dataset.imode === "mouse");
  assert.equal(await ultrawide.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).cursor), "none");
  assert.equal(await ultrawide.locator("#fs").evaluate((button) => getComputedStyle(button).cursor), "none");
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
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.__testGamepad ? [window.__testGamepad] : [] });
  });
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
  const aimBeforeMove = await controller.evaluate(() => window.__PANTHEON_TEST.state().bladeAim);
  assert.ok(aimBeforeMove && (await controller.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().recording)),
    "recorded live play exposes authoritative blade aim");
  const reachBeforeMove = Math.hypot(aimBeforeMove.x, aimBeforeMove.y);
  await controller.mouse.move(800, 475);
  await controller.waitForFunction((before) => {
    const after = window.__PANTHEON_TEST.state().bladeAim;
    return after && Math.hypot(after.x, after.y) < before - 8;
  }, reachBeforeMove, { timeout: 10_000 });
  const aimAfterShortMove = await controller.evaluate(() => window.__PANTHEON_TEST.state().bladeAim);
  assert.ok(aimAfterShortMove && Math.hypot(aimAfterShortMove.x, aimAfterShortMove.y) < reachBeforeMove - 8,
    "a short captured movement preserves the source reticle distance instead of expanding to full reach");
  await controller.mouse.move(1_050, 475, { steps: 2 });
  await controller.waitForFunction((before) => {
    const after = window.__PANTHEON_TEST.state().bladeAim;
    return after && after.x > before.x + 10;
  }, aimBeforeMove, { timeout: 10_000 });
  await controller.keyboard.press("Escape");
  await controller.waitForFunction(() => !window.__TEAR_CATALOG_DEBUG__.input.snapshot().pointerLocked);
  await controller.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused");
  assert.equal(await controller.evaluate(() => document.body.dataset.imode), "keyboard");
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
    window.__testGamepad = { axes: [0, 0, 0, 0], buttons, connected: true, id: "Xbox Browser Matrix", index: 0, mapping: "standard", timestamp: 1 };
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: window.__testGamepad });
    window.dispatchEvent(event);
  });
  // Let the controller resynchronise against a neutral physical state before
  // introducing activity. A gamepad that is already holding A at connection
  // time must not synthesize a gameplay edge.
  await controller.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await controller.evaluate(() => {
    window.__TEAR_CATALOG_DEBUG__.input.startRecording();
    window.__testGamepad.axes = [0.8, 0, 0.7, 0];
    window.__testGamepad.buttons[0] = { pressed: true, touched: true, value: 1 };
    window.__testGamepad.timestamp = 2;
  });
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "gamepad");
  await controller.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const padActions = await controller.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(20));
  assert.ok(padActions.some((entry) => entry.command.type === "move" && entry.command.x === 1000));
  assert.ok(padActions.some((entry) => entry.command.type === "jump" && entry.command.phase === "pressed"));
  await controller.evaluate(() => {
    const disconnected = window.__testGamepad;
    window.__testGamepad = null;
    const event = new Event("gamepaddisconnected");
    Object.defineProperty(event, "gamepad", { value: disconnected });
    window.dispatchEvent(event);
  });
  await controller.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen === "paused");
  await controller.close();

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("browser touch/controller input matrix passed");
}

main().catch((error) => { console.error(error); process.exit(1); });
