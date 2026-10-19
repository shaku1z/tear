const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "playground journeys", port: 8144 }, async ({ page, boot, waitScreen }) => {
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

  if (process.env.TEAR_PRACTICE_LAB_ONLY === "1") {
    // Declared historical completion/balance fixture; every subsequent entry,
    // lesson, restart and leave uses normal rendered controls. No course played.
    await page.evaluate(() => {
      localStorage.setItem("tear_profile_v2", JSON.stringify({ schema: "tear.profile", schemaVersion: 3, revision: 1,
        updatedAtMs: 1, writerId: "practice-lab-ui-fixture", extensions: {}, profile: { v: 1, created: 1,
          shards: 10, ach: { student: 1, first_buy: 1 }, achCoinsRetrofit: true, modes: {}, seen: {},
          stats: { tutorialDone: 1, coinsEarned: 1000, shopBuys: 1 } } }));
      localStorage.setItem("tear_meta", JSON.stringify({ lifetimeEarned: 1000, lifetimeSpent: 375, buy: { sharp: 1 } }));
    });
    await page.addInitScript(() => {
      const captured = [], original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function practiceLabText(value, x, y, ...rest) {
        captured.push({ text: String(value), x, y });
        if (captured.length > 1000) captured.splice(0, 500);
        return original.call(this, value, x, y, ...rest);
      };
      window.__TEAR_PRACTICE_LAB_TEXT__ = captured;
    });
    const directory = process.env.TEAR_PRACTICE_LAB_ARTIFACT_DIR;
    if (directory) fs.mkdirSync(path.resolve(directory), { recursive: true });
    const clickLabel = async (label) => {
      await page.waitForFunction((expected) => window.__TEAR_PRACTICE_LAB_TEXT__?.some((entry) => entry.text === expected), label);
      const point = await page.evaluate((expected) => window.__TEAR_PRACTICE_LAB_TEXT__.findLast((entry) => entry.text === expected), label);
      await page.mouse.click(point.x, point.y);
    };
    const savedEffects = () => page.evaluate(() => {
      const profile = JSON.parse(localStorage.getItem("tear_profile_v2")).profile;
      const meta = JSON.parse(localStorage.getItem("tear_meta"));
      return { tutorialDone: profile.stats.tutorialDone, achievements: profile.ach, earned: meta.lifetimeEarned, spent: meta.lifetimeSpent, buy: meta.buy };
    });
    await boot();
    const before = await savedEffects();
    await clickLabel("PRACTICE LAB"); await waitScreen("paused");
    let session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
    assert.equal(session.practiceOnly, true); assert.equal(session.courseCompleted, false);
    assert.equal(session.lessons.filter((lesson) => lesson.canPractice).length, 13);
    assert.ok(session.lessons.every((lesson) => !lesson.completed), "historical lesson history must remain unknown");
    if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "practice-lab-selector.png") });
    await clickLabel("LAUNCH"); await waitScreen("playing");
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().lessonIndex), 4);
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().weapon), "sword");
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().difficulty), "normal");
    await pressUntilScreen("p", "paused"); await clickLabel("RESTART LESSON"); await waitScreen("playing");
    assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.tutorial().counters.launch ?? 0), 0);
    await pressUntilScreen("p", "paused"); await clickLabel("MAIN MENU"); await waitScreen("confirmquit");
    await clickLabel("QUIT"); await waitScreen("menu");
    await boot();
    // Re-enter through the ordinary setup screen after a full page reload.
    await clickLabel("PLAY"); await waitScreen("setup");
    await clickLabel("PRACTICE LAB"); await waitScreen("paused");
    session = await page.evaluate(() => window.__PANTHEON_TEST.tutorial().session);
    assert.equal(session.practiceOnly, true); assert.equal(session.phase, "free-practice");
    assert.deepEqual(await savedEffects(), before, "opening/restarting practice must not add completion, achievements, coins or purchases");
    console.log("Practice Lab UI fixture passed: durable completed-profile reboot, normal menu/setup entry, lesson/restart/leave; no full course or reward grant");
    return;
  }

  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await waitScreen("playing");
  console.log("playground journey: run ready");

  // Hotkey spawns run at the combat-tail boundary. Each must survive the filtered
  // entity-list commit performed earlier in the same fixed tick.
  for (const key of ["1", "2", "3", "t", "b"]) {
    const before = await page.evaluate(() => window.__PANTHEON_TEST.state().enemyCount);
    await page.keyboard.press(key);
    try {
      await page.waitForFunction((count) => window.__PANTHEON_TEST.state().enemyCount > count, before, { timeout: 5000 });
    } catch (error) {
      if (error?.name !== "TimeoutError") throw error;
      const snapshot = await page.evaluate(() => ({
        state: window.__PANTHEON_TEST.state(),
        input: window.__TEAR_CATALOG_DEBUG__.input.snapshot(),
      }));
      assert.fail(`${key} did not spawn an enemy from ${before}: ${JSON.stringify(snapshot)}`);
    }
  }
  await page.keyboard.press("k");
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().enemyCount === 0, undefined, { timeout: 5000 });
  console.log("playground journey: combat hotkey spawns survive the tail commit");

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
  await page.mouse.click(800, 850); // BUILD MENU (lab back control)
  await waitScreen("pgmenu");
  console.log("playground journey: returned to build menu");
  await page.mouse.click(800, 780); // RESUME (source-position band under the actions row)
  await waitScreen("playing");
  console.log("playground journey: pointer resume");

  await pressUntilScreen("u", "pglab");
  await pressUntilScreen("Tab", "pgmenu");
  await pressUntilScreen("Tab", "playing");
  assert.equal(await page.evaluate(() => window.__PANTHEON_TEST.state().mode), "playground");
}).then(() => console.log("browser playground journeys passed"))
  .catch((error) => { console.error(error); process.exit(1); });
