// How browser tests wait. Every wall-clock wait in a browser test is one of the kinds below, and
// eslint.config.mjs rejects a bare number as a `timeout` or as a `waitForTimeout` argument, so each
// wait says which kind it is.
//
// The game runs slower than real time on a loaded machine or a small CI runner. A test that waits
// for a game state must therefore treat time as a ceiling for giving up, never as the pass
// condition: the state is what passes or fails. When speed itself matters, assert simulation ticks
// or game time, not milliseconds of wall time.

/** Ceiling for waiting on a game state, a navigation, a load or a browser event. Never the pass condition. */
const STATE_WAIT_MS = 60_000;

/** Ceiling for cold loads, long recordings and whole runs that honestly take a minute or more. */
const SLOW_STATE_WAIT_MS = 180_000;

/**
 * Ceiling for one whole browser journey. `page.evaluate` has no timeout of its own, so a page
 * whose main thread never comes back would otherwise hold the job until the CI limit.
 */
const JOURNEY_LIMIT_MS = 600_000;

/** Settles to `fallback` after `ms` unless `promise` settles first. */
function within(promise, ms, fallback) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms, fallback);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}

const stallSessions = new WeakMap();

/**
 * Opens a DevTools session with the debugger on, so that describeStall can later pause a page
 * whose main thread is busy: a session cannot be opened, nor the debugger enabled, once it is.
 * Call it right after creating the page.
 */
async function watchForStalls(page, { serverLog } = {}) {
  const session = await page.context().newCDPSession(page);
  await session.send("Debugger.enable");
  // The page's own network record, kept so a stalled navigation can say where its time went:
  // waiting for a connection, waiting for the server, or loading. Bounded to the latest requests.
  const requests = new Map();
  const seconds = (value) => value * 1000;
  session.on("Network.requestWillBeSent", (event) => {
    requests.set(event.requestId, {
      url: event.request.url,
      type: event.type,
      startedAt: seconds(event.wallTime),
      startedMono: seconds(event.timestamp),
    });
    if (requests.size > 400) requests.delete(requests.keys().next().value);
  });
  session.on("Network.responseReceived", (event) => {
    const entry = requests.get(event.requestId);
    if (entry) Object.assign(entry, { status: event.response.status, timing: event.response.timing });
  });
  session.on("Network.loadingFinished", (event) => {
    const entry = requests.get(event.requestId);
    if (entry) entry.endedMono = seconds(event.timestamp);
  });
  session.on("Network.loadingFailed", (event) => {
    const entry = requests.get(event.requestId);
    if (entry) Object.assign(entry, { endedMono: seconds(event.timestamp), failed: event.errorText });
  });
  await session.send("Network.enable");
  stallSessions.set(page, { session, requests, serverLog });
}

const shortUrl = (url) => url.replace(/^https?:\/\/[^/]+/u, "").slice(0, 80);

/** Requests the page had not finished at `since` (epoch ms), oldest first. */
function inFlight(page, since) {
  const watch = stallSessions.get(page);
  if (!watch) return "not recorded (watchForStalls was not called for this page)";
  const open = [...watch.requests.values()].filter((entry) => entry.startedAt < since && entry.endedMono === undefined);
  if (open.length === 0) return "none";
  return open
    .slice(0, 10)
    .map((entry) => `${shortUrl(entry.url)} open ${String(Math.round(since - entry.startedAt))} ms`)
    .join(", ");
}

/**
 * Where the time went for each request the page started after `since` (epoch ms): queued for a
 * connection, waited for response headers, loaded, from the browser's own timing; and when the
 * test's server received and finished each request, when the harness passed its log.
 */
function networkSince(page, since) {
  const watch = stallSessions.get(page);
  if (!watch) return "not recorded";
  const lines = [...watch.requests.values()]
    .filter((entry) => entry.startedAt >= since)
    .slice(0, 15)
    .map((entry) => {
      const at = `+${String(Math.round(entry.startedAt - since))} ms`;
      const timing = entry.timing;
      const phases =
        timing === undefined
          ? "no response yet"
          : `queued ${String(Math.round(timing.sendStart))} ms, server ${String(Math.round(timing.receiveHeadersEnd - timing.sendEnd))} ms`;
      const end =
        entry.endedMono === undefined
          ? "unfinished"
          : `${entry.failed ? `failed (${entry.failed})` : "done"} after ${String(Math.round(entry.endedMono - entry.startedMono))} ms`;
      return `${shortUrl(entry.url)} ${entry.type ?? ""} ${at}: ${phases}, ${end}`;
    });
  const server = (watch.serverLog ?? [])
    .filter((entry) => entry.arrived >= since)
    .slice(0, 15)
    .map(
      (entry) =>
        `${shortUrl(entry.url)} arrived +${String(entry.arrived - since)} ms, ${entry.finished === undefined ? "unfinished" : `finished +${String(entry.finished - since)} ms`}`,
    );
  return `browser: ${lines.length > 0 ? lines.join("; ") : "no requests"}. server: ${
    watch.serverLog === undefined ? "not recorded" : server.length > 0 ? server.join("; ") : "no requests"
  }`;
}

/**
 * Says what a stalled page is doing: whether its main thread still answers and, when it does not,
 * the JavaScript stack it is busy in (paused through watchForStalls' session, then resumed).
 */
async function describeStall(page) {
  const answer = await within(
    page
      .evaluate(() => ({ url: location.href, readyState: document.readyState, visibility: document.visibilityState }))
      .then(
        (value) => `answered ${JSON.stringify(value)}`,
        (failure) => `evaluate failed: ${String(failure)}`,
      ),
    5000,
    null,
  );
  if (answer) return `page ${answer}`;
  const session = stallSessions.get(page)?.session;
  if (!session) return "page did not answer within 5 s; no stack (watchForStalls was not called for this page)";
  const stack = await within(
    (async () => {
      const paused = new Promise((resolve) => {
        session.once("Debugger.paused", resolve);
      });
      await session.send("Debugger.pause");
      const { callFrames } = await paused;
      const frames = callFrames
        .slice(0, 12)
        .map(
          (frame) =>
            `${frame.functionName || "(anonymous)"} ${frame.url.replace(/^.*\//u, "")}:${String(frame.location.lineNumber + 1)}:${String(frame.location.columnNumber + 1)}`,
        );
      // The page may have moved on (or been torn down) since the pause; the stack is what counts.
      await session.send("Debugger.resume").catch(() => undefined);
      return `busy in: ${frames.join(" < ")}`;
    })().catch((failure) => `could not pause it: ${String(failure)}`),
    10_000,
    "no JavaScript stack within 10 s (busy outside JavaScript, or the renderer is gone)",
  );
  return `page did not answer within 5 s; ${stack}`;
}

function milliseconds(kind, ms) {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`${kind} needs a non-negative duration, got ${ms}`);
  return ms;
}

/**
 * How often to look again: a polling interval, the pause between two reads of game state, or how
 * long to give an input before pressing it again. A slow machine makes the loop take more turns;
 * it never changes the result.
 */
const pollEvery = (ms) => milliseconds("pollEvery", ms);

/**
 * How long a physical input stays held, or how long a real-time sample (frame pacing, audio
 * scheduling) runs. The test measures real time on purpose.
 */
const holdFor = (ms) => milliseconds("holdFor", ms);

/** Something must NOT happen within this much wall time: the wait itself is the check. */
const notWithin = (ms) => milliseconds("notWithin", ms);

/**
 * A known defect, named so it can be counted and removed: a sleep that stands in for waiting on a
 * state (a screen finishing its entry, a control becoming ready, a frame being drawn). Replace it
 * with a wait on that state. Do not add new ones.
 */
const settleFor = (ms) => milliseconds("settleFor", ms);

/**
 * Reloads the page with the state-wait ceiling and, when the navigation does not finish, says what
 * the page was doing: which main-frame navigations and load events happened, and whether the old
 * document still answers. Playwright's own message is only "waiting for navigation", which names
 * no cause. Navigations elsewhere must pass `timeout` (eslint.config.mjs) so none falls back to
 * Playwright's unnamed 30 s default.
 */
async function reloadPage(page, options = {}) {
  const started = Date.now();
  const events = [];
  const note = (what) => events.push(`${what} at ${String(Date.now() - started)} ms`);
  const onNavigated = (frame) => {
    if (frame === page.mainFrame()) note(`navigated to ${frame.url()}`);
  };
  const onDomContentLoaded = () => note("domcontentloaded");
  const onCrash = () => note("renderer crashed");
  page.on("framenavigated", onNavigated);
  page.on("domcontentloaded", onDomContentLoaded);
  page.on("crash", onCrash);
  const openAtStart = inFlight(page, started);
  try {
    return await page.reload({ waitUntil: "domcontentloaded", ...options, timeout: STATE_WAIT_MS });
  } catch (error) {
    const seen = events.length > 0 ? events.join("; ") : "none";
    throw new Error(
      [
        `reload did not reach domcontentloaded: navigation events: ${seen}`,
        await describeStall(page),
        `requests open when the reload began: ${openAtStart}`,
        `requests since the reload began: ${networkSince(page, started)}`,
      ].join("\n"),
      { cause: error },
    );
  } finally {
    page.off("framenavigated", onNavigated);
    page.off("domcontentloaded", onDomContentLoaded);
    page.off("crash", onCrash);
  }
}

/**
 * Waits for real pointer lock, for the nightly check that requires it (--captured-pointer). Only
 * that path may wait on the lock (eslint.config.mjs): a browser may refuse a scripted request in
 * headless mode, on a hosted runner or in a background window, so a required test waits for the
 * game state the lock leads to instead.
 */
async function waitForPointerLock(page) {
  try {
    await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: STATE_WAIT_MS });
  } catch (error) {
    const state = await within(
      page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState })),
      5000,
      "the page did not answer",
    ).catch((reason) => String(reason));
    throw new Error(`pointer lock was not granted: ${JSON.stringify(state)}`, { cause: error });
  }
}

const scriptLoads = new WeakMap();

/** Runs in the page: reports each worker's script URL to the tracker before the worker fetches it. */
function reportWorkerScripts() {
  for (const name of ["Worker", "SharedWorker"]) {
    const Original = window[name];
    if (typeof Original !== "function") continue;
    window[name] = class extends Original {
      constructor(url, options) {
        void window.__tearWorkerScript(new URL(String(url), window.location.href).href);
        super(url, options);
      }
    };
  }
}

/**
 * Counts the page's script requests in flight. Screens and runtimes load their code as lazy chunks,
 * which are script requests; music, images and other media are not. A worker's own script is not
 * screen code either, and a worker the game terminates before its script has loaded (a screen
 * closed during a slow load) leaves a request that Playwright never reports as finished or failed,
 * so worker scripts are never counted. Await it right after creating the page, before the first
 * navigation.
 */
function trackScriptLoads(page) {
  if (scriptLoads.has(page)) return scriptLoads.get(page).ready;
  const pending = new Set();
  const waiters = new Set();
  const workerScripts = new Set();
  const settle = (request) => {
    if (!pending.delete(request) || pending.size > 0) return;
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  page.on("request", (request) => {
    if (request.resourceType() === "script" && !workerScripts.has(request.url())) pending.add(request);
  });
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  // The page reports a worker's URL and the request event arrives in either order.
  const ready = Promise.all([
    page.exposeBinding("__tearWorkerScript", (_source, url) => {
      workerScripts.add(url);
      for (const request of pending) if (request.url() === url) settle(request);
    }),
    page.addInitScript(reportWorkerScripts),
  ]);
  scriptLoads.set(page, { pending, waiters, ready });
  return ready;
}

/**
 * Waits until the code the current screen asked for has loaded, then for two frames so it has
 * drawn: a screen's state can be active before its lazy renderer chunk registers the canvas
 * buttons. Never wait for the whole network to go quiet instead (`networkidle`): the game keeps
 * loading music and assets during play, so the page may never be idle; eslint rejects it.
 */
async function waitForScriptLoads(page) {
  const tracker = scriptLoads.get(page);
  if (tracker === undefined) throw new Error("waitForScriptLoads needs trackScriptLoads(page) before navigation");
  await tracker.ready;
  const frames = () =>
    page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // The screen's first frames are what ask for its chunk.
  await frames();
  if (tracker.pending.size > 0) {
    let resolveIdle;
    const idle = new Promise((resolve) => {
      resolveIdle = resolve;
      tracker.waiters.add(resolve);
    });
    const outcome = await within(idle, STATE_WAIT_MS, "still loading");
    tracker.waiters.delete(resolveIdle);
    if (outcome === "still loading") {
      const urls = [...tracker.pending].map((request) => request.url()).join(", ");
      throw new Error(`script loads still pending after ${String(STATE_WAIT_MS)} ms: ${urls}`);
    }
  }
  await frames();
}

/**
 * A control's label as a test names it: letters and digits only, case-insensitive ("‹  BACK" is
 * "back"). A label with no letters or digits ("−", "+") is matched exactly as drawn instead, so it
 * cannot match an unlabelled control.
 */
const targetName = (label) =>
  String(label)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toUpperCase();

/**
 * Clicks the control labelled `name` once a drawn frame of `screen` has registered it, at the
 * centre the game reports. Use it for menu clicks right after a screen change, instead of a
 * coordinate click: a screen's state changes before its first frame is drawn, and a screen with a
 * lazy renderer draws nothing (so has no targets) until its chunk has loaded. A click before then
 * reaches a canvas with nothing under the pointer and is ignored, as it would be for a player who
 * clicked a button not yet on screen. Needs a test build (`window.__TEAR_UI_TARGETS__`).
 */
async function clickTarget(page, screen, name) {
  let point;
  try {
    const handle = await page.waitForFunction(
      ({ screen: expected, wanted }) => {
        if (window.__TEAR_CATALOG_DEBUG__?.app.snapshot().screen !== expected) return false;
        const normal = (label) =>
          String(label)
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .toUpperCase();
        const matches = (label) => (wanted.normal === "" ? label === wanted.raw : normal(label) === wanted.normal);
        const target = window.__TEAR_UI_TARGETS__?.().find((entry) => entry.enabled && matches(entry.label));
        return target === undefined ? false : { x: target.clientX, y: target.clientY };
      },
      { screen, wanted: { normal: targetName(name), raw: String(name) } },
      { timeout: STATE_WAIT_MS },
    );
    point = await handle.jsonValue();
  } catch (error) {
    const state = await within(
      page.evaluate(() => ({
        screen: window.__TEAR_CATALOG_DEBUG__?.app.snapshot().screen,
        targets: window.__TEAR_UI_TARGETS__?.().map((entry) => entry.label) ?? "not exposed",
      })),
      5000,
      "the page did not answer",
    ).catch((reason) => String(reason));
    throw new Error(`no enabled "${name}" target on screen ${screen}: ${JSON.stringify(state)}`, { cause: error });
  }
  await page.mouse.click(point.x, point.y);
}

module.exports = {
  clickTarget,
  reportWorkerScripts,
  trackScriptLoads,
  waitForScriptLoads,
  waitForPointerLock,
  STATE_WAIT_MS,
  SLOW_STATE_WAIT_MS,
  JOURNEY_LIMIT_MS,
  pollEvery,
  holdFor,
  notWithin,
  settleFor,
  reloadPage,
  describeStall,
  watchForStalls,
};
