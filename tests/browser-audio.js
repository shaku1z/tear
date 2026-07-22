const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const headedVisibility = process.env.TEAR_HEADED_VISIBILITY === "1";

async function assertVisibilityLifecycle(page, baseline) {
  if (headedVisibility) {
    const occludingPage = await page.context().newPage();
    await occludingPage.goto("about:blank");
    await occludingPage.bringToFront();
    try {
      await page.waitForFunction(({ hidden }) => {
        const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
        return document.visibilityState === "hidden"
          && resources.visibilityTransitions.hidden > hidden
          && resources.system.temporaryMuteReasons.includes("visibility");
      }, baseline, { timeout: 3_000 });
    } catch (error) {
      const observed = await page.evaluate(() => {
        const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
        return {
          visibilityState: document.visibilityState,
          hidden: document.hidden,
          transitions: resources.visibilityTransitions,
          muteReasons: resources.system.temporaryMuteReasons,
        };
      });
      throw new Error(`headed Chrome did not hide the game tab: ${JSON.stringify(observed)}`, { cause: error });
    }
    await page.bringToFront();
    await page.waitForFunction(({ visible }) => {
      const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
      return document.visibilityState === "visible"
        && resources.visibilityTransitions.visible > visible
        && !resources.system.temporaryMuteReasons.includes("visibility");
    }, baseline, { timeout: 10_000 });
    await occludingPage.close();
    return;
  }

  // Local headless Chrome does not model tab occlusion. CI runs the headed branch
  // under Xvfb; this explicit simulation keeps local contracts portable.
  const setSimulatedVisibility = async (hidden) => page.evaluate((nextHidden) => {
    Object.defineProperties(document, {
      hidden: { configurable: true, get: () => nextHidden },
      visibilityState: { configurable: true, get: () => nextHidden ? "hidden" : "visible" },
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
  await setSimulatedVisibility(true);
  await page.waitForFunction(({ hidden }) => {
    const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
    return document.visibilityState === "hidden"
      && resources.visibilityTransitions.hidden > hidden
      && resources.system.temporaryMuteReasons.includes("visibility");
  }, baseline);
  await setSimulatedVisibility(false);
  await page.waitForFunction(({ visible }) => {
    const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
    return document.visibilityState === "visible"
      && resources.visibilityTransitions.visible > visible
      && !resources.system.temporaryMuteReasons.includes("visibility");
  }, baseline);
}

(async () => {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  const port = Number(process.env.TEAR_AUDIO_TEST_PORT || 8125);
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const rel = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: !headedVisibility,
    ...(headedVisibility ? {
      ignoreDefaultArgs: ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
    } : {}),
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  try {
    const gameContext = await browser.newContext();
    const page = await gameContext.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
    await page.addInitScript(() => {
      localStorage.setItem("tear_settings", JSON.stringify({
        vol: 0.75,
        music: true,
        musicVolume: 0.35,
        sfxVolume: 0.8,
        interfaceVolume: 0.45,
      }));
      const NativeAudioContext = window.AudioContext;
      window.__tearAudioContextCount = 0;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__tearAudioContextCount++;
        }
      };
    });
    await page.route("**/*", (route) => {
      if (route.request().url().startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, { timeout: 20000 });

    const before = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(before.state, "awaiting-user-activation");
    assert.equal(before.settings.masterVolume, 0.75);
    assert.equal(before.settings.musicVolume, 0.35);
    assert.equal(before.settings.sfxVolume, 0.8);
    assert.equal(before.settings.interfaceVolume, 0.45);

    // Modifier keys satisfy the browser activation gate without dispatching a
    // menu command into the canvas UI beneath the pointer.
    await page.keyboard.press("Shift");
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20000 });
    await page.keyboard.press("Shift");
    await page.keyboard.press("Control");
    const after = await page.evaluate(() => ({
      audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
      contexts: window.__tearAudioContextCount,
    }));
    assert.equal(after.contexts, 1);
    assert.equal(after.audio.backend, "tear-score@0.1.0-alpha.1");
    assert.equal(after.audio.resources.lifecycleInstalled, true);
    assert.equal(after.audio.resources.lifecycleListeners, 4);
    assert.deepEqual(after.audio.resources.system, {
      contexts: 1,
      mixerNodes: 8,
      effectsBackendNodes: 15,
      temporaryMuteReasons: [],
    });
    assert.ok(after.audio.resources.activeVoices <= after.audio.resources.voiceCap);

    const lifecycleBefore = after.audio.resources.visibilityTransitions;
    await assertVisibilityLifecycle(page, lifecycleBefore);
    if (headedVisibility) console.log("headed visibility lifecycle passed");

    await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.exerciseRoutes());
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources.activeVoices === 0);
    const resourceBaseline = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources);
    assert.ok(resourceBaseline.routeDispatches.weapons > 0);
    assert.ok(resourceBaseline.routeDispatches.enemies > 0);
    assert.ok(resourceBaseline.routeDispatches.player > 0);
    assert.ok(resourceBaseline.routeDispatches.environment > 0);
    assert.equal(resourceBaseline.activeVoiceGraphNodes, 0);
    assert.equal(resourceBaseline.legacySequencer.running, false);

    const publishedModes = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"];
    for (const mode of publishedModes) {
      await page.evaluate((selectedMode) => window.__PANTHEON_TEST.startMode(selectedMode), mode);
      await page.waitForFunction((selectedMode) => {
        const current = window.__PANTHEON_TEST.state();
        return current.game === "playing" && current.mode === selectedMode;
      }, mode);
      await page.waitForTimeout(150);
    }
    const repeated = await page.evaluate(() => ({
      audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
      contexts: window.__tearAudioContextCount,
    }));
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources.activeVoices === 0);
    const settledRepeated = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(repeated.contexts, 1, "repeated runs retain one host-owned AudioContext");
    assert.equal(settledRepeated.resources.activeVoiceGraphNodes, 0, "scheduled voice nodes are released");
    assert.equal(settledRepeated.resources.lifecycleListeners, resourceBaseline.lifecycleListeners,
      "repeated runs do not add lifecycle listeners");
    assert.equal(settledRepeated.resources.legacySequencer.running, resourceBaseline.legacySequencer.running,
      "repeated runs do not add owned timers");
    assert.deepEqual(settledRepeated.resources.system, resourceBaseline.system,
      "repeated runs do not add contexts, mixer nodes, or backend nodes");
    assert.deepEqual(pageErrors, []);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "disposed");
    const disposed = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources);
    assert.equal(disposed.lifecycleListeners, 0);
    assert.equal(disposed.activeVoices, 0);
    assert.equal(disposed.activeVoiceGraphNodes, 0);
    assert.equal(disposed.legacySequencer.running, false);
    assert.deepEqual(disposed.system, {
      contexts: 0,
      mixerNodes: 0,
      effectsBackendNodes: 0,
      temporaryMuteReasons: [],
    });

    const fallback = await browser.newPage();
    const fallbackErrors = [];
    fallback.on("pageerror", (error) => fallbackErrors.push(error.stack || error.message));
    await fallback.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("/vendor/tear-score/")) route.abort("failed");
      else if (url.startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await fallback.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await fallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, { timeout: 20000 });
    await fallback.keyboard.press("Shift");
    await fallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20000 });
    const fallbackAudio = await fallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(fallbackAudio.backend, "legacy-synth", "blocked TearScore assets select the exclusive legacy fallback");
    assert.equal(fallbackAudio.resources.legacySequencer.running, true);
    assert.equal(fallbackAudio.resources.system.effectsBackendNodes, 15);
    await fallback.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    await fallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "disposed");
    const fallbackDisposed = await fallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources);
    assert.equal(fallbackDisposed.legacySequencer.running, false, "fallback interval is cleared");
    assert.equal(fallbackDisposed.activeVoices, 0, "fallback scheduled sources are released");
    assert.equal(fallbackDisposed.activeVoiceGraphNodes, 0);
    assert.equal(fallbackDisposed.lifecycleListeners, 0);
    assert.equal(fallbackDisposed.system.contexts, 0);
    assert.equal(fallbackDisposed.system.mixerNodes, 0);
    assert.equal(fallbackDisposed.system.effectsBackendNodes, 0);
    assert.deepEqual(fallbackErrors, []);
    await fallback.close();
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("browser audio contract passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
