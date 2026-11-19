const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS, clickTarget } = require("./browser-waits");

withJourney(
  { name: "progression journeys", recordFrames: true },
  async ({ page, boot, waitScreen, clickAndWait, waitArmed, labelPoint, clickLabel, clickCard }) => {
    function requireHook(hooks, name) {
      assert.ok(hooks.includes(name), `built artifact is missing required PANTHEON_DEBUG hook: ${name}`);
    }
    async function settleInput() {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    /** Whether the last drawn frame contains exactly this text. */
    async function drawn(text) {
      return page.evaluate(
        (wanted) => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === wanted),
        text,
      );
    }
    async function waitDrawn(text) {
      await page.waitForFunction(
        (wanted) => window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => entry.text === wanted),
        text,
        { timeout: STATE_WAIT_MS },
      );
    }
    /** Tabs register an unlabelled target, so they are clicked where their label is drawn. */
    async function clickDrawn(label) {
      const point = await labelPoint(label);
      await page.mouse.click(point.x, point.y);
    }
    const storageSnapshot = () => page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.storage.snapshot());
    /**
     * Boots a fresh page whose isolated storage starts with `values`: what a reload finds in the
     * browser's storage. Init scripts run in the order they were added, so this seed is the last word.
     */
    async function reloadWith(values) {
      await page.addInitScript((seed) => {
        window.__TEAR_TEST_STORAGE__ = seed;
      }, values);
      await boot();
    }

    if (process.env.TEAR_CONTEXTUAL_ONBOARDING_ONLY === "1") {
      // UI fixture routing only: real screen models/renderers/controls, without
      // claiming a naturally played campaign clear or a purchase-pacing result.
      await page.addInitScript(() => {
        const captured = [],
          original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function captureOnboarding(value, ...rest) {
          captured.push(String(value));
          if (captured.length > 1000) captured.splice(0, 500);
          return original.call(this, value, ...rest);
        };
        window.__TEAR_ONBOARDING_TEXT__ = captured;
      });
      const directory = process.env.TEAR_CONTEXTUAL_ONBOARDING_ARTIFACT_DIR;
      if (directory) fs.mkdirSync(path.resolve(directory), { recursive: true });
      await boot();
      await page.evaluate(async () => {
        window.__PANTHEON_TEST.setOptions({ cinematics: "off" });
        await window.__PANTHEON_TEST.startMode("campaign", "normal");
        window.__PANTHEON_TEST.prepareCurrentGameplayScenario();
        window.__PANTHEON_TEST.openDraft({ preserveRun: true, expanded: false, rerolls: 0, reserve: false });
      });
      await waitScreen("draft");
      await page.waitForFunction(() =>
        (window.__TEAR_ONBOARDING_TEXT__ ?? []).join(" ").includes("This choice lasts for this run only."),
      );
      assert.ok(
        await page.evaluate(() => (window.__TEAR_ONBOARDING_TEXT__ ?? []).join(" ").includes("face the chapter boss.")),
      );
      if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "campaign-first-draft.png") });
      await page.keyboard.press("1");
      await waitScreen("playing");
      await boot();
      await clickAndWait(260, 452, "shop");
      await page.waitForFunction(() =>
        (window.__TEAR_ONBOARDING_TEXT__ ?? []).join(" ").includes("Buying is optional."),
      );
      assert.ok(
        await page.evaluate(() =>
          (window.__TEAR_ONBOARDING_TEXT__ ?? [])
            .join(" ")
            .includes("Spend coins on permanent upgrades for future runs."),
        ),
      );
      if (directory) await page.screenshot({ path: path.join(path.resolve(directory), "first-purchase-shop.png") });
      await clickAndWait(800, 850, "menu");
      console.log(
        "Contextual onboarding UI fixture passed: campaign draft choice and optional shop, no purchase performed",
      );
      return;
    }

    await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 2, reserve: true }));
    await waitArmed("draft");
    const hooks = await page.evaluate(() => Object.keys(window.__PANTHEON_TEST));
    const initialDraft = await page.evaluate(() => window.__PANTHEON_TEST.state().draft || null);
    assert.ok(initialDraft && initialDraft.choiceCount >= 3, "draft hook prepares real choices");
    await page.keyboard.press("r");
    await page.waitForFunction(() => window.__PANTHEON_TEST.state().draft?.rerolls === 1, undefined, {
      timeout: STATE_WAIT_MS,
    });
    assert.equal(
      await page.evaluate(() => window.__PANTHEON_TEST.state().draft.rerolls),
      1,
      "real R input consumes one reroll",
    );
    await clickCard(1, "reserve");
    assert.ok(
      (await page.evaluate(() => window.__PANTHEON_TEST.state().draft.reserveCount)) >= 1,
      "draft selection produces reserve choices",
    );
    await waitArmed("reserve");
    await clickCard(1, "playing");
    assert.ok(
      await page.evaluate(() => window.__PANTHEON_TEST.state().draft.reservedId),
      "real reserve selection is retained",
    );

    await page.evaluate(() => window.__PANTHEON_TEST.openDraft({ expanded: true, rerolls: 1, reserve: true }));
    await waitArmed("draft");
    await clickCard(1, "reserve");
    await waitArmed("reserve");
    await clickLabel("SKIP RESERVE", "playing");

    requireHook(hooks, "openTierUp");
    await page.evaluate(() => window.__PANTHEON_TEST.openTierUp());
    await waitArmed("tierup");
    await clickCard(1, "playing");

    await boot();
    await clickAndWait(260, 452, "shop");
    await page.mouse.wheel(0, 700);
    await settleInput();
    await page.mouse.wheel(0, -300);
    await settleInput();
    await clickAndWait(800, 850, "menu");

    await clickAndWait(260, 635, "codex");
    for (const x of [612, 800, 988, 612]) {
      await page.mouse.click(x, 143);
      await settleInput();
    }
    await page.mouse.click(300, 270);
    await settleInput();
    await page.mouse.wheel(0, 500);
    await settleInput();
    await clickAndWait(800, 850, "menu");

    await clickAndWait(260, 266, "profile");
    // Every profile tab that stays on the profile page, by its drawn label (CAREER opens its own archive page).
    for (const tab of ["REPLAYS", "VAULT", "STATS", "BESTS"]) {
      const point = await labelPoint(tab);
      await page.mouse.click(point.x, point.y);
      await settleInput();
      assert.equal(
        await page.evaluate(() => window.__PANTHEON_TEST.state().game),
        "profile",
        `${tab} tab keeps the profile open`,
      );
    }
    // CAREER draws the career archive page; its BACK returns to the profile tabs.
    await clickDrawn("CAREER");
    await waitDrawn("CAREER ARCHIVE");
    assert.ok(await drawn("every run recorded on this device"), "the career archive page drew its subtitle");
    assert.ok(await drawn("Page 1 / 1"), "the career archive page drew its page counter");
    await clickTarget(page, "profile", "BACK");
    await waitDrawn("CAREER");
    await clickTarget(page, "profile", "BACK");
    await waitScreen("menu");

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
    assert.notEqual(
      await page.evaluate(() => window.__PANTHEON_TEST.state().replay.speed),
      replayBefore.speed,
      "speed action changes playback speed",
    );
    await page.mouse.click(594, 856); // restart
    await settleInput();
    await page.mouse.click(1225, 856); // info
    await settleInput();
    assert.equal(
      await page.evaluate(() => window.__PANTHEON_TEST.state().replay.infoVisible),
      true,
      "INFO action opens replay summary",
    );
    await clickAndWait(1380, 856, "menu");

    requireHook(hooks, "openRename");
    await page.evaluate(() => window.__PANTHEON_TEST.openRename());
    await waitScreen("rename");
    const nameInput = page.locator("#nameInput");
    await nameInput.fill("x");
    assert.equal(
      await page.evaluate(() => window.__PANTHEON_TEST.state().rename.valid),
      false,
      "real rename validation rejects a short name",
    );
    await nameInput.fill("Journey Tester");
    assert.equal(
      await page.evaluate(() => window.__PANTHEON_TEST.state().rename.valid),
      true,
      "real rename validation accepts a valid name",
    );
    await page.keyboard.press("Escape");
    await waitScreen("profile");
    await clickTarget(page, "profile", "BACK");
    await waitScreen("menu");

    // Shop purchase with coins, kept across a reload. The first purchase also earns the
    // "Invested" achievement by the same real click, so its toast and unlock are checked too.
    const seeded = { ...(await storageSnapshot()) };
    seeded.tear_meta = JSON.stringify({ lifetimeEarned: 1000, lifetimeSpent: 0, buy: {} });
    await reloadWith(seeded);
    await clickTarget(page, "menu", "SHOP");
    await waitScreen("shop");
    await waitDrawn("1,000");
    await clickTarget(page, "shop", "325c"); // Toughness, level 0 to 1
    await page.waitForFunction(() => window.__TEAR_CATALOG_DEBUG__.storage.snapshot().tear_meta.includes('"tough":1'));
    const bought = JSON.parse((await storageSnapshot()).tear_meta);
    assert.equal(bought.buy.tough, 1, "the click bought one level of Toughness");
    assert.equal(bought.lifetimeSpent, 325, "the purchase charged its price once");
    assert.equal(bought.rewardReceipts?.receipts?.["achievement:first_buy"], 75, "the first purchase paid Invested");
    await waitDrawn("Invested");
    assert.ok(await drawn("UNLOCKED · COMMON"), "the achievement toast drew");
    await waitDrawn("750"); // 1,000 - 325 + 75 for Invested
    assert.ok(await drawn("LV 1/8"), "the shop shows Toughness at level 1");

    // Two settings: one audio (master volume down two steps) and one input (double-tap dash on).
    await clickTarget(page, "shop", "BACK");
    await waitScreen("menu");
    await clickTarget(page, "menu", "SETTINGS");
    await waitScreen("settings");
    await clickDrawn("AUDIO");
    await waitDrawn("Master volume");
    // The first stepper is master volume (60%). Two steps down give 40%, which no other row shows.
    for (const volume of [0.5, 0.4]) {
      await clickTarget(page, "settings", "−");
      await page.waitForFunction(
        (wanted) =>
          JSON.parse(window.__TEAR_CATALOG_DEBUG__.storage.snapshot().tear_settings ?? "{}").masterVolume === wanted,
        volume,
        { timeout: STATE_WAIT_MS },
      );
    }
    await waitDrawn("40%");
    await clickDrawn("CONTROLS");
    await waitDrawn("Directional double-tap dash");
    await clickTarget(page, "settings", "OFF"); // the first toggle is double-tap dash
    await page.waitForFunction(() =>
      (window.__TEAR_CATALOG_DEBUG__.storage.snapshot().tear_settings ?? "").includes('"dashDoubleTap":true'),
    );
    const changed = JSON.parse((await storageSnapshot()).tear_settings);
    assert.equal(changed.masterVolume, 0.4, "master volume stepped from 60% to 40%");
    assert.equal(changed.dashDoubleTap, true, "double-tap dash turned on");
    await clickTarget(page, "settings", "BACK");
    await waitScreen("menu");

    // Reload: the purchase, the coins, the achievement and both settings are read back from storage.
    await reloadWith(await storageSnapshot());
    await clickTarget(page, "menu", "SHOP");
    await waitScreen("shop");
    await waitDrawn("750");
    assert.ok(await drawn("LV 1/8"), "Toughness is still owned after the reload");
    await clickTarget(page, "shop", "BACK");
    await waitScreen("menu");
    await clickTarget(page, "menu", "ACHIEVEMENTS");
    await waitScreen("achievements");
    // Invested is the one unlock, in the MASTERY category.
    const achievementCount = await page.evaluate(() => window.__TEAR_CATALOG_DEBUG__.achievementCount());
    await waitDrawn(`1 / ${String(achievementCount)}`);
    assert.ok(
      await page.evaluate(() =>
        window.__TEAR_JOURNEY_FRAME__.texts.some((entry) => /^MASTERY\s+1\/16$/u.test(entry.text)),
      ),
      "the achievements page counts Invested under MASTERY after the reload",
    );
    await clickTarget(page, "achievements", "BACK");
    await waitScreen("menu");
    await clickTarget(page, "menu", "SETTINGS");
    await waitScreen("settings");
    await clickDrawn("AUDIO");
    await waitDrawn("Master volume");
    assert.ok(await drawn("40%"), "master volume is still 40% after the reload");
    await clickDrawn("CONTROLS");
    await waitDrawn("Directional double-tap dash");
    assert.ok(
      await page.evaluate(() => window.__TEAR_UI_TARGETS__().some((target) => target.label === "ON")),
      "double-tap dash is still on after the reload",
    );
  },
)
  .then(() => console.log("browser progression journeys passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
