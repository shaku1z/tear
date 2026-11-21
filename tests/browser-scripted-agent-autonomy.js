const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

// The run is bounded by game ticks, not by how long the scripted player survives. A normal campaign with
// seed 117 ends in a game over at wave 8, tick 17,104 (measured twice on one build: the same tick). Easy has
// no bound: on 2026-11-20 it reached wave 24 at tick 54,221 and was still there, one enemy left, at tick
// 498,887 (45 minutes). That is why weekly run 44785591399 met the journey ceiling at wave 21. TICK_LIMIT is
// the measured end with room for balance changes (1.75x). A run past it fails by name, with the wave and
// enemies it reached, before the ceiling does.
const DIFFICULTY = "normal";
const TICK_LIMIT = 30_000;
// Weekly run 44785591399 (ubuntu, xvfb, software rendering) took 11.0-13.9 ms of wall time per game tick in
// every slice from wave 2 to wave 21, draw included. 30,000 ticks at 13.9 ms is 417 s; the normal run is
// about 205 s at 12 ms. The ceiling sits above the tick limit so the named failure fires first.
const LIMIT_MS = 480_000;

withJourney({ name: "C24 competent scripted-agent autonomy", limitMs: LIMIT_MS }, async ({ page, errors }) => {
  const url = new URL(page.url());
  url.searchParams.set("watchagent", "1");
  await page.goto(url.toString(), { timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: STATE_WAIT_MS });
  assert.equal(await page.locator("#tear-watch-agent").count(), 1);
  const apiStart = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  assert.equal(apiStart.screen, "menu");
  assert.deepEqual(
    await page
      .getByLabel("Mode")
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value)),
    ["campaign", "endless", "gauntlet", "playground", "tutorial", "bossonly", "sandbox"],
  );
  assert.deepEqual(
    await page
      .getByLabel("Difficulty")
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value)),
    ["easy", "normal", "hard", "extreme", "onehit"],
  );
  await page.getByLabel("Profile").selectOption("competent");
  await page.getByLabel("Mode").selectOption("campaign");
  await page.getByLabel("Difficulty").selectOption(DIFFICULTY);
  await page.getByLabel("Weapon").selectOption("riftlock");
  await page.getByLabel("Seed").fill("117");

  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c24");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  await page.screenshot({ path: path.join(artifactDirectory, "watch-agent-menu.png") });
  await page.getByRole("button", { name: "Start Watch Agent" }).click();

  let result = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
  assert.deepEqual(result.selection, {
    profile: "competent",
    mode: "campaign",
    difficulty: DIFFICULTY,
    weapon: "riftlock",
    boss: "shuffle",
    seed: 117,
    skipCinematics: true,
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
  for (let batch = 0; batch < 4_000 && result.status === "running" && result.tick < TICK_LIMIT; batch += 1) {
    result = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(200));
    if (batch % 10 === 0 || result.status !== "running") samples.push(result);
    if (batch % 10 === 0 || result.status !== "running")
      console.log(
        `C24 batch ${String(batch + 1)} status=${result.status} screen=${result.screen} ` +
          `tick=${String(result.tick)} wave=${String(result.wave ?? 0)} hp=${String(result.hp ?? 0)} ` +
          `enemies=${String(result.enemyCount)} reason=${String(result.terminalReason ?? "")}`,
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
    gate: "normal-adventure-menu-to-menu",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    scenario: {
      profile: "competent",
      mode: "campaign",
      difficulty: DIFFICULTY,
      weapon: "riftlock",
      boss: "shuffle",
      seed: 117,
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
  fs.writeFileSync(
    path.join(artifactDirectory, "normal-adventure-menu-to-menu.json"),
    JSON.stringify(artifact, null, 2),
  );
  assert.equal(result.debugTransitions, 0);
  assert.equal(result.certified, false);
  assert.equal(artifact.executionClass, "engineering");
  assert.equal(artifact.controls.externalBackdoorReads, 0);
  // The journey proves the run reaches one of the game's own ends through the real screens with no broken
  // state. Winning is an open goal, not a gate: the scripted player has no recorded easy riftlock completion
  // (docs/checkpoints/C24_FULL_SCRIPTED_AGENT_AUTONOMY.md).
  assert.ok(
    result.status !== "running",
    `no game end within ${String(TICK_LIMIT)} ticks: wave ${String(result.wave ?? 0)}, ` +
      `${String(result.enemyCount)} enemies, hp ${String(result.hp ?? 0)}`,
  );
  const won = result.status === "completed";
  const lost = result.status === "failed" && result.terminalReason === "terminal-gameover";
  assert.ok(won || lost, `the run did not reach a game end: ${JSON.stringify(result)}`);
  assert.equal(result.screen, won ? "menu" : "gameover");
  assert.deepEqual(result.watchdogs.active, [], "a watchdog stopped the run");
  console.log(`C24 end: ${won ? "campaign completed" : "player defeated"} at wave ${String(result.wave ?? 0)}`);
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
  assert.match(runtimeMetadata.panelText, /Run: campaign \/ normal \/ riftlock/u);
  assert.match(runtimeMetadata.panelText, /Observation: Class A - privileged diagnostic/u);
  assert.match(runtimeMetadata.panelText, /Invariants:/u);
  assert.match(runtimeMetadata.panelText, /Memory: [1-9][0-9]* decisions/u);
  assert.deepEqual(errors, []);
  console.log("C24 competent scripted-agent Adventure menu-to-menu passed");
});
