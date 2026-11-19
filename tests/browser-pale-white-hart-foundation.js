const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

function bossSnapshot(page) {
  return page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "white-hart"));
}

withJourney(
  { name: "Pale PT3-C7 White Hart foundation regression", recordFrames: true },
  async ({ page, buildInfo, waitArmed, clickLabel }) => {
    await page.evaluate(() => window.__PANTHEON_TEST.startBoss("white-hart", "normal"));
    await page.waitForFunction(
      () => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === "white-hart"),
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    await page.waitForFunction(
      () => {
        const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === "white-hart");
        return boss?.spawnT <= 0 && boss?.introT === 0 && boss?.state === "idle";
      },
      undefined,
      { timeout: STATE_WAIT_MS },
    );

    const stage = await page.evaluate(() => window.__PANTHEON_TEST.bossStage("white-hart"));
    assert.deepEqual(stage, {
      currentId: "pale-traverse",
      currentIndex: 6,
      authoredId: "pale-traverse",
      authoredIndex: 6,
    });
    const initial = await bossSnapshot(page);
    assert.equal(initial.kind, "white-hart");
    assert.equal(initial.phase, 1);
    assert.notEqual(initial.atk, "unavailable");

    const directory = path.resolve(
      __dirname,
      "..",
      "artifacts",
      "tearbench",
      "checkpoints",
      "pale-traverse",
      "PT3-C7",
      "white-hart-foundation-regression",
    );
    fs.mkdirSync(directory, { recursive: true });
    const phaseOneFile = "phase-1-intro-released-1600x900.png";
    await page.screenshot({ path: path.join(directory, phaseOneFile) });

    await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
    await page.waitForFunction(
      () => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "white-hart")?.phaseMarker === 2,
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const phaseTwo = await bossSnapshot(page);
    assert.equal(phaseTwo.phaseMarker, 2);
    assert.notEqual(phaseTwo.atk, "unavailable");
    const phaseTwoFile = "phase-2-foundation-1600x900.png";
    await page.screenshot({ path: path.join(directory, phaseTwoFile) });

    await page.evaluate(() =>
      window.__PANTHEON_TEST.setOptions({
        flash: 0,
        reducedMotion: true,
        highContrast: true,
        gfx: "low",
        masterMuted: true,
      }),
    );
    await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.2));
    await page.waitForFunction(
      () => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "white-hart")?.phaseMarker === 3,
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const phaseThree = await bossSnapshot(page);
    assert.equal(phaseThree.phaseMarker, 3);
    assert.notEqual(phaseThree.atk, "unavailable");
    const phaseThreeFile = "phase-3-accessible-foundation-1600x900.png";
    await page.screenshot({ path: path.join(directory, phaseThreeFile) });

    // Exercise the real Boss Test result and retry path with the same constructor.
    await page.evaluate(() => window.__PANTHEON_TEST.defeatPlayer());
    // The result screen eases in and ignores input while it settles: press the drawn RETRY once
    // it has come to rest, again while the screen has not changed.
    await waitArmed("gameover");
    await clickLabel("RETRY", "playing");
    await page.waitForFunction(
      () => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === "white-hart"),
      undefined,
      { timeout: STATE_WAIT_MS },
    );
    const retriedStage = await page.evaluate(() => window.__PANTHEON_TEST.bossStage("white-hart"));
    assert.equal(retriedStage.currentId, "pale-traverse");

    fs.writeFileSync(
      path.join(directory, "evidence.json"),
      `${JSON.stringify(
        {
          format: "tear-pale-pt3-c6-white-hart-foundation-browser-evidence",
          schemaVersion: 1,
          engineeringOnly: true,
          certifying: false,
          build: buildInfo,
          mode: "bossonly",
          bossId: "white-hart",
          stageId: "pale-traverse",
          factoryKind: initial.kind,
          observedPhases: [1, 2, 3],
          attacksAvailable: true,
          resultPath: "defeat",
          retryRestoredBoss: true,
          screenshots: [phaseOneFile, phaseTwoFile, phaseThreeFile],
          accessibilityProfile: {
            highContrast: true,
            reducedMotion: true,
            lowGraphics: true,
            flashScale: 0,
            audioEnabled: false,
          },
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Pale PT3-C7 White Hart foundation regression passed at ${buildInfo.sha}`);
  },
).catch((error) => {
  console.error(error);
  process.exit(1);
});
