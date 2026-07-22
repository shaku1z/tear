const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const scenarios = [
  { name: "desktop-16:9", width: 1600, height: 900, dpr: 1 },
  { name: "desktop-4:3-hidpi", width: 1024, height: 768, dpr: 2 },
  { name: "mobile-landscape", width: 800, height: 360, dpr: 3 },
  { name: "mobile-portrait", width: 390, height: 844, dpr: 3 },
];

async function main() {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const file = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Responsive test server did not bind");
  const origin = `http://127.0.0.1:${String(address.port)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: scenario.dpr,
        isMobile: scenario.name.startsWith("mobile"),
        hasTouch: scenario.name.startsWith("mobile"),
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.stack || error.message));
      await page.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.goto(`${origin}/?test=1&bossdebug=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.viewport, undefined, { timeout: 20_000 });
      await page.mouse.move(scenario.width / 2, scenario.height / 2);
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "mouse");
      const snapshot = await page.evaluate(() => ({
        viewport: window.__TEAR_CATALOG_DEBUG__.viewport.snapshot(),
        input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
      }));
      const { viewport } = snapshot;
      assert.equal(viewport.css.width, scenario.width, `${scenario.name}: canvas width`);
      assert.equal(viewport.css.height, scenario.height, `${scenario.name}: canvas height`);
      assert.equal(viewport.backing.width, Math.round(scenario.width * Math.min(scenario.dpr, 2.5)), `${scenario.name}: backing width`);
      assert.equal(viewport.backing.height, Math.round(scenario.height * Math.min(scenario.dpr, 2.5)), `${scenario.name}: backing height`);
      assert.ok(viewport.overscan.x >= 0 && viewport.overscan.y >= 0, `${scenario.name}: non-negative overscan`);
      assert.ok(viewport.overscan.x < 0.01 || viewport.overscan.y < 0.01, `${scenario.name}: only one overscan axis`);
      assert.ok(Object.values(viewport.safeArea).every(Number.isFinite), `${scenario.name}: finite safe area`);
      assert.ok(Math.abs(snapshot.input.pointer.x - viewport.logical.width / 2) < 1, `${scenario.name}: pointer x mapping`);
      assert.ok(Math.abs(snapshot.input.pointer.y - viewport.logical.height / 2) < 1, `${scenario.name}: pointer y mapping`);
      assert.equal(snapshot.document.scrollWidth, snapshot.document.innerWidth, `${scenario.name}: no horizontal page overflow`);
      assert.equal(snapshot.document.scrollHeight, snapshot.document.innerHeight, `${scenario.name}: no vertical page overflow`);
      assert.deepEqual(errors, [], `${scenario.name}: browser errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`responsive browser matrix passed (${scenarios.length} viewport/DPR scenarios)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
