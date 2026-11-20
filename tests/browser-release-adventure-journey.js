// Release Adventure journey: the PRODUCTION build (dist/standalone, clean URL, no
// test storage or debug hooks), a fresh profile and real input only.
// A fresh profile is tutorial-first: PLAY starts the tutorial, and the player skips it on purpose
// from its pause menu, which opens the run setup. Then ADVENTURE -> EASY -> START, the chapter
// intro waits for input and advances,
// wave 1 is fought and cleared by a small pixel-guided player loop, the draft opens,
// a card is clicked and wave 2 begins. A defeat is retried within the time budget;
// a retry must skip the already-seen chapter and still progress.
// The touch leg starts the same run on a phone with touch events only and with
// document.exitPointerLock removed (iOS browsers and Android Chrome before 144 lack it): the
// menus answer taps, the on-screen controls appear and the left thumb moves the player.
// It does not fight: that a cleared wave opens the draft on such a phone is proved on the
// test build by tests/browser-input-matrix.js, where the wave clear is deterministic.
// TEAR_RELEASE_TOUCH_VIEWPORTS (default 844x390) lists the phone sizes to play.
//
// Observation (test-side only): canvas text and the player's eye are read from the
// page's own 2D draw calls, enemies from canvas pixels. Nothing in the game is called.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertCleanProductionUrl, serveProductionBuild } = require("./class-c-browser-harness");
const { STATE_WAIT_MS, holdFor, notWithin, pollEvery, settleFor, launchJourney } = require("./browser-waits");

const VIEW = Object.freeze({ width: 1280, height: 720 });
const SCALE = VIEW.width / 1600;
const COMBAT_BUDGET_MS = Number(process.env.TEAR_RELEASE_ADVENTURE_BUDGET_MS || 180_000);
const STUCK_MS = 25_000;
const buildRoot = process.env.TEAR_RELEASE_BUILD_DIR
  ? path.resolve(process.env.TEAR_RELEASE_BUILD_DIR)
  : path.resolve(__dirname, "..", "dist", "standalone");
const shotDirectory = process.env.TEAR_JOURNEY_SHOTS ? path.resolve(process.env.TEAR_JOURNEY_SHOTS) : null;

/** Installed before the game boots: records drawn text and the player's eye per animation frame. */
function installObserver() {
  const observed = { frame: 0, text: [], eye: null, lockRequests: 0, lockChanges: 0 };
  document.addEventListener("pointerlockchange", () => {
    observed.lockChanges += 1;
  });
  // The journey aims by absolute pointer position. Under pointer lock the game reads
  // relative movement instead, which headless runners do not report alike (the Linux
  // runner left the blade still), so the capture request is counted and not granted.
  Element.prototype.requestPointerLock = function () {
    observed.lockRequests += 1;
    return Promise.resolve();
  };
  Object.defineProperty(window, "__RELEASE_JOURNEY__", { value: observed });
  const proto = CanvasRenderingContext2D.prototype;
  const toCss = (context, x, y) => {
    const m = context.getTransform();
    const canvas = context.canvas;
    const rect = canvas.getBoundingClientRect();
    const ratio = rect.height / canvas.height;
    return {
      x: rect.left + (m.a * x + m.c * y + m.e) * ratio,
      y: rect.top + (m.b * x + m.d * y + m.f) * ratio,
      scale: Math.hypot(m.b, m.d) * ratio,
    };
  };
  const fillText = proto.fillText;
  proto.fillText = function (value, x, y, ...rest) {
    if (this.canvas.id === "game") {
      try {
        const at = toCss(this, x, y);
        const size = /(\d+(?:\.\d+)?)px/u.exec(this.font);
        const width = this.measureText(String(value)).width * at.scale;
        const left =
          this.textAlign === "center"
            ? at.x - width / 2
            : this.textAlign === "right" || this.textAlign === "end"
              ? at.x - width
              : at.x;
        observed.text.push({
          t: String(value),
          x: left + width / 2,
          y: at.y,
          px: size ? Number(size[1]) * at.scale : 0,
          a: this.globalAlpha,
          f: observed.frame,
        });
        if (observed.text.length > 8000) observed.text.splice(0, 4000);
      } catch {
        /* observation must never disturb drawing */
      }
    }
    return fillText.call(this, value, x, y, ...rest);
  };
  const fillRect = proto.fillRect;
  proto.fillRect = function (x, y, w, h) {
    // The player's eye is the only 8x5 rectangle drawn in an ordinary stage-one fight.
    if (w === 8 && h === 5 && this.canvas.id === "game") {
      try {
        const at = toCss(this, x + 4, y + 2.5);
        observed.eye = { x: at.x, y: at.y, scale: at.scale, f: observed.frame };
      } catch {
        /* ignore */
      }
    }
    return fillRect.call(this, x, y, w, h);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      observed.frame += 1;
      callback(time);
    });
}

/**
 * Wave-one enemies are solid bodies about 32 px across. Thinner dark blobs are
 * strokes the scan also sees: the held blade, words drawn in the scene's ink and
 * edges at the ground line. The blade also shows as a broad blob inside its own
 * reach above the hand.
 */
function looksLikeEnemy(blob, player) {
  if (Math.min(blob.w, blob.h) < 22) return false;
  return !(Math.hypot(blob.x - player.x, blob.y - player.y) < 220 * SCALE && blob.y < player.y - 20 * SCALE);
}

/** In-page pixel pass: dark blobs that are not HUD, ground, platforms or the player. */
function scanEnemies(player) {
  const canvas = document.getElementById("game");
  const W = 320,
    H = 180;
  let scratch = window.__RELEASE_JOURNEY_SCAN__;
  if (!scratch) {
    const surface = document.createElement("canvas");
    surface.width = W;
    surface.height = H;
    scratch = { surface, context: surface.getContext("2d", { willReadFrequently: true }) };
    Object.defineProperty(window, "__RELEASE_JOURNEY_SCAN__", { value: scratch });
  }
  scratch.context.drawImage(canvas, 0, 0, W, H);
  const pixels = scratch.context.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const r = pixels[i * 4],
      g = pixels[i * 4 + 1],
      b = pixels[i * 4 + 2];
    dark[i] = 0.299 * r + 0.587 * g + 0.114 * b < 110 ? 1 : 0;
  }
  let ground = H;
  for (let y = H - 1; y > H / 2; y -= 1) {
    let count = 0;
    for (let x = 0; x < W; x += 1) count += dark[y * W + x];
    if (count / W > 0.7) ground = y;
    else break;
  }
  const top = Math.floor(H * 0.16);
  for (let y = 0; y < H; y += 1) {
    if (y < top || y >= ground - 1) {
      dark.fill(0, y * W, (y + 1) * W);
      continue;
    }
    let run = 0;
    for (let x = 0; x <= W; x += 1) {
      if (x < W && dark[y * W + x]) {
        run += 1;
        continue;
      }
      if (run >= 30) dark.fill(0, y * W + x - run, y * W + x);
      run = 0;
    }
  }
  const rect = canvas.getBoundingClientRect();
  const cell = rect.width / W;
  const blobs = [];
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let start = 0; start < W * H; start += 1) {
    if (!dark[start] || seen[start]) continue;
    let count = 0,
      minX = W,
      maxX = 0,
      minY = H,
      maxY = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop();
      const x = index % W,
        y = (index - x) / W;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const next of [index - 1, index + 1, index - W, index + W]) {
        if (next < 0 || next >= W * H || seen[next] || !dark[next] || Math.abs((next % W) - x) > 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (count < 6 || maxX - minX < 2 || maxY - minY < 2) continue;
    const box = {
      x: rect.left + ((minX + maxX + 1) / 2) * cell,
      y: rect.top + ((minY + maxY + 1) / 2) * cell,
      w: (maxX - minX + 1) * cell,
      h: (maxY - minY + 1) * cell,
    };
    if (player && Math.abs(box.x - player.x) < box.w / 2 + 20 && Math.abs(box.y - player.y) < box.h / 2 + 30) continue;
    blobs.push(box);
  }
  return blobs;
}

/**
 * Phone leg: a fresh touch-only context taps through the menus and the Adventure opening,
 * sees the on-screen controls at wave 1 and moves the player with the left thumb.
 */
async function runTouchLeg(browser, origin, viewport, shot) {
  const leg = `touch-${String(viewport.width)}x${String(viewport.height)}`;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.route("**/*", (route) =>
    route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort(),
  );
  await page.addInitScript(installObserver);
  await page.addInitScript(() => {
    delete Document.prototype.exitPointerLock;
  });
  const texts = (frames = 2) =>
    page.evaluate((count) => {
      const observed = window.__RELEASE_JOURNEY__;
      const latest = new Map();
      for (const entry of observed.text)
        if (entry.f >= observed.frame - count && entry.a > 0.05)
          latest.set(`${entry.t}|${String(Math.round(entry.x))}|${String(Math.round(entry.y))}`, entry);
      return [...latest.values()];
    }, frames);
  const has = (list, pattern) => list.some((entry) => pattern.test(entry.t));
  const fingers = new Map();
  const send = (type) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: [...fingers].map(([id, point]) => ({
        x: point.x,
        y: point.y,
        id,
        radiusX: 6,
        radiusY: 6,
        force: 1,
      })),
    });
  const down = async (id, point) => {
    fingers.set(id, point);
    await send("touchStart");
  };
  const move = async (id, point) => {
    if (!fingers.has(id)) return;
    fingers.set(id, point);
    await send("touchMove");
  };
  const up = async (id) => {
    if (!fingers.delete(id)) return;
    await send("touchEnd");
  };
  const tap = async (point) => {
    await down(9, point);
    await page.waitForTimeout(holdFor(60));
    await up(9);
  };
  const waitForText = async (pattern, timeout, what) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const hit = (await texts()).find((entry) => pattern.test(entry.t));
      if (hit) return hit;
      await page.waitForTimeout(pollEvery(100));
    }
    await shot(`${leg}-missing-${what}`, page);
    throw new Error(`${leg}: ${what}: ${String(pattern)} did not appear within ${String(timeout)} ms`);
  };
  /** Taps where the label was drawn most recently; menus slide in, so earlier frames are stale. */
  const tapLabel = async (pattern, what) => {
    await waitForText(pattern, STATE_WAIT_MS, what);
    await page.waitForTimeout(settleFor(250));
    const drawn = (await texts()).filter((entry) => pattern.test(entry.t)).sort((a, b) => b.f - a.f);
    await tap(drawn[0] ?? (await waitForText(pattern, STATE_WAIT_MS, what)));
  };
  try {
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: STATE_WAIT_MS });
    await waitForText(/^PLAY$/u, STATE_WAIT_MS, "main menu");
    await page.waitForTimeout(settleFor(800));
    await tapLabel(/^PLAY$/u, "PLAY");
    await waitForText(/^LESSON 1 OF \d+$/u, STATE_WAIT_MS, "PLAY starts the tutorial");
    await tapLabel(/^PAUSE$/u, "tutorial: PAUSE");
    await tapLabel(/^SKIP TUTORIAL$/u, "tutorial: SKIP TUTORIAL");
    await page.waitForTimeout(settleFor(900));
    await tapLabel(/^ADVENTURE$/u, "Adventure mode");
    await page.waitForTimeout(settleFor(400));
    await tapLabel(/^EASY$/u, "Easy difficulty");
    await page.waitForTimeout(settleFor(400));
    await tapLabel(/^START$/u, "START");
    for (let taps = 0; taps < 30 && !has(await texts(), /^WAVE 1$/u); taps += 1) {
      await tap({ x: viewport.width / 2, y: viewport.height * 0.45 });
      await page.waitForTimeout(pollEvery(1_100));
    }
    await waitForText(/^WAVE 1$/u, STATE_WAIT_MS, "wave 1");
    await shot(`${leg}-wave-1`, page);
    // A touch that starts during the READY beat is a menu touch and never becomes a stick,
    // so the thumb goes down once the controls are drawn.
    await waitForText(/^JUMP$/u, STATE_WAIT_MS, "touch controls");
    await page.waitForTimeout(settleFor(200));
    const eyeX = async () => (await page.evaluate(() => window.__RELEASE_JOURNEY__.eye))?.x ?? null;
    const before = await eyeX();
    assert.notEqual(before, null, `${leg}: the player is drawn`);
    const joystick = { x: viewport.width * 0.14, y: viewport.height * 0.72 };
    await down(1, joystick);
    // 30 px stays inside the joystick's follow radius.
    await move(1, { x: joystick.x + 30, y: joystick.y });
    const until = Date.now() + STATE_WAIT_MS;
    let after = before;
    while (Date.now() < until && !(after - before > 20)) {
      await page.waitForTimeout(pollEvery(100));
      after = (await eyeX()) ?? after;
    }
    await up(1);
    await shot(`${leg}-moved`, page);
    assert.ok(after - before > 20, `${leg}: the left thumb moves the player (${String(before)} -> ${String(after)})`);
    assert.deepEqual(pageErrors, [], `${leg}: the touch journey raised page errors`);
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(
    fs.existsSync(path.join(buildRoot, "index.html")),
    `${buildRoot} is missing; run pnpm build:standalone first`,
  );
  if (shotDirectory) fs.mkdirSync(shotDirectory, { recursive: true });
  const host = await serveProductionBuild(buildRoot);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await launchJourney(chromium, {
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  // Diagnostic: slow the page down to imitate a weaker runner.
  const throttle = Number(process.env.TEAR_RELEASE_ADVENTURE_CPU_THROTTLE || 1);
  if (throttle > 1)
    await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const pageErrors = [],
    consoleErrors = [],
    log = [];
  const started = Date.now();
  const note = (step, detail = {}) => {
    const entry = { s: +((Date.now() - started) / 1000).toFixed(1), step, ...detail };
    log.push(entry);
    console.log(JSON.stringify(entry));
  };
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource/u.test(message.text()))
      consoleErrors.push(message.text());
  });
  await page.route("**/*", (route) =>
    route.request().url().startsWith(`${host.origin}/`) ? route.continue() : route.abort(),
  );
  await page.addInitScript(installObserver);
  let shots = 0;
  const shot = async (name, target = page) => {
    if (shotDirectory)
      await target.screenshot({ path: path.join(shotDirectory, `${String(++shots).padStart(2, "0")}-${name}.png`) });
  };
  const texts = (frames = 2) =>
    page.evaluate((count) => {
      const observed = window.__RELEASE_JOURNEY__;
      const latest = new Map();
      for (const entry of observed.text)
        if (entry.f >= observed.frame - count && entry.a > 0.05)
          latest.set(`${entry.t}|${Math.round(entry.x)}|${Math.round(entry.y)}`, entry);
      return [...latest.values()];
    }, frames);
  const has = (list, pattern) => list.some((entry) => pattern.test(entry.t));
  const press = async (code, holdMs = 70) => {
    await page.keyboard.down(code);
    await page.waitForTimeout(holdFor(holdMs));
    await page.keyboard.up(code);
  };
  const click = async (point) => {
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await page.waitForTimeout(settleFor(160));
    await page.mouse.down();
    await page.waitForTimeout(holdFor(70));
    await page.mouse.up();
  };
  const waitForText = async (pattern, timeout, what) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const hit = (await texts()).find((entry) => pattern.test(entry.t));
      if (hit) return hit;
      await page.waitForTimeout(pollEvery(100));
    }
    await shot(`missing-${what}`);
    throw new Error(`${what}: ${String(pattern)} did not appear within ${String(timeout)} ms`);
  };
  const clickLabel = async (pattern, what) => {
    const hit = await waitForText(pattern, STATE_WAIT_MS, what);
    await click(hit);
    return hit;
  };

  const startAdventure = async (leg, { tutorialFirst = false } = {}) => {
    await waitForText(/^PLAY$/u, STATE_WAIT_MS, `${leg}: main menu`);
    await page.waitForTimeout(settleFor(800));
    await clickLabel(/^PLAY$/u, `${leg}: PLAY`);
    if (tutorialFirst) {
      // A fresh profile is tutorial-first: PLAY starts the tutorial, and skipping it on purpose
      // from its pause menu opens the run setup. Afterwards PLAY opens the setup directly.
      await waitForText(/^LESSON 1 OF \d+$/u, STATE_WAIT_MS, `${leg}: PLAY starts the tutorial`);
      await press("KeyP", 80);
      await clickLabel(/^SKIP TUTORIAL$/u, `${leg}: SKIP TUTORIAL`);
    }
    await page.waitForTimeout(settleFor(900));
    await clickLabel(/^ADVENTURE$/u, `${leg}: Adventure mode`);
    await page.waitForTimeout(settleFor(400));
    await clickLabel(/^EASY$/u, `${leg}: Easy difficulty`);
    await page.waitForTimeout(settleFor(400));
    await shot(`${leg}-setup`);
    await clickLabel(/^START$/u, `${leg}: START`);
    note("started adventure", { leg });
  };

  /** The chapter intro appears, waits for the player, and advances by clicks to wave 1. */
  const passChapterIntro = async (leg) => {
    await waitForText(/^THE FIRST DESCENT$/u, STATE_WAIT_MS, `${leg}: chapter I intro`);
    await page.waitForTimeout(settleFor(500));
    await shot(`${leg}-chapter-intro`);
    await page.waitForTimeout(notWithin(3_500));
    let opening = await texts();
    assert.ok(!has(opening, /^WAVE \d+$/u), "the chapter intro must wait for input before the first wave");
    note("chapter intro holds without input", { leg });
    let advances = 0;
    const beats = new Set();
    for (; advances < 20; advances += 1) {
      opening = await texts();
      for (const entry of opening) if (entry.t.length > 3 && entry.px >= 14) beats.add(entry.t);
      if (has(opening, /^WAVE 1$/u)) break;
      await click({ x: VIEW.width / 2, y: VIEW.height * 0.55 });
      await page.waitForTimeout(pollEvery(1_100));
    }
    await waitForText(/^WAVE 1$/u, STATE_WAIT_MS, `${leg}: wave 1 after the chapter intro`);
    assert.ok(advances >= 2, `the chapter intro advanced by input (${String(advances)} clicks)`);
    note("chapter intro advanced", {
      leg,
      clicks: advances,
      beats: [...beats].slice(0, 12),
      device: await page.evaluate(() => ({
        cores: navigator.hardwareConcurrency,
        touchPoints: navigator.maxTouchPoints,
        coarse: matchMedia("(pointer: coarse)").matches,
        anyCoarse: matchMedia("(any-pointer: coarse)").matches,
        hover: matchMedia("(hover: hover)").matches,
        touchEvents: "ontouchstart" in window,
      })),
      hints: opening
        .filter((entry) => /move|blade|throw|dash/iu.test(entry.t))
        .map((entry) => entry.t)
        .slice(0, 6),
    });
    await shot(`${leg}-wave-1`);
  };

  /** Fights wave 1 until its draft opens, clicks a card and expects wave 2. Returns the retries used. */
  const clearWaveOneAndPick = async (leg) => {
    // Fight wave 1 until its draft opens; retry a defeat inside the budget.
    const combatDeadline = Date.now() + COMBAT_BUDGET_MS;
    const held = new Set();
    const hold = async (code, on) => {
      if (on && !held.has(code)) {
        held.add(code);
        await page.keyboard.down(code);
      }
      if (!on && held.has(code)) {
        held.delete(code);
        await page.keyboard.up(code);
      }
    };
    const releaseAll = async () => {
      for (const code of [...held]) await hold(code, false);
    };
    let loops = 0,
      loopsFrom = Date.now(),
      sweep,
      retries = 0,
      zeroLeftSince = null,
      lastLeft = null,
      lastText = 0,
      frameText,
      lastSeen = null;
    // Real-time play depends on the runner: report the frame rate the game reached.
    const frameOf = () => page.evaluate(() => window.__RELEASE_JOURNEY__.frame);
    let fpsFrom = { at: Date.now(), frame: await frameOf() };
    const fps = async () => {
      const now = { at: Date.now(), frame: await frameOf() };
      const value = +((now.frame - fpsFrom.frame) / Math.max(0.001, (now.at - fpsFrom.at) / 1000)).toFixed(1);
      fpsFrom = now;
      return value;
    };
    // The first lost attempt prints two small mid-fight frames into the log, so a
    // runner-only failure can be seen without artifacts.
    const attemptStarted = Date.now(),
      evidenceFrames = [];
    for (;;) {
      if (
        retries === 0 &&
        evidenceFrames.length < 2 &&
        Date.now() - attemptStarted > 4_000 * (evidenceFrames.length + 1)
      ) {
        evidenceFrames.push((await page.screenshot({ type: "jpeg", quality: 35 })).toString("base64"));
      }
      if (Date.now() > combatDeadline) {
        await shot(`${leg}-budget-exhausted`);
        throw new Error(
          `${leg}: wave 1 was not cleared within ${String(COMBAT_BUDGET_MS)} ms (retries ${String(retries)}, enemies left ${String(lastLeft)}, ${String(await fps())} fps)`,
        );
      }
      if (Date.now() - lastText > 250) {
        lastText = Date.now();
        frameText = await texts(1);
        if (has(frameText, /^TAKE ONE/u) || has(frameText, /^WAVE 1 CLEARED$/u)) break;
        if (has(frameText, /^DEFEATED$/u)) {
          await releaseAll();
          retries += 1;
          note("defeated; retrying", {
            leg,
            retries,
            fps: await fps(),
            loopHz: +(loops / ((Date.now() - loopsFrom) / 1000)).toFixed(1),
            seen: lastSeen,
            pointerLocked: await page.evaluate(() => document.pointerLockElement !== null),
          });
          if (retries === 1) for (const frame of evidenceFrames) console.log(`FRAME ${frame}`);
          await shot(`${leg}-defeated-${String(retries)}`);
          await page.waitForTimeout(settleFor(1_200));
          await clickLabel(/^RETRY$/u, "RETRY");
          const back = await waitForText(/^(WAVE 1|THE FIRST DESCENT)$/u, STATE_WAIT_MS, `${leg}: the retried run`);
          assert.equal(back.t, "WAVE 1", "a retry skips the chapter intro already seen this session");
          zeroLeftSince = null;
          continue;
        }
        const leftLabel = frameText.find((entry) => entry.t === "LEFT");
        const leftValue =
          leftLabel &&
          frameText.find(
            (entry) =>
              /^\d+$/u.test(entry.t) &&
              Math.abs(entry.x - leftLabel.x) < 12 &&
              leftLabel.y - entry.y > 4 &&
              leftLabel.y - entry.y < 30,
          );
        lastLeft = leftValue ? Number(leftValue.t) : lastLeft;
        if (lastLeft === 0) {
          zeroLeftSince ??= Date.now();
          if (Date.now() - zeroLeftSince > STUCK_MS) {
            await releaseAll();
            await shot(`${leg}-wave-stuck`);
            throw new Error(
              `${leg}: wave 1 is stuck: the HUD has shown 0 enemies left for ${String(STUCK_MS)} ms and no draft opened (retries ${String(retries)})`,
            );
          }
        } else zeroLeftSince = null;
      }
      const eye = await page.evaluate(() => window.__RELEASE_JOURNEY__.eye);
      const player = eye ? { x: eye.x, y: eye.y + 10.5 * eye.scale } : { x: VIEW.width / 2, y: VIEW.height * 0.8 };
      const enemies = await page.evaluate(scanEnemies, player);
      let target = null,
        best = Infinity;
      for (const enemy of enemies.filter((blob) => looksLikeEnemy(blob, player))) {
        const distance = Math.hypot(enemy.x - player.x, (enemy.y - player.y) * 1.3);
        if (distance < best) {
          best = distance;
          target = enemy;
        }
      }
      const round = (point) =>
        point && [
          Math.round(point.x),
          Math.round(point.y),
          ...(point.w ? [Math.round(point.w), Math.round(point.h)] : []),
        ];
      lastSeen = { eye: eye !== null, player: round(player), blobs: enemies.length, target: round(target) };
      // The swing follows the clock, not the loop count, so a faster or slower runner swings the blade at the same rate.
      sweep = ((Date.now() - loopsFrom) / 1000) * 22;
      loops += 1;
      if (target === null) {
        await hold("KeyA", false);
        await hold("KeyD", false);
        await page.mouse.move(
          player.x + Math.cos(sweep) * 120 * SCALE,
          player.y - 50 * SCALE + Math.sin(sweep) * 60 * SCALE,
        );
        await page.waitForTimeout(pollEvery(30));
        continue;
      }
      const dx = target.x - player.x,
        dy = target.y - player.y,
        direction = Math.sign(dx) || 1;
      const approach = Math.abs(dx) > 150 * SCALE;
      await hold(direction > 0 ? "KeyD" : "KeyA", approach);
      await hold(direction > 0 ? "KeyA" : "KeyD", false);
      if (dy < -120 * SCALE && Math.abs(dx) < 260 * SCALE && sweep % 7 < 1.2) await press("Space", 60);
      const angle = Math.atan2(dy - 8 * SCALE, dx) + Math.sin(sweep) * 1.4,
        radius = 190 * SCALE;
      await page.mouse.move(player.x + Math.cos(angle) * radius, player.y - 8 * SCALE + Math.sin(angle) * radius, {
        steps: 2,
      });
      await page.waitForTimeout(pollEvery(12));
    }
    await releaseAll();
    note("wave 1 cleared; draft open", {
      leg,
      retries,
      fps: await fps(),
      loopHz: +(loops / ((Date.now() - loopsFrom) / 1000)).toFixed(1),
      lock: await page.evaluate(() => ({
        requests: window.__RELEASE_JOURNEY__.lockRequests,
        changes: window.__RELEASE_JOURNEY__.lockChanges,
      })),
    });

    // The draft opens and a mouse click on a card picks it after the settle window.
    await waitForText(/^TAKE ONE/u, STATE_WAIT_MS, `${leg}: draft`);
    await page.waitForTimeout(settleFor(900));
    await shot(`${leg}-draft`);
    const draft = await texts();
    // Card titles: the mid-size text below the header (card layout moves between UI passes).
    const cards = draft
      .filter(
        (entry) =>
          entry.px >= 15 &&
          entry.px <= 26 &&
          entry.y > VIEW.height * 0.15 &&
          entry.y < VIEW.height * 0.8 &&
          !/CLEARED|TAKE ONE|REROLL/u.test(entry.t),
      )
      .sort((left, right) => left.x - right.x);
    assert.ok(
      cards.length >= 2,
      `the draft shows its cards (${draft.map((entry) => `${entry.t}@${String(Math.round(entry.px))}px`).join(", ")})`,
    );
    note("draft cards", { leg, cards: cards.map((entry) => entry.t) });
    await click(cards[0]);
    const deadline = Date.now() + STATE_WAIT_MS;
    let after = [];
    while (Date.now() < deadline) {
      after = await texts();
      if (!has(after, /^TAKE ONE/u) && has(after, /^WAVE 2$/u)) break;
      await page.waitForTimeout(pollEvery(150));
    }
    await shot(`${leg}-after-pick`);
    assert.ok(!has(after, /^TAKE ONE/u), "a mouse click on a draft card picks it");
    assert.ok(has(after, /^WAVE 2$/u), "wave 2 begins after the pick");
    note("picked card; wave 2 began", { leg, card: cards[0].t });
    return retries;
  };

  try {
    await page.goto(`${host.origin}/`, { waitUntil: "domcontentloaded", timeout: STATE_WAIT_MS });
    assertCleanProductionUrl(page.url());
    const debugSurface = await page.evaluate(() =>
      ["__PANTHEON_TEST", "__TEAR_CATALOG_DEBUG__", "__TEAR_TEST_STORAGE__"].filter((name) => name in window),
    );
    assert.deepEqual(debugSurface, [], "the production build must not expose test hooks");

    // TEAR_RELEASE_ADVENTURE_LEGS=mouse or =touch runs one half (default: both).
    const legs = new Set((process.env.TEAR_RELEASE_ADVENTURE_LEGS || "mouse,touch").split(","));
    let retries = 0;
    if (legs.has("mouse")) {
      // Leg 1, fresh profile: the chapter intro plays, wave 1 clears, a draft card is clicked, wave 2 begins.
      await startAdventure("fresh", { tutorialFirst: true });
      await passChapterIntro("fresh");
      retries += await clearWaveOneAndPick("fresh");

      // Leg 2, restart from the pause menu in the same session: the seen chapter is skipped
      // and the run must still progress past wave 1 (the reported stuck wave).
      await press("KeyP", 80);
      await waitForText(/^PAUSED$/u, STATE_WAIT_MS, "restart: pause screen");
      await page.waitForTimeout(settleFor(600));
      await clickLabel(/^RESTART$/u, "restart: RESTART");
      await page.waitForTimeout(settleFor(700));
      const confirm = (await texts()).find(
        (entry) => /^(YES|CONFIRM|RESTART)\b/u.test(entry.t) && !/^RESTART$/u.test(entry.t),
      );
      if (confirm) await click(confirm);
      const restarted = await waitForText(/^(WAVE 1|THE FIRST DESCENT)$/u, STATE_WAIT_MS, "restart: the restarted run");
      assert.equal(restarted.t, "WAVE 1", "a restart in the same session skips the chapter intro already seen");
      note("restart skipped the seen chapter");
      retries += await clearWaveOneAndPick("restart");

      // Leg 3, a new session on the same profile: biome memory is not a seen chapter, so the intro plays again.
      await page.reload({ waitUntil: "domcontentloaded", timeout: STATE_WAIT_MS });
      await startAdventure("new-session");
      await waitForText(/^THE FIRST DESCENT$/u, STATE_WAIT_MS, "new session: chapter I intro");
      await shot("new-session-intro");
      note("new session shows the chapter intro");
    }

    // Leg 4, phones: touch only, on a browser without exitPointerLock.
    const touchViewports = (process.env.TEAR_RELEASE_TOUCH_VIEWPORTS || "844x390").split(",").map((size) => {
      const [width, height] = size.trim().split("x").map(Number);
      return { width, height };
    });
    for (const viewport of legs.has("touch") ? touchViewports : []) {
      await runTouchLeg(browser, host.origin, viewport, shot);
      note("touch: menus tapped, wave 1 reached, the left thumb moved the player", { viewport });
    }

    assert.deepEqual(pageErrors, [], "the journey raised page errors");
    assert.deepEqual(consoleErrors, [], "the journey logged console errors");
    console.log(
      `release Adventure journey passed (${String(retries)} retries, ${((Date.now() - started) / 1000).toFixed(1)} s)`,
    );
  } catch (error) {
    console.error(JSON.stringify({ log, pageErrors, consoleErrors }, null, 2));
    throw error;
  } finally {
    await browser.close();
    await host.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
