const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
  const port = Number(process.env.TEAR_TEST_PORT || 8123);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
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
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") browserLogs.push(`${message.type()}: ${message.text()}`);
  });
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
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
  assert.equal(snapshot.weapons.map((weapon) => weapon.id).join(","), "sword,hammer,spear,chainblade,ringblade");
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
  assert.deepEqual(keyboardDown.actions.map((entry) => entry.command), [{ type: "move", x: 1000, y: 0 }]);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const focusRelease = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(2));
  assert.deepEqual(focusRelease.map((entry) => entry.command), [{ type: "move", x: 0, y: 0 }]);
  await page.keyboard.up("d");
  const keyboardUp = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(3));
  assert.deepEqual(keyboardUp, []);
  await page.mouse.click(800, 450, { button: "right" });
  const pointerSecondary = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.drain(4));
  assert.deepEqual(pointerSecondary.map((entry) => entry.command), [
    { type: "weapon", intent: "throw", phase: "pressed" },
  ]);
  await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.input.stopRecording());

  // Exercise the real shell controls, including the contextual Settings return.
  const waitForScreen = async (screen) => {
    await page.waitForFunction(
      (expected) => window.__TEAR_CATALOG_DEBUG__.app.snapshot().screen === expected,
      screen,
    );
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await page.mouse.click(260, 360); // PLAY
  await waitForScreen("setup");
  await page.mouse.click(800, 758); // BEGIN
  await waitForScreen("playing");
  try {
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().backend?.startsWith("tear-score@"));
  } catch (error) {
    const failedAudio = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.fail(`TearScore did not become active: ${JSON.stringify(failedAudio)}\n${browserLogs.join("\n") || error.message}`);
  }
  try {
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().score.run?.runId);
  } catch (error) {
    const failedRun = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.fail(`TearScore run did not start: ${JSON.stringify(failedRun)}\n${browserLogs.join("\n") || error.message}`);
  }
  const firstMusicRun = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
  assert.equal(firstMusicRun.score.enabled, true);
  assert.ok(firstMusicRun.score.run?.runId);
  await page.keyboard.press("p");
  await waitForScreen("paused");
  await page.mouse.click(300, 370); // SETTINGS (third pause action)
  await waitForScreen("settings");
  assert.equal(await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.app.snapshot().settingsReturn), "paused");
  await page.mouse.click(800, 840); // BACK TO PAUSE
  await waitForScreen("paused");
  await page.mouse.click(300, 235); // RESUME
  await waitForScreen("playing");
  await page.keyboard.press("p");
  await waitForScreen("paused");
  await page.mouse.click(300, 430); // MAIN MENU
  await waitForScreen("confirmquit");
  await page.mouse.click(650, 378); // QUIT
  await waitForScreen("menu");
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().score.run === null);
  console.log("application state flow passed");

  await page.evaluate(() => window.__PANTHEON_TEST.startMode("campaign"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG().lifecycle.phase === "wave-prepared");
  const campaignLifecycle = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().lifecycle);
  assert.equal(campaignLifecycle.activationDeferred, true, "campaign opening lore defers prepared-wave activation");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__);
  await page.mouse.click(260, 360); // PLAY -> setup/war table (renders all five weapon cards)
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running");
  await page.waitForTimeout(500);
  if (process.env.TEAR_SCREENSHOT) await page.screenshot({ path: process.env.TEAR_SCREENSHOT });
  const weaponIds = ["sword", "hammer", "spear", "chainblade", "ringblade"];
  async function pulseThrowUntilLaunched(expectedThrows) {
    let snapshot = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      await page.mouse.click(800, 450, { button: "right" });
      await page.waitForTimeout(80);
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
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__);
      await page.mouse.click(260, 360);
      await page.waitForTimeout(450);
    }
    await page.mouse.click(1180, 200 + i * 78);
    await page.waitForTimeout(80);
    await page.mouse.click(800, 758);
    await page.waitForTimeout(500);
    const debug = await page.evaluate(() => window.TEAR_WEAPON_DEBUG && window.TEAR_WEAPON_DEBUG());
    assert.equal(debug && debug.weapon, weaponIds[i], `${weaponIds[i]} run starts cleanly; page errors: ${pageErrors.join(" | ")}`);
    assert.equal(debug && debug.lifecycle.phase, "wave-active", `${weaponIds[i]} run lifecycle activates its prepared wave`);
    const thrown = await pulseThrowUntilLaunched(1);
    assert.ok(thrown.stats.throws >= 1, `${weaponIds[i]} throw launches through shared input (${JSON.stringify({ blade: thrown.blade, input: thrown.input, pageErrors })})`);
    await page.mouse.click(800, 450, { button: "right" });
    await page.waitForTimeout(180);
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
