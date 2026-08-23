const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function assertVisibilityLifecycle(page, baseline) {
  // Tab occlusion is window-manager behavior and is not portable through Xvfb.
  // Drive the browser event deterministically and assert the application's
  // complete hidden/visible mute lifecycle instead.
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
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
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
    const musicVendorRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/vendor/tear-music/") || url.includes("/vendor/tear-score/")) {
        musicVendorRequests.push(new URL(url).pathname);
      }
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      // Recorded stems are the normal primary backend and have their own
      // contract suite. With cues unavailable, this page exercises the
      // canonical Adaptive Soundtrack vendor path.
      if (url.includes("/audio/cues/")) route.abort("failed");
      else if (url.startsWith(`${baseUrl}/`)) route.continue();
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
    assert.ok(musicVendorRequests.includes("/vendor/tear-music/adaptive-soundtrack.esm.js"),
      "canonical Adaptive Soundtrack module was evaluated");
    assert.ok(musicVendorRequests.includes("/vendor/tear-music/tone-host-14.9.17.esm.js"),
      "canonical paired Tone host was loaded");
    assert.equal(musicVendorRequests.some((request) => request.includes("/vendor/tear-score/")), false,
      "canonical success does not invoke the legacy vendor fallback");
    assert.equal(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, "Tone")), false,
      "canonical Tone bridge is restored after module evaluation");
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
      await page.waitForTimeout(150);
    }
    // The first menu-to-gameplay score swap lands on the next musical bar.
    // Keep the page alive past that boundary so callback-time regressions surface.
    await page.waitForTimeout(2_500);
    const repeated = await page.evaluate(() => ({
      audio: window.__TEAR_CATALOG_DEBUG__.audio.snapshot(),
      contexts: window.__tearAudioContextCount,
    }));
    const settledRepeatedHandle = await page.waitForFunction(() => {
      const snapshot = window.__TEAR_CATALOG_DEBUG__.audio.snapshot();
      return snapshot.resources.activeVoices === 0 && snapshot.resources.activeVoiceGraphNodes === 0
        ? snapshot
        : false;
    });
    const settledRepeated = await settledRepeatedHandle.jsonValue();
    await settledRepeatedHandle.dispose();
    assert.equal(repeated.contexts, 1, "repeated runs retain one host-owned AudioContext");
    assert.equal(settledRepeated.resources.activeVoiceGraphNodes, 0, "scheduled voice nodes are released");
    assert.equal(settledRepeated.resources.lifecycleListeners, resourceBaseline.lifecycleListeners,
      "repeated runs do not add lifecycle listeners");
    assert.equal(settledRepeated.resources.legacySequencer.running, resourceBaseline.legacySequencer.running,
      "repeated runs do not add owned timers");
    assert.deepEqual(settledRepeated.resources.system, resourceBaseline.system,
      "repeated runs do not add contexts, mixer nodes, or backend nodes");
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(timingWarnings, [], "score transitions use Tone's scheduled callback time");

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
    const fallbackVendorRequests = [];
    fallback.on("pageerror", (error) => fallbackErrors.push(error.stack || error.message));
    fallback.on("request", (request) => {
      const url = request.url();
      if (url.includes("/vendor/tear-music/") || url.includes("/vendor/tear-score/")) {
        fallbackVendorRequests.push(new URL(url).pathname);
      }
    });
    await fallback.route("**/*", (route) => {
      const url = route.request().url();
      // Block only the canonical generation to prove the existing pinned
      // TearScore vendor remains a working compatibility fallback.
      if (url.includes("/vendor/tear-music/") || url.includes("/audio/cues/")) route.abort("failed");
      else if (url.startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await fallback.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await fallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, { timeout: 20000 });
    await fallback.keyboard.press("Shift");
    await fallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20000 });
    const fallbackAudio = await fallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(fallbackAudio.backend, "tear-score@0.1.0-alpha.1", "blocked canonical assets select the pinned TearScore fallback");
    assert.equal(fallbackVendorRequests.includes("/vendor/tear-score/tear-score.esm.js"), true,
      "legacy TearScore module was loaded after canonical failure");
    assert.equal(fallbackVendorRequests.includes("/vendor/tear-score/tone-host-14.9.17.esm.js"), true,
      "legacy paired Tone host was loaded after canonical failure");
    assert.equal(fallbackAudio.resources.legacySequencer.running, false);
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

    const legacySynthFallback = await browser.newPage();
    const legacySynthErrors = [];
    legacySynthFallback.on("pageerror", (error) => legacySynthErrors.push(error.stack || error.message));
    await legacySynthFallback.route("**/*", (route) => {
      const url = route.request().url();
      // Keep the pre-existing final fallback evidence: both vendored music
      // generations and recorded cues are unavailable, so legacy synth is the
      // only backend allowed to initialize.
      if (url.includes("/vendor/tear-music/") || url.includes("/vendor/tear-score/") || url.includes("/audio/cues/")) route.abort("failed");
      else if (url.startsWith(`${baseUrl}/`)) route.continue();
      else route.abort();
    });
    await legacySynthFallback.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await legacySynthFallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.audio, undefined, { timeout: 20000 });
    await legacySynthFallback.keyboard.press("Shift");
    await legacySynthFallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20000 });
    const legacySynthAudio = await legacySynthFallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot());
    assert.equal(legacySynthAudio.backend, "legacy-synth", "blocked canonical and TearScore assets select the final legacy-synth fallback");
    assert.equal(legacySynthAudio.resources.legacySequencer.running, true);
    assert.equal(legacySynthAudio.resources.system.effectsBackendNodes, 15);
    await legacySynthFallback.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    await legacySynthFallback.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "disposed");
    const legacySynthDisposed = await legacySynthFallback.evaluate(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().resources);
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
