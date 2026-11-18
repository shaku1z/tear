const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS, settleFor } = require("./browser-waits");

// The replay engine is fetched on first use. Open a saved replay on a cold page whose engine chunk is held back
// (so the idle fetch-ahead cannot help): the open must wait, not throw; a failed fetch must give one plain
// message; and the next try, with the network back, must open the replay.
const ENGINE_CHUNK = "**/assets/production-replay-composition-*.js";

withJourney({ name: "Replay engine cold open", port: 8171 }, async ({ page, boot }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.evaluate(() => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    environment.reset({
      format: "tear-contract",
      kind: "scenario",
      schemaVersion: 1,
      id: "cold-replay-open",
      version: 1,
      description: "Replay opened on a cold page",
      stateClass: "recorded-canonical",
      executionClass: "engineering",
      seed: "cold-replay-seed",
      start: { mode: "endless", difficulty: "normal", weapon: "sword" },
      maxTicks: 30,
      assertions: ["runtime.finite-state"],
      tags: ["ghost", "replay", "cold"],
    });
    environment.step([{ kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } }]);
    environment.terminate();
  });
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null, undefined, { timeout: STATE_WAIT_MS });
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  assert.equal(manifest.status, "complete");

  // A fresh page: the engine has not been fetched. Hold its chunk back.
  const requested = [];
  page.on("request", (request) => {
    if (/production-replay-composition-[\w-]+\.js/u.test(request.url())) requested.push(request.url());
  });
  let hold = true;
  const gate = [];
  const handler = (route) => {
    if (!hold) return route.continue();
    gate.push(route);
    return undefined;
  };
  await page.route(ENGINE_CHUNK, handler);
  requested.length = 0; // recording the replay on the first page may itself have fetched the engine
  await boot();
  assert.deepEqual(requested, [], "the engine chunk must not be fetched while the menu is loading");

  // 1) The open waits for the engine instead of throwing.
  await page.evaluate((id) => {
    window.__COLD_REPLAY__ = { settled: false, failure: null, found: null };
    window.__TEAR_GHOST_V3__
      .read(id)
      .then((capsule) => {
        window.__COLD_REPLAY__ = { settled: true, failure: null, found: capsule?.manifest?.id ?? null };
      })
      .catch((error) => {
        window.__COLD_REPLAY__ = { settled: true, failure: String(error?.message ?? error), found: null };
      });
  }, manifest.id);
  await page.waitForTimeout(settleFor(800));
  assert.equal(
    (await page.evaluate(() => window.__COLD_REPLAY__)).settled,
    false,
    "the open must still be waiting while the engine is held back",
  );
  assert.ok(requested.length >= 1, "opening a replay must request the engine");

  // 2) The fetch fails: one plain message, no hang.
  hold = false;
  for (const route of gate.splice(0)) await route.abort("failed");
  const failed = await page.waitForFunction(() => window.__COLD_REPLAY__.settled && window.__COLD_REPLAY__, undefined, {
    timeout: STATE_WAIT_MS,
  });
  const failure = await failed.jsonValue();
  assert.match(failure.failure ?? "", /online visit|try again/u, `plain failure message, got ${failure.failure}`);

  // 3) The network is back: the next try opens the replay.
  await page.unroute(ENGINE_CHUNK, handler);
  const opened = await page.evaluate(
    (id) => window.__TEAR_GHOST_V3__.read(id).then((capsule) => capsule?.manifest?.id ?? null),
    manifest.id,
  );
  assert.equal(opened, manifest.id, "the retry must open the replay");
  const verified = await page.evaluate(
    (id) => window.__TEAR_GHOST_V3__.verify(id, "opening-continuation"),
    manifest.id,
  );
  assert.ok(verified !== undefined, "replay verification must run once the engine is there");
});
