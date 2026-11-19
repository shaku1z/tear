const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { pollEvery } = require("./browser-waits");

withJourney({ name: "terminal journeys", recordFrames: true }, async ({ page, waitArmed, clickLabel }) => {
  const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
  assert.ok(hooks.includes("openTerminal"), "built artifact is missing required PANTHEON_DEBUG hook: openTerminal");

  // Results screens ignore pointer input until they settle; then press the drawn control.
  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
  await waitArmed("gameover");
  await clickLabel("RETRY", "playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("gameover"));
  await waitArmed("gameover");
  await clickLabel("MAIN MENU", "menu");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("continue"));
  await waitArmed("continue");
  await clickLabel("GIVE UP", "gameover");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("win"));
  await waitArmed("win");
  await clickLabel("PLAY AGAIN", "playing");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("win"));
  await waitArmed("win");
  await clickLabel("MAIN MENU", "menu");

  await page.evaluate(() => window.__PANTHEON_TEST.openTerminal("campaignWin"));
  await waitArmed("win");
  await clickLabel("MAIN MENU", "menu");

  await page.evaluate(() => window.__PANTHEON_TEST.startFinale());
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().finale !== null);
  for (let step = 0; step < 80; step++) {
    const state = await page.evaluate(() => window.__PANTHEON_TEST.state());
    if (state.game === "win") break;
    if (state.finale && state.finale.phase === "cut") await page.evaluate(() => window.__PANTHEON_TEST.cut());
    else await page.evaluate(() => window.__PANTHEON_TEST.advance());
    await page.waitForTimeout(pollEvery(40));
  }
  const finaleState = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.ok(
    finaleState.game === "win" || (finaleState.finale && finaleState.finale.restoring),
    `finale debug journey did not reach restoration/results: ${JSON.stringify(finaleState)}`,
  );
})
  .then(() => console.log("browser terminal journeys passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
