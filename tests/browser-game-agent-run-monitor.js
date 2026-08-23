/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "G4-F canonical Game Agent and Run Monitor surface", port: 8164 }, async ({ page, baseUrl }) => {
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1&run-monitor=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_RUN_MONITOR__, undefined, { timeout: 15_000 });
  assert.equal(await page.locator("#tear-run-monitor").count(), 1);
  assert.equal(await page.evaluate(() => window.__TEAR_RUN_MONITOR__ === window.__TEAR_WATCH_AGENT__), true);
  assert.equal(await page.getByRole("button", { name: "Start Run Monitor" }).count(), 1);
  assert.equal((await page.evaluate(() => window.__TEAR_RUN_MONITOR__.snapshot())).screen, "menu");

  await page.getByRole("button", { name: "Start Run Monitor" }).click();
  let snapshot = await page.evaluate(() => window.__TEAR_RUN_MONITOR__.snapshot());
  assert.equal(snapshot.status, "running");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal((await page.evaluate(() => window.__TEAR_RUN_MONITOR__.snapshot())).status, "paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  snapshot = await page.evaluate(() => window.__TEAR_RUN_MONITOR__.snapshot());
  assert.equal(snapshot.status, "running");

  // The old deep link remains readable and continues to expose the old DOM
  // contract for existing C24/C32 evidence journeys.
  await page.goto(`${baseUrl}/index.html?test=1&bossdebug=1&watchagent=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  assert.equal(await page.locator("#tear-watch-agent").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Start Watch Agent" }).count(), 1);
});
