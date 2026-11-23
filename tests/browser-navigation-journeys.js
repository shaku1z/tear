const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS, pollEvery } = require("./browser-waits");

withJourney(
  { name: "navigation journeys", tutorialSkipped: true },
  async ({ page, boot, waitScreen, clickAndWait }) => {
    async function setupSnapshot() {
      const snapshot = await page.evaluate(() => window.__PANTHEON_TEST.state().setup || null);
      assert.ok(snapshot, "built artifact must expose the read-only setup selection summary in PANTHEON_DEBUG");
      return snapshot;
    }
    // A setup choice counts once the game shows it selected, not after a number of frames: a click the
    // game has not acted on yet must not be followed by BEGIN, which would start the previous choice.
    // Click again only while the choice is still unchanged, as clickAndWait does for a screen.
    async function choose(x, y, field, value) {
      const selected = () => page.evaluate((key) => window.__PANTHEON_TEST.state().setup?.[key], field);
      const deadline = Date.now() + STATE_WAIT_MS;
      await page.mouse.click(x, y);
      for (;;) {
        try {
          await page.waitForFunction(
            ({ key, expected }) => window.__PANTHEON_TEST.state().setup?.[key] === expected,
            { key: field, expected: value },
            { timeout: pollEvery(1_000) },
          );
          return;
        } catch (error) {
          if (error?.name !== "TimeoutError") throw error;
          if (Date.now() > deadline)
            throw new Error(`setup ${field} never became ${value} (it is ${String(await selected())})`, {
              cause: error,
            });
          await page.mouse.click(x, y);
        }
      }
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
    await choose(430, 195 + 2 * 60, "mode", "gauntlet");
    await choose(820, 196 + 2 * 60, "difficulty", "hard");
    await choose(1180, 196 + 3 * 60, "weapon", "chainblade");
    assert.deepEqual(await setupSnapshot(), {
      mode: "gauntlet",
      difficulty: "hard",
      weapon: "chainblade",
      boss: "shuffle",
    });
    await clickAndWait(800, 850, "menu");

    await clickAndWait(260, 360, "setup");
    await choose(430, 509, "mode", "bossonly"); // BOSS ONLY (first compact DEV row)
    await choose(829, 683, "boss", "warden"); // THE WARDEN (first boss after SHUFFLE in the six-boss published row)
    assert.deepEqual(await setupSnapshot(), {
      mode: "bossonly",
      difficulty: "hard",
      weapon: "chainblade",
      boss: "warden",
    });
    await clickAndWait(800, 850, "menu");

    const requestedMode = process.env.TEAR_JOURNEY_MODE;
    const modes = ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"].filter(
      (mode) => !requestedMode || mode === requestedMode,
    );
    for (const mode of modes) {
      const modeY = {
        campaign: 195,
        endless: 255,
        gauntlet: 315,
        playground: 375,
        tutorial: 435,
        bossonly: 509,
        sandbox: 549,
      }[mode];
      console.log(`navigation journey: starting ${mode}`);
      await boot();
      await clickAndWait(260, 360, "setup");
      await choose(430, modeY, "mode", mode);
      await page.mouse.click(800, 758);
      try {
        await page.waitForFunction(
          (expected) => {
            const state = window.__PANTHEON_TEST.state();
            return state.game === "playing" && state.mode === expected;
          },
          mode,
          { timeout: STATE_WAIT_MS },
        );
      } catch (error) {
        const snapshot = await page.evaluate(() => window.__PANTHEON_TEST.state());
        assert.fail(`${mode} BEGIN did not start its selected mode: ${JSON.stringify(snapshot)} (${error.message})`);
      }
      if (mode === "tutorial") {
        assert.deepEqual(
          await page.evaluate(() => {
            const tutorial = window.__PANTHEON_TEST.tutorial();
            return {
              active: tutorial.active,
              lesson: tutorial.lesson,
              lessonCount: tutorial.lessonCount,
              arena: tutorial.arena,
            };
          }),
          {
            active: true,
            lesson: "MOVE",
            lessonCount: 14,
            arena: "runway",
          },
          "Tutorial must launch the Cutting Room curriculum, not only a generic tutorial mode",
        );
      }
      await page.evaluate(() => window.__PANTHEON_TEST.skip());
      await page.waitForFunction(() => window.__PANTHEON_TEST.state().active === false, undefined, {
        timeout: STATE_WAIT_MS,
      });
      assert.equal(
        await page.evaluate(() => window.__PANTHEON_TEST.state().active),
        false,
        `${mode} opening is safely skippable`,
      );
      await page.keyboard.press("p");
      await waitScreen("paused");
      // Pause and confirm-quit use the shared overlay pattern: the action rail starts under
      // the title (RESUME first); the tutorial pause lists its lesson actions before MAIN MENU.
      await clickAndWait(200, 151, "playing");
      await page.keyboard.press("p");
      await waitScreen("paused");
      await clickAndWait(200, mode === "tutorial" ? 431 : 331, "confirmquit");
      // The confirm's actions are one centred row; the tutorial's adds SKIP TUTORIAL after QUIT,
      // so its row of three (300 wide, 12 apart) centres QUIT at 488 instead of 644.
      await clickAndWait(mode === "tutorial" ? 488 : 644, 175, "menu");
    }

    await boot();
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().attract?.ready === true, undefined, {
      timeout: STATE_WAIT_MS,
    });
    const initialAttract = await page.evaluate(() => window.__PANTHEON_TEST.state().attract || null);
    assert.ok(initialAttract, "built artifact must expose the read-only Attract summary in PANTHEON_DEBUG");
    assert.equal(initialAttract.ready, true, "attract mode is active on the menu");
    await clickAndWait(260, 360, "setup");
    assert.equal(
      (await page.evaluate(() => window.__PANTHEON_TEST.state().attract)).ready,
      true,
      "attract mode remains the live backdrop across menu screens",
    );
    await page.mouse.click(800, 758);
    await waitScreen("playing");
    assert.equal(
      (await page.evaluate(() => window.__PANTHEON_TEST.state().attract)).ready,
      false,
      "attract mode exits when a run begins",
    );
    await page.keyboard.press("p");
    await waitScreen("paused");
    // A fresh profile starts the Tutorial, whose pause lists its lesson actions before MAIN MENU.
    const tutorialPause = await page.evaluate(() => window.__PANTHEON_TEST.state().mode === "tutorial");
    await clickAndWait(200, tutorialPause ? 431 : 331, "confirmquit");
    await clickAndWait(644, 175, "menu");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().attract.ready);
  },
)
  .then(() => console.log("browser navigation journeys passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
