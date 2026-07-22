const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

async function withJourney(options, run) {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  assert.ok(fs.existsSync(path.join(root, "index.html")), "dist/standalone is missing; run pnpm build:standalone first");
  const port = Number(process.env.TEAR_JOURNEY_PORT || options.port);
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.route("**/*", (route) => route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort());

    async function boot() {
      await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__, undefined, { timeout: 15000 });
      await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0, undefined, { timeout: 15000 });
      await page.mouse.click(10, 10);
    }
    async function waitScreen(screen) {
      await page.waitForFunction((expected) => window.__PANTHEON_TEST.state().game === expected, screen, { timeout: 10000 });
      // A cold screen's state can become active before its lazy renderer chunk has
      // registered the canvas buttons. Wait for that static import to settle so
      // the next pointer action exercises the rendered screen, not a timing race.
      await page.waitForLoadState("networkidle", { timeout: 10000 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function clickAndWait(x, y, screen) {
      await page.mouse.click(x, y);
      await waitScreen(screen);
    }
    await boot();
    await run({ page, errors, boot, waitScreen, clickAndWait });
    assert.deepEqual(errors, [], `${options.name} page errors: ${errors.join("\n")}`);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { withJourney };
