const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// This intentionally follows the ordinary C27/C29 durable-capsule path.  It
// does not manufacture Vault data or call the publication controller directly.
withJourney({ name: "C38 player publication review", port: 8180 }, async ({ page, boot, waitScreen, baseUrl }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c38-player-publication-review", version: 1, description: "C38 normal player publication review",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c38-publication-review-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 120,
      assertions: ["runtime.finite-state"], tags: ["c38", "ghost", "publication"],
    });
    for (let tick = 1; tick <= 120; tick += 1) {
      environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }] : []);
    }
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.status, "complete");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id)).status, "verified");

  await boot();
  const durable = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(durable.manifest.status, "complete");
  await page.evaluate(() => {
    const captured = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function capturePublicationReview(value, ...rest) {
      captured.push(String(value));
      return original.call(this, value, ...rest);
    };
    window.__TEAR_C38_PUBLICATION_TEXT__ = captured;
  });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.mouse.click(260, 266); // PROFILE: ordinary player menu route
  await waitScreen("profile");
  await page.mouse.click(875, 271); // VAULT: ordinary Profile tab
  await page.waitForFunction(() => window.__TEAR_C38_PUBLICATION_TEXT__?.includes("Ghost V3 - COACHING"), undefined, { timeout: 10000 });
  await page.mouse.click(1280, 398); // PUBLISH on the real healthy Vault row
  await waitScreen("ghostpublication");
  await page.waitForFunction(() => window.__TEAR_C38_PUBLICATION_TEXT__?.includes("GHOST PUBLICATION"), undefined, { timeout: 10000 });
  const review = await page.evaluate(() => window.__TEAR_C38_PUBLICATION_TEXT__ ?? []);
  for (const expected of [
    "STATUS / UNAVAILABLE", `CAPSULE / ${manifest.id}`, `SOURCE ROOT / ${manifest.rootIntegrity}`,
    "CAPABILITY / endpoint-unconfigured", "TRAINING / NO-TRAINING (NOT COLLECTED OR GRANTED)",
    "GRANT LOCAL PUBLICATION", "CANCEL PUBLICATION",
  ]) {
    assert.ok(review.includes(expected), `normal C38 review did not render ${expected}: ${review.slice(-100).join(" | ")}`);
  }
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "ghostpublication");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id)).manifest.rootIntegrity,
    manifest.rootIntegrity, "review changed durable source custody");
  assert.deepEqual(requests.filter((url) => !url.startsWith(`${baseUrl}/`)), [], "local-only unavailable review made a network request");
}).then(() => console.log("browser C38 player publication review passed"))
  .catch((error) => { console.error(error); process.exit(1); });
