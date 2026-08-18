const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C29 durable active campaign cinematic", port: 8164 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined,
    { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c29-active-campaign-cinematic", version: 1,
      description: "C29 durable active campaign cinematic capture",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c29-cinematic-seed",
      start: { mode: "campaign", difficulty: "normal", weapon: "sword" }, maxTicks: 1,
      assertions: ["runtime.finite-state"], tags: ["c29", "ghost", "campaign", "cinematic"],
    });
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.provenance.replayContext.simulation.initialState, "opening-initialized");
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  const anchor = capsule.tracks.keyframes.find((entry) => entry.tick === 0)?.value;
  assert.equal(anchor?.state?.["tear.cinematic.v1"]?.active, true,
    "the durable opening anchor must contain the active campaign director");
  const verification = await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id);
  assert.equal(verification.status, "verified");
  assert.deepEqual(verification.comparisons.map((entry) => [entry.tick, entry.equal]), [[0, true]]);
});
