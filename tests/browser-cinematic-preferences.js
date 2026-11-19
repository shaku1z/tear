const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

withJourney({ name: "cinematic preference journeys" }, async ({ page, boot, waitScreen }) => {
  for (const preference of ["full", "brief", "off"]) {
    await boot();
    await page.evaluate((value) => {
      window.__PANTHEON_TEST.setOptions({ cinematics: value });
      window.__PANTHEON_TEST.startMode("campaign", "normal");
    }, preference);
    await waitScreen("playing");
    const snapshot = await page.evaluate(() => window.__PANTHEON_TEST.state());
    assert.equal(snapshot.settings.cinematics, preference, `${preference} preference must be applied`);

    if (preference === "off") {
      assert.equal(snapshot.active, false, "off must not launch a blocking chapter cinematic");
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().enemyCount > 0, undefined, {
        timeout: STATE_WAIT_MS,
      });
    } else {
      assert.equal(snapshot.active, true, `${preference} must launch the chapter cinematic`);
      assert.equal(
        snapshot.chapterBrief,
        preference === "brief",
        `${preference} must select the correct chapter script length`,
      );
    }
  }
})
  .then(() => console.log("browser cinematic preference journeys passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
