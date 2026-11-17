const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  STATE_WAIT_MS,
  JOURNEY_LIMIT_MS,
  describeStall,
  pollEvery,
  trackScriptLoads,
  waitForScriptLoads,
  watchForStalls,
} = require("./browser-waits");

/**
 * Where a journey parks the pointer so the held blade hangs straight down from a player standing
 * at x 320 (the practice start): below the floor line, away from both enemy spawn bands.
 */
const BLADE_REST_POINT = Object.freeze({ x: 320, y: 890 });

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

/** Page init script for `recordFrames`: the last drawn frame's text and stroked rectangles, in CSS pixels. */
function recordCanvasFrames() {
  const frame = { texts: [], rects: [] };
  let pending = { texts: [], rects: [] };
  const toCss = (context, x, y) => {
    const m = context.getTransform(),
      bounds = context.canvas.getBoundingClientRect(),
      k = bounds.width / context.canvas.width;
    return {
      x: bounds.left + (m.a * x + m.c * y + m.e) * k,
      y: bounds.top + (m.b * x + m.d * y + m.f) * k,
      k: k * Math.hypot(m.a, m.b),
    };
  };
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function recordText(value, x, y, ...rest) {
    if (this.canvas.id === "game")
      pending.texts.push({ text: String(value), baseline: this.textBaseline, ...toCss(this, x, y) });
    return fillText.call(this, value, x, y, ...rest);
  };
  const strokeRect = CanvasRenderingContext2D.prototype.strokeRect;
  CanvasRenderingContext2D.prototype.strokeRect = function recordRect(x, y, w, h) {
    if (this.canvas.id === "game") {
      const origin = toCss(this, x, y);
      pending.rects.push({ x: origin.x, y: origin.y, w: w * origin.k, h: h * origin.k });
    }
    return strokeRect.call(this, x, y, w, h);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      if (pending.texts.length > 0) {
        frame.texts = pending.texts;
        frame.rects = pending.rects;
      }
      pending = { texts: [], rects: [] };
      callback(time);
    });
  window.__TEAR_JOURNEY_FRAME__ = frame;
}

async function withJourney(options, run) {
  const buildDirectory = process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone";
  const root = path.resolve(__dirname, "..", "dist", buildDirectory);
  assert.ok(
    fs.existsSync(path.join(root, "index.html")),
    `dist/${buildDirectory} is missing; run pnpm build:test:standalone first`,
  );
  const { calculateArtifactHash, readSourceIdentity } = await import("../scripts/release-artifact.mjs");
  const buildInfoPath = path.join(root, "build-info.json");
  assert.ok(
    fs.existsSync(buildInfoPath),
    `dist/${buildDirectory}/build-info.json is missing; build attribution is required`,
  );
  const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  const expectedTarget = buildDirectory.includes("crazygames") ? "crazygames" : "standalone";
  assert.equal(buildInfo.format, "tear-build-info", "served build-info format is unsupported");
  assert.equal(buildInfo.target, expectedTarget, "served build target does not match the journey target");
  assert.equal(buildInfo.mode, buildDirectory, "served build mode does not match the journey directory");
  assert.match(buildInfo.toolchain?.digest, /^[a-f0-9]{64}$/, "served build toolchain identity is required");
  assert.match(buildInfo.configuration?.digest, /^[a-f0-9]{64}$/, "served build configuration identity is required");
  assert.match(buildInfo.buildIdentityDigest, /^[a-f0-9]{64}$/, "served complete build identity is required");
  assert.equal(
    buildInfo.contentAddressedPath,
    `artifacts/tearbench/builds/${buildInfo.buildIdentityDigest}/payload`,
    "served content-addressed build path is stale",
  );
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
  // When each request reached this server and when its response finished, for stall reports.
  const serverLog = [];
  const server = http.createServer((request, response) => {
    const entry = { url: request.url, arrived: Date.now(), finished: undefined };
    serverLog.push(entry);
    if (serverLog.length > 400) serverLog.shift();
    response.on("close", () => {
      entry.finished = Date.now();
    });
    const pathname = new URL(request.url, baseUrl).pathname;
    if (pathname === "/__tear_browser_blank_fixture__.html") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Tear browser fixture</title>");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    const containedPath = path.relative(root, file);
    if (
      containedPath.startsWith("..") ||
      path.isAbsolute(containedPath) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    browser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    });
    // Journey suites repeatedly navigate the same instrumented page. Keep the
    // production service worker out of this harness so an activation/update
    // race cannot replace the exact test build between boots. PWA behavior has
    // its own production and offline browser gates.
    const page = await browser.newPage({
      viewport: options.viewport || { width: 1600, height: 900 },
      deviceScaleFactor: options.deviceScaleFactor || 1,
      // A touch phone: the game selects its compact layout only for touch screens.
      ...(options.touch ? { isMobile: true, hasTouch: true } : {}),
      serviceWorkers: "block",
    });
    // A call that names no timeout still gets the state-wait ceiling, not Playwright's 30 s.
    page.setDefaultTimeout(STATE_WAIT_MS);
    page.setDefaultNavigationTimeout(STATE_WAIT_MS);
    await watchForStalls(page, { serverLog });
    trackScriptLoads(page);
    if (options.settings) {
      await page.addInitScript((settings) => {
        window.__TEAR_TEST_STORAGE__ = {
          tear_settings: JSON.stringify({
            gfx: settings.gfx,
            reducedMotion: settings.reducedMotion,
            highContrast: settings.highContrast,
            flash: settings.flashScale,
          }),
        };
      }, options.settings);
    }
    if (options.colorScheme || options.reducedMotion) {
      await page.emulateMedia({ colorScheme: options.colorScheme, reducedMotion: options.reducedMotion });
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack || error.message));
    await page.route("**/*", (route) =>
      route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort(),
    );

    const initialQuery = {
      test: "1",
      ...(options.debugApi === false ? {} : { bossdebug: "1" }),
      ...(options.query || {}),
    };
    async function boot(query = initialQuery) {
      await page.goto(`${baseUrl}/index.html?${new URLSearchParams(query).toString()}`, {
        waitUntil: "domcontentloaded",
        timeout: STATE_WAIT_MS,
      });
      try {
        if (options.ordinaryWatch) {
          await page.waitForFunction(
            () =>
              window.__TEAR_WATCH_AGENT__ &&
              window.__TEAR_RUNTIME_ENVIRONMENT__ &&
              window.__PANTHEON_TEST &&
              [...document.querySelectorAll("canvas")].some(
                (canvas) =>
                  canvas.width > 0 &&
                  canvas.height > 0 &&
                  canvas.getBoundingClientRect().width > 0 &&
                  canvas.getContext("2d")?.getImageData(0, 0, 1, 1).data[3] > 0,
              ),
            undefined,
            { timeout: STATE_WAIT_MS },
          );
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
        } else {
          await page.waitForFunction(
            (debugApi) =>
              window.__TEAR_CATALOG_DEBUG__ &&
              window.__TEAR_RUNTIME_ENVIRONMENT__ &&
              (!debugApi || window.__PANTHEON_TEST),
            options.debugApi !== false,
            { timeout: STATE_WAIT_MS },
          );
          await page.waitForFunction(() => window.__TEAR_DIAGNOSTICS__?.snapshot().frame.samples > 0, undefined, {
            timeout: STATE_WAIT_MS,
          });
        }
      } catch (error) {
        throw new Error(`Tear browser boot unavailable: ${errors.join("\n") || "no page error was emitted"}`, {
          cause: error,
        });
      }
      await page.mouse.click(10, 10);
    }
    async function waitScreen(screen) {
      await page.waitForFunction((expected) => window.__PANTHEON_TEST.state().game === expected, screen, {
        timeout: STATE_WAIT_MS,
      });
      // A cold screen's state can become active before its lazy renderer chunk has
      // registered the canvas buttons, so the next pointer action waits for that chunk.
      await waitForScriptLoads(page);
    }
    // A screen that has just opened ignores input for a moment (UI_CONFIRM_SETTLE_SECONDS), and a
    // loaded runner can reach the click before the game has drawn enough frames to arm it. So click
    // again only while the game is still on the screen the click started from; once it has left,
    // never click again (the next screen may have a control at the same place) and wait for the
    // expected screen. The screen change is the pass condition; the clock only bounds the trying.
    async function clickAndWait(x, y, screen) {
      const gameScreen = () => page.evaluate(() => window.__PANTHEON_TEST.state().game);
      const start = await gameScreen();
      const deadline = Date.now() + STATE_WAIT_MS;
      await page.mouse.click(x, y);
      while (start !== screen) {
        try {
          await page.waitForFunction((from) => window.__PANTHEON_TEST.state().game !== from, start, {
            timeout: pollEvery(1000),
          });
          break;
        } catch (error) {
          if (error?.name !== "TimeoutError") throw error;
          if (Date.now() > deadline)
            throw new Error(`clicking (${String(x)}, ${String(y)}) never left ${start} for ${screen}`, {
              cause: error,
            });
          await page.mouse.click(x, y);
        }
      }
      await waitScreen(screen);
    }
    // Canvas screens have no DOM controls, so `recordFrames` journeys find them the way a
    // player does: from what the last frame drew. Each frame's text and stroked rectangles
    // are kept in CSS pixels; a reward card is the outlined frame around its number badge.
    if (options.recordFrames) await page.addInitScript(recordCanvasFrames);
    /** Choice and results screens ignore input for UI_CONFIRM_SETTLE_SECONDS (0.35 s) after they open. */
    async function waitArmed(screen) {
      await waitScreen(screen);
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const start = performance.now();
            const tick = () => {
              if (performance.now() - start >= 450) resolve();
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );
    }
    // Screens ease in when they open, so a control is located only once two consecutive
    // frames drew it in the same place: where a player sees it come to rest.
    /** The middle of a drawn control label (RETRY, SKIP RESERVE, a tab name). */
    async function labelPoint(label) {
      assert.ok(options.recordFrames, "labelPoint needs the recordFrames journey option");
      await page.evaluate(() => {
        window.__TEAR_JOURNEY_LAST_POINT__ = null;
      });
      const handle = await page.waitForFunction(
        (text) => {
          const entry = window.__TEAR_JOURNEY_FRAME__.texts.find((candidate) => candidate.text === text);
          const point = entry ? { x: Math.round(entry.x), y: Math.round(entry.y - 4) } : null;
          const previous = window.__TEAR_JOURNEY_LAST_POINT__;
          window.__TEAR_JOURNEY_LAST_POINT__ = { key: `label:${text}`, point };
          return point &&
            previous?.key === `label:${text}` &&
            previous.point?.x === point.x &&
            previous.point.y === point.y
            ? point
            : null;
        },
        label,
        { timeout: STATE_WAIT_MS },
      );
      return handle.jsonValue();
    }
    async function clickLabel(label, screen) {
      const point = await labelPoint(label);
      await clickAndWait(point.x, point.y, screen);
    }
    // The held blade follows the pointer, and a click on a canvas control leaves the pointer
    // on that control: when play resumes, the blade sweeps from where it was to the control and
    // can strike whatever appears on the way (a restarted practice opponent spawning beside the
    // player). These two helpers keep the blade still and pointed away from the arena floor.
    /** Points the blade at `rest` and waits until it is held, not swinging, and slower than 30 px/s. */
    async function restBlade(rest = BLADE_REST_POINT) {
      await page.mouse.move(rest.x, rest.y, { steps: 4 });
      await page.waitForFunction(
        () => {
          const blade = window.__TEAR_RUNTIME_ENVIRONMENT__
            .create("A")
            .captureSnapshot("blade-rest", "recorded-canonical").state["tear.blade.v1"];
          return blade?.state === "held" && blade.swingActive !== true && Math.abs(blade.tipSpeed ?? 0) < 30;
        },
        undefined,
        { timeout: STATE_WAIT_MS },
      );
    }
    /**
     * Clicks the control at (`x`, `y`) and moves the pointer back to `rest` in the same page task,
     * so the game's next frame already aims at `rest`. A bare click event (no mousedown) is what a
     * menu control reads, and it does not also queue a swing. Rest the blade first (`restBlade`).
     */
    async function clickAtRest(x, y, screen, rest = BLADE_REST_POINT) {
      await page.evaluate(
        ({ point, back }) => {
          const canvas = document.querySelector("canvas");
          const event = (type, at) =>
            new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 });
          canvas.dispatchEvent(event("mousemove", point));
          canvas.dispatchEvent(event("click", point));
          canvas.dispatchEvent(event("mousemove", back));
        },
        { point: { x, y }, back: rest },
      );
      await page.mouse.move(rest.x, rest.y);
      await waitScreen(screen);
    }
    /** Centre of the drawn card whose key badge reads `number`: the smallest outlined frame around the badge. */
    async function cardCentre(number) {
      assert.ok(options.recordFrames, "cardCentre needs the recordFrames journey option");
      await page.evaluate(() => {
        window.__TEAR_JOURNEY_LAST_POINT__ = null;
      });
      const handle = await page.waitForFunction(
        (label) => {
          const frame = window.__TEAR_JOURNEY_FRAME__;
          const badge = frame.texts.find((entry) => entry.text === label && entry.baseline === "middle");
          if (!badge) return null;
          const cards = frame.rects.filter(
            (rect) =>
              rect.h > 150 &&
              rect.w > 150 &&
              badge.x > rect.x &&
              badge.x < rect.x + rect.w &&
              badge.y > rect.y &&
              badge.y < rect.y + rect.h,
          );
          if (cards.length === 0) return null;
          const card = cards.reduce((best, rect) => (rect.w * rect.h < best.w * best.h ? rect : best));
          const point = { x: Math.round(card.x + card.w / 2), y: Math.round(card.y + card.h / 2) };
          const previous = window.__TEAR_JOURNEY_LAST_POINT__;
          window.__TEAR_JOURNEY_LAST_POINT__ = { key: `card:${label}`, point };
          return previous?.key === `card:${label}` && previous.point?.x === point.x && previous.point.y === point.y
            ? point
            : null;
        },
        String(number),
        { timeout: STATE_WAIT_MS },
      );
      return handle.jsonValue();
    }
    async function clickCard(number, screen) {
      const centre = await cardCentre(number);
      await clickAndWait(centre.x, centre.y, screen);
    }
    // Migration tests need to create a legacy IndexedDB schema at this exact
    // HTTP origin before the application opens it. Ordinary journeys retain
    // their existing eager boot behavior.
    if (!options.deferBoot) await boot();
    const served = await page.request.get(`${baseUrl}/build-info.json`);
    assert.ok(served.ok(), "served build-info.json is unavailable");
    assert.deepEqual(await served.json(), buildInfo, "served build metadata differs from the verified local artifact");
    // One ceiling for the whole journey: page.evaluate has no timeout, so a page whose main thread
    // never comes back would otherwise hold the job until the CI limit and print nothing.
    const limitMs = options.limitMs ?? JOURNEY_LIMIT_MS;
    let limitTimer;
    const overLimit = new Promise((_resolve, reject) => {
      limitTimer = setTimeout(() => {
        void describeStall(page).then((stall) => {
          reject(new Error(`${options.name} did not finish within ${String(limitMs / 1000)} s: ${stall}`));
        });
      }, limitMs);
    });
    try {
      await Promise.race([
        run({
          page,
          errors,
          baseUrl,
          boot,
          waitScreen,
          clickAndWait,
          buildInfo,
          waitArmed,
          labelPoint,
          clickLabel,
          cardCentre,
          clickCard,
          restBlade,
          clickAtRest,
        }),
        overLimit,
      ]);
    } finally {
      clearTimeout(limitTimer);
    }
    assert.deepEqual(errors, [], `${options.name} page errors: ${errors.join("\n")}`);
  } finally {
    if (browser && options.browserCloseTimeoutMs) {
      let timeout;
      try {
        await Promise.race([
          browser.close(),
          new Promise((resolve) => {
            timeout = setTimeout(resolve, options.browserCloseTimeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    } else if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Poll resolved durable evidence rather than an async predicate's Promise. */
async function waitForBrowserValue(
  page,
  predicate,
  argument,
  { timeout = STATE_WAIT_MS, polling = pollEvery(50) } = {},
) {
  assert.ok(Number.isFinite(timeout) && timeout > 0, "async browser wait requires a positive timeout");
  assert.ok(Number.isFinite(polling) && polling > 0, "async browser wait requires a positive polling interval");
  let cancelled = false,
    timer;
  const deadline = new Promise((resolve, reject) => {
    void resolve;
    timer = setTimeout(
      () => reject(new Error(`async browser condition did not become truthy within ${timeout}ms`)),
      timeout,
    );
  });
  const poll = async () => {
    while (!cancelled) {
      const value = await page.evaluate(predicate, argument);
      if (cancelled) return undefined;
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, polling));
    }
    return undefined;
  };
  try {
    return await Promise.race([poll(), deadline]);
  } finally {
    cancelled = true;
    clearTimeout(timer);
  }
}

module.exports = { withJourney, waitForBrowserValue, BLADE_REST_POINT };
