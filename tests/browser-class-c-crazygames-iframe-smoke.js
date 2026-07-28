/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const { assertCleanProductionUrl, createClassCControls, writeClassCArtifact } = require("./class-c-browser-harness");

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

function sampledDifference(left, right) {
  let changed = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += Math.max(1, Math.floor(length / 8192))) if (left[index] !== right[index]) changed += 1;
  return changed;
}

async function serveIframeBuild(directory) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end("<!doctype html><html><body style='margin:0;overflow:hidden'><iframe allow='autoplay; fullscreen; gamepad' style='border:0;width:1600px;height:900px' src='/game/'></iframe></body></html>");
      return;
    }
    const relative = pathname === "/game/" ? "index.html" : pathname.startsWith("/game/") ? pathname.slice("/game/".length) : "";
    const candidate = path.resolve(directory, relative);
    const escaped = path.relative(directory, candidate);
    if (relative.length === 0 || escaped.startsWith("..") || path.isAbsolute(escaped) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader("Content-Type", contentType(candidate)); fs.createReadStream(candidate).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Class-C CrazyGames iframe server did not bind");
  return Object.freeze({
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  });
}

async function main() {
  const root = path.resolve(__dirname, "..", "dist", "crazygames");
  assert.ok(fs.existsSync(path.join(root, "index.html")), "dist/crazygames is missing; run pnpm build first");
  const host = await serveIframeBuild(root);
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const record = {
    format: "tear-class-c-crazygames-iframe-smoke", version: 1,
    executionClass: "black-box", observationClass: "pixel-only", certified: false,
    // The local SDK façade validates clean embed wiring only; it cannot stand
    // in for a real CrazyGames certification launch.
    target: "crazygames-iframe-engineering", url: `${host.origin}/`, viewport: { width: 1600, height: 900, dpr: 1 },
    inputs: [], frames: [], browserErrors: [], result: "incomplete",
  };
  page.on("pageerror", (error) => record.browserErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("crazygames-sdk-v3.js")) {
      void route.fulfill({ contentType: "text/javascript", body: "window.CrazyGames={SDK:{environment:'crazygames',init:async()=>{},game:{settings:{muteAudio:false},addSettingsChangeListener:()=>{},loadingStart:()=>{},loadingStop:()=>{},gameplayStart:()=>{},gameplayStop:()=>{}},data:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}}};" });
    } else if (url.startsWith(host.origin)) void route.continue(); else void route.abort();
  });
  try {
    await page.goto(record.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    assertCleanProductionUrl(page.url());
    const controls = createClassCControls(page, record.viewport, record);
    await controls.wait(1_200);
    const menu = await controls.screenshot("iframe-main-menu");
    assert.ok(menu.length > 1_000, "embedded shipped production frame was not rendered");
    await controls.pointer({ x: 260, y: 360 }, "down"); await controls.pointer({ x: 260, y: 360 }, "up");
    await controls.wait(700);
    const setup = await controls.screenshot("iframe-setup");
    assert.ok(sampledDifference(menu, setup) > 20, "physical input did not visibly activate the CrazyGames embedded menu");
    record.buildDigest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "index.html"))).digest("hex");
    record.result = "partial-production-iframe-physical-journey";
    assert.deepEqual(record.browserErrors, [], `CrazyGames Class-C iframe browser errors: ${record.browserErrors.join("\n")}`);
  } finally {
    writeClassCArtifact("crazygames-iframe-physical-smoke", record);
    await context.close(); await browser.close(); await host.close();
  }
  console.log("C25 clean-production CrazyGames iframe physical smoke passed (non-certifying engineering coverage)");
}

main().catch((error) => { console.error(error); process.exit(1); });
