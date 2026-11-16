// `pnpm scene preview <stage> --out <dir>`: captures the package in the real
// game. Serves an existing dist/test-standalone (run pnpm build:test:standalone
// first), forges a State Forge scenario on the package's stage, screenshots the
// required viewports and records a looping animated WebP at 1600x900.
//
// Options: --wave N (default 1), --frames N (default 48, 0 skips the loop),
// --dpr N (default 1), --reduced (prefers-reduced-motion), --low (low graphics),
// --viewports 1600x900,844x390 (default: every required viewport).
/* global window, requestAnimationFrame -- page.evaluate callbacks run in the browser */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";
import { inspectPackage, isShippedPackage, REPOSITORY_ROOT, REQUIRED_VIEWPORTS } from "./package-files.mjs";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

function serve(root) {
  const server = createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname).slice(1) || "index.html";
    const file = resolve(root, relative);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

/** A State Forge scenario that starts a campaign run on `stage` at `wave`. */
function scenario(stage, wave) {
  const id = `scene-preview-${stage}-wave-${wave}`;
  const start = { mode: "campaign", difficulty: "normal", weapon: "sword", stage, wave };
  const tags = [stage, "stage", "state-forge", "engineering-only", "non-publishable"];
  const assertions = [
    "runtime.finite-state",
    "entity.unique-id",
    "player.valid-health",
    "world.legal-bounds",
    "runtime.no-softlock",
  ];
  return {
    document: {
      format: "tearsdl",
      schemaVersion: 1,
      id,
      stateClass: "reconstructed-reachable",
      seed: id,
      start,
      constraints: { legalProgression: true },
      tags,
      maxTicks: 1440,
    },
    scenario: {
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id,
      version: 1,
      description: `Scene preview for ${stage}`,
      stateClass: "reconstructed-reachable",
      executionClass: "engineering",
      seed: id,
      start,
      maxTicks: 1440,
      assertions,
      tags,
    },
    structural: { valid: true, issues: [] },
    reachability: { reachable: true, reasons: [] },
    plausibility: { plausible: true, provisional: false, reasons: [] },
    resolvedHash: id,
  };
}

async function launchBrowser(chromium) {
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
}

async function forge(page, resolved) {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 20000 });
  const launched = await page.evaluate((input) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    window.__SCENE_PREVIEW__ = environment;
    const result = environment.forgeResolvedScenario(input);
    for (let index = 0; index < 90; index += 1) environment.renderFrame(1 / 60);
    return result;
  }, resolved);
  if (!launched.ok) throw new Error(`State Forge refused the scenario: ${JSON.stringify(launched)}`);
}

/** Renders frames while lazy scene art decodes, then waits for paint. */
const settle = (page) =>
  page.evaluate(async () => {
    for (let index = 0; index < 20; index += 1) {
      window.__SCENE_PREVIEW__.renderFrame(1 / 60);
      await new Promise((done) => setTimeout(done, 50));
    }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });

async function recordLoop(page, out, name, frames) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await settle(page);
  const shots = [];
  for (let index = 0; index < frames; index += 1) {
    await page.evaluate(() => {
      window.__SCENE_PREVIEW__.renderFrame(1 / 30);
      return new Promise((done) => requestAnimationFrame(done));
    });
    shots.push(
      await sharp(await page.screenshot())
        .resize(800)
        .png()
        .toBuffer(),
    );
  }
  const file = join(out, `${name}-loop.webp`);
  await sharp(shots, { join: { animated: true } })
    .webp({ quality: 70, loop: 0, delay: Array(frames).fill(33) })
    .toFile(file);
  console.log(`wrote ${file} (${frames} frames at 30 fps)`);
}

export async function preview(directory, out, options = {}) {
  const { scene, problems } = await inspectPackage(directory);
  if (scene === undefined || problems.length > 0) throw new Error("package is invalid; run pnpm scene validate");
  if (!isShippedPackage(directory)) throw new Error("fixture packages are not in the game; preview a shipped package");
  const root = join(REPOSITORY_ROOT, "dist", "test-standalone");
  if (!existsSync(join(root, "index.html")))
    throw new Error("dist/test-standalone is missing; run pnpm build:test:standalone");
  mkdirSync(out, { recursive: true });
  const { chromium } = createRequire(join(REPOSITORY_ROOT, "package.json"))("@playwright/test");
  const name = basename(directory);
  const wanted =
    typeof options.viewports === "string"
      ? options.viewports.split(",")
      : REQUIRED_VIEWPORTS.map(([, w, h]) => `${w}x${h}`);
  const server = await serve(root);
  const browser = await launchBrowser(chromium);
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: Number(options.dpr ?? 1),
      serviceWorkers: "block",
    });
    page.on("pageerror", (error) => console.error("pageerror:", error.message));
    if (options.reduced === true) await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/index.html?test=1${options.low === true ? "&bossdebug=1" : ""}`,
      { waitUntil: "domcontentloaded" },
    );
    await forge(page, scenario(scene.stageId, Number(options.wave ?? 1)));
    if (options.low === true) await page.evaluate(() => window.__PANTHEON_TEST.setOptions({ gfx: "low" }));
    for (const viewport of wanted) {
      const [width, height] = viewport.split("x").map(Number);
      await page.setViewportSize({ width, height });
      await settle(page);
      const file = join(out, `${name}-${viewport}.png`);
      await page.screenshot({ path: file });
      console.log(`wrote ${file}`);
    }
    const frames = Number(options.frames ?? 48);
    if (frames > 0) await recordLoop(page, out, name, frames);
  } finally {
    await browser.close();
    server.close();
  }
}
