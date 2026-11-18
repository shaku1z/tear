const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { listenOnFreePort } = require("./local-server");
const path = require("node:path");
const { STATE_WAIT_MS } = require("./browser-waits");

async function main() {
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
  // Set once the server listens on a free port (tests/local-server.js).
  let baseUrl = "http://127.0.0.1";
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
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
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.route("**/*", (route) =>
    route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort(),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));

  async function boot() {
    await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, {
      timeout: STATE_WAIT_MS,
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__);
    // Debug mode can start a run without navigating the real menu, but Web Audio
    // still requires the same user activation as production gameplay.
    await page.mouse.click(10, 10);
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.audio.snapshot().state === "running");
  }

  const modes = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"];
  for (const mode of modes) {
    await boot();
    await page.evaluate((selectedMode) => window.__PANTHEON_TEST.startMode(selectedMode), mode);
    await page.waitForFunction((selectedMode) => {
      const state = window.__PANTHEON_TEST.state();
      return state.game === "playing" && state.mode === selectedMode;
    }, mode);
    const lifecycle = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().lifecycle.phase);
    if (mode === "tutorial" || mode === "playground")
      assert.equal(lifecycle, "training-active", `${mode} uses training lifecycle`);
    else assert.ok(["wave-prepared", "wave-active"].includes(lifecycle), `${mode} prepares or activates a wave`);
  }

  await boot();
  await page.evaluate(() =>
    window.__PANTHEON_TEST.setOptions({
      masterVolume: 0.2,
      musicVolume: 0.3,
      sfxVolume: 0.4,
      interfaceVolume: 0.5,
      masterMuted: false,
      musicMuted: true,
      sfxMuted: false,
      interfaceMuted: true,
      reducedMotion: true,
      highContrast: true,
      gfx: "low",
    }),
  );
  const settings = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.deepEqual(settings.settings, {
    masterVolume: 0.2,
    musicVolume: 0.3,
    sfxVolume: 0.4,
    interfaceVolume: 0.5,
    masterMuted: false,
    musicMuted: true,
    sfxMuted: false,
    interfaceMuted: true,
    cinematics: "full",
  });
  assert.equal(settings.reducedMotion, true);
  assert.equal(settings.highContrast, true);
  assert.equal(settings.lowEffects, true);

  await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: true }));
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "draft");
  await page.evaluate(() => window.__PANTHEON_TEST.startFinale());
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().finale !== null);

  assert.deepEqual(errors, []);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("browser feature matrix passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
