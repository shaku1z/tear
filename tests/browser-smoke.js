const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { listenOnFreePort } = require("./local-server");
const path = require("node:path");
const {
  STATE_WAIT_MS,
  chooseOnSetup,
  clickTarget,
  pollEvery,
  settleFor,
  launchJourney,
  startFromSetup,
  waitForSetup,
} = require("./browser-waits");
const { TUTORIAL_SKIPPED_STORAGE } = require("./browser-journey-harness");

(async () => {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
  // Set once the server listens on a free port (tests/local-server.js).
  let baseUrl = "http://127.0.0.1";
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, rel);
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
  ({ origin: baseUrl } = await listenOnFreePort(server));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await launchJourney(chromium, {
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(`${baseUrl}/`)) route.continue();
    else route.abort();
  });
  const pageErrors = [];
  const browserLogs = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  // A console "Failed to load resource" names no URL; record which request failed and why.
  page.on("requestfailed", (request) =>
    browserLogs.push(`request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`),
  );
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      browserLogs.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, {
    waitUntil: "domcontentloaded",
    timeout: STATE_WAIT_MS,
  });
  try {
    await page.waitForFunction(() => window.__TEAR_BUILD__ && window.__TEAR_CATALOG_DEBUG__);
  } catch (error) {
    assert.fail(`Tear did not finish booting: ${pageErrors.join("\n") || error.message}`);
  }
  try {
    await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__.snapshot().frame.samples > 0);
  } catch (error) {
    assert.fail(`Tear frame loop did not start: ${pageErrors.join("\n") || browserLogs.join("\n") || error.message}`);
  }
  const snapshot = await page.evaluate(() => ({
    weapons: window.__TEAR_CATALOG_DEBUG__.weapons,
    abilities: window.__TEAR_CATALOG_DEBUG__.abilities,
    audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
    diagnostics: window.__TEAR_DIAGNOSTICS__.snapshot(),
    diagnosticsFrozen: Object.isFrozen(window.__TEAR_DIAGNOSTICS__),
    canvas: { width: document.querySelector("canvas").width, height: document.querySelector("canvas").height },
  }));
  assert.equal(snapshot.weapons.map((weapon) => weapon.id).join(","), "sword,hammer,greatsword,chainblade,riftlock");
  assert.equal(new Set(snapshot.weapons.map((weapon) => weapon.throwIdentity)).size, 5);
  assert.equal(snapshot.abilities.sort().join(","), "Overrun,Sever,Stormbank");
  assert.equal(snapshot.audio.settings.masterVolume, 0.6);
  assert.equal(snapshot.audio.settings.musicVolume, 0.5);
  assert.equal(snapshot.audio.settings.sfxVolume, 1);
  assert.equal(snapshot.audio.settings.interfaceVolume, 1);
  assert.equal(snapshot.diagnosticsFrozen, true);
  assert.ok(snapshot.diagnostics.frame.samples > 0);
  assert.deepEqual(Object.keys(snapshot.diagnostics.gauges), ["effects", "enemies", "projectiles"]);
  assert.ok(snapshot.canvas.width > 0 && snapshot.canvas.height > 0);
  assert.equal(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen), "menu");
  await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.startRecording());
  await page.keyboard.down("d");
  const keyboardDown = await page.evaluate(() => ({
    snapshot: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
    actions: window.__TEAR_CATALOG_DEBUG__.input.drain(1),
  }));
  assert.equal(keyboardDown.snapshot.mode, "keyboard");
  assert.ok(keyboardDown.snapshot.held.includes("KeyD"));
  assert.deepEqual(
    keyboardDown.actions.map((entry) => entry.command),
    [{ type: "move", x: 1000, y: 0 }],
  );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const focusRelease = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(2));
  assert.deepEqual(
    focusRelease.map((entry) => entry.command),
    [{ type: "move", x: 0, y: 0 }],
  );
  await page.keyboard.up("d");
  const keyboardUp = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(3));
  assert.deepEqual(keyboardUp, []);
  await page.mouse.click(800, 450, { button: "right" });
  const pointerSecondary = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(4));
  assert.deepEqual(
    pointerSecondary.map((entry) => entry.command),
    [{ type: "weapon", intent: "throw", phase: "pressed" }],
  );
  await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.stopRecording());

  // Exercise the real shell controls, including the contextual Settings return.
  // Every click the page receives is recorded, so a screen that never changes can say whether the
  // click reached the canvas, which element took it, and what the page logged meanwhile.
  await page.evaluate(() => {
    window.__SMOKE_CLICKS__ = [];
    window.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        window.__SMOKE_CLICKS__.push({
          x: event.clientX,
          y: event.clientY,
          target: target ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}` : String(event.target),
          screen: window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen,
        });
      },
      true,
    );
  });
  const waitForScreen = async (screen) => {
    try {
      await page.waitForFunction(
        (expected) => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen === expected,
        screen,
      );
    } catch (error) {
      const actual = await page.evaluate(() => {
        const canvas = document.getElementById("game")?.getBoundingClientRect();
        return {
          app: window.__TEAR_CATALOG_DEBUG__.app.snapshot(),
          lastClicks: window.__SMOKE_CLICKS__.slice(-3),
          // What a click is matched against on the latest drawn frame.
          targets: window.__TEAR_UI_TARGETS__?.() ?? "not exposed",
          canvas: canvas && { x: canvas.x, y: canvas.y, w: canvas.width, h: canvas.height },
        };
      });
      throw new Error(
        `Expected screen ${screen}; received ${JSON.stringify(actual)}\n` +
          `page errors: ${pageErrors.join("\n") || "none"}\nconsole: ${browserLogs.join("\n") || "none"}`,
        { cause: error },
      );
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  // A fresh profile is tutorial-first: PLAY starts the tutorial. Skipping it on purpose, on the
  // quit confirm that the pause's MAIN MENU opens, opens the run setup with Adventure selected,
  // and PLAY no longer leads into it.
  await clickTarget(page, "menu", "PLAY");
  await waitForScreen("playing");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().mode), "tutorial");
  await page.keyboard.press("p");
  await waitForScreen("paused");
  await clickTarget(page, "paused", "MAIN MENU");
  await waitForScreen("confirmquit");
  await clickTarget(page, "confirmquit", "SKIP TUTORIAL");
  await waitForScreen("setup");
  assert.equal(await page.evaluate(() => window.__TEAR_SETUP__().mode), "campaign");
  // This journey plays Endless, as a player would pick it.
  await chooseOnSetup(page, "ENDLESS", { mode: "endless" });
  await startFromSetup(page);
  await waitForScreen("playing");
  try {
    await page.waitForFunction(
      () => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().backend === "stem-cue:biome-routed",
    );
  } catch (error) {
    const failedAudio = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.fail(
      `Default biome-stem backend did not become active: ${JSON.stringify(failedAudio)}\n${browserLogs.join("\n") || error.message}`,
    );
  }
  try {
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().score.run?.runId);
  } catch (error) {
    const failedRun = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.fail(
      `TearScore run did not start: ${JSON.stringify(failedRun)}\n${browserLogs.join("\n") || error.message}`,
    );
  }
  const firstMusicRun = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
  assert.equal(firstMusicRun.backend, "stem-cue:biome-routed");
  assert.equal(firstMusicRun.score.enabled, false);
  assert.equal(firstMusicRun.score.reason, "not-recorded");
  assert.ok(firstMusicRun.score.run?.runId);
  await page.keyboard.press("p");
  await waitForScreen("paused");
  await clickTarget(page, "paused", "SETTINGS");
  await waitForScreen("settings");
  assert.equal(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().back), "paused");
  await clickTarget(page, "settings", "BACK");
  await waitForScreen("paused");
  await clickTarget(page, "paused", "RESUME");
  await waitForScreen("playing");
  await page.keyboard.press("p");
  await waitForScreen("paused");
  await clickTarget(page, "paused", "MAIN MENU");
  await waitForScreen("confirmquit");
  await clickTarget(page, "confirmquit", "QUIT");
  await waitForScreen("menu");
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().score.run === null);
  console.log("application state flow passed");
  // The test build's storage starts fresh on every page load, so the skip above does not outlive
  // the reloads below; from here on the page plays as a player who skipped the tutorial.
  await page.addInitScript((storage) => {
    window.__TEAR_TEST_STORAGE__ = storage;
  }, TUTORIAL_SKIPPED_STORAGE);

  await page.evaluate(() => window.__PANTHEON_TEST.startMode("campaign"));
  await page.waitForFunction(
    () => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG().lifecycle.phase === "wave-prepared",
  );
  const campaignLifecycle = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().lifecycle);
  assert.equal(campaignLifecycle.activationDeferred, true, "campaign opening lore defers prepared-wave activation");

  await page.reload({ timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__);
  await clickTarget(page, "menu", "PLAY"); // setup/war table (renders all five weapon cards)
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running");
  await waitForSetup(page, { ready: true });
  if (process.env.TEAR_SCREENSHOT) await page.screenshot({ path: process.env.TEAR_SCREENSHOT });
  const weaponIds = ["sword", "hammer", "greatsword", "chainblade", "riftlock"];
  async function pulseThrowUntilLaunched(expectedThrows) {
    let snapshot = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await page.mouse.click(800, 450, { button: "right" });
      await page.waitForTimeout(pollEvery(80));
      snapshot = await page.evaluate(() => {
        const weapon = window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG();
        if (weapon) weapon.input = window.__TEAR_CATALOG_DEBUG__.input.snapshot();
        return weapon;
      });
      if (snapshot && snapshot.stats.throws >= expectedThrows) return snapshot;
    }
    return snapshot;
  }
  for (let i = 0; i < weaponIds.length; i++) {
    if (i > 0) {
      await page.reload({ timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__);
      await clickTarget(page, "menu", "PLAY");
    }
    await chooseOnSetup(page, weaponIds[i], { weapon: weaponIds[i] });
    // A skipped tutorial preselects Adventure. Choosing Endless must keep the weapon chosen above.
    await chooseOnSetup(page, "ENDLESS", { mode: "endless", weapon: weaponIds[i] });
    await startFromSetup(page);
    await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.()?.lifecycle.phase === "wave-active", undefined, {
      timeout: STATE_WAIT_MS,
    });
    const debug = await page.evaluate(() => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG());
    assert.equal(
      debug && debug.weapon,
      weaponIds[i],
      `${weaponIds[i]} run starts cleanly; page errors: ${pageErrors.join(" | ")}`,
    );
    assert.equal(
      debug && debug.lifecycle.phase,
      "wave-active",
      `${weaponIds[i]} run lifecycle activates its prepared wave`,
    );
    const thrown = await pulseThrowUntilLaunched(1);
    assert.ok(
      thrown.stats.throws >= 1,
      `${weaponIds[i]} throw launches through shared input (${JSON.stringify({ blade: thrown.blade, input: thrown.input, pageErrors })})`,
    );
    await page.mouse.click(800, 450, { button: "right" });
    await page.waitForTimeout(settleFor(180));
    console.log(`${weaponIds[i]} start passed`);
  }
  assert.deepEqual(pageErrors, []);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("browser smoke passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
