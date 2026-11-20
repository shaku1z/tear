import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { evaluateBundleBudgets, measureBundleTarget } from "../../scripts/check-bundle-budget.mjs";

const roots = [];
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

const BUDGETS = Object.freeze({
  mainGzipBytes: 10_000,
  workerGzipBytes: 10_000,
  tutorialGoldGzipBytes: 10_000,
  startupScriptBytes: 3_000,
  precacheEntries: 4,
  precacheBytes: 5_000,
});

/** Poorly compressible deterministic text, so gzip ordering follows byte size. */
const noise = (length, seed) =>
  Array.from({ length }, (_, index) => String.fromCharCode(33 + (((index * 7919 + seed * 104729) % 9973) % 90))).join(
    "",
  );
/** A small built target: entry + one preloaded app chunk, one worker, the on-demand corpus, and a service worker. */
async function target({ preloadGold = false, precacheGold = false, appBytes = 1_000, lazyIntoStartup = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), "tear-bundle-budget-"));
  roots.push(root);
  await mkdir(join(root, "assets"));
  const files = {
    "assets/index-a1.js": noise(110, 1),
    "assets/runtime-app-core-b2.js": noise(appBytes, 2) + (lazyIntoStartup ? 'import("./runtime-app-core-b2.js")' : ""),
    "assets/career-archive-worker-c3.js": noise(2_000, 3),
    "assets/tutorial-gold-reference-d4.js": noise(4_000, 4),
  };
  for (const [file, contents] of Object.entries(files)) await writeFile(join(root, file), contents);
  const preloads = [
    "/assets/runtime-app-core-b2.js",
    ...(preloadGold ? ["/assets/tutorial-gold-reference-d4.js"] : []),
  ];
  await writeFile(
    join(root, "index.html"),
    `<script type="module" crossorigin src="/assets/index-a1.js"></script>\n${preloads
      .map((href) => `<link rel="modulepreload" crossorigin href="${href}">`)
      .join("\n")}\n`,
  );
  const precached = [
    "index.html",
    "assets/index-a1.js",
    "assets/runtime-app-core-b2.js",
    ...(precacheGold ? ["assets/tutorial-gold-reference-d4.js"] : []),
  ];
  await writeFile(
    join(root, "sw.js"),
    `s.precacheAndRoute([${precached.map((url) => `{url:"${url}",revision:null}`).join(",")}],{});`,
  );
  return root;
}

const failures = (results) => results.filter(([, ok]) => !ok).map(([label]) => label);

describe("bundle budget gate", () => {
  it("fails when a dynamic import resolves into a startup chunk, and allows the entry's own import", async () => {
    const lazy = await measureBundleTarget(await target({ lazyIntoStartup: true }));
    expect(lazy.startup.lazyInStartup).toEqual(["runtime-app-core-b2.js -> runtime-app-core-b2.js"]);
    expect(failures(evaluateBundleBudgets("standalone", lazy, BUDGETS, { pwa: true }))).toEqual([
      "standalone lazy code kept out of startup",
    ]);
    const clean = await measureBundleTarget(await target());
    expect(clean.startup.lazyInStartup).toEqual([]);
  });

  it("separates startup, worker, on-demand corpus and precache measurements", async () => {
    const measured = await measureBundleTarget(await target());
    expect(measured.main.file).toBe("runtime-app-core-b2.js");
    expect(measured.worker.file).toBe("career-archive-worker-c3.js");
    expect(measured.tutorialGold.file).toBe("tutorial-gold-reference-d4.js");
    expect(measured.startup.files).toEqual(["assets/index-a1.js", "assets/runtime-app-core-b2.js"]);
    expect(measured.startup.bytes).toBe(110 + 1_000);
    expect(measured.precache.entries).toBe(3);
    expect(failures(evaluateBundleBudgets("standalone", measured, BUDGETS, { pwa: true }))).toEqual([]);
  });

  it("fails when the on-demand corpus is modulepreloaded or precached", async () => {
    const preloaded = await measureBundleTarget(await target({ preloadGold: true }));
    expect(
      failures(
        evaluateBundleBudgets("standalone", preloaded, { ...BUDGETS, startupScriptBytes: 100_000 }, { pwa: true }),
      ),
    ).toEqual(["standalone startup scripts"]);
    const precached = await measureBundleTarget(await target({ precacheGold: true }));
    expect(
      failures(evaluateBundleBudgets("standalone", precached, { ...BUDGETS, precacheBytes: 100_000 }, { pwa: true })),
    ).toEqual(["standalone precache"]);
  });

  it("fails on startup bytes, precache size and entries above their ceilings", async () => {
    const measured = await measureBundleTarget(await target({ appBytes: 2_950 }));
    expect(
      failures(evaluateBundleBudgets("standalone", measured, { ...BUDGETS, precacheEntries: 2 }, { pwa: true })),
    ).toEqual(["standalone startup scripts", "standalone precache"]);
    // A portal build without a service worker is measured without a precache budget.
    expect(
      failures(
        evaluateBundleBudgets("CrazyGames", measured, { ...BUDGETS, startupScriptBytes: 100_000 }, { pwa: false }),
      ),
    ).toEqual([]);
  });
});
