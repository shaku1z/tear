const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

const BOSSES = ["warden", "colossus", "aldric", "echo", "source"];

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

withJourney({ name: "boss oracle parity", port: 8237 }, async ({ page }) => {
  for (const bossId of BOSSES) {
    await page.evaluate((id) => window.__PANTHEON_TEST.startBoss(id, "normal"), bossId);
    await page.waitForFunction((id) => window.TEAR_WEAPON_DEBUG?.().enemies.some((enemy) => enemy.bossId === id),
      bossId, { timeout: 10000 });
    await page.waitForFunction((id) => {
      const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === id);
      return boss?.spawnT <= 0 && boss?.introT === 0;
    }, bossId, { timeout: 10000 });
    const before = await page.evaluate((id) => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === id), bossId);
    await page.waitForTimeout(bossId === "echo" ? 2200 : 1200);
    const after = await page.evaluate((id) => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === id), bossId);
    assert.ok(after.aliveT > before.aliveT + 0.8, `${bossId} AI must keep receiving fixed ticks after its intro`);
    assert.ok(distance(before, after) > 1, `${bossId} must leave its arrival pose after its intro`);
    if (bossId === "echo") assert.equal(after.live, true, "the Echo mirror brain must be live");
  }

  // Prove damage through the actual captured-pointer + held-blade path. This is
  // deliberately not a debug hit shortcut: it exercises the same collision gate
  // that made every boss appear invulnerable when introT was stranded above zero.
  await page.evaluate(() => window.__PANTHEON_TEST.startBoss("warden", "normal"));
  await page.waitForFunction(() => {
    const boss = window.TEAR_WEAPON_DEBUG?.().enemies.find((enemy) => enemy.bossId === "warden");
    return boss?.spawnT <= 0 && boss?.introT === 0;
  }, undefined, { timeout: 10000 });
  const fullHealth = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "warden").hp);
  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement !== null, undefined, { timeout: 5000 });
  for (let index = 0; index < 180; index += 1) {
    const angle = index * 0.48, radius = index % 2 === 0 ? 70 : 240;
    await page.mouse.move(800 + Math.cos(angle) * radius, 650 + Math.sin(angle) * radius);
    await page.waitForTimeout(10);
  }
  const damaged = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().enemies.find((enemy) => enemy.bossId === "warden"));
  assert.ok(damaged.hp < fullHealth, `captured-pointer held blade must damage the live boss (${String(damaged.hp)} < ${String(fullHealth)})`);
});
