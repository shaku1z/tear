// Release Adventure journey: the PRODUCTION build (dist/standalone, clean URL, no
// test storage or debug hooks), a fresh profile and real mouse and keyboard only.
// PLAY -> ADVENTURE -> EASY -> START, the chapter intro waits for input and advances,
// wave 1 is fought and cleared by a small pixel-guided player loop, the draft opens,
// a card is clicked and wave 2 begins. A defeat is retried within the time budget;
// a retry must skip the already-seen chapter and still progress.
//
// Observation (test-side only): canvas text and the player's eye are read from the
// page's own 2D draw calls, enemies from canvas pixels. Nothing in the game is called.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertCleanProductionUrl, serveProductionBuild } = require("./class-c-browser-harness");

const VIEW = Object.freeze({ width: 1280, height: 720 });
const SCALE = VIEW.width / 1600;
const COMBAT_BUDGET_MS = Number(process.env.TEAR_RELEASE_ADVENTURE_BUDGET_MS || 180_000);
const STUCK_MS = 25_000;
const buildRoot = process.env.TEAR_RELEASE_BUILD_DIR
  ? path.resolve(process.env.TEAR_RELEASE_BUILD_DIR)
  : path.resolve(__dirname, "..", "dist", "standalone");
const shotDirectory = process.env.TEAR_JOURNEY_SHOTS ? path.resolve(process.env.TEAR_JOURNEY_SHOTS) : null;
const sleep = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

/** Installed before the game boots: records drawn text and the player's eye per animation frame. */
function installObserver() {
  const observed = { frame: 0, text: [], eye: null, lockRequests: 0, lockChanges: 0 };
  document.addEventListener("pointerlockchange", () => { observed.lockChanges += 1; });
  // The journey aims by absolute pointer position. Under pointer lock the game reads
  // relative movement instead, which headless runners do not report alike (the Linux
  // runner left the blade still), so the capture request is counted and not granted.
  Element.prototype.requestPointerLock = function () { observed.lockRequests += 1; return Promise.resolve(); };
  Object.defineProperty(window, "__RELEASE_JOURNEY__", { value: observed });
  const proto = CanvasRenderingContext2D.prototype;
  const toCss = (context, x, y) => {
    const m = context.getTransform(); const canvas = context.canvas;
    const rect = canvas.getBoundingClientRect(); const ratio = rect.height / canvas.height;
    return { x: rect.left + (m.a * x + m.c * y + m.e) * ratio, y: rect.top + (m.b * x + m.d * y + m.f) * ratio, scale: Math.hypot(m.b, m.d) * ratio };
  };
  const fillText = proto.fillText;
  proto.fillText = function (value, x, y, ...rest) {
    if (this.canvas.id === "game") {
      try {
        const at = toCss(this, x, y); const size = /(\d+(?:\.\d+)?)px/u.exec(this.font);
        const width = this.measureText(String(value)).width * at.scale;
        const left = this.textAlign === "center" ? at.x - width / 2 : this.textAlign === "right" || this.textAlign === "end" ? at.x - width : at.x;
        observed.text.push({ t: String(value), x: left + width / 2, y: at.y, px: size ? Number(size[1]) * at.scale : 0, a: this.globalAlpha, f: observed.frame });
        if (observed.text.length > 8000) observed.text.splice(0, 4000);
      } catch { /* observation must never disturb drawing */ }
    }
    return fillText.call(this, value, x, y, ...rest);
  };
  const fillRect = proto.fillRect;
  proto.fillRect = function (x, y, w, h) {
    // The player's eye is the only 8x5 rectangle drawn in an ordinary stage-one fight.
    if (w === 8 && h === 5 && this.canvas.id === "game") {
      try { const at = toCss(this, x + 4, y + 2.5); observed.eye = { x: at.x, y: at.y, scale: at.scale, f: observed.frame }; } catch { /* ignore */ }
    }
    return fillRect.call(this, x, y, w, h);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((time) => { observed.frame += 1; callback(time); });
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
  const W = 320, H = 180;
  let scratch = window.__RELEASE_JOURNEY_SCAN__;
  if (!scratch) {
    const surface = document.createElement("canvas"); surface.width = W; surface.height = H;
    scratch = { surface, context: surface.getContext("2d", { willReadFrequently: true }) };
    Object.defineProperty(window, "__RELEASE_JOURNEY_SCAN__", { value: scratch });
  }
  scratch.context.drawImage(canvas, 0, 0, W, H);
  const pixels = scratch.context.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    dark[i] = 0.299 * r + 0.587 * g + 0.114 * b < 110 ? 1 : 0;
  }
  let ground = H;
  for (let y = H - 1; y > H / 2; y -= 1) {
    let count = 0; for (let x = 0; x < W; x += 1) count += dark[y * W + x];
    if (count / W > 0.7) ground = y; else break;
  }
  const top = Math.floor(H * 0.16);
  for (let y = 0; y < H; y += 1) {
    if (y < top || y >= ground - 1) { dark.fill(0, y * W, (y + 1) * W); continue; }
    let run = 0;
    for (let x = 0; x <= W; x += 1) {
      if (x < W && dark[y * W + x]) { run += 1; continue; }
      if (run >= 30) dark.fill(0, y * W + x - run, y * W + x);
      run = 0;
    }
  }
  const rect = canvas.getBoundingClientRect(); const cell = rect.width / W;
  const blobs = []; const seen = new Uint8Array(W * H); const stack = [];
  for (let start = 0; start < W * H; start += 1) {
    if (!dark[start] || seen[start]) continue;
    let count = 0, minX = W, maxX = 0, minY = H, maxY = 0; stack.push(start); seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop(); const x = index % W, y = (index - x) / W; count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const next of [index - 1, index + 1, index - W, index + W]) {
        if (next < 0 || next >= W * H || seen[next] || !dark[next] || Math.abs((next % W) - x) > 1) continue;
        seen[next] = 1; stack.push(next);
      }
    }
    if (count < 6 || maxX - minX < 2 || maxY - minY < 2) continue;
    const box = { x: rect.left + (minX + maxX + 1) / 2 * cell, y: rect.top + (minY + maxY + 1) / 2 * cell, w: (maxX - minX + 1) * cell, h: (maxY - minY + 1) * cell };
    if (player && Math.abs(box.x - player.x) < box.w / 2 + 20 && Math.abs(box.y - player.y) < box.h / 2 + 30) continue;
    blobs.push(box);
  }
  return blobs;
}

async function main() {
  assert.ok(fs.existsSync(path.join(buildRoot, "index.html")), `${buildRoot} is missing; run pnpm build:standalone first`);
  if (shotDirectory) fs.mkdirSync(shotDirectory, { recursive: true });
  const host = await serveProductionBuild(buildRoot);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, serviceWorkers: "block" });
  const page = await context.newPage();
  // Diagnostic: slow the page down to imitate a weaker runner.
  const throttle = Number(process.env.TEAR_RELEASE_ADVENTURE_CPU_THROTTLE || 1);
  if (throttle > 1) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: throttle });
  const pageErrors = [], consoleErrors = [], log = [];
  const started = Date.now();
  const note = (step, detail = {}) => { const entry = { s: +((Date.now() - started) / 1000).toFixed(1), step, ...detail }; log.push(entry); console.log(JSON.stringify(entry)); };
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource/u.test(message.text())) consoleErrors.push(message.text()); });
  await page.route("**/*", (route) => route.request().url().startsWith(`${host.origin}/`) ? route.continue() : route.abort());
  await page.addInitScript(installObserver);
  let shots = 0;
  const shot = async (name) => { if (shotDirectory) await page.screenshot({ path: path.join(shotDirectory, `${String(++shots).padStart(2, "0")}-${name}.png`) }); };
  const texts = (frames = 2) => page.evaluate((count) => {
    const observed = window.__RELEASE_JOURNEY__; const latest = new Map();
    for (const entry of observed.text) if (entry.f >= observed.frame - count && entry.a > 0.05) latest.set(`${entry.t}|${Math.round(entry.x)}|${Math.round(entry.y)}`, entry);
    return [...latest.values()];
  }, frames);
  const has = (list, pattern) => list.some((entry) => pattern.test(entry.t));
  const press = async (code, holdMs = 70) => { await page.keyboard.down(code); await sleep(holdMs); await page.keyboard.up(code); };
  const click = async (point) => {
    await page.mouse.move(point.x, point.y, { steps: 4 }); await sleep(160);
    await page.mouse.down(); await sleep(70); await page.mouse.up();
  };
  const waitForText = async (pattern, timeout, what) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const hit = (await texts()).find((entry) => pattern.test(entry.t));
      if (hit) return hit;
      await sleep(100);
    }
    await shot(`missing-${what}`);
    throw new Error(`${what}: ${String(pattern)} did not appear within ${String(timeout)} ms`);
  };
  const clickLabel = async (pattern, what) => { const hit = await waitForText(pattern, 15_000, what); await click(hit); return hit; };

  const startAdventure = async (leg) => {
    await waitForText(/^PLAY$/u, 40_000, `${leg}: main menu`); await sleep(800);
    await clickLabel(/^PLAY$/u, `${leg}: PLAY`); await sleep(900);
    await clickLabel(/^ADVENTURE$/u, `${leg}: Adventure mode`); await sleep(400);
    await clickLabel(/^EASY$/u, `${leg}: Easy difficulty`); await sleep(400);
    await shot(`${leg}-setup`);
    await clickLabel(/^START$/u, `${leg}: START`);
    note("started adventure", { leg });
  };

  /** The chapter intro appears, waits for the player, and advances by clicks to wave 1. */
  const passChapterIntro = async (leg) => {
    await waitForText(/^THE FIRST DESCENT$/u, 15_000, `${leg}: chapter I intro`);
    await sleep(500); await shot(`${leg}-chapter-intro`);
    await sleep(3_500);
    let opening = await texts();
    assert.ok(!has(opening, /^WAVE \d+$/u), "the chapter intro must wait for input before the first wave");
    note("chapter intro holds without input", { leg });
    let advances = 0; const beats = new Set();
    for (; advances < 20; advances += 1) {
      opening = await texts();
      for (const entry of opening) if (entry.t.length > 3 && entry.px >= 14) beats.add(entry.t);
      if (has(opening, /^WAVE 1$/u)) break;
      await click({ x: VIEW.width / 2, y: VIEW.height * 0.55 });
      await sleep(1_100);
    }
    await waitForText(/^WAVE 1$/u, 20_000, `${leg}: wave 1 after the chapter intro`);
    assert.ok(advances >= 2, `the chapter intro advanced by input (${String(advances)} clicks)`);
    note("chapter intro advanced", { leg, clicks: advances, beats: [...beats].slice(0, 12),
      device: await page.evaluate(() => ({ cores: navigator.hardwareConcurrency, touchPoints: navigator.maxTouchPoints,
        coarse: matchMedia("(pointer: coarse)").matches, anyCoarse: matchMedia("(any-pointer: coarse)").matches,
        hover: matchMedia("(hover: hover)").matches, touchEvents: "ontouchstart" in window })),
      hints: opening.filter((entry) => /move|blade|throw|dash/iu.test(entry.t)).map((entry) => entry.t).slice(0, 6) });
    await shot(`${leg}-wave-1`);
  };

  /** Fights wave 1 until its draft opens, clicks a card and expects wave 2. Returns the retries used. */
  const clearWaveOneAndPick = async (leg) => {
    // Fight wave 1 until its draft opens; retry a defeat inside the budget.
    const combatDeadline = Date.now() + COMBAT_BUDGET_MS;
    const held = new Set();
    const hold = async (code, on) => {
      if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
      if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
    };
    const releaseAll = async () => { for (const code of [...held]) await hold(code, false); };
    let loops = 0, loopsFrom = Date.now(), sweep, retries = 0, zeroLeftSince = null, lastLeft = null, lastText = 0, frameText, lastSeen = null;
    // Real-time play depends on the runner: report the frame rate the game reached.
    const frameOf = () => page.evaluate(() => window.__RELEASE_JOURNEY__.frame);
    let fpsFrom = { at: Date.now(), frame: await frameOf() };
    const fps = async () => { const now = { at: Date.now(), frame: await frameOf() };
      const value = +((now.frame - fpsFrom.frame) / Math.max(0.001, (now.at - fpsFrom.at) / 1000)).toFixed(1); fpsFrom = now; return value; };
    // The first lost attempt prints two small mid-fight frames into the log, so a
    // runner-only failure can be seen without artifacts.
    const attemptStarted = Date.now(), evidenceFrames = [];
    for (;;) {
      if (retries === 0 && evidenceFrames.length < 2 && Date.now() - attemptStarted > 4_000 * (evidenceFrames.length + 1)) {
        evidenceFrames.push((await page.screenshot({ type: "jpeg", quality: 35 })).toString("base64"));
      }
      if (Date.now() > combatDeadline) {
        await shot(`${leg}-budget-exhausted`);
        throw new Error(`${leg}: wave 1 was not cleared within ${String(COMBAT_BUDGET_MS)} ms (retries ${String(retries)}, enemies left ${String(lastLeft)}, ${String(await fps())} fps)`);
      }
      if (Date.now() - lastText > 250) {
        lastText = Date.now(); frameText = await texts(1);
        if (has(frameText, /^TAKE ONE/u) || has(frameText, /^WAVE 1 CLEARED$/u)) break;
        if (has(frameText, /^DEFEATED$/u)) {
          await releaseAll(); retries += 1; note("defeated; retrying", { leg, retries, fps: await fps(), loopHz: +(loops / ((Date.now() - loopsFrom) / 1000)).toFixed(1), seen: lastSeen,
            pointerLocked: await page.evaluate(() => document.pointerLockElement !== null) });
          if (retries === 1) for (const frame of evidenceFrames) console.log(`FRAME ${frame}`); await shot(`${leg}-defeated-${String(retries)}`);
          await sleep(1_200); await clickLabel(/^RETRY$/u, "RETRY");
          const back = await waitForText(/^(WAVE 1|THE FIRST DESCENT)$/u, 20_000, `${leg}: the retried run`);
          assert.equal(back.t, "WAVE 1", "a retry skips the chapter intro already seen this session");
          zeroLeftSince = null; continue;
        }
        const leftLabel = frameText.find((entry) => entry.t === "LEFT");
        const leftValue = leftLabel && frameText.find((entry) => /^\d+$/u.test(entry.t) && Math.abs(entry.x - leftLabel.x) < 12 && leftLabel.y - entry.y > 4 && leftLabel.y - entry.y < 30);
        lastLeft = leftValue ? Number(leftValue.t) : lastLeft;
        if (lastLeft === 0) {
          zeroLeftSince ??= Date.now();
          if (Date.now() - zeroLeftSince > STUCK_MS) {
            await releaseAll(); await shot(`${leg}-wave-stuck`);
            throw new Error(`${leg}: wave 1 is stuck: the HUD has shown 0 enemies left for ${String(STUCK_MS)} ms and no draft opened (retries ${String(retries)})`);
          }
        } else zeroLeftSince = null;
      }
      const eye = await page.evaluate(() => window.__RELEASE_JOURNEY__.eye);
      const player = eye ? { x: eye.x, y: eye.y + 10.5 * eye.scale } : { x: VIEW.width / 2, y: VIEW.height * 0.8 };
      const enemies = await page.evaluate(scanEnemies, player);
      let target = null, best = Infinity;
      for (const enemy of enemies.filter((blob) => looksLikeEnemy(blob, player))) { const distance = Math.hypot(enemy.x - player.x, (enemy.y - player.y) * 1.3); if (distance < best) { best = distance; target = enemy; } }
      const round = (point) => point && [Math.round(point.x), Math.round(point.y), ...(point.w ? [Math.round(point.w), Math.round(point.h)] : [])];
      lastSeen = { eye: eye !== null, player: round(player), blobs: enemies.length, target: round(target) };
      // The swing follows the clock, not the loop count, so a faster or slower runner swings the blade at the same rate.
      sweep = (Date.now() - loopsFrom) / 1000 * 22; loops += 1;
      if (target === null) {
        await hold("KeyA", false); await hold("KeyD", false);
        await page.mouse.move(player.x + Math.cos(sweep) * 120 * SCALE, player.y - 50 * SCALE + Math.sin(sweep) * 60 * SCALE);
        await sleep(30); continue;
      }
      const dx = target.x - player.x, dy = target.y - player.y, direction = Math.sign(dx) || 1;
      const approach = Math.abs(dx) > 150 * SCALE;
      await hold(direction > 0 ? "KeyD" : "KeyA", approach); await hold(direction > 0 ? "KeyA" : "KeyD", false);
      if (dy < -120 * SCALE && Math.abs(dx) < 260 * SCALE && sweep % 7 < 1.2) await press("Space", 60);
      const angle = Math.atan2(dy - 8 * SCALE, dx) + Math.sin(sweep) * 1.4, radius = 190 * SCALE;
      await page.mouse.move(player.x + Math.cos(angle) * radius, player.y - 8 * SCALE + Math.sin(angle) * radius, { steps: 2 });
      await sleep(12);
    }
    await releaseAll();
    note("wave 1 cleared; draft open", { leg, retries, fps: await fps(), loopHz: +(loops / ((Date.now() - loopsFrom) / 1000)).toFixed(1),
      lock: await page.evaluate(() => ({ requests: window.__RELEASE_JOURNEY__.lockRequests, changes: window.__RELEASE_JOURNEY__.lockChanges })) });

    // The draft opens and a mouse click on a card picks it after the settle window.
    await waitForText(/^TAKE ONE/u, 5_000, `${leg}: draft`);
    await sleep(900); await shot(`${leg}-draft`);
    const draft = await texts();
    // Card titles: the mid-size text below the header (card layout moves between UI passes).
    const cards = draft.filter((entry) => entry.px >= 15 && entry.px <= 26 && entry.y > VIEW.height * 0.15 && entry.y < VIEW.height * 0.8
      && !/CLEARED|TAKE ONE|REROLL/u.test(entry.t)).sort((left, right) => left.x - right.x);
    assert.ok(cards.length >= 2, `the draft shows its cards (${draft.map((entry) => `${entry.t}@${String(Math.round(entry.px))}px`).join(", ")})`);
    note("draft cards", { leg, cards: cards.map((entry) => entry.t) });
    await click(cards[0]);
    const deadline = Date.now() + 8_000; let after = [];
    while (Date.now() < deadline) {
      after = await texts();
      if (!has(after, /^TAKE ONE/u) && has(after, /^WAVE 2$/u)) break;
      await sleep(150);
    }
    await shot(`${leg}-after-pick`);
    assert.ok(!has(after, /^TAKE ONE/u), "a mouse click on a draft card picks it");
    assert.ok(has(after, /^WAVE 2$/u), "wave 2 begins after the pick");
    note("picked card; wave 2 began", { leg, card: cards[0].t });
    return retries;
  };

  try {
    await page.goto(`${host.origin}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    const debugSurface = await page.evaluate(() => ["__PANTHEON_TEST", "__TEAR_CATALOG_DEBUG__", "__TEAR_TEST_STORAGE__"].filter((name) => name in window));
    assert.deepEqual(debugSurface, [], "the production build must not expose test hooks");

    // Leg 1, fresh profile: the chapter intro plays, wave 1 clears, a draft card is clicked, wave 2 begins.
    await startAdventure("fresh");
    await passChapterIntro("fresh");
    let retries = await clearWaveOneAndPick("fresh");

    // Leg 2, restart from the pause menu in the same session: the seen chapter is skipped
    // and the run must still progress past wave 1 (the reported stuck wave).
    await press("KeyP", 80);
    await waitForText(/^PAUSED$/u, 5_000, "restart: pause screen"); await sleep(600);
    await clickLabel(/^RESTART$/u, "restart: RESTART");
    await sleep(700);
    const confirm = (await texts()).find((entry) => /^(YES|CONFIRM|RESTART)\b/u.test(entry.t) && !/^RESTART$/u.test(entry.t));
    if (confirm) await click(confirm);
    const restarted = await waitForText(/^(WAVE 1|THE FIRST DESCENT)$/u, 20_000, "restart: the restarted run");
    assert.equal(restarted.t, "WAVE 1", "a restart in the same session skips the chapter intro already seen");
    note("restart skipped the seen chapter");
    retries += await clearWaveOneAndPick("restart");

    // Leg 3, a new session on the same profile: biome memory is not a seen chapter, so the intro plays again.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await startAdventure("new-session");
    await waitForText(/^THE FIRST DESCENT$/u, 15_000, "new session: chapter I intro");
    await shot("new-session-intro");
    note("new session shows the chapter intro");

    assert.deepEqual(pageErrors, [], "the journey raised page errors");
    assert.deepEqual(consoleErrors, [], "the journey logged console errors");
    console.log(`release Adventure journey passed (${String(retries)} retries, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (error) {
    console.error(JSON.stringify({ log, pageErrors, consoleErrors }, null, 2));
    throw error;
  } finally {
    await browser.close();
    await host.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
