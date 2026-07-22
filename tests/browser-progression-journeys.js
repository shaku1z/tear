const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "progression journeys", port: 8142 }, async ({ page, boot, waitScreen, clickAndWait }) => {
  function requireHook(hooks, name) {
    assert.ok(hooks.includes(name), `built artifact is missing required PANTHEON_DEBUG hook: ${name}`);
  }
  async function settleInput() {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: true }));
  await waitScreen("draft");
  const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
  const initialDraft = await page.evaluate(() => window.__PANTHEON_TEST.state().draft || null);
  assert.ok(initialDraft && initialDraft.choiceCount >= 3, "draft hook prepares real choices");
  await page.keyboard.press("r");
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().draft?.rerolls === 1, undefined, { timeout: 5000 });
  assert.equal((await page.evaluate(() => window.__PANTHEON_TEST.state().draft.rerolls)), 1, "real R input consumes one reroll");
  await page.mouse.click(314, 300);
  await waitScreen("reserve");
  assert.ok((await page.evaluate(() => window.__PANTHEON_TEST.state().draft.reserveCount)) >= 1, "draft selection produces reserve choices");
  await page.mouse.click(314, 300);
  await waitScreen("playing");
  assert.ok(await page.evaluate(() => window.__PANTHEON_TEST.state().draft.reservedId), "real reserve selection is retained");

  await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 1, reserve: true }));
  await waitScreen("draft");
  await page.mouse.click(314, 300);
  await waitScreen("reserve");
  await clickAndWait(800, 706, "playing");

  requireHook(hooks, "openTierUp");
  await page.evaluate(() => window.__PANTHEON_TEST.openTierUp());
  await waitScreen("tierup");
  await page.mouse.click(314, 300);
  await waitScreen("playing");

  await boot();
  await clickAndWait(260, 452, "shop");
  await page.mouse.wheel(0, 700);
  await settleInput();
  await page.mouse.wheel(0, -300);
  await settleInput();
  await clickAndWait(800, 850, "menu");

  await clickAndWait(260, 635, "codex");
  for (const x of [612, 800, 988, 612]) { await page.mouse.click(x, 143); await settleInput(); }
  await page.mouse.click(300, 270);
  await settleInput();
  await page.mouse.wheel(0, 500);
  await settleInput();
  await clickAndWait(800, 850, "menu");

  await clickAndWait(260, 266, "profile");
  for (const x of [612, 800, 988, 612]) { await page.mouse.click(x, 271); await settleInput(); }
  await clickAndWait(800, 850, "menu");

  await clickAndWait(260, 513, "achievements");
  await page.mouse.click(518, 347);
  await settleInput();
  await page.mouse.click(400, 430);
  await settleInput();
  await page.mouse.wheel(0, 500);
  await settleInput();
  await clickAndWait(800, 850, "menu");

  await clickAndWait(260, 574, "leaderboards");
  await page.mouse.click(894, 143); // REPLAY FEED
  await settleInput();
  await page.mouse.wheel(0, 500);
  await settleInput();
  await page.mouse.click(706, 143); // GLOBAL
  await settleInput();
  await page.mouse.click(800, 243); // mode board
  await settleInput();
  await page.mouse.click(988, 285); // difficulty board
  await settleInput();
  await clickAndWait(800, 850, "menu");

  requireHook(hooks, "openReplay");
  await page.evaluate(() => window.__PANTHEON_TEST.openReplay());
  await waitScreen("replay");
  const replayBefore = await page.evaluate(() => window.__PANTHEON_TEST.state().replay || null);
  assert.ok(replayBefore, "built artifact exposes a read-only replay summary in PANTHEON_DEBUG");
  await page.mouse.click(252, 856); // previous chapter
  await settleInput();
  await page.mouse.click(340, 856); // pause
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().replay.paused);
  await page.mouse.click(428, 856); // next chapter
  await settleInput();
  await page.mouse.click(506, 856); // speed
  await settleInput();
  assert.notEqual((await page.evaluate(() => window.__PANTHEON_TEST.state().replay.speed)), replayBefore.speed, "speed action changes playback speed");
  await page.mouse.click(594, 856); // restart
  await settleInput();
  await page.mouse.click(1225, 856); // info
  await settleInput();
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().replay.infoVisible), true, "INFO action opens replay summary");
  await clickAndWait(1380, 856, "menu");

  requireHook(hooks, "openRename");
  await page.evaluate(() => window.__PANTHEON_TEST.openRename());
  await waitScreen("rename");
  const nameInput = page.locator("#nameInput");
  await nameInput.fill("x");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().rename.valid), false, "real rename validation rejects a short name");
  await nameInput.fill("Journey Tester");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().rename.valid), true, "real rename validation accepts a valid name");
  await page.keyboard.press("Escape");
  await waitScreen("profile");
}).then(() => console.log("browser progression journeys passed"))
  .catch((error) => { console.error(error); process.exit(1); });
