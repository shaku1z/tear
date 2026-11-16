const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { STATE_WAIT_MS, holdFor } = require("./browser-waits");

async function assertVisibilityLifecycle(page, baseline) {
  // Tab occlusion is window-manager behavior and is not portable through Xvfb.
  // Drive the browser event deterministically and assert the application's
  // complete hidden/visible mute lifecycle instead.
  const setSimulatedVisibility = async (hidden) =>
    page.evaluate((nextHidden) => {
      Object.defineProperties(document, {
        hidden: { configurable: true, get: () => nextHidden },
        visibilityState: { configurable: true, get: () => (nextHidden ? "hidden" : "visible") },
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setSimulatedVisibility(true);
  await page.waitForFunction(({ hidden }) => {
    const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
    return (
      document.visibilityState === "hidden" &&
      resources.visibilityTransitions.hidden > hidden &&
      resources.system.temporaryMuteReasons.includes("visibility")
    );
  }, baseline);
  await setSimulatedVisibility(false);
  await page.waitForFunction(({ visible }) => {
    const resources = window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources;
    return (
      document.visibilityState === "visible" &&
      resources.visibilityTransitions.visible > visible &&
      !resources.system.temporaryMuteReasons.includes("visibility")
    );
  }, baseline);
}

(async () => {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
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
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream",
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  try {
    const gameContext = await browser.newContext();
    const page = await gameContext.newPage();
    const pageErrors = [];
    const timingWarnings = [];
    page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
    page.on("console", (message) => {
      if (message.text().includes("Events scheduled inside of scheduled callbacks")) {
        timingWarnings.push(message.text());
      }
    });
    await page.addInitScript(() => {
      window.__TEAR_TEST_STORAGE__ = {
        tear_settings: JSON.stringify({
          vol: 0.75,
          music: true,
          musicVolume: 0.35,
          sfxVolume: 0.8,
          interfaceVolume: 0.45,
        }),
      };
      const NativeAudioContext = window.AudioContext;
      window.__tearAudioContextCount = 0;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.__tearAudioContextCount++;
        }
      };
    });
    const musicRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/audio/") || url.includes("/vendor/")) musicRequests.push(new URL(url).pathname);
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      // Recorded stems are the music backend; the page loads them as players do.
      if (url.startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, {
      waitUntil: "domcontentloaded",
      timeout: STATE_WAIT_MS,
    });
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, { timeout: STATE_WAIT_MS });

    const before = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(before.state, "awaiting-user-activation");
    assert.equal(before.settings.masterVolume, 0.75);
    assert.equal(before.settings.musicVolume, 0.35);
    assert.equal(before.settings.sfxVolume, 0.8);
    assert.equal(before.settings.interfaceVolume, 0.45);

    // Modifier keys satisfy the browser activation gate without dispatching a
    // menu command into the canvas UI beneath the pointer.
    await page.keyboard.press("Shift");
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, {
      timeout: STATE_WAIT_MS,
    });
    await page.keyboard.press("Shift");
    await page.keyboard.press("Control");
    const after = await page.evaluate(() => ({
      audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
      contexts: window.__tearAudioContextCount,
    }));
    assert.equal(after.contexts, 1);
    assert.equal(after.audio.backend, "stem-cue:biome-routed", "recorded stems are the music backend");
    assert.ok(musicRequests.includes("/audio/music.json"), "the one music index was loaded");
    assert.equal(
      musicRequests.some((request) => request.endsWith("/cue.json")),
      false,
      "cue manifests come from the index, not one request each",
    );
    assert.ok(
      musicRequests.some((request) => request.startsWith("/audio/cues/fillet/opus/")),
      "the menu cue's layers were requested",
    );
    assert.equal(
      musicRequests.some((request) => request.startsWith("/vendor/")),
      false,
      "no vendored music engine is requested",
    );
    assert.equal(
      await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, "Tone")),
      false,
      "no Tone global exists",
    );
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
      await page.waitForTimeout(holdFor(150));
    }
    // The first menu-to-gameplay score swap lands on the next musical bar.
    // Keep the page alive past that boundary so callback-time regressions surface.
    await page.waitForTimeout(holdFor(2_500));
    const repeated = await page.evaluate(() => ({
      audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
      contexts: window.__tearAudioContextCount,
    }));
    const settledRepeatedHandle = await page.waitForFunction(() => {
      const snapshot = window.__TEAR_CATALOG_DEBUG__.audio.snapshot();
      return snapshot.resources.activeVoices === 0 && snapshot.resources.activeVoiceGraphNodes === 0 ? snapshot : false;
    });
    const settledRepeated = await settledRepeatedHandle.jsonValue();
    await settledRepeatedHandle.dispose();
    assert.equal(repeated.contexts, 1, "repeated runs retain one host-owned AudioContext");
    assert.equal(settledRepeated.resources.activeVoiceGraphNodes, 0, "scheduled voice nodes are released");
    assert.equal(
      settledRepeated.resources.lifecycleListeners,
      resourceBaseline.lifecycleListeners,
      "repeated runs do not add lifecycle listeners",
    );
    assert.equal(
      settledRepeated.resources.legacySequencer.running,
      resourceBaseline.legacySequencer.running,
      "repeated runs do not add owned timers",
    );
    assert.deepEqual(
      settledRepeated.resources.system,
      resourceBaseline.system,
      "repeated runs do not add contexts, mixer nodes, or backend nodes",
    );
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(timingWarnings, [], "music transitions use scheduled callback time");

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

    const legacySynthFallback = await browser.newPage();
    const legacySynthErrors = [];
    legacySynthFallback.on("pageerror", (error) => legacySynthErrors.push(error.stack || error.message));
    await legacySynthFallback.route("**/*", (route) => {
      const url = route.request().url();
      // With the recorded cues unavailable, AudioSystem's built-in music is the
      // fallback, so music is never silent.
      if (url.includes("/audio/cues/")) route.abort("failed");
      else if (url.startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await legacySynthFallback.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, {
      waitUntil: "domcontentloaded",
      timeout: STATE_WAIT_MS,
    });
    await legacySynthFallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, {
      timeout: STATE_WAIT_MS,
    });
    await legacySynthFallback.keyboard.press("Shift");
    await legacySynthFallback.waitForFunction(
      () => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running",
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const legacySynthAudio = await legacySynthFallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(
      legacySynthAudio.backend,
      "legacy-synth",
      "unavailable recorded cues select the built-in music fallback",
    );
    assert.equal(legacySynthAudio.resources.legacySequencer.running, true);
    assert.equal(legacySynthAudio.resources.system.effectsBackendNodes, 15);
    await legacySynthFallback.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })),
    );
    await legacySynthFallback.waitForFunction(
      () => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "disposed",
    );
    const legacySynthDisposed = await legacySynthFallback.evaluate(
      () => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources,
    );
    assert.equal(legacySynthDisposed.legacySequencer.running, false, "legacy synth interval is cleared");
    assert.equal(legacySynthDisposed.activeVoices, 0);
    assert.equal(legacySynthDisposed.activeVoiceGraphNodes, 0);
    assert.equal(legacySynthDisposed.lifecycleListeners, 0);
    assert.deepEqual(legacySynthDisposed.system, {
      contexts: 0,
      mixerNodes: 0,
      effectsBackendNodes: 0,
      temporaryMuteReasons: [],
    });
    assert.deepEqual(legacySynthErrors, []);
    await legacySynthFallback.close();
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
