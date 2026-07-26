/* eslint-disable @typescript-eslint/no-require-imports -- Browser evidence scripts run directly under Node CommonJS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const weapons = ["sword", "hammer", "spear", "chainblade", "ringblade"];
const difficulties = ["easy", "normal", "hard", "extreme", "onehit"];
const collectiveRequiredCoreMechanics = [
  "heldSlash", "launch", "juggle", "slam", "updraft",
  "throw", "recall", "tether", "projectileParry", "stolenBladeRecovery",
];
const collectiveNonStolenMechanics = collectiveRequiredCoreMechanics.filter(
  (mechanic) => mechanic !== "stolenBladeRecovery",
);
const weaponIdentityRequirements = Object.freeze({
  sword: ["heldSlash"],
  hammer: ["heldSlash"],
  spear: ["heldSlash"],
  chainblade: ["heldSlash"],
  ringblade: ["throw", "recall"],
});
const modeContracts = [
  { id: "tutorial", mode: "tutorial", difficulties: null },
  { id: "adventure", mode: "campaign", difficulties },
  { id: "endless", mode: "endless", difficulties },
  { id: "gauntlet", mode: "gauntlet", difficulties },
  { id: "playground", mode: "playground", difficulties },
  { id: "boss-test", mode: "bossonly", difficulties },
  { id: "enemy-test", mode: "sandbox", difficulties },
];

function mechanics(snapshot) {
  const stats = snapshot.weaponStats ?? {};
  const heldEvents = snapshot.weaponEvents.filter((event) =>
    event && typeof event === "object" && event.type === "heldHit");
  const effects = new Set(snapshot.engineEvents
    .filter((event) => event.kind === "effect")
    .map((event) => event.effect));
  const states = new Set(snapshot.bladeStates);
  const control = snapshot.bladeStateTransitions;
  const observed = (condition, evidence) => ({
    status: condition ? "observed" : "not-observed",
    evidence: condition ? evidence : "No corresponding live signal occurred in this bounded run.",
  });
  const recalled = stats.throws > 0 && [...states].some((state) =>
    ["returning", "reeling", "yanking", "held"].includes(state));
  const tethered = snapshot.bladeTether.contracted
    || control.some((entry) => entry.state === "latched");
  const stolenAt = control.findIndex((entry) => entry.hostile && entry.stolen);
  const recoveredAt = control.findIndex((entry, index) =>
    index > stolenAt && !entry.hostile && !entry.stolen && entry.state === "held");
  const stolenRecovered = stolenAt >= 0 && recoveredAt > stolenAt;
  return {
    heldSlash: observed(stats.heldHits > 0, `${String(stats.heldHits)} live held hits`),
    launch: observed(
      heldEvents.some((event) => event.strikeType === "launch") || effects.has("launch"),
      "production weapon log recorded strikeType=launch",
    ),
    juggle: observed(
      heldEvents.some((event) => event.airborne === true),
      "production weapon log recorded a held hit on an already-airborne target",
    ),
    slam: observed(effects.has("slam") || effects.has("superslam"), "live Ghost engine slam effect"),
    updraft: observed(effects.has("updraft"), "live Ghost engine effect: updraft"),
    throw: observed(stats.throws > 0, `${String(stats.throws)} production throw launches`),
    recall: observed(recalled, `observed blade states: ${[...states].join(", ")}`),
    tether: observed(
      tethered,
      `live tether factor ${snapshot.bladeTether.minimum.toFixed(3)}..${snapshot.bladeTether.maximum.toFixed(3)}`,
    ),
    stolenBladeRecovery: observed(stolenRecovered, "ordered blade control timeline proved stolen/hostile then held recovery"),
    tetherOrStolenRecovery: observed(
      tethered || stolenRecovered,
      `ordered blade control timeline: ${control.map((entry) =>
        `${entry.state}/${entry.hostile ? "hostile" : "owned"}`).join(", ")}`,
    ),
    projectileParry: observed(
      stats.perfectParries > 0 || effects.has("parry") || effects.has("deflect"),
      `${String(stats.perfectParries ?? 0)} perfect parries; effects ${[...effects].join(", ")}`,
    ),
  };
}

async function runTargetedScenario(page, scenario) {
  const url = new URL(page.url());
  url.searchParams.set("watchagent", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
  await page.mouse.click(10, 10);
  let snapshot = await page.evaluate((options) => window.__TEAR_WATCH_AGENT__.start(options), {
    profile: scenario.profile, mode: scenario.mode, difficulty: "easy",
    weapon: scenario.weapon, boss: scenario.boss ?? "shuffle", seed: scenario.seed,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const targetScreen = scenario.mode === "playground" ? "pgmenu" : "playing";
  for (let step = 0; step < 12 && snapshot.screen !== targetScreen; step += 1) {
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(1));
  }
  if (scenario.mode === "playground" && snapshot.screen === "playing") {
    await page.keyboard.press("Tab");
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(1));
  }
  assert.equal(snapshot.screen, targetScreen, `${scenario.id} must reach its real simulation flow`);
  for (const action of scenario.actions) {
    if (action === "boss:source") {
      // Source is the fifth visible boss card in the production two-column
      // Playground board. Exercise its real pointer hitbox as a player would.
      await page.mouse.click(900, 330);
      snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
    } else {
      snapshot = await page.evaluate((id) =>
        window.__TEAR_WATCH_AGENT__.activatePlaygroundAction(id), action);
    }
  }
  if (scenario.mode === "playground") {
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.resumePlayground());
    assert.equal(snapshot.screen, "playing");
  }
  for (let batch = 0; batch < scenario.batches && snapshot.status === "running"; batch += 1) {
    if (scenario.manualBladeClicks === true) {
      await page.mouse.click(1_200, 430, { button: "right" });
    }
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(200));
  }
  return {
    id: scenario.id,
    flow: scenario.mode === "playground"
      ? "main menu -> setup -> Playground menu controls -> RESUME -> real simulation"
      : "main menu -> setup -> typed boss selection -> real Boss Test simulation",
    requestedActions: scenario.actions,
    profile: scenario.profile,
    weapon: scenario.weapon,
    boss: scenario.boss ?? "shuffle",
    status: snapshot.status,
    terminalReason: snapshot.terminalReason ?? null,
    fixedTicks: snapshot.fixedTicks,
    weaponStats: snapshot.weaponStats,
    bladeStateTransitions: snapshot.bladeStateTransitions,
    weaponEvents: snapshot.weaponEvents,
    engineEvents: snapshot.engineEvents,
    mechanics: mechanics(snapshot),
    debugTransitions: snapshot.debugTransitions,
  };
}

withJourney({ name: "C24 weapon and contract truth matrix", port: 8154 }, async ({ page, errors }) => {
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c24");
  const contractDirectory = path.join(artifactDirectory, "mode-contracts");
  fs.mkdirSync(contractDirectory, { recursive: true });
  const results = [];
  for (const weapon of weapons) {
    const url = new URL(page.url());
    url.searchParams.set("watchagent", "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
    await page.getByLabel("Profile").selectOption("competent");
    await page.getByLabel("Mode").selectOption("campaign");
    await page.getByLabel("Difficulty").selectOption("easy");
    await page.getByLabel("Weapon").selectOption(weapon);
    await page.getByLabel("Seed").fill("62");
    await page.getByRole("button", { name: "Start Watch Agent" }).click();
    let snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
    for (let batch = 0; batch < 80 && snapshot.status === "running"; batch += 1) {
      snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.run(200));
    }
    const result = {
      weapon,
      selection: snapshot.selection,
      executionClass: "engineering",
      observationClass: "privileged-diagnostic",
      certified: false,
      outcome: snapshot.status,
      terminalReason: snapshot.terminalReason ?? null,
      fixedTicks: snapshot.fixedTicks,
      transitions: snapshot.transitions,
      weaponStats: snapshot.weaponStats,
      bladeStates: snapshot.bladeStates,
      bladeStateTransitions: snapshot.bladeStateTransitions,
      bladeTether: snapshot.bladeTether,
      weaponEvents: snapshot.weaponEvents,
      effectEvents: snapshot.engineEvents.filter((event) => event.kind === "effect"),
      actionIntents: snapshot.mechanics,
      mechanics: mechanics(snapshot),
      debugTransitions: snapshot.debugTransitions,
    };
    results.push(result);
    assert.equal(snapshot.selection.weapon, weapon);
    assert.ok(snapshot.transitions.some((entry) => entry.screen === "setup"));
    assert.ok(snapshot.transitions.some((entry) => entry.screen === "playing"));
    assert.ok(snapshot.fixedTicks > 0);
    assert.equal(snapshot.debugTransitions, 0);
    assert.ok(snapshot.weaponStats);
  }

  const targetedScenarios = [];
  targetedScenarios.push(await runTargetedScenario(page, {
    id: "source-stolen-blade-recovery", profile: "competent", weapon: "sword",
    mode: "bossonly", boss: "source", seed: 6, actions: [], batches: 100,
  }));

  const campaignStarts = results.filter((entry) =>
    entry.transitions.some((transition) => transition.screen === "playing")).length;
  const contractArtifacts = modeContracts.map((contract) => {
    const rows = contract.difficulties === null
      ? [{
          mode: contract.mode, difficulty: null, status: "unsupported",
          reason: "Tutorial has no production difficulty selector; difficulty-specific completion is not applicable.",
        }]
      : contract.difficulties.map((difficulty) => ({
          mode: contract.mode,
          difficulty,
          ...(contract.mode === "campaign" && difficulty === "easy"
            ? {
                status: "not-evaluated-here",
                reason: `${String(campaignStarts)} bounded live starts were observed, but completion is owned by `
                  + "tests/browser-scripted-agent-autonomy.js and "
                  + "tests/browser-scripted-agent-repeatability.js.",
              }
            : {
                status: "fail",
                reason: "No natural completion evidence was executed for this contract row.",
              }),
        }));
    const artifact = {
      schemaVersion: 1,
      checkpoint: "C24",
      contractId: contract.id,
      contractStatus: "contract-defined-no-live-certification",
      rows,
    };
    fs.writeFileSync(path.join(contractDirectory, `${contract.id}.json`), JSON.stringify(artifact, null, 2));
    return artifact;
  });
  const artifact = {
    schemaVersion: 1,
    checkpoint: "C24",
    gate: "real-simulation-weapon-and-mechanics-matrix",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    controls: {
      menuNavigation: "typed production ScreenAction controls",
      gameplayInput: "semantic GameAction through the live application frame",
      privilegedHostObservation: true,
      externalBackdoorReads: 0,
      cinematicControl: "engineering skip bridge (not physical-input evidence)",
      transitionShortcuts: 0,
    },
    requiredCoreMechanics: collectiveRequiredCoreMechanics,
    results,
    targetedScenarios,
    modeContracts: contractArtifacts,
    browserErrors: errors,
  };
  fs.writeFileSync(path.join(artifactDirectory, "weapon-mechanics-matrix.json"), JSON.stringify(artifact, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "weapon-mechanics-matrix.png") });
  assert.equal(results.length, 5);
  for (const mechanic of collectiveNonStolenMechanics) {
    assert.ok(results.some((entry) => entry.mechanics[mechanic].status === "observed"),
      `collective five-weapon matrix did not observe required core mechanic ${mechanic}`);
  }
  for (const result of results) {
    assert.equal(result.mechanics.heldSlash.status, "observed",
      `${result.weapon} did not produce a production held hit`);
    assert.equal(result.mechanics.tether.status, "observed",
      `${result.weapon} did not exercise its production blade tether`);
    for (const mechanic of weaponIdentityRequirements[result.weapon]) {
      assert.equal(result.mechanics[mechanic].status, "observed",
        `${result.weapon} did not exercise required identity mechanic ${mechanic}`);
    }
  }
  const sourceRecovery = targetedScenarios.find((entry) => entry.id === "source-stolen-blade-recovery");
  assert.ok(sourceRecovery, "Source stolen-blade recovery scenario is missing");
  assert.equal(sourceRecovery.mechanics.stolenBladeRecovery.status, "observed",
    "Source scenario did not prove ordered hostile/stolen then owned/held recovery");
  assert.ok(sourceRecovery.engineEvents.some((event) =>
    event.kind === "effect" && event.effect === "stolenBlade"),
  "Source scenario did not emit the semantic stolenBlade production event");
  assert.ok(sourceRecovery.weaponEvents.some((event) =>
    event && typeof event === "object" && event.type === "stolenBlade"),
  "Source scenario did not emit the stolenBlade production weapon event");
  assert.equal(contractArtifacts.length, 7);
  assert.equal(contractArtifacts.flatMap((entry) => entry.rows).length, 31);
  assert.deepEqual(errors, []);
  console.log("C24 real-simulation weapon and mode-contract truth matrix passed");
});
