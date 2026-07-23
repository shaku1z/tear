const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

(async () => {
  const target = process.argv[2] || process.env.TEAR_SMOKE_TARGET || "standalone";
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || `test-${target}`);
  const builtHtml = fs.readFileSync(path.resolve(root, "index.html"), "utf8");
  if (target === "crazygames") {
    assert.equal(builtHtml.includes('rel="manifest"'), false, "CrazyGames HTML must not advertise PWA installation");
    assert.equal(fs.existsSync(path.resolve(root, "sw.js")), false, "CrazyGames must not emit a service worker");
    assert.equal(/(?:src|href)="\/assets\//.test(builtHtml), false, "CrazyGames game assets must use relative bundle paths");
    assert.match(builtHtml, /(?:src|href)="\.\/assets\//, "CrazyGames HTML should contain relative hashed assets");
  } else {
    assert.equal(builtHtml.includes('rel="manifest"'), true, "standalone HTML must advertise its PWA manifest");
    assert.equal(fs.existsSync(path.resolve(root, "sw.js")), true, "standalone must emit its generated service worker");
  }
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
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (target === "crazygames" && url.includes("crazygames-sdk-v3.js")) {
      void route.fulfill({
        contentType: "text/javascript",
        body: `window.CrazyGames={SDK:{environment:"local",init:()=>Promise.resolve(),game:{settings:{muteAudio:false},addSettingsChangeListener:()=>{}},data:{getItem:()=>null,setItem:()=>{}}}};`,
      });
    }
    else if (url.startsWith(`http://127.0.0.1:${address.port}/`)) void route.continue();
    else void route.abort();
  });
  await page.goto(`http://127.0.0.1:${address.port}/?test=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ && window.__TEAR_PLATFORM_SERVICES__, undefined, { timeout: 10_000 });
  const boot = await page.evaluate(() => ({
    platform: window.__TEAR_PLATFORM_SERVICES__.id,
    envelope: JSON.parse(localStorage.getItem("tear_profile_v2") || "null"),
  }));
  assert.equal(boot.platform, target === "crazygames" ? "crazygames" : "browser");
  assert.equal(boot.envelope.schema, "tear.profile");
  assert.equal(boot.envelope.schemaVersion, 2);

  await page.mouse.click(260, 360);
  await page.waitForTimeout(350);
  await page.mouse.click(1180, 200);
  await page.mouse.click(800, 758);
  await page.waitForTimeout(750);
  assert.deepEqual(errors, []);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("platform browser smoke passed");
})().catch((error) => { console.error(error); process.exit(1); });
