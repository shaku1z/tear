const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "navigation journeys", port: 8141 }, async ({ page, boot, waitScreen, clickAndWait }) => {
  async function setupSnapshot() {
    const snapshot = await page.evaluate(() => window.__PANTHEON_TEST.state().setup || null);
    assert.ok(snapshot, "built artifact must expose the read-only setup selection summary in PANTHEON_DEBUG");
    return snapshot;
  }
  async function settleInput() {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  const hubRoutes = [
    { point: [260, 266], screen: "profile" },
    { point: [260, 452], screen: "shop" },
    { point: [260, 513], screen: "achievements" },
    { point: [260, 574], screen: "leaderboards" },
    { point: [260, 635], screen: "codex" },
    { point: [260, 696], screen: "settings" },
  ];
  for (const route of hubRoutes) {
    await boot();
    await clickAndWait(route.point[0], route.point[1], route.screen);
    await clickAndWait(800, 850, "menu");
  }

  await boot();
  await clickAndWait(260, 360, "setup");
  await clickAndWait(800, 850, "menu");

  // Exercise all selectable War Table columns, including the conditional boss picker.
  await clickAndWait(260, 360, "setup");
  await page.mouse.click(430, 197 + 2 * 66); // GAUNTLET
  await settleInput();
  await page.mouse.click(820, 197 + 2 * 66); // HARD
  await settleInput();
  await page.mouse.click(1180, 203 + 3 * 78); // CHAINBLADE
  await settleInput();
  assert.deepEqual(await setupSnapshot(), {
    mode: "gauntlet", difficulty: "hard", weapon: "chainblade", boss: "shuffle",
  });
  await clickAndWait(800, 850, "menu");

  await clickAndWait(260, 360, "setup");
  await page.mouse.click(430, 197 + 5 * 66); // BOSS ONLY
  await settleInput();
  await page.mouse.click(870, 707); // THE WARDEN (first boss after SHUFFLE)
  await settleInput();
  assert.deepEqual(await setupSnapshot(), {
    mode: "bossonly", difficulty: "hard", weapon: "chainblade", boss: "warden",
  });
  await clickAndWait(800, 850, "menu");

  const requestedMode = process.env.TEAR_JOURNEY_MODE;
  const modes = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"]
    .filter((mode) => !requestedMode || mode === requestedMode);
  for (let index = 0; index < modes.length; index++) {
    const mode = modes[index];
    const cardIndex = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"].indexOf(mode);
    console.log(`navigation journey: starting ${mode}`);
    await boot();
    await clickAndWait(260, 360, "setup");
    await page.mouse.click(430, 197 + cardIndex * 66);
    await settleInput();
    await page.mouse.click(800, 758);
    try {
      await page.waitForFunction((expected) => {
        const state = window.__PANTHEON_TEST.state();
        return state.game === "playing" && state.mode === expected;
      }, mode, { timeout: 10000 });
    } catch (error) {
      const snapshot = await page.evaluate(() => window.__PANTHEON_TEST.state());
      assert.fail(`${mode} BEGIN did not start its selected mode: ${JSON.stringify(snapshot)} (${error.message})`);
    }
    await page.evaluate(() => window.__PANTHEON_TEST.skip());
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().active === false, undefined, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().active), false, `${mode} opening is safely skippable`);
    await page.keyboard.press("p");
    await waitScreen("paused");
    await clickAndWait(300, 235, "playing");
    await page.keyboard.press("p");
    await waitScreen("paused");
    await clickAndWait(300, 430, "confirmquit");
    await clickAndWait(650, 378, "menu");
  }

  await boot();
  const initialAttract = await page.evaluate(() => window.__PANTHEON_TEST.state().attract || null);
  assert.ok(initialAttract, "built artifact must expose the read-only Attract summary in PANTHEON_DEBUG");
  assert.equal(initialAttract.ready, true, "attract mode is active on the menu");
  await clickAndWait(260, 360, "setup");
  assert.equal((await page.evaluate(() => window.__PANTHEON_TEST.state().attract)).ready, true, "attract mode remains the live backdrop across menu screens");
  await page.mouse.click(800, 758);
  await waitScreen("playing");
  assert.equal((await page.evaluate(() => window.__PANTHEON_TEST.state().attract)).ready, false, "attract mode exits when a run begins");
  await page.keyboard.press("p");
  await waitScreen("paused");
  await clickAndWait(300, 430, "confirmquit");
  await clickAndWait(650, 378, "menu");
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().attract.ready);
}).then(() => console.log("browser navigation journeys passed"))
  .catch((error) => { console.error(error); process.exit(1); });
