const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C37 normal Replay Hub home", port: 8179 }, async ({ page, waitScreen }) => {
  const text = [];
  await page.evaluate(() => {
    const captured = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function ghostLabText(value, ...rest) {
      captured.push(String(value));
      return original.call(this, value, ...rest);
    };
    window.__TEAR_C37_GHOST_LAB_TEXT__ = captured;
  });
  await page.mouse.click(780, 757); // normal main-menu REPLAY HUB control
  await waitScreen("ghostlab");
  const labText = await page.evaluate(() => window.__TEAR_C37_GHOST_LAB_TEXT__);
  for (const expected of ["REPLAY HUB", "AVAILABLE LOCALLY", "TRAINING ARCHIVE", "TRAINING OPERATIONS", "NOT YET PLAYER-SAFE", "UNAVAILABLE / RUN MONITOR", "UNAVAILABLE / SCENARIO CONSOLE", "UNAVAILABLE / GAME AGENT LADDER", "UNAVAILABLE / REPLAY EDITOR"]) {
    assert.ok(labText.includes(expected), `Replay Hub did not visibly render ${expected}: ${labText.slice(-80).join(" | ")}`);
  }
  await page.mouse.click(475, 224); // Academy
  await waitScreen("academy");
  await page.mouse.click(800, 850); // BACK
  await waitScreen("menu");
  await page.mouse.click(780, 757); await waitScreen("ghostlab");
  await page.mouse.click(475, 336); // Training Operations
  await waitScreen("foundry");
  await page.mouse.click(800, 850); await waitScreen("menu");
  await page.mouse.click(780, 757); await waitScreen("ghostlab");
  await page.mouse.click(475, 448); // Vault
  await waitScreen("profile");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
  assert.ok((await page.evaluate(() => window.__TEAR_C37_GHOST_LAB_TEXT__)).includes("VAULT"), "Ghost Lab Vault action did not render the normal Vault result state");
}).then(() => console.log("browser normal Replay Hub home passed"))
  .catch((error) => { console.error(error); process.exit(1); });
