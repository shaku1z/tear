const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

(async () => {
  const root = path.resolve(__dirname, "..", "dist", "standalone");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end(); return;
    }
    const contentType = file.endsWith(".js") ? "text/javascript"
      : file.endsWith(".html") ? "text/html"
        : file.endsWith(".json") ? "application/json" : "application/octet-stream";
    response.setHeader("Content-Type", contentType);
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("PWA test server did not bind");
  const origin = `http://127.0.0.1:${address.port}`;
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith(origin)) void route.continue();
    else void route.abort();
  });
  await page.goto(`${origin}/?test=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ !== undefined);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.active) throw new Error("service worker did not activate");
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__ !== undefined);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);
  await context.setOffline(false);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("PWA offline smoke passed");
})().catch((error) => { console.error(error); process.exit(1); });
