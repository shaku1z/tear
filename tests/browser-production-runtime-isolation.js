const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { STATE_WAIT_MS, launchJourney } = require("./browser-waits");

const repositoryRoot = path.resolve(__dirname, "..");
const targets = ["standalone", "crazygames"];
const bridgeMarkers = [
  "__TEAR_RUNTIME_ENVIRONMENT__",
  "live-runtime-environment",
  "createLiveTearRuntimeEnvironment",
  "installLiveTearRuntimeBridge",
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
    if (
      escaped.startsWith("..") ||
      path.isAbsolute(escaped) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
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

// Engineering parameters that a production page must ignore: the test hook,
// Watch Agent route, cue audition and Foundry audio preview.
const engineeringQuery = "?test=1&watchagent=1&stemcue=fillet";
// Canvas labels that only engineering builds may draw on the main menu and setup screen.
const engineeringMenuLabels = ["TRAINING ARCHIVE", "TRAINING OPERATIONS", "REPLAY HUB", "LOCAL ROUTES"];
const engineeringSetupLabels = ["DEV", "BOSS TEST", "ENEMY TEST", "CREATE SEED-LOCKED RACE"];

/** Records canvas text so production menus can be inspected without any test hook in the bundle. */
function recordCanvasText() {
  const drawn = [];
  // Where each label was last drawn on the visible canvas, in page pixels, so a drawn control can be clicked.
  const at = new Map();
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, ...rest) {
    drawn.push(String(text));
    if (drawn.length > 20_000) drawn.splice(0, drawn.length - 10_000);
    if (this.canvas.isConnected) {
      const point = this.getTransform().transformPoint({ x, y }),
        rect = this.canvas.getBoundingClientRect();
      at.set(String(text), {
        x: rect.left + (point.x * rect.width) / this.canvas.width,
        y: rect.top + (point.y * rect.height) / this.canvas.height,
      });
    }
    return original.call(this, text, x, y, ...rest);
  };
  Object.defineProperty(window, "__isolationDrawnText", { configurable: false, value: drawn });
  Object.defineProperty(window, "__isolationDrawnAt", { configurable: false, value: at });
}

/** Exact or fitted (ellipsized) canvas labels that belong to engineering controls. */
function engineeringText(drawn, labels) {
  return drawn.filter((text) =>
    labels.some(
      (label) =>
        text === label || (text.endsWith("…") && text.length > 4 && label.startsWith(text.slice(0, -1).trimEnd())),
    ),
  );
}

async function drawnTextAfterFrames(page, frames = 6) {
  await page.evaluate(() => {
    window.__isolationDrawnText.length = 0;
  });
  await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let remaining = count;
        const next = () => {
          remaining -= 1;
          if (remaining <= 0) resolve();
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
  return page.evaluate(() => [...new Set(window.__isolationDrawnText)]);
}

async function waitForDrawnText(page, text, description) {
  await page
    .waitForFunction((expected) => window.__isolationDrawnText.includes(expected), text, { timeout: STATE_WAIT_MS })
    .catch(() => {
      throw new Error(`${description}: canvas never drew ${text}`);
    });
}

async function clickVirtual(page, x, y) {
  const box = await page.locator("#game").boundingBox();
  assert.ok(box, "game canvas has no layout box");
  const scale = Math.min(box.width / 1600, box.height / 900);
  const left = box.x + (box.width - 1600 * scale) / 2,
    top = box.y + (box.height - 900 * scale) / 2;
  await page.mouse.move(left + x * scale, top + y * scale);
  await page.mouse.click(left + x * scale, top + y * scale);
}

async function assertReleaseSurfaces(page, target) {
  await waitForDrawnText(page, "SETTINGS", `${target} main menu`);
  const menu = await drawnTextAfterFrames(page);
  assert.ok(menu.includes("PLAY"), `${target} main menu did not render PLAY`);
  assert.deepEqual(
    engineeringText(menu, engineeringMenuLabels),
    [],
    `${target} production main menu rendered engineering entries`,
  );
  await clickVirtual(page, 260, 361);
  // A fresh profile is tutorial-first: PLAY starts the tutorial, and skipping it on purpose from
  // its pause menu opens the run setup.
  await page
    .waitForFunction(() => window.__isolationDrawnText.some((text) => /^LESSON 1 OF \d+$/u.test(text)), undefined, {
      timeout: STATE_WAIT_MS,
    })
    .catch(() => {
      throw new Error(`${target} PLAY did not start the tutorial`);
    });
  await page.keyboard.press("KeyP");
  await waitForDrawnText(page, "SKIP TUTORIAL", `${target} tutorial pause`);
  const skip = await page.evaluate(() => window.__isolationDrawnAt.get("SKIP TUTORIAL"));
  await page.mouse.click(skip.x, skip.y);
  await waitForDrawnText(page, "START", `${target} setup`);
  const setup = await drawnTextAfterFrames(page);
  assert.ok(setup.includes("ADVENTURE"), `${target} setup did not render its modes`);
  assert.deepEqual(
    engineeringText(setup, engineeringSetupLabels),
    [],
    `${target} production setup rendered engineering modes or controls`,
  );
  await clickVirtual(page, 800, 757);
  await page
    .waitForFunction(() => performance.getEntriesByName("tear:gameplay-start").length > 0, undefined, {
      timeout: STATE_WAIT_MS,
    })
    .catch(() => {
      throw new Error(`${target} START did not enter a run`);
    });
  await drawnTextAfterFrames(page, 30);
  const globals = await page.evaluate(() => ({
    weaponDebug: typeof window.TEAR_WEAPON_DEBUG,
    weaponDebugPresent: "TEAR_WEAPON_DEBUG" in window,
  }));
  assert.deepEqual(
    globals,
    { weaponDebug: "undefined", weaponDebugPresent: false },
    `${target} production run installed an engineering global`,
  );
}

async function assertRuntimeIsolation(browser, target, directory) {
  const host = await serve(directory);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(recordCanvasText);
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
    await page.goto(`${host.origin}/${engineeringQuery}`, {
      waitUntil: "domcontentloaded",
      timeout: STATE_WAIT_MS,
    });
    await page.waitForFunction((expectedTarget) => window.__TEAR_BUILD__?.target === expectedTarget, target, {
      timeout: STATE_WAIT_MS,
    });
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
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
        loadedScripts: performance.getEntriesByType("resource").filter((entry) => entry.name.includes(".js")).length,
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
    await assertReleaseSurfaces(page, target);
    assert.deepEqual(
      pageErrors,
      [],
      `${target} production bundle raised a page error during the release-surface journey`,
    );
  } finally {
    await context.close();
    await host.close();
  }
}

async function main() {
  const directories = new Map(targets.map((target) => [target, path.join(repositoryRoot, "dist", target)]));
  for (const [target, directory] of directories) {
    assert.ok(fs.existsSync(directory), `dist/${target} is missing; run the production build first`);
    assertNoStaticBridge(target, directory);
  }

  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await launchJourney(chromium, {
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
  console.log("production runtime bridge and release-surface isolation passed for standalone and crazygames");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
