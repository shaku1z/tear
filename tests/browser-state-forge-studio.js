const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

withJourney({ name: "C23 State Forge Studio", port: 8144 }, async ({ page, errors }) => {
  async function openSurface(query) {
    const url = new URL(page.url());
    url.searchParams.delete("scenario-console");
    url.searchParams.delete("stateforge");
    url.searchParams.set(query, "1");
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15_000 });
    await page.waitForTimeout(100);
  }

  await openSurface("scenario-console");
  assert.equal(await page.locator('[data-surface="scenario-console"]').count(), 1,
    `Scenario Console canonical route did not install: ${errors.join("\n")}`);
  assert.equal(await page.locator('[data-scenario-console-control="editor"]').count(), 1);
  assert.equal(await page.locator("#tear-state-forge-studio").count(), 1,
    "canonical route must preserve the C23 root selector");

  await openSurface("stateforge");
  assert.equal(await page.locator("#tear-state-forge-studio").count(), 1,
    `State Forge Studio did not install: ${errors.join("\n")}`);
  assert.equal(await page.locator('[data-surface="scenario-console"]').count(), 1,
    "legacy route must expose the canonical Scenario Console selector");

  const editor = page.locator("#tear-state-forge-editor");
  const originalSource = await editor.inputValue();
  const reports = await page.locator('[aria-label="Validation reports"] article').evaluateAll((articles) =>
    articles.map((article) => article.dataset.status));
  assert.deepEqual(reports, ["valid", "reachable", "plausible"]);
  assert.equal(await page.locator("#tear-state-forge-timeline option").count(), 0);

  await page.getByRole("button", { name: "Launch scenario" }).click();
  await page.getByRole("status").filter({ hasText: "Launched state-forge.live-sandbox" }).waitFor();
  assert.equal(await page.locator("#tear-state-forge-timeline option").count(), 1);
  assert.match(await page.getByText("Provenance").locator("..").textContent(), /live-tear-runtime/);

  await page.getByLabel("Fork id").fill("studio-low-health");
  await page.getByLabel("Fork state patch (JSON)").fill(JSON.stringify({
    "tear.player.v1": { hp: 77 },
  }));
  await page.getByRole("button", { name: "Fork checkpoint" }).evaluate((button) => button.click());
  assert.match(await page.getByRole("status").textContent(), /Forked studio-low-health/);
  assert.equal(await page.locator("#tear-state-forge-timeline option").count(), 2);
  assert.match(await page.getByText("Checkpoint diff").locator("..").textContent(), /tear\.player\.v1\.hp/);

  await page.getByRole("button", { name: "Watch checkpoint" }).evaluate((button) => button.click());
  assert.match(await page.getByRole("status").textContent(), /Watching studio-low-health/);

  const imported = {
    format: "tearsdl",
    schemaVersion: 1,
    id: "state-forge.imported-child",
    extends: "state-forge.live-sandbox",
    stateClass: "recorded-canonical",
    seed: "studio-import",
    start: { wave: 1 },
    state: {},
  };
  await page.getByLabel("Import TearSDL").setInputFiles({
    name: "imported.tearsdl.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await page.getByRole("status").filter({ hasText: "Resolved state-forge.imported-child" }).waitFor();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export" }).evaluate((button) => button.click()),
  ]);
  assert.equal(download.suggestedFilename(), "state-forge.imported-child.tearsdl.json");
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  assert.deepEqual(JSON.parse(fs.readFileSync(downloadPath, "utf8")), imported);

  const forgeClasses = [
    { stateClass: "reconstructed-reachable", wave: 24, constraints: { legalProgression: true }, state: { playerHpRatio: 0.5 } },
    { stateClass: "plausible-population", wave: 2, state: { playerHp: 80, profileId: "provisional-studio" } },
    { stateClass: "surgical-valid", wave: 3, state: { playerHp: 61, blade: { state: "held" } } },
    {
      stateClass: "adversarial-impossible",
      wave: 1,
      constraints: { quarantined: true, faultBudget: 1, excludeFromBalanceEvidence: true },
      state: { corruptionProfile: "quarantined-studio" },
    },
  ];
  const forgedClassEvidence = [];
  for (const [index, entry] of forgeClasses.entries()) {
    const document = {
      format: "tearsdl", schemaVersion: 1,
      id: `state-forge.class-${String(index)}`,
      stateClass: entry.stateClass,
      seed: `studio-class-${String(index)}`,
      start: { mode: "endless", difficulty: "hard", weapon: "hammer", wave: entry.wave },
      state: entry.state,
      ...(entry.constraints === undefined ? {} : { constraints: entry.constraints }),
    };
    await editor.fill(JSON.stringify(document));
    await page.getByRole("button", { name: "Validate", exact: true }).evaluate((button) => button.click());
    await page.getByRole("status").filter({ hasText: `Resolved ${document.id}` }).waitFor();
    await page.getByRole("button", { name: "Launch scenario", exact: true }).evaluate((button) => button.click());
    await page.waitForTimeout(200);
    assert.match(await page.getByRole("status").textContent(), new RegExp(`Launched ${document.id}`));
    const forged = await page.evaluate((expectedClass) => {
      const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
      const snapshot = environment.captureSnapshot(`proof-${expectedClass}`);
      return {
        wave: snapshot.state["tear.run.v1"].wave,
        stateClass: snapshot.state["tear.run.v1"].stateForgeScenario.stateClass,
      };
    }, entry.stateClass);
    assert.equal(forged.wave, entry.wave);
    assert.equal(forged.stateClass, entry.stateClass);
    forgedClassEvidence.push({
      scenarioId: document.id,
      stateClass: entry.stateClass,
      wave: forged.wave,
      constraints: entry.constraints ?? {},
    });
  }

  await editor.fill("{");
  await page.getByRole("button", { name: "Validate" }).evaluate((button) => button.click());
  const invalidReports = await page.locator('[aria-label="Validation reports"] article').evaluateAll((articles) =>
    articles.map((article) => article.dataset.status));
  assert.deepEqual(invalidReports, ["invalid", "not-evaluated", "not-evaluated"]);
  assert.equal(await page.getByRole("button", { name: "Launch scenario" }).isDisabled(), true);

  await editor.fill(originalSource);
  await page.getByRole("button", { name: "Validate" }).evaluate((button) => button.click());
  assert.equal(await page.getByRole("button", { name: "Launch scenario" }).isEnabled(), true);
  const artifactDirectory = path.resolve(__dirname, "..", "artifacts", "tearbench", "c23");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  fs.writeFileSync(path.join(artifactDirectory, "state-forge-studio-journey.json"), JSON.stringify({
    launchedRecordedCanonical: true,
    checkpointCount: 2,
    forkedCheckpoint: "studio-low-health",
    importExportRoundTrip: true,
    invalidScenarioRejected: true,
    forgedClasses: forgedClassEvidence,
    adversarialEvidenceQuarantined: true,
  }, null, 2));
  await page.screenshot({ path: path.join(artifactDirectory, "state-forge-studio-journey.png") });
  console.log("C23 State Forge Studio live host passed");
});
