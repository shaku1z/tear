const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "playground journeys", port: 8144 }, async ({ page, waitScreen }) => {
  async function pressUntilScreen(key, screen) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await page.keyboard.press(key);
      try {
        await page.waitForFunction((expected) => window.__PANTHEON_TEST.state().game === expected, screen, { timeout: 500 });
        await waitScreen(screen);
        return;
      } catch (error) {
        if (error?.name !== "TimeoutError") throw error;
      }
    }
    const snapshot = await page.evaluate(() => ({ state: window.__PANTHEON_TEST.state(), input: window.__TEAR_CATALOG_DEBUG__.input.snapshot() }));
    assert.fail(`${key} did not reach ${screen}: ${JSON.stringify(snapshot)}`);
  }

  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await waitScreen("playing");
  console.log("playground journey: run ready");

  // The in-world E shortcut shown by the production Playground help opens the tools.
  await pressUntilScreen("e", "pgmenu");
  console.log("playground journey: build menu open");
  const enemiesBefore = await page.evaluate(() => window.__PANTHEON_TEST.state().enemyCount);
  await page.mouse.click(278, 229); // spawn the first enemy kind
  await page.waitForFunction((before) => window.__PANTHEON_TEST.state().enemyCount > before, enemiesBefore, { timeout: 10000 });
  console.log("playground journey: enemy spawned");

  await page.mouse.click(330, 721); // ABILITY LAB
  await waitScreen("pglab");
  console.log("playground journey: ability lab open");
  await page.mouse.click(721, 272); // TAKE the first available ability
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.wheel(0, 500);
  await page.mouse.click(800, 850); // BUILD MENU
  await waitScreen("pgmenu");
  console.log("playground journey: returned to build menu");
  await page.mouse.click(800, 850); // RESUME
  await waitScreen("playing");
  console.log("playground journey: pointer resume");

  await pressUntilScreen("u", "pglab");
  await pressUntilScreen("Tab", "pgmenu");
  await pressUntilScreen("Tab", "playing");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().mode), "playground");
}).then(() => console.log("browser playground journeys passed"))
  .catch((error) => { console.error(error); process.exit(1); });
