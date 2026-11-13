const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney(
  { name: "C37 normal Replay Hub home", port: 8179, recordFrames: true },
  async ({ page, clickLabel, labelPoint }) => {
    await page.evaluate(() => {
      const captured = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function ghostLabText(value, ...rest) {
        captured.push(String(value));
        return original.call(this, value, ...rest);
      };
      window.__TEAR_C37_GHOST_LAB_TEXT__ = captured;
    });
    // Canvas controls are pressed where the frame drew their labels.
    await clickLabel("REPLAY HUB", "ghostlab"); // normal main-menu REPLAY HUB control
    const labText = await page.evaluate(() => window.__TEAR_C37_GHOST_LAB_TEXT__);
    for (const expected of [
      "REPLAY HUB",
      "AVAILABLE LOCALLY",
      "TRAINING ARCHIVE",
      "TRAINING OPERATIONS",
      "NOT YET PLAYER-SAFE",
      "UNAVAILABLE / RUN MONITOR",
      "UNAVAILABLE / SCENARIO CONSOLE",
      "UNAVAILABLE / GAME AGENT EVIDENCE",
      "UNAVAILABLE / GAME AGENT LADDER",
      "UNAVAILABLE / REPLAY EDITOR",
    ]) {
      assert.ok(
        labText.includes(expected),
        `Replay Hub did not visibly render ${expected}: ${labText.slice(-80).join(" | ")}`,
      );
    }
    // Each local page reads its stores before it draws; wait for the loaded content before BACK.
    await clickLabel("TRAINING ARCHIVE", "academy");
    await labelPoint("HELD");
    await clickLabel("‹  BACK", "menu");
    await clickLabel("REPLAY HUB", "ghostlab");
    await clickLabel("TRAINING OPERATIONS", "foundry");
    await labelPoint("REFRESH");
    await clickLabel("‹  BACK", "menu");
    await clickLabel("REPLAY HUB", "ghostlab");
    await clickLabel("REPLAY VAULT", "profile");
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().game), "profile");
    assert.ok(
      (await page.evaluate(() => window.__TEAR_C37_GHOST_LAB_TEXT__)).includes("VAULT"),
      "Ghost Lab Vault action did not render the normal Vault result state",
    );
  },
)
  .then(() => console.log("browser normal Replay Hub home passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
