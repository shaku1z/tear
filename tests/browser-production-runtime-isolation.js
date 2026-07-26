/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const targets = ["standalone", "crazygames"];
const bridgeMarkers = [
  "__TEAR_RUNTIME_ENVIRONMENT__",
  "live-runtime-environment",
  "createLiveTearRuntimeEnvironment",
  "installLiveTearRuntimeBridge",
  "tear-ghost-lab",
  "Ghost Lab",
  "__TEAR_WATCH_AGENT__",
  "live-watch-agent-host",
  "tear-watch-agent",
  "Watch Agent",
];

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(candidate) : [candidate];
  });
}

function assertNoStaticBridge(target, directory) {
  const failures = [];
  for (const file of filesUnder(directory)) {
    const relative = path.relative(directory, file).replaceAll("\\", "/");
    for (const marker of bridgeMarkers) {
      if (relative.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${relative} has bridge marker ${marker} in its filename`);
      }
    }
    if (!/\.(?:css|html|js|json|map|txt|webmanifest)$/u.test(file)) continue;
    const contents = fs.readFileSync(file, "utf8");
    for (const marker of bridgeMarkers) {
      if (contents.includes(marker)) failures.push(`${relative} contains bridge marker ${marker}`);
    }
  }
  assert.deepEqual(failures, [], `${target} production artifact contains test-only runtime bridge material`);
}

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

async function serve(directory) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(directory, relative);
    const escaped = path.relative(directory, file);
    if (escaped.startsWith("..") || path.isAbsolute(escaped) ||
        !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("production isolation server did not bind");
  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function crazyGamesSdkStub() {
  return `
    window.CrazyGames = { SDK: {
      environment: "crazygames",
      init: async () => undefined,
      game: {
        settings: { muteAudio: false },
        addSettingsChangeListener: () => undefined,
        loadingStart: () => undefined,
        loadingStop: () => undefined,
        gameplayStart: () => undefined,
        gameplayStop: () => undefined,
        happytime: () => undefined,
      },
      data: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      ad: {
        requestAd: (_type, callbacks) => {
          callbacks?.adStarted?.();
          callbacks?.adFinished?.();
        },
      },
    } };
  `;
}

async function assertRuntimeIsolation(browser, target, directory) {
  const host = await serve(directory);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("crazygames-sdk-v3.js")) {
      void route.fulfill({ contentType: "text/javascript", body: crazyGamesSdkStub() });
    } else if (url.startsWith(host.origin)) {
      void route.continue();
    } else {
      void route.abort();
    }
  });

  try {
    await page.goto(`${host.origin}/?test=1&watchagent=1`, {
      waitUntil: "domcontentloaded", timeout: 30_000,
    });
    await page.waitForFunction(
      (expectedTarget) => window.__TEAR_BUILD__?.target === expectedTarget,
      target,
      { timeout: 30_000 },
    );
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const result = await page.evaluate(() => {
      const name = "__TEAR_RUNTIME_ENVIRONMENT__";
      const watchName = "__TEAR_WATCH_AGENT__";
      return {
        own: Object.prototype.hasOwnProperty.call(globalThis, name),
        present: name in globalThis,
        descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
        valueType: typeof globalThis[name],
        watchOwn: Object.prototype.hasOwnProperty.call(globalThis, watchName),
        watchPresent: watchName in globalThis,
        watchDescriptor: Object.getOwnPropertyDescriptor(globalThis, watchName),
        watchValueType: typeof globalThis[watchName],
        watchPanel: document.getElementById("tear-watch-agent") !== null,
        build: globalThis.__TEAR_BUILD__,
        loadedScripts: performance.getEntriesByType("resource")
          .filter((entry) => entry.name.includes(".js")).length,
      };
    });
    assert.equal(result.build.target, target);
    assert.ok(result.loadedScripts > 0, `${target} production JavaScript did not load`);
    assert.equal(result.own, false, `${target} owns the test-only runtime bridge global`);
    assert.equal(result.present, false, `${target} exposes the test-only runtime bridge through its global chain`);
    assert.equal(result.descriptor, undefined);
    assert.equal(result.valueType, "undefined");
    assert.equal(result.watchOwn, false, `${target} owns the test-only Watch Agent global`);
    assert.equal(result.watchPresent, false, `${target} exposes the test-only Watch Agent global`);
    assert.equal(result.watchDescriptor, undefined);
    assert.equal(result.watchValueType, "undefined");
    assert.equal(result.watchPanel, false, `${target} rendered the test-only Watch Agent panel`);
    assert.deepEqual(pageErrors, [], `${target} production bundle raised a page error while booting`);
  } finally {
    await context.close();
    await host.close();
  }
}

async function main() {
  const directories = new Map(targets.map((target) => [
    target,
    path.join(repositoryRoot, "dist", target),
  ]));
  for (const [target, directory] of directories) {
    assert.ok(fs.existsSync(directory), `dist/${target} is missing; run the production build first`);
    assertNoStaticBridge(target, directory);
  }

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
  });
  try {
    for (const [target, directory] of directories) {
      await assertRuntimeIsolation(browser, target, directory);
    }
  } finally {
    await browser.close();
  }
  console.log("production runtime bridge isolation passed for standalone and crazygames");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
