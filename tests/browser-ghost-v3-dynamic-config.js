/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

function staticBuild(build) {
  const { configHash: ignored, ...stable } = build;
  void ignored;
  return stable;
}

withJourney({ name: "C27 Ghost V3 dynamic configuration provenance", port: 8163 }, async ({ page, waitScreen }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  // The test hook creates a normal live run and reaches the real tier-up UI;
  // the click below flows through the production reward controller. Its first
  // card is a configuration-mutating tier, not a State Forge/direct mutation.
  await page.evaluate(() => window.__PANTHEON_TEST.openTierUp());
  await waitScreen("tierup");
  await page.mouse.click(314, 300);
  await waitScreen("playing");
  // Let the ordinary requestAnimationFrame loop pass two 60-tick capture
  // intervals after the physical reward selection.
  await page.waitForTimeout(1_500);
  await page.evaluate(() => window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").terminate());

  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null
    || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);

  const { capsule, admission } = await page.evaluate(async () => {
    const manifest = await window.__TEAR_GHOST_V3__.manifest();
    return {
      capsule: await window.__TEAR_GHOST_V3__.read(manifest.id),
      admission: await window.__TEAR_GHOST_V3__.admission(manifest.id),
    };
  });
  assert.equal(admission.status, "unavailable", JSON.stringify(admission));
  const snapshots = capsule.tracks.keyframes.filter((entry) => entry.value?.kind === "snapshot");
  assert.ok(snapshots.length >= 2, "the upgraded live run did not retain bootstrap and a later State Forge keyframe");
  const bootstrap = capsule.tracks.events.find((entry) => entry.value?.id?.startsWith("ghost-live-bootstrap-")
    && entry.value?.payload?.boundary === "v3-sidecar-opened");
  assert.ok(bootstrap, "the capsule omitted its integrity-protected bootstrap event");
  assert.deepEqual(bootstrap.value.payload.provenance?.replayContext, admission.context,
    "the sealed bootstrap event disagrees with the capsule replay context");
  assert.ok(snapshots.every((entry) => entry.value?.provenance?.sourceId === bootstrap.value.id),
    "a dynamic-configuration keyframe did not cite the V3 bootstrap event");
  const bootstrapSnapshots = snapshots.filter((entry) => entry.tick === 0);
  assert.equal(bootstrapSnapshots.length, 1, "the capsule did not retain exactly one tick-zero State Forge bootstrap snapshot");
  assert.deepEqual(bootstrapSnapshots[0].value.provenance.build, admission.context.build,
    "the tick-zero State Forge snapshot does not match the immutable replay bootstrap fingerprint");
  for (const snapshot of snapshots) {
    assert.deepEqual(staticBuild(snapshot.value.provenance.build), staticBuild(admission.context.build),
      "a dynamic-configuration keyframe changed static build identity");
  }
  assert.ok(snapshots.some((entry) => entry.value.provenance.build.configHash !== admission.context.build.configHash),
    "State Forge upgrades did not produce a keyframe-specific configuration fingerprint");
  assert.equal(capsule.tracks.events.some((entry) => entry.value?.type === "ghost.snapshot-degraded"), false,
    "valid upgraded configuration caused V3 snapshot degradation");
});
