const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

function bossSnapshot(page) {
  return page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies
    .find((enemy) => enemy.bossId === "white-hart"));
}

withJourney({ name: "Pale PT3-C6 White Hart foundation", port: 8356 }, async ({ page, buildInfo }) => {
  await page.evaluate(() => window.__PANTHEON_TEST.startBoss("white-hart", "normal"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .some((enemy) => enemy.bossId === "white-hart"), undefined, { timeout: 10_000 });
  await page.waitForFunction(() => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === "white-hart");
    return boss?.spawnT <= 0 && boss?.introT === 0 && boss?.state === "idle";
  }, undefined, { timeout: 10_000 });

  const stage = await page.evaluate(() => window.__PANTHEON_TEST.bossStage("white-hart"));
  assert.deepEqual(stage, {
    currentId: "pale-traverse", currentIndex: 4,
    authoredId: "pale-traverse", authoredIndex: 4,
  });
  const initial = await bossSnapshot(page);
  assert.equal(initial.kind, "white-hart");
  assert.equal(initial.phase, 1);
  assert.equal(initial.atk, "unavailable");

  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints",
    "pale-traverse", "PT3-C6", "white-hart-foundation");
  fs.mkdirSync(directory, { recursive: true });
  const phaseOneFile = "phase-1-intro-released-1600x900.png";
  await page.screenshot({ path: path.join(directory, phaseOneFile) });

  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.5));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .find((enemy) => enemy.bossId === "white-hart")?.phase === 2, undefined, { timeout: 5_000 });
  const phaseTwo = await bossSnapshot(page);
  assert.equal(phaseTwo.phaseMarker, 2);
  assert.equal(phaseTwo.atk, "unavailable");
  const phaseTwoFile = "phase-2-foundation-1600x900.png";
  await page.screenshot({ path: path.join(directory, phaseTwoFile) });

  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  await page.evaluate(() => window.__PANTHEON_TEST.setBossHealthFraction(0.2));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .find((enemy) => enemy.bossId === "white-hart")?.phase === 3, undefined, { timeout: 5_000 });
  const phaseThree = await bossSnapshot(page);
  assert.equal(phaseThree.phaseMarker, 3);
  assert.equal(phaseThree.atk, "unavailable");
  const phaseThreeFile = "phase-3-accessible-foundation-1600x900.png";
  await page.screenshot({ path: path.join(directory, phaseThreeFile) });

  // Exercise the real Boss Test result and retry path with the same constructor.
  await page.evaluate(() => window.__PANTHEON_TEST.defeatPlayer());
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "gameover", undefined, { timeout: 10_000 });
  await page.mouse.click(220, 347);
  await page.waitForFunction(() => window.__PANTHEON_TEST.state().game === "playing", undefined, { timeout: 10_000 });
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG?.().enemies
    .some((enemy) => enemy.bossId === "white-hart"), undefined, { timeout: 10_000 });
  const retriedStage = await page.evaluate(() => window.__PANTHEON_TEST.bossStage("white-hart"));
  assert.equal(retriedStage.currentId, "pale-traverse");

  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-pale-pt3-c6-white-hart-foundation-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    mode: "bossonly", bossId: "white-hart", stageId: "pale-traverse",
    factoryKind: initial.kind, observedPhases: [1, 2, 3], attacksAvailable: false,
    resultPath: "defeat", retryRestoredBoss: true,
    screenshots: [phaseOneFile, phaseTwoFile, phaseThreeFile],
    accessibilityProfile: { highContrast: true, reducedMotion: true, lowGraphics: true, flashScale: 0, audioEnabled: false },
  }, null, 2)}\n`);
  console.log(`Pale PT3-C6 White Hart foundation passed at ${buildInfo.sha}`);
}).catch((error) => { console.error(error); process.exit(1); });
