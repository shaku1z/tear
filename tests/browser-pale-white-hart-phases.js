const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const scenario = Object.freeze({
  start: Object.freeze({ mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "white-hart" }),
});

function hart(page) {
  return page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies
    .find((enemy) => enemy.bossId === "white-hart"));
}

async function preparePhase(page, fraction, phase) {
  await page.evaluate((value) => window.__PANTHEON_TEST.setBossHealthFraction(value), fraction);
  await page.waitForFunction((expected) => window.TEAR_WEAPON_DEBUG().enemies
    .find((enemy) => enemy.bossId === "white-hart")?.phaseMarker === expected,
  phase, { timeout: 5_000 });
}

async function captureAttack(page, directory, attack, file, predicate) {
  await page.evaluate((id) => window.__PANTHEON_TEST.prepareWhiteHartAttack(id), attack);
  await page.waitForFunction(({ id, expected }) => {
    const boss = window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "white-hart");
    return boss?.atk === id && boss?.state === expected;
  }, { id: attack, expected: predicate }, { timeout: 10_000 });
  await page.evaluate(() => window.__PANTHEON_TEST.pause());
  const snapshot = await hart(page);
  await page.screenshot({ path: path.join(directory, file) });
  await page.evaluate(() => window.__PANTHEON_TEST.resume());
  return snapshot;
}

withJourney({ name: "Pale PT3-C7 White Hart phases", port: 8357 }, async ({ page, buildInfo }) => {
  await page.evaluate(({ boss, difficulty }) => window.__PANTHEON_TEST.startBoss(boss, difficulty), scenario.start);
  await page.waitForFunction(() => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === "white-hart");
    return boss?.spawnT <= 0 && boss?.introT === 0;
  }, undefined, { timeout: 10_000 });
  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints",
    "pale-traverse", "PT3-C7", "white-hart-phases");
  fs.mkdirSync(directory, { recursive: true });
  const screenshots = [];

  const antlerFile = "phase-1-antler-run-windup-1600x900.png";
  const antler = await captureAttack(page, directory, "antler-run", antlerFile, "windup");
  assert.equal(antler.phaseMarker, 1);
  assert.equal(antler.routeTelegraph.length, 2);
  screenshots.push(antlerFile);

  const volleyFile = "phase-1-aurora-volley-commit-1600x900.png";
  await page.evaluate(() => window.__PANTHEON_TEST.prepareWhiteHartAttack("aurora-volley"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().projectiles
    .filter((projectile) => projectile.kind === "aurora-shard").length === 3, undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__PANTHEON_TEST.pause());
  const shards = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().projectiles
    .filter((projectile) => projectile.kind === "aurora-shard"));
  assert.ok(shards.every((projectile) => projectile.counterplay === "deflect/return"));
  await page.screenshot({ path: path.join(directory, volleyFile) }); screenshots.push(volleyFile);
  await page.evaluate(() => window.__PANTHEON_TEST.resume());

  await preparePhase(page, 0.5, 2);
  const ghostFile = "phase-2-ghost-tracks-windup-1600x900.png";
  const ghost = await captureAttack(page, directory, "ghost-tracks", ghostFile, "windup");
  assert.equal(ghost.phaseMarker, 2);
  assert.equal(ghost.candidateRoutes.length, 3);
  assert.ok(ghost.trueRouteIndex >= 0 && ghost.trueRouteIndex < 3);
  screenshots.push(ghostFile);

  await preparePhase(page, 0.2, 3);
  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  const returnFile = "phase-3-endless-return-accessible-1600x900.png";
  await page.evaluate(() => window.__PANTHEON_TEST.prepareWhiteHartAttack("endless-return"));
  await page.waitForFunction(() => {
    const boss = window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "white-hart");
    return boss?.atk === "endless-return" && boss?.state === "commit"
      && boss?.auroraBossChargeActive === true;
  }, undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__PANTHEON_TEST.pause());
  const endless = await hart(page);
  await page.screenshot({ path: path.join(directory, returnFile) });
  await page.evaluate(() => window.__PANTHEON_TEST.resume());
  assert.equal(endless.phaseMarker, 3);
  assert.ok(endless.routeTelegraph.length >= 8);
  assert.equal(endless.auroraBossChargeActive, true);
  screenshots.push(returnFile);

  const state = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(state.highContrast, true);
  assert.equal(state.reducedMotion, true);
  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-pale-pt3-c7-white-hart-phase-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo,
    mode: "bossonly", bossId: "white-hart", stageId: "pale-traverse",
    observed: [
      { phase: 1, attack: "antler-run", state: "windup", routePoints: antler.routeTelegraph.length },
      { phase: 1, attack: "aurora-volley", state: "commit", projectileCount: shards.length,
        counterplay: "deflect/return" },
      { phase: 2, attack: "ghost-tracks", state: "windup", candidateRoutes: ghost.candidateRoutes.length,
        trueRouteIndex: ghost.trueRouteIndex },
      { phase: 3, attack: "endless-return", state: "commit", routePoints: endless.routeTelegraph.length,
        interruptible: true },
    ],
    screenshots,
    accessibilityProfile: { highContrast: true, reducedMotion: true, lowGraphics: true,
      flashScale: 0, audioEnabled: false },
  }, null, 2)}\n`);
  console.log(`Pale PT3-C7 White Hart phases passed at ${buildInfo.sha}`);
}).catch((error) => { console.error(error); process.exit(1); });
