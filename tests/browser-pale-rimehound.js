const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "Pale PT3-C3 Rimehound", port: 8353 }, async ({ page, waitScreen, buildInfo }) => {
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await waitScreen("playing");
  await page.evaluate(() => window.__PANTHEON_TEST.prepareRimehoundScenario());
  await page.waitForFunction(() => {
    const hounds = window.TEAR_WEAPON_DEBUG?.().enemies.filter((enemy) => enemy.kind === "rimehound") ?? [];
    return hounds.length === 2 && hounds.filter((enemy) => enemy.packAttackAuthorized).length === 1
      && hounds.some((enemy) => enemy.atk === "windup");
  }, undefined, { timeout: 10_000 });

  const windup = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies
    .filter((enemy) => enemy.kind === "rimehound"));
  assert.deepEqual(windup.map((enemy) => enemy.packRole), ["line", "flank"]);
  assert.equal(windup.filter((enemy) => enemy.packAttackAuthorized).length, 1);
  assert.ok(windup.some((enemy) => enemy.pounceTargetX > enemy.x), "windup must expose its committed route");
  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints",
    "pale-traverse", "PT3-C3", "rimehound");
  fs.mkdirSync(directory, { recursive: true });
  const normalFile = "normal-windup-1600x900.png";
  await page.screenshot({ path: path.join(directory, normalFile) });

  // Each phase is a short live state. Recompose between screenshots so a slow
  // capture cannot advance beyond the next state before its assertion begins.
  await page.evaluate(() => window.__PANTHEON_TEST.prepareRimehoundScenario());
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .some((enemy) => enemy.kind === "rimehound" && enemy.atk === "pounce"), undefined, { timeout: 10_000 });
  const pounceFile = "committed-pounce-1600x900.png";
  await page.screenshot({ path: path.join(directory, pounceFile) });
  await page.evaluate(() => window.__PANTHEON_TEST.prepareRimehoundScenario());
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .some((enemy) => enemy.kind === "rimehound" && enemy.atk === "skid"), undefined, { timeout: 10_000 });

  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  await page.evaluate(() => window.__PANTHEON_TEST.prepareRimehoundScenario());
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .some((enemy) => enemy.kind === "rimehound" && enemy.atk === "windup"), undefined, { timeout: 10_000 });
  const accessibilityFile = "accessible-windup-1600x900.png";
  await page.screenshot({ path: path.join(directory, accessibilityFile) });
  const accessibility = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(accessibility.highContrast, true);
  assert.equal(accessibility.reducedMotion, true);
  assert.equal(accessibility.lowEffects, true);

  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-pale-pt3-c3-rimehound-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    mode: "playground", enemyId: "rimehound",
    observedStates: ["flank", "windup", "pounce", "skid"],
    packRoles: ["line", "flank"], sharedAttackLock: true,
    screenshots: [normalFile, pounceFile, accessibilityFile],
    accessibilityProfile: { highContrast: true, reducedMotion: true, lowGraphics: true, flashScale: 0, audioEnabled: false },
  }, null, 2)}\n`);
  console.log(`Pale PT3-C3 Rimehound passed at ${buildInfo.sha}`);
}).catch((error) => { console.error(error); process.exit(1); });
