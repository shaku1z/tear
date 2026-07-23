const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function main() {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-crazygames");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/harness") {
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><html><body style='margin:0'><iframe id='game' allow='autoplay; fullscreen; gamepad' style='border:0;width:960px;height:540px' src='/?test=1&bossdebug=1'></iframe></body></html>");
      return;
    }
    const file = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("CrazyGames iframe test server did not bind");
  const origin = `http://127.0.0.1:${String(address.port)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("crazygames-sdk-v3.js")) {
        void route.fulfill({
          contentType: "text/javascript",
          body: `
            window.__crazyCalls = [];
            const call = (name) => window.__crazyCalls.push(name);
            window.CrazyGames = { SDK: {
              environment: "crazygames",
              init: async () => { call("init"); },
              game: {
                settings: { muteAudio: false },
                addSettingsChangeListener: (listener) => { window.__crazySettingsListener = listener; call("settings-listener"); },
                loadingStart: () => call("loading-start"), loadingStop: () => call("loading-stop"),
                gameplayStart: () => call("gameplay-start"), gameplayStop: () => call("gameplay-stop"),
                happytime: () => call("happytime"),
              },
              data: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
              ad: { requestAd: (_type, callbacks) => { callbacks.adStarted(); callbacks.adFinished(); } },
            } };
          `,
        });
      } else if (url.startsWith(origin)) void route.continue();
      else void route.abort();
    });

    await page.goto(`${origin}/harness`, { waitUntil: "domcontentloaded" });
    const iframe = await page.waitForSelector("#game");
    const frame = await iframe.contentFrame();
    if (!frame) throw new Error("CrazyGames game iframe did not load");
    await frame.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ && window.__TEAR_PLATFORM_SERVICES__, undefined, { timeout: 20_000 });
    // A trusted pointer event inside the embedded document activates Web Audio;
    // the canvas center is intentionally outside the menu's interactive rails.
    await iframe.click({ position: { x: 480, y: 270 } });
    await frame.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running", undefined, { timeout: 20_000 });

    const boot = await frame.evaluate(async () => ({
      platform: window.__TEAR_PLATFORM_SERVICES__.id,
      calls: window.__crazyCalls.slice(),
      serviceWorkers: "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      canvas: (() => { const rect = document.querySelector("canvas").getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
    }));
    assert.equal(boot.platform, "crazygames");
    assert.equal(boot.serviceWorkers, 0);
    assert.ok(boot.canvas.width > 0 && boot.canvas.width <= 960);
    assert.ok(boot.canvas.height > 0 && boot.canvas.height <= 540);
    assert.deepEqual(boot.calls.slice(0, 4), ["init", "settings-listener", "loading-start", "loading-stop"]);

    await page.evaluate(() => {
      const game = document.querySelector("#game");
      game.style.width = "390px";
      game.style.height = "700px";
    });
    await frame.waitForFunction(() => {
      const rect = document.querySelector("canvas").getBoundingClientRect();
      return rect.width === 390 && rect.height === 700;
    });
    const mobileEmbed = await frame.evaluate(() => {
      const rect = document.querySelector("canvas").getBoundingClientRect();
      return { width: rect.width, height: rect.height, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
    });
    assert.deepEqual(mobileEmbed, { width: 390, height: 700, scrollWidth: 390, scrollHeight: 700 });
    await page.evaluate(() => {
      const game = document.querySelector("#game");
      game.style.width = "960px";
      game.style.height = "540px";
    });
    await frame.waitForFunction(() => document.querySelector("canvas").getBoundingClientRect().width === 960);

    await frame.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
    await frame.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, { timeout: 20_000 });
    await frame.evaluate(() => window.__PANTHEON_TEST.pause());
    await frame.waitForFunction(() => window.__PANTHEON_TEST.state().game === "paused", undefined, { timeout: 20_000 });
    await frame.evaluate(() => window.__PANTHEON_TEST.resume());
    await frame.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, { timeout: 20_000 });
    await frame.waitForFunction(() => window.__crazyCalls.filter((call) => call.startsWith("gameplay-")).length >= 3,
      undefined, { timeout: 20_000 });
    const calls = await frame.evaluate(() => window.__crazyCalls.slice());
    const gameplayCalls = calls.filter((call) => call.startsWith("gameplay-"));
    assert.deepEqual(gameplayCalls, ["gameplay-start", "gameplay-stop", "gameplay-start"]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log("CrazyGames iframe lifecycle matrix passed");
}

main().catch((error) => { console.error(error); process.exit(1); });
