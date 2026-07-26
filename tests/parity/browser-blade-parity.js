const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const REPOSITORY_ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_FILE = path.join(__dirname, "blade-pointer-lifecycle.json");
const OUTPUT_ROOT = path.join(REPOSITORY_ROOT, "artifacts", "parity");
const ORACLE_REVISION = "ee5e93141d67cc02505b2227b3be0b10d1819e1c";
const ORACLE_PROBE = `
  window.__TEAR_ORACLE_PARITY__ = Object.freeze({
    startRun: (mode, difficulty) => { startRun(mode, difficulty); },
    screen: () => state,
    snapshot: () => {
      const hint = document.querySelector("#lockhint");
      return {
        screen: state,
        simulationTick: Math.round(CLOCK.sim * 120),
        runTime: run?.runTime ?? null,
        input: {
          mode: Input.mode,
          pointerLocked: Input.locked,
          pointerLockAllowed: Input.allowLock,
          pointer: { x: Input.mouseX, y: Input.mouseY },
          tetherHeld: Input.tetherHeld,
        },
        cursor: {
          bodyMode: document.body.dataset.imode ?? null,
          canvas: getComputedStyle(canvas).cursor,
          drawn: state !== "playing" && Input.mode === "mouse",
          lockHintVisible: hint ? getComputedStyle(hint).display !== "none" : false,
        },
        player: player ? {
          x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp,
          onGround: player.onGround, coyote: player.coyote, jumpBuffer: player.jumpBuf,
          dashTimer: player.dashTimer, dashCooldown: player.dashCd,
        } : null,
        blade: blade ? {
          state: blade.state, x: blade.x, y: blade.y, vx: blade.vx, vy: blade.vy,
          tipX: blade.tipX, tipY: blade.tipY, tipVX: blade.tipVX, tipVY: blade.tipVY,
          aimX: blade.aimX, aimY: blade.aimY, reticleX: blade.reticleX, reticleY: blade.reticleY,
          flyTime: blade.flyTime, tension: blade.tension, secondaryActive: blade.secondaryActive,
        } : null,
      };
    },
  });
`;

function contentType(file) {
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript";
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".json") || file.endsWith(".webmanifest")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".woff2")) return "font/woff2";
  if (file.endsWith(".mp3")) return "audio/mpeg";
  if (file.endsWith(".ogg")) return "audio/ogg";
  return "application/octet-stream";
}

function createStaticServer(root, port) {
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, baseUrl).pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  return {
    baseUrl,
    listen: () => new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)),
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function installAdapter(page, kind, fixture) {
  if (kind === "oracle") {
    await page.evaluate(({ mode, difficulty, revision }) => {
      window.__TEAR_PARITY_ADAPTER__ = Object.freeze({
        source: { kind: "oracle", revision },
        startRun: () => { window.__TEAR_ORACLE_PARITY__.startRun(mode, difficulty); },
        screen: () => window.__TEAR_ORACLE_PARITY__.screen(),
        snapshot: () => window.__TEAR_ORACLE_PARITY__.snapshot(),
      });
    }, { mode: fixture.mode, difficulty: fixture.difficulty, revision: ORACLE_REVISION });
    return;
  }

  await page.evaluate(({ mode, difficulty }) => {
    window.__TEAR_PARITY_ADAPTER__ = Object.freeze({
      source: { kind: "current", revision: "working-tree" },
      startRun: () => { window.__PANTHEON_TEST.startMode(mode, difficulty); },
      screen: () => window.__PANTHEON_TEST.state().game,
      snapshot: () => {
        const live = window.__PANTHEON_TEST.state();
        const input = window.__TEAR_CATALOG_DEBUG__.input.snapshot();
        const canvas = document.querySelector("canvas");
        const hint = document.querySelector("#lockhint");
        return {
          screen: live.game,
          simulationTick: live.simulationTick,
          runTime: live.runTime ?? null,
          input: {
            mode: input.mode,
            pointerLocked: input.pointerLocked,
            pointerLockAllowed: input.pointerLockAllowed,
            pointer: input.pointer,
            tetherHeld: Boolean(input.tetherHeld),
          },
          cursor: {
            bodyMode: document.body.dataset.imode ?? null,
            canvas: canvas ? getComputedStyle(canvas).cursor : null,
            drawn: live.game !== "playing" && input.mode === "mouse",
            lockHintVisible: hint ? getComputedStyle(hint).display !== "none" : false,
          },
          player: live.playerTrace,
          blade: live.bladeTrace,
        };
      },
    });
  }, { mode: fixture.mode, difficulty: fixture.difficulty });
}

async function settle(page, frames = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let remaining = count;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), frames);
}

async function installTickBridge(page) {
  await page.evaluate(() => {
    const moveMouse = (x, y) => {
      const canvas = document.querySelector("canvas");
      const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
      const event = new MouseEvent("mousemove", {
        bubbles: true, cancelable: true, clientX: x, clientY: y,
      });
      Object.defineProperties(event, {
        movementX: { value: x - prior.x },
        movementY: { value: y - prior.y },
      });
      canvas.dispatchEvent(event);
      window.__TEAR_PARITY_MOUSE__ = { x, y };
    };
    const dispatch = (action) => {
      const canvas = document.querySelector("canvas");
      const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
      const buttonIndex = action.button === "right" ? 2 : 0;
      if (action.type === "mouseMove") {
        moveMouse(action.x, action.y);
      } else if (action.type === "mouseClick") {
        moveMouse(action.x, action.y);
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
        canvas.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, clientX: action.x, clientY: action.y, button: buttonIndex,
        }));
      } else if (action.type === "mouseDown") {
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: buttonIndex,
        }));
      } else if (action.type === "mouseUp") {
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: buttonIndex,
        }));
      } else if (action.type === "keyPress") {
        const code = action.key === "Escape" ? "Escape" : action.key;
        if (action.key === "Escape") void document.exitPointerLock();
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: action.key, code, bubbles: true, cancelable: true,
        }));
        window.dispatchEvent(new KeyboardEvent("keyup", {
          key: action.key, code, bubbles: true, cancelable: true,
        }));
      }
    };
    window.__TEAR_PARITY_TICK__ = {
      jobs: [],
      captures: {},
      events: [],
      before(tick) {
        for (const job of this.jobs) {
          if (!job.dispatched && job.action && job.actionTick === tick) {
            job.dispatched = true;
            dispatch(job.action);
            this.events.push({
              tick,
              action: job.action,
              input: window.__TEAR_PARITY_ADAPTER__.snapshot().input,
            });
          }
        }
      },
      after(tick) {
        for (const job of this.jobs) {
          if (!job.captured && job.captureTick === tick) {
            job.captured = true;
            this.captures[job.id] = window.__TEAR_PARITY_ADAPTER__.snapshot();
          }
        }
      },
    };
  });
}

async function queueTickJobs(page, jobs) {
  await page.evaluate((entries) => {
    window.__TEAR_PARITY_TICK__.jobs.push(...entries.map((job) => ({
      ...job,
      dispatched: job.action === null,
      captured: false,
    })));
  }, jobs);
}

async function readTickCapture(page, id) {
  try {
    await page.waitForFunction((captureId) => Boolean(window.__TEAR_PARITY_TICK__.captures[captureId]), id, {
      timeout: 10_000,
    });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      screen: window.__TEAR_PARITY_ADAPTER__.screen(),
      snapshot: window.__TEAR_PARITY_ADAPTER__.snapshot(),
      jobs: window.__TEAR_PARITY_TICK__.jobs,
      captureIds: Object.keys(window.__TEAR_PARITY_TICK__.captures),
    }));
    throw new Error(`${error.message}\nTick bridge diagnostics: ${JSON.stringify(diagnostics)}`);
  }
  return page.evaluate((captureId) => {
    const snapshot = window.__TEAR_PARITY_TICK__.captures[captureId];
    delete window.__TEAR_PARITY_TICK__.captures[captureId];
    window.__TEAR_PARITY_TICK__.jobs = window.__TEAR_PARITY_TICK__.jobs
      .filter((job) => job.id !== captureId);
    return snapshot;
  }, id);
}

async function applyAction(page, action) {
  switch (action.type) {
    case "wait":
      await page.waitForTimeout(action.ms);
      break;
    case "mouseMove":
      await page.evaluate(({ x, y }) => {
        const canvas = document.querySelector("canvas");
        const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        const event = new MouseEvent("mousemove", {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
        });
        Object.defineProperties(event, {
          movementX: { value: x - prior.x },
          movementY: { value: y - prior.y },
        });
        canvas.dispatchEvent(event);
        window.__TEAR_PARITY_MOUSE__ = { x, y };
      }, action);
      break;
    case "mouseClick":
      await page.evaluate(({ x, y, button }) => {
        const canvas = document.querySelector("canvas");
        const prior = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        const buttonIndex = button === "right" ? 2 : 0;
        const move = new MouseEvent("mousemove", {
          bubbles: true, cancelable: true, clientX: x, clientY: y,
        });
        Object.defineProperties(move, {
          movementX: { value: x - prior.x },
          movementY: { value: y - prior.y },
        });
        canvas.dispatchEvent(move);
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        canvas.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: buttonIndex,
        }));
        window.__TEAR_PARITY_MOUSE__ = { x, y };
      }, { ...action, button: action.button ?? "left" });
      break;
    case "mouseDown":
      await page.evaluate(({ button }) => {
        const canvas = document.querySelector("canvas");
        const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        canvas.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
          button: button === "right" ? 2 : 0,
        }));
      }, action);
      break;
    case "mouseUp":
      await page.evaluate(({ button }) => {
        const point = window.__TEAR_PARITY_MOUSE__ ?? { x: 800, y: 450 };
        window.dispatchEvent(new MouseEvent("mouseup", {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
          button: button === "right" ? 2 : 0,
        }));
      }, action);
      break;
    case "keyPress":
      await page.evaluate((key) => {
        const code = key === "Escape" ? "Escape" : key;
        window.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent("keyup", { key, code, bubbles: true, cancelable: true }));
      }, action.key);
      break;
    case "waitForPause":
      try {
        await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "paused", undefined, {
          timeout: action.timeoutMs ?? 2000,
        });
      } catch (error) {
        if (error?.name !== "TimeoutError") throw error;
      }
      break;
    case "restartRun":
      await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.startRun());
      await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing");
      break;
    default:
      throw new Error(`Unknown parity action: ${String(action.type)}`);
  }
}

async function captureTrace(browser, kind, baseUrl, root, fixture) {
  const page = await browser.newPage({ viewport: fixture.viewport });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  await page.route("**/*", async (route) => {
    if (kind === "oracle" && new URL(route.request().url()).pathname === "/js/game.js") {
      const gameFile = path.join(root, "js", "game.js");
      const source = fs.readFileSync(gameFile, "utf8").replace(/\r\n/g, "\n");
      const marker = "  requestAnimationFrame(frame);";
      assert.ok(source.lastIndexOf(marker) >= 0, "oracle game.js probe insertion marker is missing");
      const stepMarker = "  function stepPlaying(dt) {";
      const afterStepMarker = "\n  }\n\n  function onKill(e, cause) {";
      assert.ok(source.includes(stepMarker) && source.includes(afterStepMarker),
        "oracle fixed-step probe markers are missing");
      const instrumented = source
        .replace(stepMarker, `${stepMarker}\n    window.__TEAR_PARITY_TICK__?.before?.(Math.round(CLOCK.sim * 120) + 1);`)
        .replace(afterStepMarker,
          "\n    window.__TEAR_PARITY_TICK__?.after?.(Math.round(CLOCK.sim * 120));\n  }\n\n  function onKill(e, cause) {");
      const insertion = instrumented.lastIndexOf(marker);
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: `${instrumented.slice(0, insertion)}${ORACLE_PROBE}\n${instrumented.slice(insertion)}`,
      });
      return;
    }
    if (route.request().url().startsWith(`${baseUrl}/`)) void route.continue();
    else void route.abort();
  });
  await page.addInitScript(() => {
    window.__TEAR_POINTER_EVENTS__ = [];
    document.addEventListener("pointerlockchange", () => {
      window.__TEAR_POINTER_EVENTS__.push({
        type: "pointerlockchange",
        atMs: performance.now(),
        locked: Boolean(document.pointerLockElement),
      });
    });
    document.addEventListener("pointerlockerror", () => {
      window.__TEAR_POINTER_EVENTS__.push({ type: "pointerlockerror", atMs: performance.now() });
    });
  });

  const query = kind === "current" ? "?test=1&bossdebug=1" : "?bossdebug=1";
  await page.goto(`${baseUrl}/${query}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (kind === "current") {
    await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__, undefined, {
      timeout: 15_000,
    });
  } else {
    await page.waitForFunction(() => window.__TEAR_ORACLE_PARITY__, undefined, { timeout: 15_000 });
  }
  await installAdapter(page, kind, fixture);
  await installTickBridge(page);
  await page.mouse.click(10, 10);
  await settle(page);
  const firstEscapeIndex = fixture.actions.findIndex((action) => action.type === "keyPress" && action.key === "Escape");
  const planned = new Map();
  let plannedTick = 0;
  const firstRunJobs = [];
  for (let index = 0; index < firstEscapeIndex; index += 1) {
    const action = fixture.actions[index];
    const id = `${String(index)}-${action.checkpoint ?? action.type}`;
    if (action.type === "wait") {
      plannedTick += Math.max(1, Math.round(action.ms * 0.12));
      firstRunJobs.push({ id, captureTick: plannedTick, action: null, actionTick: null });
    } else {
      const actionTick = plannedTick + 1;
      plannedTick = actionTick + 12;
      firstRunJobs.push({ id, captureTick: plannedTick, action, actionTick });
    }
    planned.set(index, plannedTick);
  }
  await queueTickJobs(page, firstRunJobs);
  await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.startRun());
  await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing");

  const startedAt = Date.now();
  const checkpoints = [];
  let targetTick = 0;
  let postRestartQueued = false;
  for (let index = 0; index < fixture.actions.length; index += 1) {
    const action = fixture.actions[index];
    const captureId = `${String(index)}-${action.checkpoint ?? action.type}`;
    let snapshot;
    if (planned.has(index)) {
      targetTick = planned.get(index);
      snapshot = await readTickCapture(page, captureId);
    } else if (action.type === "wait") {
      targetTick += Math.max(1, Math.round(action.ms * 0.12));
      snapshot = await readTickCapture(page, captureId);
    } else if (action.type === "keyPress" && action.key === "Escape") {
      await applyAction(page, action);
      await page.waitForFunction(() => window.__TEAR_PARITY_ADAPTER__.screen() === "paused", undefined, {
        timeout: 3_000,
      });
      snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      targetTick = snapshot.simulationTick;
    } else {
      if (action.type === "restartRun") {
        if (!postRestartQueued) {
          let restartTick = 0;
          const restartJobs = [];
          for (let future = index; future < fixture.actions.length; future += 1) {
            const futureAction = fixture.actions[future];
            const id = `${String(future)}-${futureAction.checkpoint ?? futureAction.type}`;
            if (futureAction.type === "restartRun") {
              restartTick = 30;
              restartJobs.push({ id, captureTick: restartTick, action: null, actionTick: null });
            } else if (futureAction.type === "wait") {
              restartTick += Math.max(1, Math.round(futureAction.ms * 0.12));
              restartJobs.push({ id, captureTick: restartTick, action: null, actionTick: null });
            }
            planned.set(future, restartTick);
          }
          await queueTickJobs(page, restartJobs);
          postRestartQueued = true;
        }
        await applyAction(page, action);
        targetTick = planned.get(index);
        snapshot = await readTickCapture(page, captureId);
      } else if (action.type === "waitForPause") {
        await applyAction(page, action);
        await settle(page);
        snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      } else if (await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.screen() === "playing")) {
        const actionTick = targetTick + 1;
        targetTick = actionTick + 12;
        await queueTickJobs(page, [{ id: captureId, captureTick: targetTick, action, actionTick }]);
        snapshot = await readTickCapture(page, captureId);
      } else {
        await applyAction(page, action);
        await settle(page);
        snapshot = await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.snapshot());
      }
    }
    checkpoints.push({
      index,
      label: action.checkpoint ?? `${String(index)}-${action.type}`,
      action: { ...action, checkpoint: undefined },
      atMs: Date.now() - startedAt,
      targetTick,
      ...snapshot,
    });
  }

  const trace = {
    schemaVersion: 1,
    fixtureId: fixture.id,
    source: await page.evaluate(() => window.__TEAR_PARITY_ADAPTER__.source),
    viewport: fixture.viewport,
    checkpoints,
    pointerEvents: (await page.evaluate(() => window.__TEAR_POINTER_EVENTS__))
      .map((entry) => ({ ...entry, atMs: finiteOrNull(entry.atMs) })),
    tickEvents: await page.evaluate(() => window.__TEAR_PARITY_TICK__.events),
    pageErrors,
  };
  await page.close();
  return trace;
}

function checkpoint(trace, label) {
  const found = trace.checkpoints.find((entry) => entry.label === label);
  assert.ok(found, `missing ${label} checkpoint`);
  return found;
}

function assertCurrentLifecycle(trace) {
  assert.deepEqual(trace.pageErrors, [], `current blade trace page errors:\n${trace.pageErrors.join("\n")}`);
  const captured = checkpoint(trace, "pointer-captured");
  const shortDelta = checkpoint(trace, "short-locked-delta");
  const longDelta = checkpoint(trace, "long-locked-delta");
  const tether = checkpoint(trace, "tether-loaded");
  const flight = checkpoint(trace, "throw-flight");
  const paused = checkpoint(trace, "paused-after-capture-loss");
  const fresh = checkpoint(trace, "fresh-run-settled");

  assert.equal(captured.input.pointerLocked, true, "gameplay click captures the pointer");
  assert.equal(captured.cursor.lockHintVisible, false, "capture hides the pointer-lock hint");
  assert.ok(shortDelta.blade.aimY > captured.blade.aimY + 2,
    "a short locked delta steers the player-relative reticle in its raw movement direction");
  assert.ok(longDelta.blade.aimX > shortDelta.blade.aimX + 10,
    "a long locked delta steers the reticle in its raw movement direction");
  assert.equal(tether.input.tetherHeld, true, "holding primary engages the blade tether");
  assert.notEqual(flight.blade.state, "held", "right-click launches the blade");
  assert.equal(paused.screen, "paused", "capture loss pauses the live run");
  assert.equal(paused.input.pointerLocked, false, "paused play releases pointer capture");
  assert.equal(paused.input.pointerLockAllowed, false, "paused play cannot immediately recapture");
  assert.equal(fresh.screen, "playing", "a replacement run reaches live play");
  assert.equal(fresh.blade.state, "held", "a replacement run resets the blade lifecycle");
  assert.ok(Number.isFinite(fresh.blade.tipX) && Number.isFinite(fresh.blade.tipY),
    "fresh-run blade geometry remains finite");
}

async function main() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, "utf8"));
  const currentOnly = process.argv.includes("--current-only");
  const currentRoot = path.resolve(
    process.env.TEAR_PARITY_CURRENT_ROOT
      || path.join(REPOSITORY_ROOT, "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone"),
  );
  const oracleRoot = path.resolve(
    process.env.TEAR_ORACLE_ROOT || path.join(REPOSITORY_ROOT, "..", "Tear-oracle"),
  );
  assert.ok(fs.existsSync(path.join(currentRoot, "index.html")),
    `${currentRoot} is missing; run pnpm build:test:standalone first`);
  if (!currentOnly) {
    assert.ok(fs.existsSync(path.join(oracleRoot, "index.html")),
      `${oracleRoot} is missing; set TEAR_ORACLE_ROOT to the ee5e931 worktree`);
    const oracleHead = execFileSync("git", ["-C", oracleRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(oracleHead, ORACLE_REVISION,
      `oracle worktree is ${oracleHead}; expected ${ORACLE_REVISION}`);
  }

  const currentServer = createStaticServer(currentRoot, Number(process.env.TEAR_PARITY_CURRENT_PORT || 8134));
  const oracleServer = currentOnly
    ? null
    : createStaticServer(oracleRoot, Number(process.env.TEAR_PARITY_ORACLE_PORT || 8135));
  let browser;
  try {
    await currentServer.listen();
    if (oracleServer) await oracleServer.listen();
    browser = await chromium.launch({ headless: true });
    const currentTrace = await captureTrace(browser, "current", currentServer.baseUrl, currentRoot, fixture);
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    const currentFile = path.join(OUTPUT_ROOT, `${fixture.id}.current.json`);
    fs.writeFileSync(currentFile, `${JSON.stringify(currentTrace, null, 2)}\n`);
    assertCurrentLifecycle(currentTrace);

    if (oracleServer) {
      const oracleTrace = await captureTrace(browser, "oracle", oracleServer.baseUrl, oracleRoot, fixture);
      const oracleFile = path.join(OUTPUT_ROOT, `${fixture.id}.oracle.json`);
      fs.writeFileSync(oracleFile, `${JSON.stringify(oracleTrace, null, 2)}\n`);
      const { compareParityTraces } = await import(pathToFileURL(
        path.join(REPOSITORY_ROOT, "scripts", "parity-diff.mjs"),
      ).href);
      const report = compareParityTraces(oracleTrace, currentTrace);
      const reportFile = path.join(OUTPUT_ROOT, `${fixture.id}.report.json`);
      fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`blade parity trace captured: ${report.comparedCheckpoints} checkpoints, ${report.divergenceCount} divergences`);
      if (report.firstDivergence) console.log(`first divergence: ${report.firstDivergence.label} / ${report.firstDivergence.field}`);
      console.log(`report: ${reportFile}`);
      if (process.env.TEAR_PARITY_STRICT === "1") assert.equal(report.passed, true,
        `strict blade parity failed at ${report.firstDivergence?.label} / ${report.firstDivergence?.field}`);
    } else {
      console.log(`current blade lifecycle passed (${currentTrace.checkpoints.length} checkpoints)`);
    }
  } finally {
    if (browser) await browser.close();
    if (oracleServer) await oracleServer.close();
    await currentServer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
