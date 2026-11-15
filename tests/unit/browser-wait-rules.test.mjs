// The browser-test wait rules in eslint.config.mjs, tested on code rather than on the config text.
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: root });
const { reloadPage, STATE_WAIT_MS } = createRequire(import.meta.url)("../browser-waits.js");

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
      /navigation events: navigated to http:\/\/127\.0\.0\.1\/index\.html at \d+ ms; page did not answer within 5 s; no stack/u,
    );
    expect(failure.cause.message).toContain("Timeout exceeded");
    expect(page.listenerCount("framenavigated")).toBe(0);
  });
});
