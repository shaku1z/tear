/**
 * Load profile of the release builds: what a player downloads and waits for
 * before the first frame, before the menu accepts input, and from pressing
 * PLAY (a new player's first press, into the tutorial) to playing, on throttled network and CPU device profiles.
 *
 * Each release build (`dist/standalone`, `dist/crazygames`) is
 * served the way its host serves it: text compressed (brotli, else gzip) and,
 * for standalone, the build's `_headers` cache rules over the Cloudflare
 * default `public, max-age=0, must-revalidate` with ETags. The CrazyGames
 * build runs under a portal-style subpath with an SDK stub. The milestones are
 * the `tear:*` User Timing marks the game records (src/platform/startup-milestones.ts).
 *
 * Cold load is a fresh browser context; warm load reloads in the same context,
 * after the service worker (standalone) has installed. Byte and request counts
 * are deterministic for a build and are what the budget checks; times are
 * reported with the median of TEAR_LOAD_REPEATS runs and are noise-prone on a
 * shared machine.
 *
 *   node tests/browser-load-profile.js            report every target and profile
 *   node tests/browser-load-profile.js --check    also enforce config/load-budgets.json
 *
 * TEAR_LOAD_TARGETS=standalone,crazygames  TEAR_LOAD_PROFILES=desktop,laptop (phone: parked with mobile)
 * TEAR_LOAD_REPEATS (default 1)  TEAR_LOAD_OUTPUT (report path)  TEAR_LOAD_START=0 (skip START)
 */
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const { SLOW_STATE_WAIT_MS, STATE_WAIT_MS, holdFor, pollEvery, launchJourney } = require("./browser-waits");

const projectRoot = path.resolve(__dirname, "..");
const check = process.argv.includes("--check");
const budgets = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "load-budgets.json"), "utf8"));
const repeats = Number(process.env.TEAR_LOAD_REPEATS || 1);
const driveStart = process.env.TEAR_LOAD_START !== "0";
const output = path.resolve(
  projectRoot,
  process.env.TEAR_LOAD_OUTPUT || "artifacts/tearbench/generated/browser-load-profile.json",
);

/** Device classes. Network numbers follow Chrome DevTools/Lighthouse presets; CPU is Chromium's throttle factor. */
const PROFILES = Object.freeze({
  desktop: { viewport: { width: 1600, height: 900 }, scale: 1, mobile: false, cpu: 1, rttMs: 20, downKbps: 40_000 },
  laptop: { viewport: { width: 1366, height: 768 }, scale: 1, mobile: false, cpu: 4, rttMs: 40, downKbps: 10_000 },
  phone: { viewport: { width: 844, height: 390 }, scale: 3, mobile: true, cpu: 4, rttMs: 150, downKbps: 1_600 },
});
const TARGETS = Object.freeze({
  standalone: { directory: "dist/standalone", base: "/", serviceWorker: true, sdk: false },
  crazygames: { directory: "dist/crazygames", base: "/games/tear/", serviceWorker: false, sdk: true },
});
const selectedTargets = (process.env.TEAR_LOAD_TARGETS || Object.keys(TARGETS).join(","))
  .split(",")
  .filter((target) => fs.existsSync(path.join(projectRoot, TARGETS[target]?.directory ?? "missing", "index.html")));
// The phone profile is off by default while mobile is paused (plans/MOBILE_LATER.md): a release
// build shows a phone the computer-only line and never starts, so there is no START to time.
const selectedProfiles = (process.env.TEAR_LOAD_PROFILES || "desktop,laptop").split(",");
assert.ok(
  selectedProfiles.every((profile) => profile in PROFILES),
  `TEAR_LOAD_PROFILES accepts ${Object.keys(PROFILES).join(", ")}`,
);
assert.ok(selectedTargets.length > 0, "no release build found; run pnpm build:standalone (and the other targets)");

const CONTENT_TYPES = Object.freeze({
  ".js": "text/javascript",
  ".html": "text/html",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".txt": "text/plain",
});
const COMPRESSIBLE = new Set([".js", ".html", ".css", ".json", ".webmanifest", ".txt", ".svg"]);

/** `_headers` rules (Cloudflare syntax: a path pattern line, then indented headers). */
function parseHeaders(directory) {
  const file = path.join(directory, "_headers");
  if (!fs.existsSync(file)) return [];
  const rules = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    if (!/^\s/u.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const [name, ...value] = line.trim().split(":");
      rules.at(-1).headers[name.trim()] = value.join(":").trim();
    }
  }
  return rules;
}

function matches(pattern, pathname) {
  const expression = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replaceAll("*", ".*")}$`, "u");
  return expression.test(pathname);
}

/**
 * Every file of a build, read and compressed once before serving so the
 * server adds no latency. Brotli quality 5 approximates an edge that
 * compresses on the fly; a host serving maximum-quality brotli sends less.
 */
function loadBuild(root) {
  const files = new Map();
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const body = fs.readFileSync(file);
        const compressible = COMPRESSIBLE.has(path.extname(file));
        files.set(path.relative(root, file).replaceAll("\\", "/"), {
          body,
          extension: path.extname(file),
          etag: `"${crypto.createHash("sha1").update(body).digest("hex")}"`,
          br: compressible
            ? zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
            : null,
          gzip: compressible ? zlib.gzipSync(body, { level: 6 }) : null,
        });
      }
    }
  };
  walk(root);
  return files;
}

/** Serves one build the way its host does. */
function serveBuild(target) {
  const { directory, base } = TARGETS[target];
  const root = path.join(projectRoot, directory);
  const rules = parseHeaders(root);
  const files = loadBuild(root);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (target === "crazygames" && url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        `<!doctype html><body style="margin:0"><iframe id="game" src="${base}index.html" style="border:0;width:100vw;height:100vh" allow="autoplay; fullscreen"></iframe></body>`,
      );
      return;
    }
    if (!url.pathname.startsWith(base)) return void response.writeHead(404).end();
    const relative = decodeURIComponent(url.pathname.slice(base.length)) || "index.html";
    const entry = files.get(relative);
    if (entry === undefined) return void response.writeHead(404).end();
    const { extension } = entry;
    const headers = {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: entry.etag,
    };
    const servedPath = `/${relative}`;
    for (const rule of rules) if (matches(rule.pattern, servedPath)) Object.assign(headers, rule.headers);
    if (request.headers["if-none-match"] === entry.etag) return void response.writeHead(304, headers).end();
    const accepted = String(request.headers["accept-encoding"] ?? "");
    let body = entry.body;
    if (entry.br && accepted.includes("br")) {
      headers["Content-Encoding"] = "br";
      body = entry.br;
    } else if (entry.gzip && accepted.includes("gzip")) {
      headers["Content-Encoding"] = "gzip";
      body = entry.gzip;
    }
    headers["Content-Length"] = String(body.length);
    response.writeHead(200, headers);
    response.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const origin = `http://127.0.0.1:${String(port)}`;
      resolve({
        origin,
        url: target === "crazygames" ? `${origin}/` : `${origin}${base}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}

const CRAZYGAMES_SDK_STUB = `
  window.CrazyGames = { SDK: {
    environment: "crazygames",
    init: async () => undefined,
    game: {
      settings: { muteAudio: false },
      addSettingsChangeListener: () => undefined,
      loadingStart: () => undefined, loadingStop: () => undefined,
      gameplayStart: () => undefined, gameplayStop: () => undefined, happytime: () => undefined,
    },
    data: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    ad: { requestAd: (_type, callbacks) => { callbacks.adStarted(); callbacks.adFinished(); }, hasAdblock: async () => false },
    user: { getUser: async () => null, isUserAccountAvailable: false, addAuthListener: () => undefined },
  } };`;

/** Records drawn canvas text so the harness can click menu labels like a player. */
function installTextObserver() {
  performance.setResourceTimingBufferSize(4000);
  const observed = { frame: 0, text: [] };
  Object.defineProperty(window, "__LOAD_PROFILE__", { value: observed });
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (value, x, y, ...rest) {
    if (this.canvas.id === "game") {
      try {
        const m = this.getTransform();
        const rect = this.canvas.getBoundingClientRect();
        const ratio = rect.height / this.canvas.height;
        const width = this.measureText(String(value)).width * Math.hypot(m.b, m.d) * ratio;
        const cx = rect.left + (m.a * x + m.c * y + m.e) * ratio;
        const left = this.textAlign === "center" ? cx - width / 2 : this.textAlign === "right" ? cx - width : cx;
        observed.text.push({ t: String(value), x: left + width / 2, y: rect.top + (m.b * x + m.d * y + m.f) * ratio });
        if (observed.text.length > 4000) observed.text.splice(0, 2000);
      } catch {
        /* observation never disturbs drawing */
      }
    }
    return fillText.call(this, value, x, y, ...rest);
  };
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor((sorted.length - 1) / 2)];
};
const round = (value) => (typeof value === "number" ? Math.round(value) : null);

function category(pathname) {
  if (pathname.includes("/audio/")) return pathname.endsWith(".json") ? "audio-manifest" : "audio";
  if (pathname.includes("/vendor/")) return "music-engine";
  if (pathname.includes("worker")) return "worker";
  if (pathname.endsWith(".js")) return "script";
  if (pathname.endsWith(".woff2")) return "font";
  if (/\.(png|webp|jpg)$/u.test(pathname)) return "image";
  if (pathname.endsWith(".html") || pathname.endsWith("/")) return "document";
  return "other";
}

/**
 * Same-origin Resource Timing of the game document, on the same clock as the
 * `tear:*` marks. `transferSize` is the bytes on the wire including headers;
 * it is 0 for a response from the HTTP cache or the service worker's cache.
 */
function readTimeline() {
  const navigation = performance.getEntriesByType("navigation")[0];
  const describe = (entry) => ({
    path: new URL(entry.name).pathname,
    end: entry.responseEnd,
    bytes: entry.transferSize,
    body: entry.encodedBodySize,
    serviceWorker: entry.workerStart > 0,
  });
  const resources = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.startsWith(location.origin))
    .map(describe);
  if (navigation) resources.unshift(describe(navigation));
  const at = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
  return {
    resources,
    domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
    firstFrame: at("tear:first-frame"),
    menuInteractive: at("tear:loading-finished"),
    playing: at("tear:gameplay-start"),
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
  };
}

/** Requests and bytes that completed in (from, until] page milliseconds. */
function span(timeline, until, from = Number.NEGATIVE_INFINITY) {
  if (typeof until !== "number") return null;
  const entries = timeline.resources.filter((entry) => entry.end <= until && entry.end > from);
  const byCategory = {};
  for (const entry of entries) {
    const bucket = (byCategory[category(entry.path)] ??= { requests: 0, bytes: 0 });
    bucket.requests += 1;
    bucket.bytes += entry.bytes;
  }
  return {
    requests: entries.length,
    networkRequests: entries.filter((entry) => entry.bytes > 0).length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    byCategory,
  };
}

function marks(timeline) {
  return {
    firstFrameMs: round(timeline.firstFrame),
    menuInteractiveMs: round(timeline.menuInteractive),
    domContentLoadedMs: round(timeline.domContentLoaded),
    heapBytesAtMenu: timeline.heapBytes,
  };
}

/**
 * A fresh player's first press into gameplay, with real pointer or touch input on the drawn label;
 * returns the page time of the press. A fresh profile is tutorial-first, so that press is PLAY and the
 * gameplay it starts is the tutorial's first lesson: the cold path a new player downloads and waits for.
 */
async function pressStart(page, frame, profile) {
  const offset =
    frame === page
      ? { x: 0, y: 0 }
      : await (await frame.frameElement()).boundingBox().then((box) => box ?? { x: 0, y: 0 });
  const find = async (pattern, timeout = STATE_WAIT_MS) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const hit = await frame.evaluate((source) => {
        const expression = new RegExp(source, "u");
        const { text } = window.__LOAD_PROFILE__;
        for (let index = text.length - 1; index >= Math.max(0, text.length - 400); index -= 1)
          if (expression.test(text[index].t)) return text[index];
        return null;
      }, pattern.source);
      if (hit) return { x: hit.x + offset.x, y: hit.y + offset.y };
      await page.waitForTimeout(pollEvery(100));
    }
    throw new Error(`${String(pattern)} was never drawn`);
  };
  const click = async (point) => {
    if (profile.mobile) {
      await page.touchscreen.tap(point.x, point.y);
      return;
    }
    await page.mouse.move(point.x, point.y, { steps: 3 });
    await page.waitForTimeout(holdFor(120));
    await page.mouse.down();
    await page.waitForTimeout(holdFor(60));
    await page.mouse.up();
  };
  const play = await find(/^PLAY$/u);
  const pressedMs = await frame.evaluate(() => performance.now());
  await click(play);
  await frame.waitForFunction(() => performance.getEntriesByName("tear:gameplay-start").length > 0, undefined, {
    timeout: SLOW_STATE_WAIT_MS,
    polling: 50,
  });
  return pressedMs;
}

async function measureLoad(browser, target, profileId, server) {
  const profile = PROFILES[profileId];
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.scale,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    serviceWorkers: TARGETS[target].serviceWorker ? "allow" : "block",
  });
  await context.addInitScript(installTextObserver);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A script that fails to load is not a page error; index.html marks #boot failed instead.
  const failedRequests = [];
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} (${request.failure()?.errorText})`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  // Playwright routing would disable the HTTP cache and void the warm load, so the
  // portal SDK stub is served through CDP request interception of that one URL.
  if (TARGETS[target].sdk) {
    cdp.on("Fetch.requestPaused", (event) => {
      void cdp.send("Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
        body: Buffer.from(CRAZYGAMES_SDK_STUB).toString("base64"),
      });
    });
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "https://sdk.crazygames.com/*" }] });
  }
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.rttMs,
    downloadThroughput: (profile.downKbps * 1000) / 8,
    uploadThroughput: (Math.min(profile.downKbps, 5000) * 1000) / 8,
  });
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  const gameFrame = () => (target === "crazygames" ? page.frames().find((frame) => frame !== page.mainFrame()) : page);
  const load = async () => {
    await page.goto(server.url, { timeout: STATE_WAIT_MS, waitUntil: "commit" });
    const deadline = Date.now() + SLOW_STATE_WAIT_MS;
    let frame;
    while (!(frame = gameFrame())) {
      assert.ok(Date.now() < deadline, `${target}/${profileId}: game frame never attached`);
      await page.waitForTimeout(pollEvery(50));
    }
    // The first frame, or a boot screen that will never give way to one: a failed boot
    // (index.html) or the computer-only line (a device the build reads as touch-only).
    const bootState = () =>
      frame.evaluate(() => {
        const boot = document.getElementById("boot");
        return boot === null ? "removed" : `#boot.${boot.className || "loading"}: ${boot.innerText.trim()}`;
      });
    const outcome = await frame
      .waitForFunction(
        () => {
          if (performance.getEntriesByName("tear:first-frame").length > 0) return "first-frame";
          const boot = document.getElementById("boot");
          if (boot?.classList.contains("failed")) return "boot-failed";
          if (boot?.classList.contains("computer")) return "computer-only";
          return false;
        },
        undefined,
        { timeout: SLOW_STATE_WAIT_MS, polling: 100 },
      )
      .then((handle) => handle.jsonValue())
      .catch(async (error) => {
        throw new Error(
          `${target}/${profileId}: no first frame. Boot screen: ${await bootState().catch(() => "unreadable")}; ` +
            `page errors: ${JSON.stringify(errors)}; failed requests: ${JSON.stringify(failedRequests)}`,
          { cause: error },
        );
      });
    assert.equal(
      outcome,
      "first-frame",
      `${target}/${profileId}: the game never started. Boot screen: ${await bootState()}; ` +
        `page errors: ${JSON.stringify(errors)}; failed requests: ${JSON.stringify(failedRequests)}`,
    );
    await frame
      .waitForFunction(() => performance.getEntriesByName("tear:loading-finished").length > 0, undefined, {
        timeout: STATE_WAIT_MS,
        polling: 100,
      })
      .catch(() => undefined);
    return frame;
  };

  const coldFrame = await load();
  const pressedMs = driveStart ? await pressStart(page, coldFrame, profile) : null;
  // Music is ready when every stem of the first cue has arrived (four in today's cues).
  // The budget check reads bytes only, so it does not wait for the stems.
  const musicReadyMs = check
    ? null
    : await coldFrame
        .waitForFunction(
          () => {
            const stems = performance
              .getEntriesByType("resource")
              .filter((entry) => /\/audio\/cues\/.+\.ogg$/u.test(entry.name));
            if (stems.length === 0) return false;
            const cue = new URL(stems[0].name).pathname.split("/opus/")[0];
            const sameCue = stems.filter((entry) => new URL(entry.name).pathname.startsWith(`${cue}/opus/`));
            return sameCue.length >= 4 ? Math.max(...sameCue.map((entry) => entry.responseEnd)) : false;
          },
          undefined,
          { timeout: SLOW_STATE_WAIT_MS, polling: 250 },
        )
        .then((handle) => handle.jsonValue())
        .catch(() => null);
  const coldTimeline = await coldFrame.evaluate(readTimeline);
  const cold = {
    ...marks(coldTimeline),
    startToPlayingMs:
      pressedMs === null || coldTimeline.playing === null ? null : round(coldTimeline.playing - pressedMs),
    musicReadyMs: round(musicReadyMs),
    toFirstFrame: span(coldTimeline, coldTimeline.firstFrame),
    toMenu: span(coldTimeline, coldTimeline.menuInteractive),
    toPlaying: span(coldTimeline, coldTimeline.playing),
    duringStart: pressedMs === null ? null : span(coldTimeline, coldTimeline.playing, pressedMs),
    resources: coldTimeline.resources.map((entry) => ({ ...entry, end: round(entry.end) })),
  };
  // The returning player: on standalone the service worker has installed and controls the next load.
  if (TARGETS[target].serviceWorker)
    await coldFrame
      .waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, { timeout: SLOW_STATE_WAIT_MS })
      .catch(() => undefined);
  const warmFrame = await load();
  const warmTimeline = await warmFrame.evaluate(readTimeline);
  const warm = {
    ...marks(warmTimeline),
    toFirstFrame: span(warmTimeline, warmTimeline.firstFrame),
    toMenu: span(warmTimeline, warmTimeline.menuInteractive),
  };
  await context.close();
  assert.deepEqual(errors, [], `${target}/${profileId}: page errors`);
  return { cold, warm };
}

function summarize(runs) {
  const take = (phase, key) => median(runs.map((run) => run[phase]?.[key]));
  const [first] = runs;
  return {
    cold: {
      firstFrameMs: take("cold", "firstFrameMs"),
      menuInteractiveMs: take("cold", "menuInteractiveMs"),
      startToPlayingMs: take("cold", "startToPlayingMs"),
      musicReadyMs: take("cold", "musicReadyMs"),
      heapBytesAtMenu: take("cold", "heapBytesAtMenu"),
      toFirstFrame: first.cold.toFirstFrame,
      toMenu: first.cold.toMenu,
      toPlaying: first.cold.toPlaying,
      duringStart: first.cold.duringStart,
    },
    warm: {
      firstFrameMs: take("warm", "firstFrameMs"),
      menuInteractiveMs: take("warm", "menuInteractiveMs"),
      toFirstFrame: first.warm.toFirstFrame,
      toMenu: first.warm.toMenu,
    },
    runsMs: runs.map((run) => ({
      cold: [run.cold.firstFrameMs, run.cold.menuInteractiveMs, run.cold.startToPlayingMs, run.cold.musicReadyMs],
      warm: [run.warm.firstFrameMs, run.warm.menuInteractiveMs],
    })),
  };
}

const withoutStems = (span) => (span ? span.bytes - (span.byCategory.audio?.bytes ?? 0) : undefined);

/** Byte and request ceilings only: they are deterministic for a build, unlike the times. */
function enforce(report) {
  const failures = [];
  for (const [target, profiles] of Object.entries(report.targets)) {
    const limits = budgets.targets[target];
    const measured = profiles.desktop?.summary;
    if (!limits || !measured) continue;
    const checks = [
      ["cold bytes to first frame", measured.cold.toFirstFrame?.bytes, limits.coldBytesToFirstFrame],
      ["cold requests to first frame", measured.cold.toFirstFrame?.requests, limits.coldRequestsToFirstFrame],
      // Music stems stream in while the player clicks through the menu, so how many have arrived
      // by START depends on timing; everything else a first run needs has arrived by then.
      [
        "cold bytes to playing, music stems excluded",
        withoutStems(measured.cold.toPlaying),
        limits.coldBytesToPlayingWithoutStems,
      ],
      [
        "warm network requests to first frame",
        measured.warm.toFirstFrame?.networkRequests,
        limits.warmNetworkRequestsToFirstFrame,
      ],
    ];
    for (const [name, value, limit] of checks) {
      if (limit === undefined) continue;
      if (typeof value !== "number") failures.push(`${target}: ${name} was not measured`);
      else if (value > limit) failures.push(`${target}: ${name} ${String(value)} > ${String(limit)}`);
    }
  }
  return failures;
}

async function main() {
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const browser = await launchJourney(chromium, {
    headless: true,
    ...(fs.existsSync(chromePath) && process.env.TEAR_LOAD_BROWSER !== "bundled" ? { executablePath: chromePath } : {}),
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    browser: browser.version(),
    repeats,
    profiles: PROFILES,
    targets: {},
  };
  try {
    for (const target of selectedTargets) {
      const server = await serveBuild(target);
      report.targets[target] = {};
      try {
        for (const profileId of check ? ["desktop"] : selectedProfiles) {
          const runs = [];
          for (let repeat = 0; repeat < repeats; repeat += 1)
            runs.push(await measureLoad(browser, target, profileId, server));
          const summary = summarize(runs);
          report.targets[target][profileId] = { summary, resources: runs[0].cold.resources };
          console.log(
            JSON.stringify({
              target,
              profile: profileId,
              coldFirstFrameMs: summary.cold.firstFrameMs,
              coldMenuMs: summary.cold.menuInteractiveMs,
              startToPlayingMs: summary.cold.startToPlayingMs,
              musicReadyMs: summary.cold.musicReadyMs,
              warmFirstFrameMs: summary.warm.firstFrameMs,
              coldBytesToFirstFrame: summary.cold.toFirstFrame?.bytes,
              coldRequestsToFirstFrame: summary.cold.toFirstFrame?.requests,
              coldBytesToPlaying: summary.cold.toPlaying?.bytes,
              warmNetworkRequestsToFirstFrame: summary.warm.toFirstFrame?.networkRequests,
            }),
          );
        }
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`load profile written to ${path.relative(projectRoot, output)}`);
  if (!check) return;
  const failures = enforce(report);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("PASS load budgets");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
