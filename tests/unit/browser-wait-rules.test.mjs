// The browser-test wait rules in eslint.config.mjs, tested on code rather than on the config text.
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: root });
const { reloadPage, STATE_WAIT_MS, trackScriptLoads, waitForScriptLoads } = createRequire(import.meta.url)(
  "../browser-waits.js",
);

async function messages(code) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, "tests/rule-probe-browser.js") });
  return result.messages.filter((message) => message.ruleId === "no-restricted-syntax").map((message) => message.line);
}

describe("browser wait rules", { timeout: 60_000 }, () => {
  it("rejects a navigation that falls back to Playwright's unnamed 30 s default", async () => {
    const code = [
      'const { STATE_WAIT_MS } = require("./browser-waits");',
      "async function run(page) {",
      '  await page.reload({ waitUntil: "domcontentloaded" });',
      '  await page.goto("http://127.0.0.1/");',
      '  await page.waitForLoadState("load");',
      "  await page.reload({ timeout: STATE_WAIT_MS });",
      '  await page.goto("http://127.0.0.1/", { waitUntil: "load", timeout: STATE_WAIT_MS });',
      "}",
      "module.exports = { run };",
    ].join("\n");
    expect(await messages(code)).toEqual([3, 4, 5]);
  });

  it("rejects bare-number timeouts and unnamed sleeps, and accepts the named kinds", async () => {
    const code = [
      'const { STATE_WAIT_MS, pollEvery } = require("./browser-waits");',
      "async function run(page) {",
      "  await page.waitForFunction(() => true, undefined, { timeout: 5000 });",
      "  await page.waitForTimeout(200);",
      "  await page.waitForFunction(() => true, undefined, { timeout: STATE_WAIT_MS });",
      "  await page.waitForTimeout(pollEvery(200));",
      "}",
      "module.exports = { run };",
    ].join("\n");
    expect(await messages(code)).toEqual([3, 4]);
  });

  it("rejects unnamed setTimeout delays, deadlines, default waits and sleep helpers, in the test and in page code", async () => {
    const code = [
      'const { STATE_WAIT_MS, pollEvery } = require("./browser-waits");',
      "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
      "async function find(page, timeout = 15_000, polling = pollEvery(50)) {",
      "  const deadline = Date.now() + 8_000;",
      "  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));",
      "  await page.evaluate(() => performance.now() + 20_000);",
      "  await new Promise((resolve) => setTimeout(resolve, 2 * 100));",
      "  const named = Date.now() + STATE_WAIT_MS;",
      "  await page.evaluate((ceiling) => new Promise((resolve) => setTimeout(resolve, ceiling)), STATE_WAIT_MS);",
      "  return [sleep, timeout, polling, deadline, named];",
      "}",
      "module.exports = { find };",
    ].join("\n");
    expect(await messages(code)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("rejects a test hook that acts on live game state from a separate page call", async () => {
    const code = [
      'const { STATE_WAIT_MS } = require("./browser-waits");',
      "async function run(page) {",
      '  await page.evaluate(() => window.__PANTHEON_TEST.triggerPaleVariantCounterplay("prism-seer", "perfect-parry"));',
      "  await page.waitForFunction(",
      '    () => window.TEAR_WEAPON_DEBUG().projectiles.length > 0 && (window.__PANTHEON_TEST.triggerX("a"), true),',
      "    undefined,",
      "    { timeout: STATE_WAIT_MS },",
      "  );",
      "}",
      "module.exports = { run };",
    ].join("\n");
    expect(await messages(code)).toEqual([3]);
  });

  it("rejects reading projectiles from a separate page call after the wait that found them", async () => {
    const code = [
      'const { STATE_WAIT_MS } = require("./browser-waits");',
      "async function run(page) {",
      "  const handle = await page.waitForFunction(",
      '    () => window.TEAR_WEAPON_DEBUG().projectiles.find((projectile) => projectile.kind === "hail-orb") ?? null,',
      "    undefined,",
      "    { timeout: STATE_WAIT_MS },",
      "  );",
      '  const late = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().projectiles.find((p) => p.kind === "hail-orb"));',
      "  return [await handle.jsonValue(), late];",
      "}",
      "module.exports = { run };",
    ].join("\n");
    expect(await messages(code)).toEqual([8]);
  });

  it("rejects waiting on pointer lock or an inline style, and accepts a performance mark", async () => {
    const code = [
      'const { STATE_WAIT_MS } = require("./browser-waits");',
      "async function run(page) {",
      "  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: STATE_WAIT_MS });",
      '  await page.waitForFunction(() => document.getElementById("hint").style.display === "block", undefined, {',
      "    timeout: STATE_WAIT_MS,",
      "  });",
      '  await page.waitForFunction(() => performance.getEntriesByName("tear:gameplay-start").length > 0, undefined, {',
      "    timeout: STATE_WAIT_MS,",
      "  });",
      "}",
      "module.exports = { run };",
    ].join("\n");
    expect(await messages(code)).toEqual([3, 4]);
  });
});

describe("reloadPage", () => {
  function fakePage({ reload, evaluate }) {
    const page = new EventEmitter();
    const mainFrame = { url: () => "http://127.0.0.1/index.html" };
    page.off = page.removeListener;
    page.mainFrame = () => mainFrame;
    page.reload = (options) => reload(page, mainFrame, options);
    page.evaluate = evaluate;
    return page;
  }

  it("rejects waiting for networkidle in any form, and accepts waiting for script loads", async () => {
    const code = [
      'const { STATE_WAIT_MS, waitForScriptLoads } = require("./browser-waits");',
      "async function run(page) {",
      '  await page.waitForLoadState("networkidle", { timeout: STATE_WAIT_MS });',
      '  await page.goto("http://127.0.0.1/", { waitUntil: "networkidle", timeout: STATE_WAIT_MS });',
      "  await waitForScriptLoads(page);",
      "}",
      "module.exports = { run };",
    ].join(String.fromCharCode(10));
    expect(await messages(code)).toEqual([3, 4]);
  });

  it("waits for script requests in flight and ignores media that keeps loading", async () => {
    const page = new EventEmitter();
    let frames = 0;
    page.evaluate = async () => {
      frames += 1;
    };
    await expect(waitForScriptLoads(page)).rejects.toThrow(/trackScriptLoads/u);
    trackScriptLoads(page);
    const request = (type, url) => ({ resourceType: () => type, url: () => url });
    const music = request("media", "http://127.0.0.1/assets/stem.ogg");
    page.emit("request", music); // still loading when the screen is ready: must not hold the wait
    await waitForScriptLoads(page);
    expect(frames).toBe(2);

    const chunk = request("script", "http://127.0.0.1/assets/cold-screen-renderers.js");
    page.emit("request", chunk);
    let done = false;
    const waiting = waitForScriptLoads(page).then(() => {
      done = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(done).toBe(false);
    page.emit("requestfinished", music);
    await new Promise((resolve) => setImmediate(resolve));
    expect(done).toBe(false);
    page.emit("requestfinished", chunk);
    await waiting;
    expect(done).toBe(true);
    expect(frames).toBe(4);
  });

  it("reloads with the state-wait ceiling", async () => {
    let seen;
    const page = fakePage({
      reload: (_page, _frame, options) => ((seen = options), Promise.resolve("ok")),
      evaluate: () => Promise.resolve(),
    });
    await expect(reloadPage(page)).resolves.toBe("ok");
    expect(seen).toEqual({ waitUntil: "domcontentloaded", timeout: STATE_WAIT_MS });
  });

  it("names what the page was doing when the reload stalls", { timeout: 10_000 }, async () => {
    const page = fakePage({
      reload: (target, frame) => {
        target.emit("framenavigated", frame);
        return Promise.reject(new Error("page.reload: Timeout exceeded"));
      },
      // A main thread that never answers.
      evaluate: () => new Promise((resolve) => void resolve),
    });
    const failure = await reloadPage(page).catch((error) => error);
    expect(failure.message).toMatch(
      /navigation events: navigated to http:\/\/127\.0\.0\.1\/index\.html at \d+ ms\npage did not answer within 5 s; no stack[^\n]*\nrequests open when the reload began: not recorded[^\n]*\nrequests since the reload began: not recorded/u,
    );
    expect(failure.cause.message).toContain("Timeout exceeded");
    expect(page.listenerCount("framenavigated")).toBe(0);
  });
});
