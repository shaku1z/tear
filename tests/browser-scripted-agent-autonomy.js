/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C24 competent scripted-agent autonomy", port: 8153 }, async ({ page, errors }) => {
  const url = new URL(page.url());
  url.searchParams.set("watchagent", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  assert.equal(await page.locator("#tear-watch-agent").count(), 1);
  const apiStart = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  assert.equal(apiStart.screen, "menu");
  assert.deepEqual(await page.getByLabel("Mode").locator("option").evaluateAll(
    (options) => options.map((option) => option.value),
  ), ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"]);
  assert.deepEqual(await page.getByLabel("Difficulty").locator("option").evaluateAll(
    (options) => options.map((option) => option.value),
  ), ["easy", "normal", "hard", "extreme", "onehit"]);
  await page.getByLabel("Profile").selectOption("competent");
  await page.getByLabel("Mode").selectOption("campaign");
  await page.getByLabel("Difficulty").selectOption("easy");
  await page.getByLabel("Weapon").selectOption("riftlock");
  await page.getByLabel("Seed").fill("117");

  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c24");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({ path: path.join(artifactDirectory, "watch-agent-menu.png") });
  await page.getByRole("button", { name: "Start Watch Agent" }).click();

  let result = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  assert.deepEqual(result.selection, {
    profile: "competent", mode: "campaign", difficulty: "easy",
    weapon: "riftlock", boss: "shuffle", seed: 117, skipCinematics: true,
  });
  assert.equal(result.executionClass, "engineering");
  assert.equal(result.observationLabel, "Class A - privileged diagnostic");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  assert.equal((await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot())).status, "paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  result = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  assert.equal(result.status, "running");
  console.log("C24 start", JSON.stringify(result));
  const samples = [result];
  for (let batch = 0; batch < 4_000 && result.status === "running"; batch += 1) {
    result = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(200));
    if (batch % 10 === 0 || result.status !== "running") samples.push(result);
    if (batch % 10 === 0 || result.status !== "running") console.log(
      `C24 batch ${String(batch + 1)} status=${result.status} screen=${result.screen} `
      + `tick=${String(result.tick)} wave=${String(result.wave ?? 0)} hp=${String(result.hp ?? 0)} `
      + `enemies=${String(result.enemyCount)} reason=${String(result.terminalReason ?? "")}`,
    );
    if (result.status !== "running") console.log("C24 diagnostic snapshot", JSON.stringify(result));
  }
  // Refresh the visible panel through its own control after direct batched API
  // execution so the screenshot and accessibility text reflect the terminal snapshot.
  await page.getByRole("button", { name: "Run 2,000 ticks" }).click();

  const runtimeMetadata = await page.evaluate(() => ({
    build: window.__TEAR_BUILD__,
    location: window.location.pathname,
    panelText: document.querySelector("#tear-watch-agent pre")?.textContent ?? "",
  }));
  const artifact = {
    schemaVersion: 1,
    checkpoint: "C24",
    gate: "easy-adventure-menu-to-menu",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    scenario: {
      profile: "competent", mode: "campaign", difficulty: "easy",
      weapon: "riftlock", boss: "shuffle", seed: 117,
    },
    controls: {
      startSurface: "visible Watch Agent panel",
      menuNavigation: "typed production ScreenAction controls",
      gameplayInput: "semantic GameAction at authoritative fixed ticks",
      privilegedHostObservation: true,
      externalBackdoorReads: 0,
      cinematicControl: "engineering skip bridge (not physical-input evidence)",
      debugTransitions: result.debugTransitions,
    },
    intentEvidence: {
      structured: result.structuredIntent,
      legacyTrace: result.lastTrace,
    },
    result,
    samples,
    runtimeMetadata,
    browserErrors: errors,
  };
  await page.screenshot({ path: path.join(artifactDirectory, "watch-agent-result.png") });
  fs.writeFileSync(path.join(artifactDirectory, "easy-adventure-menu-to-menu.json"),
    JSON.stringify(artifact, null, 2));
  assert.equal(result.debugTransitions, 0);
  assert.equal(result.certified, false);
  assert.equal(artifact.executionClass, "engineering");
  assert.equal(artifact.controls.externalBackdoorReads, 0);
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.screen, "menu");
  assert.ok(result.transitions.some((entry) => entry.screen === "setup"));
  assert.ok(result.transitions.some((entry) => entry.screen === "playing"));
  assert.ok(result.transitions.some((entry) => entry.screen === "draft"));
  assert.ok(result.mechanics.includes("slash"));
  assert.ok(result.lastTrace?.objective);
  assert.ok(result.lastTrace?.maneuver);
  assert.equal(typeof result.lastTrace?.confidence, "number");
  assert.equal(typeof result.lastTrace?.recovery, "boolean");
  assert.ok(Array.isArray(result.lastTrace?.critic));
  assert.ok(result.structuredIntent, "live Watch Agent must expose the full hierarchical intent");
  assert.equal(result.structuredIntent.profile, "competent");
  assert.equal(result.structuredIntent.observationClass, "privileged-diagnostic");
  assert.ok(result.structuredIntent.memory.decisions > 0);
  assert.ok(Array.isArray(result.structuredIntent.critic));
  assert.ok(Array.isArray(result.structuredIntent.invariantViolations));
  assert.ok(Array.isArray(result.structuredIntent.watchdog));
  assert.deepEqual(artifact.intentEvidence.structured, result.structuredIntent);
  assert.ok(Array.isArray(result.watchdogs.active));
  assert.match(runtimeMetadata.panelText, /Policy: competent/u);
  assert.match(runtimeMetadata.panelText, /Run: campaign \/ easy \/ riftlock/u);
  assert.match(runtimeMetadata.panelText, /Observation: Class A - privileged diagnostic/u);
  assert.match(runtimeMetadata.panelText, /Invariants:/u);
  assert.match(runtimeMetadata.panelText, /Memory: [1-9][0-9]* decisions/u);
  assert.deepEqual(errors, []);
  console.log("C24 competent scripted-agent Adventure menu-to-menu passed");
});
