const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const variants = [
  ["charger", "rime-runner", "Rime Runner", "windup"],
  ["ranged", "prism-seer", "Prism Seer", "windup"],
  ["flyer", "snowfall-kite", "Snowfall Kite", "warn"],
  ["bomber", "hailcaster", "Hailcaster", null],
  ["armored", "glacier-guard", "Glacier Guard", null],
];

withJourney({ name: "Pale PT3-C4 variants", port: 8354 }, async ({ page, waitScreen, buildInfo }) => {
  await page.evaluate(() => window.__PANTHEON_TEST.startMode("playground"));
  await waitScreen("playing");
  const directory = path.resolve(__dirname, "..", "artifacts", "tearbench", "checkpoints",
    "pale-traverse", "PT3-C4", "variants");
  fs.mkdirSync(directory, { recursive: true });
  const screenshots = [];
  const observed = [];

  for (const [kind, variantId, variantName, readableState] of variants) {
    await page.evaluate(([family, id]) => window.__PANTHEON_TEST.preparePaleVariantEvidenceScenario(family, id),
      [kind, variantId]);
    await page.waitForFunction(([family, id, expected]) => window.TEAR_WEAPON_DEBUG().enemies
      .some((enemy) => enemy.kind === family && enemy.variant === id && enemy.spawnT <= 0
        && (expected == null || enemy.atk === expected || enemy.state === expected)),
    [kind, variantId, readableState], { timeout: 10_000 });
    const actor = await page.evaluate(([family, id]) => window.TEAR_WEAPON_DEBUG().enemies
      .find((enemy) => enemy.kind === family && enemy.variant === id), [kind, variantId]);
    assert.equal(actor.variantName, variantName);
    assert.equal(actor.kind, kind);
    assert.ok(typeof actor.behavior === "string" && actor.behavior.length > 0);
    observed.push({ kind, variantId, variantName, behavior: actor.behavior });
    const file = `${variantId}-1600x900.png`;
    await page.screenshot({ path: path.join(directory, file) });
    screenshots.push(file);

    if (variantId === "rime-runner") {
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
        .some((enemy) => enemy.variant === "rime-runner" && enemy.rimeRebounds === 1 && enemy.atk === "commit"),
      undefined, { timeout: 10_000 });
      const reboundFile = "rime-runner-rebound-1600x900.png";
      await page.screenshot({ path: path.join(directory, reboundFile) }); screenshots.push(reboundFile);
      observed.push({ variantId, mechanic: "single-wall-rebound", liveState: "commit", rimeRebounds: 1 });
    } else if (variantId === "prism-seer") {
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().projectiles
        .filter((projectile) => projectile.kind === "prism-shard").length === 2, undefined, { timeout: 10_000 });
      const shards = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().projectiles
        .filter((projectile) => projectile.kind === "prism-shard"));
      assert.ok(shards.every((projectile) => projectile.counterplay === "deflect/recombine"));
      const shardFile = "prism-seer-shard-pair-1600x900.png";
      await page.screenshot({ path: path.join(directory, shardFile) }); screenshots.push(shardFile);
      observed.push({ variantId, mechanic: "independent-prism-shard-pair", projectileCount: shards.length,
        counterplay: shards[0].counterplay });
      await page.evaluate(() => window.__PANTHEON_TEST
        .triggerPaleVariantCounterplay("prism-seer", "perfect-parry"));
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().projectiles
        .some((projectile) => projectile.kind === "prism-return" && projectile.perfect === true
          && projectile.counterplay === "recombined return"), undefined, { timeout: 10_000 });
      const returnFile = "prism-seer-perfect-recombined-return-1600x900.png";
      await page.screenshot({ path: path.join(directory, returnFile) }); screenshots.push(returnFile);
      observed.push({ variantId, mechanic: "perfect-parry-recombined-return", projectileCount: 1,
        counterplay: "recombined return" });
    } else if (variantId === "snowfall-kite") {
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
        .some((enemy) => enemy.variant === "snowfall-kite" && enemy.state === "recover" && enemy.snowWakeT > 0),
      undefined, { timeout: 10_000 });
      const wakeFile = "snowfall-kite-recovery-wake-1600x900.png";
      await page.screenshot({ path: path.join(directory, wakeFile) }); screenshots.push(wakeFile);
      observed.push({ variantId, mechanic: "grounded-launchable-recovery-wake", liveState: "recover" });
    } else if (variantId === "hailcaster") {
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().projectiles
        .some((projectile) => projectile.kind === "hail-orb"), undefined, { timeout: 10_000 });
      const orb = await page.evaluate(() => window.TEAR_WEAPON_DEBUG().projectiles
        .find((projectile) => projectile.kind === "hail-orb"));
      assert.equal(orb.counterplay, "deflect/detonate or ground shatter");
      const orbFile = "hailcaster-hail-orb-1600x900.png";
      await page.screenshot({ path: path.join(directory, orbFile) }); screenshots.push(orbFile);
      await page.evaluate(() => window.__PANTHEON_TEST.positionDebugPlayer(1_450));
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().projectiles
        .filter((projectile) => projectile.kind === "hail-shard").length === 6, undefined, { timeout: 10_000 });
      const shatterFile = "hailcaster-ground-shatter-1600x900.png";
      await page.screenshot({ path: path.join(directory, shatterFile) }); screenshots.push(shatterFile);
      observed.push({ variantId, mechanic: "hail-orb-ground-shatter", projectileCount: 6,
        counterplay: orb.counterplay });
    } else if (variantId === "glacier-guard") {
      observed.push({ variantId, mechanic: "grounded-glacier-shell", glacierCracked: actor.glacierCracked,
        enraged: actor.enraged });
      await page.evaluate(() => window.__PANTHEON_TEST.triggerPaleVariantCounterplay("glacier-guard", "launch"));
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
        .some((enemy) => enemy.variant === "glacier-guard" && enemy.glacierCracked === true
          && enemy.enraged === false), undefined, { timeout: 10_000 });
      const crackedFile = "glacier-guard-launched-crack-1600x900.png";
      await page.screenshot({ path: path.join(directory, crackedFile) }); screenshots.push(crackedFile);
      observed.push({ variantId, mechanic: "launch-cracks-shell", glacierCracked: true, enraged: false });
      await page.evaluate(() => window.__PANTHEON_TEST.triggerPaleVariantCounterplay("glacier-guard", "break"));
      await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
        .some((enemy) => enemy.variant === "glacier-guard" && enemy.glacierCracked === true
          && enemy.enraged === true), undefined, { timeout: 10_000 });
      const brokenFile = "glacier-guard-broken-enraged-1600x900.png";
      await page.screenshot({ path: path.join(directory, brokenFile) }); screenshots.push(brokenFile);
      observed.push({ variantId, mechanic: "power-break-removes-shell", glacierCracked: true, enraged: true });
    }
  }

  await page.evaluate(() => window.__PANTHEON_TEST.setOptions({
    flash: 0, reducedMotion: true, highContrast: true, gfx: "low", masterMuted: true,
  }));
  await page.evaluate(() => window.__PANTHEON_TEST.preparePaleVariantEvidenceScenario("flyer", "snowfall-kite"));
  await page.waitForFunction(() => window.TEAR_WEAPON_DEBUG().enemies
    .some((enemy) => enemy.variant === "snowfall-kite" && enemy.state === "warn"), undefined, { timeout: 10_000 });
  const accessibleFile = "snowfall-kite-accessible-1600x900.png";
  await page.screenshot({ path: path.join(directory, accessibleFile) });
  screenshots.push(accessibleFile);
  const accessibility = await page.evaluate(() => window.__PANTHEON_TEST.state());
  assert.equal(accessibility.highContrast, true);
  assert.equal(accessibility.reducedMotion, true);

  fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify({
    format: "tear-pale-pt3-c4-variant-browser-evidence", schemaVersion: 1,
    engineeringOnly: true, certifying: false, build: buildInfo, mode: "playground",
    selectionPath: "canonical-explicit-variant-spawn", observed, screenshots,
    accessibilityProfile: { highContrast: true, reducedMotion: true, lowGraphics: true, flashScale: 0, audioEnabled: false },
  }, null, 2)}\n`);
  console.log(`Pale PT3-C4 variants passed at ${buildInfo.sha}`);
}).catch((error) => { console.error(error); process.exit(1); });
