/* eslint-disable @typescript-eslint/no-require-imports -- Browser evidence scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const baseSeed = Number(process.env.C24_LONGITUDINAL_SEED || 4);
const maxEpisodes = Number(process.env.C24_LONGITUDINAL_MAX_EPISODES || 5);
const maxSpend = Number(process.env.C24_LONGITUDINAL_MAX_SPEND || 1500);

withJourney({ name: "C24 longitudinal earned-profile journey", port: 8155 }, async ({ page, errors }) => {
  const url = new URL(page.url());
  url.searchParams.set("watchagent", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  await page.getByLabel("Profile").selectOption("competent");
  await page.getByLabel("Mode").selectOption("campaign");
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.getByLabel("Weapon").selectOption("riftlock");
  await page.getByLabel("Journey").selectOption("longitudinal-earned-profile");
  await page.getByLabel("Seed").fill(String(baseSeed));
  await page.getByLabel("Max episodes").fill(String(maxEpisodes));
  await page.getByLabel("Max spend").fill(String(maxSpend));
  const navigationCountBefore = await page.evaluate(() =>
    performance.getEntriesByType("navigation").length);
  await page.getByRole("button", { name: "Start Watch Agent" }).click();

  let snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  for (let batch = 0; batch < 2_000 && snapshot.status === "running"; batch += 1) {
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(2_000));
  }
  const navigationCountAfter = await page.evaluate(() =>
    performance.getEntriesByType("navigation").length);
  const ledger = snapshot.longitudinal;
  assert.ok(ledger, "longitudinal journey must publish its earned-profile ledger");
  assert.equal(ledger.label, "longitudinal-earned-profile");
  assert.equal(ledger.policyId, "c24-credible-cheap-v1");
  assert.equal(ledger.maxEpisodes, maxEpisodes);
  assert.equal(ledger.maxSpend, maxSpend);
  assert.ok(ledger.episodes.length >= 1 && ledger.episodes.length <= maxEpisodes);
  assert.ok(ledger.purchases.length >= 1, "bounded real-UI loop must naturally earn and buy an upgrade");
  assert.ok(ledger.frozenCombatLevels, "terminal ledger must freeze the combat-affecting level vector");
  assert.ok(ledger.spent <= ledger.maxSpend);
  assert.equal(navigationCountAfter, navigationCountBefore, "earned progression must not reload the page");
  assert.ok(ledger.episodes.every((episode, index) =>
    episode.episode === index + 1
    && episode.seed === baseSeed + index
    && episode.walletAfter >= episode.walletBefore
    && episode.coinsEarned >= 0));
  assert.ok(ledger.purchases.every((purchase) =>
    purchase.levelAfter === purchase.levelBefore + 1
    && purchase.walletAfter <= purchase.walletBefore
    && purchase.cost > 0));
  assert.equal(snapshot.executionClass, "engineering");
  assert.equal(snapshot.observationClass, "privileged-diagnostic");
  assert.equal(snapshot.debugTransitions, 0);
  assert.equal(snapshot.certified, false);

  const artifact = {
    schemaVersion: 1,
    checkpoint: "C24",
    gate: "longitudinal-earned-profile-bounded-journey",
    label: "longitudinal-earned-profile",
    cleanProfileGate: "separate-and-unchanged",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    controls: {
      startSurface: "visible Watch Agent panel",
      journeyTransitions: "currently rendered typed production ScreenAction controls",
      gameplayInput: "semantic GameAction at authoritative fixed ticks",
      currencyOrProfileInjection: false,
      agentDirectMetaCalls: false,
      debugStateWrites: 0,
      debugTransitions: snapshot.debugTransitions,
      pageReloadsDuringJourney: navigationCountAfter - navigationCountBefore,
    },
    ceilings: { maxEpisodes: ledger.maxEpisodes, maxSpend: ledger.maxSpend },
    ledger,
    result: snapshot,
    browserErrors: errors,
  };
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c24");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(path.join(artifactDirectory, "longitudinal-earned-profile.json"),
    JSON.stringify(artifact, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "longitudinal-earned-profile.png") });
  assert.deepEqual(errors, []);
  console.log("C24 bounded longitudinal earned-profile journey passed");
});
