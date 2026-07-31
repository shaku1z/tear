const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C27 Ghost V3 live capture", port: 8155 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract", kind: "scenario", schemaVersion: 1,
      id: "c27-live-capture", version: 1, description: "C27 V3 live recorder proof",
      stateClass: "recorded-canonical", executionClass: "engineering", seed: "c27-capsule-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" }, maxTicks: 240,
      assertions: ["runtime.finite-state"], tags: ["c27", "ghost", "capsule"],
    });
    for (let tick = 1; tick <= 240; tick += 1) {
      environment.step(tick === 1 ? [{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }]
        : tick === 25 ? [{ kind: "command", tick, id: 2, command: { type: "dash", x: 1000, y: 0 } }] : []);
    }
    environment.pause();
    environment.resume();
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const persisted = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.recordingProfile, "coaching");
  assert.equal(typeof manifest.provenance.runId, "string");
  assert.equal(typeof manifest.provenance.seed, "string");
  assert.ok(persisted.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"));
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(capsule.tracks.events.length > 0, true);
  const eventTypes = capsule.tracks.events.map((entry) => entry.value?.type);
  assert.ok(eventTypes.includes("run.started"), "live capsule omitted its authoritative start boundary");
  assert.ok(eventTypes.includes("run.paused"), "live pause did not enter the V3 causal track");
  assert.ok(eventTypes.includes("run.resumed"), "live resume did not enter the V3 causal track");
  assert.ok(eventTypes.includes("run.abandoned"), "lifecycle termination did not enter the V3 capsule before shutdown");
  assert.equal(capsule.tracks.results.length > 0, true);
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "events"));
  assert.ok(manifest.chunks.some((chunk) => chunk.kind === "results"));
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__, undefined, { timeout: 15000 });
  const afterReload = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifests());
  assert.ok(afterReload.some((candidate) => candidate.id === manifest.id && candidate.status === "complete"),
    "completed Ghost V3 capsule was not readable after a browser reload");
  const reloadedCapsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(reloadedCapsule.tracks.results.length > 0, true);
});
