/* eslint-disable @typescript-eslint/no-require-imports -- Browser journey scripts run directly under Node CommonJS. */
const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const repositoryRoot = path.resolve(__dirname, "..");
const buildDirectoryName = process.env.TEAR_BROWSER_BUILD_DIR || "test-standalone";
const buildDirectory = path.join(repositoryRoot, "dist", buildDirectoryName);
const sampleStepBudget = 200;
const maxSamples = Number(process.env.C24_REPEAT_MAX_SAMPLES || 4_000);
const requestedSeed = Number(process.env.C24_REPEAT_SEED || 117);
const scenario = Object.freeze({
  profile: process.env.C24_REPEAT_PROFILE || "competent",
  mode: process.env.C24_REPEAT_MODE || "campaign",
  difficulty: process.env.C24_REPEAT_DIFFICULTY || "easy",
  weapon: process.env.C24_REPEAT_WEAPON || "riftlock",
  boss: process.env.C24_REPEAT_BOSS || "shuffle",
  seed: requestedSeed,
  skipCinematics: true,
});

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(candidate) : [candidate];
  });
}

function buildTreeIdentity() {
  const hash = createHash("sha256");
  for (const file of filesUnder(buildDirectory).sort((left, right) => left.localeCompare(right))) {
    const relative = path.relative(buildDirectory, file).replaceAll("\\", "/");
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return Object.freeze({
    directory: buildDirectoryName,
    algorithm: "sha256",
    digest: hash.digest("hex"),
  });
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function eventTypeCounts(events) {
  const counts = {};
  for (const event of events) {
    const type = event !== null && typeof event === "object" && typeof event.type === "string"
      ? event.type
      : "unknown";
    counts[type] = (counts[type] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function transcriptSample(snapshot) {
  return {
    status: snapshot.status,
    screen: snapshot.screen,
    tick: snapshot.tick,
    fixedTicks: snapshot.fixedTicks,
    decisions: snapshot.decisions,
    wave: snapshot.wave ?? null,
    hp: snapshot.hp ?? null,
    enemyCount: snapshot.enemyCount,
    terminalReason: snapshot.terminalReason ?? null,
    transitionCount: snapshot.transitions.length,
    draftCount: snapshot.draftPicks.length,
    mechanics: snapshot.mechanics,
    bladeStates: snapshot.bladeStates,
    weaponStats: snapshot.weaponStats ?? null,
    intent: snapshot.structuredIntent === undefined ? null : {
      objective: snapshot.structuredIntent.objective,
      targetId: snapshot.structuredIntent.targetId ?? null,
      maneuver: snapshot.structuredIntent.maneuver,
      recovery: snapshot.structuredIntent.recovery,
      confidence: snapshot.structuredIntent.confidence,
      watchdog: snapshot.structuredIntent.watchdog,
      invariantViolations: snapshot.structuredIntent.invariantViolations,
    },
  };
}

function terminalSummary(snapshot) {
  return {
    status: snapshot.status,
    screen: snapshot.screen,
    terminalReason: snapshot.terminalReason ?? null,
    tick: snapshot.tick,
    fixedTicks: snapshot.fixedTicks,
    decisions: snapshot.decisions,
    wave: snapshot.wave ?? null,
    hp: snapshot.hp ?? null,
    enemyCount: snapshot.enemyCount,
  };
}

function mechanicAndWeaponSummary(snapshot) {
  return {
    mechanics: snapshot.mechanics,
    bladeStates: snapshot.bladeStates,
    bladeStateTransitions: snapshot.bladeStateTransitions,
    bladeTether: snapshot.bladeTether,
    weaponStats: snapshot.weaponStats ?? null,
    weaponEventTypeCounts: eventTypeCounts(snapshot.weaponEvents),
  };
}

async function runFreshJourney(browser, baseUrl, runNumber) {
  const context = await browser.newContext({
    viewport: { width: 1_600, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  await context.route("**/*", (route) => {
    if (route.request().url().startsWith(`${baseUrl}/`)) void route.continue();
    else void route.abort();
  });
  try {
    await page.goto(`${baseUrl}/index.html?test=1&watchagent=1`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__, undefined, { timeout: 15_000 });
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const buildMetadata = await page.evaluate(() => window.__TEAR_BUILD__ ?? null);
    let snapshot = await page.evaluate((options) => window.__TEAR_WATCH_AGENT__.start(options), scenario);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const transcript = [transcriptSample(snapshot)];
    for (let sample = 0; sample < maxSamples && snapshot.status === "running"; sample += 1) {
      snapshot = await page.evaluate((budget) => window.__TEAR_WATCH_AGENT__.run(budget), sampleStepBudget);
      transcript.push(transcriptSample(snapshot));
    }

    assert.equal(snapshot.selection.seed, requestedSeed, `run ${String(runNumber)} changed the requested seed`);
    assert.equal(snapshot.executionClass, "engineering");
    assert.equal(snapshot.observationClass, "privileged-diagnostic");
    assert.equal(snapshot.certified, false);
    assert.equal(snapshot.status, "completed", `run ${String(runNumber)} did not complete: ${JSON.stringify(terminalSummary(snapshot))}`);
    assert.equal(snapshot.screen, "menu", `run ${String(runNumber)} did not return to the menu`);
    assert.ok(snapshot.transitions.some((entry) => entry.screen === "playing"),
      `run ${String(runNumber)} never entered real gameplay`);
    assert.deepEqual(errors, [], `run ${String(runNumber)} page errors: ${errors.join("\n")}`);

    return Object.freeze({
      runNumber,
      requestedSeed,
      runSeed: Object.hasOwn(snapshot, "runSeed") ? snapshot.runSeed : null,
      buildMetadata,
      terminal: terminalSummary(snapshot),
      transitions: snapshot.transitions,
      drafts: snapshot.draftPicks,
      mechanicAndWeaponSummary: mechanicAndWeaponSummary(snapshot),
      transcriptSamples: transcript.length,
      transcriptHash: stableHash(transcript),
    });
  } finally {
    await context.close();
  }
}

withJourney({ name: "C24 same-seed scripted-agent repeatability", port: 8155 }, async ({ page, errors }) => {
  assert.ok(Number.isSafeInteger(requestedSeed) && requestedSeed > 0,
    "C24_REPEAT_SEED must be a positive safe integer");
  assert.ok(Number.isSafeInteger(maxSamples) && maxSamples > 0,
    "C24_REPEAT_MAX_SAMPLES must be a positive safe integer");
  const browser = page.context().browser();
  assert.ok(browser, "repeatability journey requires a live browser");
  const baseUrl = new URL(page.url()).origin;
  const before = buildTreeIdentity();
  const first = await runFreshJourney(browser, baseUrl, 1);
  const second = await runFreshJourney(browser, baseUrl, 2);
  const after = buildTreeIdentity();

  assert.deepEqual(after, before, "the served test build changed between repeated journeys");
  assert.equal(first.requestedSeed, second.requestedSeed);
  assert.equal(first.runSeed, second.runSeed);
  assert.deepEqual(first.buildMetadata, second.buildMetadata);
  assert.deepEqual(first.terminal, second.terminal);
  assert.deepEqual(first.transitions, second.transitions);
  assert.deepEqual(first.drafts, second.drafts);
  assert.deepEqual(first.mechanicAndWeaponSummary, second.mechanicAndWeaponSummary);
  assert.equal(first.transcriptSamples, second.transcriptSamples);
  assert.equal(first.transcriptHash, second.transcriptHash);
  assert.deepEqual(errors, []);

  const report = {
    schemaVersion: 1,
    checkpoint: "C24",
    gate: "same-seed-repeatability",
    executionClass: "engineering",
    observationClass: "privileged-diagnostic",
    certified: false,
    immutableBuild: before,
    scenario,
    sampleCadence: { watchStepBudget: sampleStepBudget, maximumSamples: maxSamples },
    freshBrowserContexts: 2,
    results: [first, second],
  };
  const artifactDirectory = path.join(repositoryRoot, "artifacts", "tearbench", "c24");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(path.join(artifactDirectory, "easy-adventure-repeatability.json"),
    JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("C24 same-seed completed Adventure repeatability passed");
});
