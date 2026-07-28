/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence helper. */
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

async function serveProductionBuild(directory) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const candidate = path.resolve(directory, pathname === "/" ? "index.html" : pathname.slice(1));
    const escaped = path.relative(directory, candidate);
    if (escaped.startsWith("..") || path.isAbsolute(escaped) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      response.writeHead(404).end(); return;
    }
    response.setHeader("Content-Type", contentType(candidate)); fs.createReadStream(candidate).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Class-C production server did not bind");
  return Object.freeze({
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  });
}

function logicalPoint(logical, viewport) {
  return { x: logical.x / 1600 * viewport.width, y: logical.y / 900 * viewport.height };
}

/**
 * The only control surface available to a Class-C browser policy.  Notice that
 * it does not expose Page.evaluate, locators, URL query mutation, DOM handles,
 * or test globals.  Decisions can consume captured pixels and issue normal
 * browser device gestures only.
 */
function createClassCControls(page, viewport, record) {
  const recordInput = (input) => record.inputs.push(Object.freeze({ atMs: Date.now(), ...input }));
  let touchSession = null;
  return Object.freeze({
    screenshot: async (name) => {
      const png = await page.screenshot({ type: "png" });
      const digest = crypto.createHash("sha256").update(png).digest("hex");
      record.frames.push(Object.freeze({ name, atMs: Date.now(), bytes: png.length, digest }));
      return png;
    },
    key: async (code, phase) => {
      recordInput({ device: "keyboard", code, phase });
      if (phase === "down") await page.keyboard.down(code); else await page.keyboard.up(code);
    },
    pointer: async (logical, phase = "click", button = "left") => {
      const point = logicalPoint(logical, viewport);
      recordInput({ device: "mouse", phase, button, logical, point });
      await page.mouse.move(point.x, point.y);
      if (phase === "down") await page.mouse.down({ button });
      else if (phase === "up") await page.mouse.up({ button });
      else if (phase === "click") await page.mouse.click(point.x, point.y, { button });
    },
    touch: async (logical, phase, identifier = 1) => {
      const point = logicalPoint(logical, viewport);
      recordInput({ device: "touch", phase, identifier, logical, point });
      touchSession ??= await page.context().newCDPSession(page);
      const type = phase === "start" ? "touchStart" : phase === "end" ? "touchEnd" : "touchMove";
      const points = phase === "end" ? [] : [{ x: point.x, y: point.y, id: identifier, radiusX: 8, radiusY: 8, force: 1 }];
      await touchSession.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    },
    wait: async (milliseconds) => { await page.waitForTimeout(milliseconds); },
  });
}

function writeClassCArtifact(name, value) {
  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c25");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function assertCleanProductionUrl(url) {
  const parsed = new URL(url);
  assert.equal(parsed.search, "", "Class-C runs must boot the clean shipped URL without a test/debug query");
}

module.exports = { assertCleanProductionUrl, createClassCControls, serveProductionBuild, writeClassCArtifact };
