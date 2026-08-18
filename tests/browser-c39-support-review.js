const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// Uses the ordinary C27/C29 durable-capsule route; it does not seed the UI or
// call the C39 controller directly.
withJourney({ name: "C39 player local support review", port: 8181 }, async ({ page, boot, waitScreen, baseUrl }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => { const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A"); environment.reset({ format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c39-player-support-review", version: 1, description: "C39 normal player support review", stateClass: "recorded-canonical", executionClass: "engineering", seed: "c39-support-review-seed", start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 120, assertions: ["runtime.finite-state"], tags: ["c39", "ghost", "support"] }); for (let tick = 1; tick <= 120; tick += 1) environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }] : []); environment.terminate(); });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest()); await boot();
  await page.evaluate(() => { const captured = []; const original = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function captureSupportReview(value, ...rest) { captured.push(String(value)); return original.call(this, value, ...rest); }; window.__TEAR_C39_SUPPORT_TEXT__ = captured; });
  const requests = []; page.on("request", (request) => requests.push(request.url()));
  await page.mouse.click(260, 266); await waitScreen("profile"); await page.mouse.click(875, 271);
  await page.waitForFunction(() => window.__TEAR_C39_SUPPORT_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  await page.mouse.click(1152, 398); await waitScreen("ghostsupport");
  await page.waitForFunction(() => window.__TEAR_C39_SUPPORT_TEXT__?.includes("GHOST SUPPORT"), undefined, { timeout: 10000 });
  const review = await page.evaluate(() => window.__TEAR_C39_SUPPORT_TEXT__ ?? []);
  for (const expected of ["STATUS / READY", `CAPSULE / ${manifest.id}`, `SOURCE ROOT / ${manifest.rootIntegrity}`, "CREATE LOCAL BUNDLE"]) assert.ok(review.includes(expected), `normal C39 review did not render ${expected}`);
  await page.mouse.click(640, 547);
  await page.waitForFunction(() => window.__TEAR_C39_SUPPORT_TEXT__?.includes("STATUS / CREATED"), undefined, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "ghostsupport");
  assert.deepEqual(requests.filter((url) => !url.startsWith(`${baseUrl}/`)), [], "local support review made a network request");
}).then(() => console.log("browser C39 player local support review passed")).catch((error) => { console.error(error); process.exit(1); });
