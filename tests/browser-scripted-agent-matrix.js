const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

// Riftlock goes first: it is the one weapon whose identity is throw and recall, so it can show every shared
// mechanic and the weapons after it stop as soon as they have shown their own.
const weapons = ["riftlock", "sword", "hammer", "greatsword", "chainblade"];
/** Frames the Watch Agent runs between looks at what it has shown. */
const batchFrames = 200;
/**
 * The most batches one weapon gets. Measured 2026-11-18 (seed 62): the last mechanic any weapon showed first
 * appeared in batch 31, so 60 leaves twice that, and five weapons at the cap still end inside the journey limit.
 */
const maxBatches = 60;
const difficulties = ["easy", "normal", "hard", "extreme", "onehit"];
const collectiveRequiredCoreMechanics = [
  "heldSlash",
  "launch",
  "juggle",
  "slam",
  "updraft",
  "throw",
  "recall",
  "tether",
  "projectileParry",
];
const weaponIdentityRequirements = Object.freeze({
  sword: ["heldSlash"],
  hammer: ["heldSlash"],
  greatsword: ["heldSlash"],
  chainblade: ["heldSlash"],
  riftlock: ["throw", "recall"],
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
  const heldEvents = snapshot.weaponEvents.filter(
    (event) => event && typeof event === "object" && event.type === "heldHit",
  );
  const effects = new Set(
    snapshot.engineEvents.filter((event) => event.kind === "effect").map((event) => event.effect),
  );
  const states = new Set(snapshot.bladeStates);
  const control = snapshot.bladeStateTransitions;
  const observed = (condition, evidence) => ({
    status: condition ? "observed" : "not-observed",
    evidence: condition ? evidence : "No corresponding live signal occurred in this bounded run.",
  });
  const recalled = stats.throws > 0 && [...states].some((state) => ["returning", "slinging", "held"].includes(state));
  const tethered = snapshot.bladeTether.contracted || control.some((entry) => entry.state === "hooked");
  const stolenAt = control.findIndex((entry) => entry.hostile && entry.stolen);
  const recoveredAt = control.findIndex(
    (entry, index) => index > stolenAt && !entry.hostile && !entry.stolen && entry.state === "held",
  );
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
    stolenBladeRecovery: observed(
      stolenRecovered,
      "ordered blade control timeline proved stolen/hostile then held recovery",
    ),
    tetherOrStolenRecovery: observed(
      tethered || stolenRecovered,
      `ordered blade control timeline: ${control
        .map((entry) => `${entry.state}/${entry.hostile ? "hostile" : "owned"}`)
        .join(", ")}`,
    ),
    projectileParry: observed(
      stats.perfectParries > 0 || effects.has("parry") || effects.has("deflect"),
      `${String(stats.perfectParries ?? 0)} perfect parries; effects ${[...effects].join(", ")}`,
    ),
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
    await page.goto(url.toString(), { timeout: STATE_WAIT_MS, waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: STATE_WAIT_MS });
    await page.getByLabel("Profile").selectOption("competent");
    await page.getByLabel("Mode").selectOption("campaign");
    await page.getByLabel("Difficulty").selectOption("easy");
    await page.getByLabel("Weapon").selectOption(weapon);
    await page.getByLabel("Seed").fill("62");
    await page.getByRole("button", { name: "Start Watch Agent" }).click();
    let snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.snapshot());
    // A weapon plays until it has shown what this journey asserts of it: its own mechanics, and any shared
    // mechanic no earlier weapon has shown. Frames after that prove nothing here.
    const owed = [
      "heldSlash",
      "tether",
      ...weaponIdentityRequirements[weapon],
      ...collectiveRequiredCoreMechanics.filter((mechanic) =>
        results.every((entry) => entry.mechanics[mechanic].status !== "observed"),
      ),
    ];
    const startedAt = Date.now();
    let batches = 0;
    const shown = () => owed.every((mechanic) => mechanics(snapshot)[mechanic].status === "observed");
    while (batches < maxBatches && snapshot.status === "running" && !shown()) {
      snapshot = await page.evaluate((frames) => window.__TEAR_WATCH_AGENT__.run(frames), batchFrames);
      batches += 1;
    }
    console.log(
      `C24 matrix ${weapon}: ${String(batches)} batches, ${String(snapshot.fixedTicks)} ticks, ` +
        `${((Date.now() - startedAt) / 1000).toFixed(1)} s, ${snapshot.status}`,
    );
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

  const campaignStarts = results.filter((entry) =>
    entry.transitions.some((transition) => transition.screen === "playing"),
  ).length;
  const contractArtifacts = modeContracts.map((contract) => {
    const rows =
      contract.difficulties === null
        ? [
            {
              mode: contract.mode,
              difficulty: null,
              status: "unsupported",
              reason:
                "Tutorial has no production difficulty selector; difficulty-specific completion is not applicable.",
            },
          ]
        : contract.difficulties.map((difficulty) => ({
            mode: contract.mode,
            difficulty,
            ...(contract.mode === "campaign" && difficulty === "easy"
              ? {
                  status: "not-evaluated-here",
                  reason:
                    `${String(campaignStarts)} bounded live starts were observed, but completion is owned by ` +
                    "tests/browser-scripted-agent-autonomy.js and " +
                    "tests/browser-scripted-agent-repeatability.js.",
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
    modeContracts: contractArtifacts,
    browserErrors: errors,
  };
  fs.writeFileSync(path.join(artifactDirectory, "weapon-mechanics-matrix.json"), JSON.stringify(artifact, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "weapon-mechanics-matrix.png") });
  assert.equal(results.length, 5);
  for (const mechanic of collectiveRequiredCoreMechanics) {
    assert.ok(
      results.some((entry) => entry.mechanics[mechanic].status === "observed"),
      `collective five-weapon matrix did not observe required core mechanic ${mechanic}`,
    );
  }
  for (const result of results) {
    assert.equal(
      result.mechanics.heldSlash.status,
      "observed",
      `${result.weapon} did not produce a production held hit`,
    );
    assert.equal(
      result.mechanics.tether.status,
      "observed",
      `${result.weapon} did not exercise its production blade tether`,
    );
    for (const mechanic of weaponIdentityRequirements[result.weapon]) {
      assert.equal(
        result.mechanics[mechanic].status,
        "observed",
        `${result.weapon} did not exercise required identity mechanic ${mechanic}`,
      );
    }
  }
  assert.equal(contractArtifacts.length, 7);
  assert.equal(contractArtifacts.flatMap((entry) => entry.rows).length, 31);
  assert.deepEqual(errors, []);
  console.log("C24 real-simulation weapon and mode-contract truth matrix passed");
});
