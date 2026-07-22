const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "terminal journeys", port: 8143 }, async ({ page, waitScreen }) => {
  const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
  assert.ok(hooks.includes("openTerminal"), "built artifact is missing required PANTHEON_DEBUG hook: openTerminal");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
  await waitScreen("gameover");
  await page.mouse.click(220, 347);
  await waitScreen("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
  await waitScreen("gameover");
  await page.mouse.click(220, 409);
  await waitScreen("menu");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("continue"));
  await waitScreen("continue");
  await page.mouse.click(965, 390);
  await waitScreen("gameover");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("win"));
  await waitScreen("win");
  await page.mouse.click(800, 585);
  await waitScreen("playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("win"));
  await waitScreen("win");
  await page.mouse.click(800, 647);
  await waitScreen("menu");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("campaignWin"));
  await waitScreen("win");
  await page.mouse.click(800, 685);
  await waitScreen("menu");

  await page.evaluate(() => window.__PANTHEON_TEST.startFinale());
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().finale !== null);
  for (let step = 0; step < 80; step++) {
    const state = await page.evaluate(() => window.__PANTHEON_TEST.state());
    if (state.game === "win") break;
    if (state.finale && state.finale.phase === "cut") await page.evaluate(() => window.__PANTHEON_TEST.cut());
    else await page.evaluate(() => window.__PANTHEON_TEST.advance());
    await page.waitForTimeout(40);
  }
  const finaleState = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.ok(finaleState.game === "win" || (finaleState.finale && finaleState.finale.restoring),
    `finale debug journey did not reach restoration/results: ${JSON.stringify(finaleState)}`);
}).then(() => console.log("browser terminal journeys passed"))
  .catch((error) => { console.error(error); process.exit(1); });
