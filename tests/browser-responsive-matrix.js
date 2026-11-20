const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { STATE_WAIT_MS, settleFor, trackScriptLoads, waitForScriptLoads, launchJourney } = require("./browser-waits");
const { TUTORIAL_SKIPPED_STORAGE } = require("./browser-journey-harness");

const scenarios = [
  { name: "desktop-16:9", width: 1600, height: 900, dpr: 1 },
  { name: "desktop-reported-laptop", width: 2048, height: 1024, dpr: 1 },
  { name: "desktop-ultrawide", width: 2048, height: 1041, dpr: 1 },
  { name: "desktop-4:3-hidpi", width: 1024, height: 768, dpr: 2 },
  { name: "mobile-landscape", width: 800, height: 360, dpr: 3 },
  { name: "mobile-portrait", width: 390, height: 844, dpr: 3 },
];

/**
 * Phone landscape: every library screen, the shop and the playground build menu open in
 * their compact composition, scroll, and return through their own footer control. Positions
 * follow the compact menu rail (menu-setup.ts) and the compact page footer (compact-page.ts).
 */
/** Records where each text label was last drawn, in page (client) pixels. */
async function recordDrawnLabels(page) {
  await page.addInitScript(() => {
    window.__TEAR_DRAWN_LABELS__ = {};
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function recordLabel(value, x, y, ...rest) {
      const point = this.getTransform().transformPoint({ x, y }),
        rect = this.canvas.getBoundingClientRect();
      window.__TEAR_DRAWN_LABELS__[String(value)] = {
        x: rect.left + (point.x * rect.width) / this.canvas.width,
        y: rect.top + (point.y * rect.height) / this.canvas.height,
      };
      return original.call(this, value, x, y, ...rest);
    };
  });
}

async function phoneJourney(page, scenario, viewport) {
  const scale = Math.min(scenario.width / 1600, scenario.height / 900);
  const target = Math.ceil(44 / scale),
    gap = 12;
  const tap = async (x, y) => {
    await page.touchscreen.tap((x + viewport.overscan.x) * scale, (y + viewport.overscan.y) * scale);
  };
  const settle = async (screen) => {
    await page.waitForFunction((expected) => window.__PANTHEON_TEST?.state().game === expected, screen, {
      timeout: STATE_WAIT_MS,
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const swipeUp = async () => {
    const x = (800 + viewport.overscan.x) * scale,
      y = 600 * scale;
    await page.evaluate(
      ([cx, cy]) =>
        new Promise((resolve) => {
          const canvas = document.querySelector("canvas"),
            touch = (ty) => new Touch({ identifier: 3, target: canvas, clientX: cx, clientY: ty });
          const send = (type, ty, live) =>
            canvas.dispatchEvent(
              new TouchEvent(type, {
                touches: live ? [touch(ty)] : [],
                changedTouches: [touch(ty)],
                bubbles: true,
                cancelable: true,
              }),
            );
          send("touchstart", cy, true);
          let step = 0;
          const move = () => {
            step += 1;
            send("touchmove", cy - step * 12, true);
            if (step < 10) requestAnimationFrame(move);
            else {
              send("touchend", cy - step * 12, false);
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            }
          };
          requestAnimationFrame(move);
        }),
      [x, y],
    );
  };
  // Compact main menu: the identity row sits under the wordmark; the navigation rows are found by the
  // labels the menu draws, so the journey does not depend on how many rows the build shows.
  const identityY = 96 + 34 + 24;
  const railX = 100 - viewport.overscan.x;
  const tapLabel = async (label) => {
    await page.waitForFunction((text) => window.__TEAR_DRAWN_LABELS__?.[text], label, { timeout: STATE_WAIT_MS });
    const point = await page.evaluate((text) => window.__TEAR_DRAWN_LABELS__[text], label);
    await page.touchscreen.tap(point.x, point.y);
  };
  const routes = [
    ["profile", () => tap(railX + 200, identityY + target / 2)],
    ["shop", () => tapLabel("SHOP")],
    ["achievements", () => tapLabel("ACHIEVEMENTS")],
    ["leaderboards", () => tapLabel("LEADERBOARDS")],
    ["codex", () => tapLabel("CODEX")],
  ];
  // The wide compact sheet is inset 20 from the frame's top and bottom; BACK is centred in its footer row.
  const back = [800, 20 + 860 - target - gap + target / 2];
  // A first touch beside the rail hands the interface to touch (and the compact density) before any control is tapped.
  await tap(-viewport.overscan.x + 20, 450);
  await settle("menu");
  for (const [screen, open] of routes) {
    await page.evaluate(() => {
      window.__TEAR_DRAWN_LABELS__ = {};
    });
    await open();
    await settle(screen);
    await swipeUp();
    assert.equal(
      await page.evaluate(() => window.__PANTHEON_TEST.state().game),
      screen,
      `${scenario.name}: ${screen} stays open while it scrolls`,
    );
    await tap(back[0], back[1]);
    await settle("menu");
  }
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await settle("playing");
  await page.keyboard.press("Tab");
  await settle("pgmenu");
  await swipeUp();
  // RESUME is centred in the build menu's footer row, a spacing step above the frame's bottom.
  await tap(800, 900 - 10 - 16 - target / 2);
  await settle("playing");
}

/**
 * Which viewports run: `--desktop` (the required check), `--touch` (the phone viewports, parked
 * while mobile is paused, plans/MOBILE_LATER.md; `pnpm check:mobile`), or both by default.
 */
function wantedScenarios(argv) {
  const desktop = argv.includes("--desktop"),
    touch = argv.includes("--touch"),
    both = !desktop && !touch;
  return scenarios.filter((scenario) => (scenario.name.startsWith("mobile") ? touch || both : desktop || both));
}

async function main() {
  const chosen = wantedScenarios(process.argv.slice(2));
  const root = path.resolve(__dirname, "..", "dist", process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone");
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const file = path.resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream",
    );
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Responsive test server did not bind");
  const origin = `http://127.0.0.1:${String(address.port)}`;
  const browser = await launchJourney(chromium, { headless: true });
  try {
    for (const scenario of chosen) {
      const context = await browser.newContext({
        viewport: { width: scenario.width, height: scenario.height },
        deviceScaleFactor: scenario.dpr,
        isMobile: scenario.name.startsWith("mobile"),
        hasTouch: scenario.name.startsWith("mobile"),
      });
      const page = await context.newPage();
      await trackScriptLoads(page);
      // The matrix captures the run setup through PLAY, so it plays as a player who skipped the tutorial.
      await page.addInitScript((storage) => {
        window.__TEAR_TEST_STORAGE__ = storage;
      }, TUTORIAL_SKIPPED_STORAGE);
      if (scenario.name === "mobile-landscape") await recordDrawnLabels(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.stack || error.message));
      await page.route("**/*", (route) =>
        route.request().url().startsWith(origin) ? route.continue() : route.abort(),
      );
      await page.goto(`${origin}/?test=1&bossdebug=1`, { timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__?.viewport, undefined, { timeout: STATE_WAIT_MS });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(scenario.width / 2, scenario.height / 2);
      await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.input.snapshot().mode === "mouse");
      const snapshot = await page.evaluate(() => ({
        viewport: window.__TEAR_CATALOG_DEBUG__.viewport.snapshot(),
        input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
        fonts: {
          brand: document.fonts.check("16px 'Courier New'"),
          display: document.fonts.check("16px 'Barlow Condensed'"),
          body: document.fonts.check("16px 'IBM Plex Mono'"),
        },
      }));
      const { viewport } = snapshot;
      assert.equal(viewport.css.width, scenario.width, `${scenario.name}: canvas width`);
      assert.equal(viewport.css.height, scenario.height, `${scenario.name}: canvas height`);
      assert.equal(
        viewport.backing.width,
        Math.round(scenario.width * Math.min(scenario.dpr, 2.5)),
        `${scenario.name}: backing width`,
      );
      assert.equal(
        viewport.backing.height,
        Math.round(scenario.height * Math.min(scenario.dpr, 2.5)),
        `${scenario.name}: backing height`,
      );
      assert.ok(viewport.overscan.x >= 0 && viewport.overscan.y >= 0, `${scenario.name}: non-negative overscan`);
      assert.ok(viewport.overscan.x < 0.01 || viewport.overscan.y < 0.01, `${scenario.name}: only one overscan axis`);
      assert.ok(Object.values(viewport.safeArea).every(Number.isFinite), `${scenario.name}: finite safe area`);
      assert.ok(
        Math.abs(snapshot.input.pointer.x - viewport.logical.width / 2) < 1,
        `${scenario.name}: pointer x mapping`,
      );
      assert.ok(
        Math.abs(snapshot.input.pointer.y - viewport.logical.height / 2) < 1,
        `${scenario.name}: pointer y mapping`,
      );
      assert.equal(
        snapshot.document.scrollWidth,
        snapshot.document.innerWidth,
        `${scenario.name}: no horizontal page overflow`,
      );
      assert.equal(
        snapshot.document.scrollHeight,
        snapshot.document.innerHeight,
        `${scenario.name}: no vertical page overflow`,
      );
      assert.equal(snapshot.fonts.brand, true, `${scenario.name}: brand font ready`);
      assert.equal(snapshot.fonts.display, true, `${scenario.name}: display font ready`);
      assert.equal(snapshot.fonts.body, true, `${scenario.name}: body font ready`);
      if (scenario.name === "mobile-landscape") await phoneJourney(page, scenario, viewport);
      if (process.env.TEAR_VISUAL_DIR) {
        fs.mkdirSync(process.env.TEAR_VISUAL_DIR, { recursive: true });
        const fileName = scenario.name.replace(/[^a-z0-9-]+/gi, "-");
        const capture = async (screen) =>
          page.screenshot({ path: path.join(process.env.TEAR_VISUAL_DIR, `${fileName}-${screen}.png`) });
        const settle = async (screen) => {
          await page.waitForFunction((expected) => window.__PANTHEON_TEST?.state().game === expected, screen, {
            timeout: STATE_WAIT_MS,
          });
          await waitForScriptLoads(page);
        };
        const logicalClick = async (x, y) => {
          const cssScale = scenario.width / (viewport.logical.width + viewport.overscan.x * 2);
          await page.mouse.click((x + viewport.overscan.x) * cssScale, (y + viewport.overscan.y) * cssScale);
        };
        await capture("menu");
        if (scenario.name.startsWith("desktop")) {
          await logicalClick(260, 452);
          await settle("shop");
          await capture("shop");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 360);
          await settle("setup");
          await capture("setup");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 696);
          await settle("settings");
          await capture("settings");
          await logicalClick(800, 169);
          await page.waitForTimeout(settleFor(120));
          await capture("settings-audio");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 635);
          await settle("codex");
          await capture("codex");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 269);
          await settle("profile");
          await capture("profile");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 513);
          await settle("achievements");
          await capture("achievements");
          await logicalClick(800, 828);
          await settle("menu");
          await logicalClick(260, 574);
          await settle("leaderboards");
          await capture("leaderboards");
          await logicalClick(800, 828);
          await settle("menu");
          await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: true }));
          await settle("draft");
          await capture("draft");
          await page.reload({ timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.__PANTHEON_TEST && window.__TEAR_CATALOG_DEBUG__, undefined, {
            timeout: STATE_WAIT_MS,
          });
          await page.mouse.click(10, 10);
          await page.evaluate(() => window.__PANTHEON_TEST.startMode("endless"));
          await settle("playing");
          await page.evaluate(() => window.__PANTHEON_TEST.pause());
          await settle("paused");
          await capture("paused");
          await page.evaluate(() => {
            window.__PANTHEON_TEST.resume();
            window.__PANTHEON_TEST.openTerminal("gameover");
          });
          await settle("gameover");
          await capture("gameover");
        }
      }
      assert.deepEqual(errors, [], `${scenario.name}: browser errors`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(`responsive browser matrix passed (${chosen.length} viewport/DPR scenarios)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
