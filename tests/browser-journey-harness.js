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
  const buildDirectory = process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone";
  const root = path.resolve(__dirname, "..", "dist", buildDirectory);
  assert.ok(fs.existsSync(path.join(root, "index.html")), `dist/${buildDirectory} is missing; run pnpm build:test:standalone first`);
  const { calculateArtifactHash, readSourceIdentity } = await import("../scripts/release-artifact.mjs");
  const buildInfoPath = path.join(root, "build-info.json");
  assert.ok(fs.existsSync(buildInfoPath), `dist/${buildDirectory}/build-info.json is missing; build attribution is required`);
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  const expectedTarget = buildDirectory.includes("crazygames") ? "crazygames" : "standalone";
  assert.equal(buildInfo.format, "tear-build-info", "served build-info format is unsupported");
  assert.equal(buildInfo.target, expectedTarget, "served build target does not match the journey target");
  assert.equal(typeof buildInfo.mode, "string", "served build-info mode is required");
  const artifact = await calculateArtifactHash(root);
  assert.equal(buildInfo.artifactHash, artifact.hash, "served build artifact hash is stale");
  assert.equal(buildInfo.artifactFiles, artifact.files, "served build artifact file count is stale");
  const source = await readSourceIdentity(path.resolve(__dirname, ".."));
  assert.equal(buildInfo.sha, source.revision, "served build SHA does not match the current source revision");
  assert.equal(buildInfo.sourceRevision, source.revision, "served build source revision is stale");
  assert.equal(buildInfo.sourceState, source.state, "served build source state is stale");
  assert.equal(buildInfo.sourceFingerprint, source.fingerprint, "served build source fingerprint is stale");
  const port = Number(process.env.TEAR_JOURNEY_PORT || options.port);
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, baseUrl).pathname;
    if (pathname === "/__tear_browser_blank_fixture__.html") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Tear browser fixture</title>");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    const containedPath = path.relative(root, file);
    if (containedPath.startsWith("..") || path.isAbsolute(containedPath)
      || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
    // Journey suites repeatedly navigate the same instrumented page. Keep the
    // production service worker out of this harness so an activation/update
    // race cannot replace the exact test build between boots. PWA behavior has
    // its own production and offline browser gates.
    const page = await browser.newPage({
      viewport: options.viewport || { width: 1600, height: 900 },
      serviceWorkers: "block",
    });
    if (options.colorScheme || options.reducedMotion) {
      await page.emulateMedia({ colorScheme: options.colorScheme, reducedMotion: options.reducedMotion });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.route("**/*", (route) => route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort());

    const initialQuery = { test: "1", bossdebug: "1", ...(options.query || {}) };
    async function boot(query = initialQuery) {
      await page.goto(`${baseUrl}/index.html?${new URLSearchParams(query).toString()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      try {
        await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__, undefined, { timeout: 15000 });
        await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0, undefined, { timeout: 15000 });
      } catch (error) {
        throw new Error(`Tear browser boot unavailable: ${errors.join("\n") || "no page error was emitted"}`, { cause: error });
      }
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
    // Migration tests need to create a legacy IndexedDB schema at this exact
    // HTTP origin before the application opens it. Ordinary journeys retain
    // their existing eager boot behavior.
    if (!options.deferBoot) await boot();
    const served = await page.request.get(`${baseUrl}/build-info.json`);
    assert.ok(served.ok(), "served build-info.json is unavailable");
    assert.deepEqual(await served.json(), buildInfo, "served build metadata differs from the verified local artifact");
    await run({ page, errors, baseUrl, boot, waitScreen, clickAndWait, buildInfo });
    assert.deepEqual(errors, [], `${options.name} page errors: ${errors.join("\n")}`);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

module.exports = { withJourney };
