const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const { withJourney } = require("./browser-journey-harness");

const scenario = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "c22.live-runtime.determinism",
  version: 1,
  description: "C22 real live runtime determinism proof",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  seed: "c22-fixed-seed",
  start: { mode: "endless", difficulty: "normal", weapon: "sword" },
  maxTicks: 120,
  assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
  tags: ["c22", "live-runtime", "determinism"],
};

function action(tick, id, command) {
  return { kind: "command", tick, id, command };
}

function actionsAt(tick) {
  if (tick === 1) return [action(tick, 1, { type: "move", x: 1000, y: 0 })];
  if (tick === 10) return [action(tick, 2, { type: "jump", phase: "pressed" })];
  if (tick === 11) return [action(tick, 3, { type: "jump", phase: "released" })];
  if (tick === 25) return [action(tick, 4, { type: "dash", x: 1000, y: 0 })];
  if (tick === 40) return [action(tick, 5, { type: "aim", turn: 0, magnitude: 1000 })];
  if (tick === 41) return [action(tick, 6, { type: "weapon", intent: "primary", phase: "pressed" })];
  if (tick === 43) return [action(tick, 7, { type: "weapon", intent: "primary", phase: "released" })];
  return [];
}

withJourney({ name: "C22 live Tear runtime", port: 8137 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15000 });
  const actionSchedule = Object.fromEntries(Array.from({ length: scenario.maxTicks }, (_, index) => {
    const tick = index + 1;
    return [tick, actionsAt(tick)];
  }));
  const result = await page.evaluate(({ scenarioValue, scheduledActions }) => {
    const localStorageBefore = JSON.stringify(Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .filter(Boolean).map((key) => [key, localStorage.getItem(key)]),
    ));
    const profiles = { "30": 1 / 30, "60": 1 / 60, "144": 1 / 144, "uncapped": 1 / 1000 };
    const hashes = {};
    const canonicalHashes = {};
    const fixedEnvironment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const firstObservation = fixedEnvironment.reset(scenarioValue);
    for (let tick = 1; tick <= scenarioValue.maxTicks; tick++) {
      fixedEnvironment.step(scheduledActions[tick] ?? []);
    }
    const finalObservation = fixedEnvironment.observe();
    const rng = fixedEnvironment.rng();
    const metrics = fixedEnvironment.metrics();
    const eventTypes = fixedEnvironment.events().map((event) => event.type);
    const eventSources = fixedEnvironment.events().map((event) => event.source);
    const screenshotPrefix = fixedEnvironment.screenshot().slice(0, 22);
    const renderMetrics = {};
    for (const [profile, deltaSeconds] of Object.entries(profiles)) {
      const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
      environment.reset(scenarioValue);
      let transition;
      let frames = 0;
      while (environment.observe().tick < scenarioValue.maxTicks) {
        const initial = frames === 0 ? [
          { kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } },
        ] : [];
        transition = environment.renderFrame(deltaSeconds, initial);
        frames += 1;
        if (frames > 2_000) throw new Error(`render profile ${profile} failed to reach the target tick`);
      }
      hashes[profile] = environment.stateHash();
      canonicalHashes[profile] = transition.info.canonicalStateHash;
      renderMetrics[profile] = { frames, ticks: environment.observe().tick };
    }
    const classB = window.__TEAR_RUNTIME_ENVIRONMENT__.create("B");
    const classBObservation = classB.reset(scenarioValue);
    let classBRngDenied = false;
    try { classB.rng(); } catch { classBRngDenied = true; }
    const classC = window.__TEAR_RUNTIME_ENVIRONMENT__.create("C");
    const classCStructuredAbsent = !("reset" in classC) && !("observe" in classC)
      && !("stateHash" in classC) && !("rng" in classC);
    classC.physicalInput({ type: "key", code: "KeyD", phase: "pressed" });
    classC.physicalInput({ type: "key", code: "KeyD", phase: "released" });
    let invalidClassDenied = false;
    try { window.__TEAR_RUNTIME_ENVIRONMENT__.create("D"); } catch { invalidClassDenied = true; }
    const lifecycleEnvironment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    lifecycleEnvironment.reset(scenarioValue);
    lifecycleEnvironment.pause();
    const pausedObservation = lifecycleEnvironment.observe();
    lifecycleEnvironment.resume();
    const resumedObservation = lifecycleEnvironment.observe();
    lifecycleEnvironment.terminate();
    const terminatedLifecycle = lifecycleEnvironment.observe().diagnostics.lifecyclePhase;
    let terminalStepDenied = false;
    try { lifecycleEnvironment.step(); } catch { terminalStepDenied = true; }
    const timeEffectEnvironment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    timeEffectEnvironment.reset(scenarioValue);
    timeEffectEnvironment.setTimeEffectsForTest({ hitStop: 0.25, slowMotion: 1, timeScale: 0.2 });
    const hitStopTick = timeEffectEnvironment.step().observation.tick;
    const choiceEnvironment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    choiceEnvironment.reset(scenarioValue);
    window.__PANTHEON_TEST.openDraft();
    const draftObservation = choiceEnvironment.observe();
    const draftChoiceId = draftObservation.diagnostics.ui.focusableIds[0];
    const draftTransition = choiceEnvironment.step([{
      kind: "command", id: 1, tick: draftObservation.tick + 1,
      command: { type: "draft-choice", choiceId: draftChoiceId },
    }]);
    choiceEnvironment.reset(scenarioValue);
    window.__PANTHEON_TEST.openTierUp();
    const tierObservation = choiceEnvironment.observe();
    const tierChoiceId = tierObservation.diagnostics.ui.focusableIds[0];
    const tierTransition = choiceEnvironment.step([{
      kind: "command", id: 1, tick: tierObservation.tick + 1,
      command: { type: "tier-up-choice", choiceId: tierChoiceId },
    }]);
    const validationEnvironment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    validationEnvironment.reset(scenarioValue);
    let invalidEnvelopeDenied = false;
    try {
      validationEnvironment.step([{
        kind: "command", id: 1, tick: 99, command: { type: "move", x: 1000, y: 0 },
      }]);
    } catch { invalidEnvelopeDenied = true; }
    let unsupportedScenarioDenied = false;
    try {
      window.__TEAR_RUNTIME_ENVIRONMENT__.create("A").reset({
        ...scenarioValue, id: "c22.unsupported-stage", start: { ...scenarioValue.start, stage: "forge" },
      });
    } catch { unsupportedScenarioDenied = true; }
    const batchTransitions = validationEnvironment.actionBatch([{
      actions: [{ kind: "command", id: 1, tick: 1, command: { type: "move", x: 1000, y: 0 } }],
      ticks: 3,
    }]);
    return {
      hashes, canonicalHashes, firstObservation, finalObservation, rng, metrics, eventTypes, eventSources, renderMetrics,
      screenshotPrefix, classBObservationClass: classBObservation.observationClass,
      classBRngDenied, classCStructuredAbsent, classCScreenshotPrefix: classC.screenshot().slice(0, 22),
      invalidClassDenied, pausedObservation, resumedObservation, terminatedLifecycle, terminalStepDenied,
      hitStopTick,
      draftAction: {
        before: draftObservation.availableActions,
        consumed: draftTransition.actions[0].command.type,
        simulationActions: draftTransition.info.simulationActions,
      },
      tierAction: {
        before: tierObservation.availableActions,
        consumed: tierTransition.actions[0].command.type,
        simulationActions: tierTransition.info.simulationActions,
      },
      invalidEnvelopeDenied,
      unsupportedScenarioDenied,
      batch: {
        ticks: validationEnvironment.observe().tick,
        transitions: batchTransitions.length,
        consumedPerTick: batchTransitions.map((transition) => transition.actions
          .filter((entry) => entry.command.type === "move").length),
      },
      factoryFrozen: Object.isFrozen(window.__TEAR_RUNTIME_ENVIRONMENT__),
      localStorageBefore,
      localStorageAfter: JSON.stringify(Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
          .filter(Boolean).map((key) => [key, localStorage.getItem(key)]),
      )),
      externalCapabilities: Object.fromEntries(["identity", "cloudSave", "leaderboards", "ads",
        "achievements", "analytics", "fullscreen", "overlay"]
        .map((key) => [key, window.__TEAR_PLATFORM_SERVICES__[key].available])),
    };
  }, { scenarioValue: scenario, scheduledActions: actionSchedule });

  assert.equal(new Set(Object.values(result.hashes)).size, 1,
    `semantic hash is render-profile invariant: ${JSON.stringify(result.hashes)}`);
  assert.equal(new Set(Object.values(result.canonicalHashes)).size, 1, "canonical state hash is render-profile invariant");
  assert.deepEqual(Object.fromEntries(Object.entries(result.renderMetrics).map(([profile, value]) => [profile, value.ticks])),
    { 30: 120, 60: 120, 144: 120, uncapped: 120 });
  assert.equal(result.firstObservation.tick, 0);
  assert.equal(result.finalObservation.tick, 120);
  assert.equal(result.finalObservation.run.mode, "endless");
  assert.equal(result.finalObservation.run.weapon, "sword");
  assert.equal(result.finalObservation.observationClass, "privileged-diagnostic");
  assert.equal(result.metrics.fixedTicks, 120);
  assert.equal(result.metrics.acceptedActions, 7);
  assert.ok(result.eventTypes.includes("run.started"));
  assert.ok(result.eventTypes.includes("system.checkpoint"));
  assert.ok(result.eventSources.includes("engine"));
  assert.ok(result.eventSources.includes("agent"));
  assert.equal(result.screenshotPrefix, "data:image/png;base64,");
  assert.equal(result.classCScreenshotPrefix, "data:image/png;base64,");
  assert.equal(result.classBObservationClass, "structured-state");
  assert.equal(result.classBRngDenied, true);
  assert.equal(result.classCStructuredAbsent, true);
  assert.equal(result.invalidClassDenied, true);
  assert.equal(result.pausedObservation.diagnostics.paused, true);
  assert.equal(result.pausedObservation.availableActions.includes("confirm"), true);
  assert.equal(result.resumedObservation.diagnostics.paused, false);
  assert.equal(result.resumedObservation.availableActions.includes("move"), true);
  assert.equal(result.terminatedLifecycle, "terminated");
  assert.equal(result.terminalStepDenied, true);
  assert.equal(result.hitStopTick, 1, "fixed-tick stepping bypasses render-time hit-stop and slow motion");
  assert.deepEqual(result.draftAction, {
    before: ["draft-choice"], consumed: "draft-choice", simulationActions: 0,
  });
  assert.deepEqual(result.tierAction, {
    before: ["tier-up-choice"], consumed: "tier-up-choice", simulationActions: 0,
  });
  assert.equal(result.invalidEnvelopeDenied, true);
  assert.equal(result.unsupportedScenarioDenied, true);
  assert.deepEqual(result.batch, { ticks: 3, transitions: 3, consumedPerTick: [1, 0, 0] });
  assert.equal(result.factoryFrozen, true);
  assert.equal(result.localStorageAfter, result.localStorageBefore, "disposable live runs do not mutate browser profile storage");
  assert.deepEqual(result.externalCapabilities, {
    identity: false, cloudSave: false, leaderboards: false, ads: false,
    achievements: false, analytics: false, fullscreen: false, overlay: false,
  });
  for (const stream of Object.values(result.rng)) {
    assert.equal(stream.algorithm, "mulberry32");
    assert.equal(Number.isInteger(stream.seed), true);
    assert.equal(Number.isInteger(stream.cursor), true);
  }
  const cleanProcessHashes = {};
  const cleanProcessCanonicalHashes = {};
  const baseUrl = new URL(page.url()).origin;
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const cleanProfiles = {
    30: [1 / 30],
    60: [1 / 60],
    144: [1 / 144],
    uncapped: [1 / 1000, 1 / 777, 1 / 1440, 1 / 500],
  };
  for (const [profile, deltas] of Object.entries(cleanProfiles)) {
    const profileBrowser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : {}),
    });
    try {
      const profilePage = await profileBrowser.newPage({ viewport: { width: 1600, height: 900 } });
      await profilePage.route("**/*", (route) =>
        route.request().url().startsWith(`${baseUrl}/`) ? route.continue() : route.abort());
      await profilePage.goto(`${baseUrl}/index.html?test=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await profilePage.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15000 });
      await profilePage.mouse.click(10, 10);
      const profileResult = await profilePage.evaluate(({ scenarioValue, schedule }) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        environment.reset(scenarioValue);
        let frame = 0;
        let transition;
        while (environment.observe().tick < scenarioValue.maxTicks) {
          const actions = frame === 0
            ? [{ kind: "command", tick: 1, id: 1, command: { type: "move", x: 1000, y: 0 } }]
            : [];
          transition = environment.renderFrame(schedule[frame % schedule.length], actions);
          frame += 1;
          if (frame > 3_000) throw new Error("clean-process render schedule did not reach target");
        }
        return {
          semanticHash: environment.stateHash(),
          canonicalHash: transition.info.canonicalStateHash,
          tick: environment.observe().tick,
        };
      }, { scenarioValue: scenario, schedule: deltas });
      cleanProcessHashes[profile] = profileResult.semanticHash;
      cleanProcessCanonicalHashes[profile] = profileResult.canonicalHash;
      assert.equal(profileResult.tick, 120);
    } finally {
      await profileBrowser.close();
    }
  }
  assert.equal(new Set(Object.values(cleanProcessHashes)).size, 1,
    `clean-process semantic hashes diverged: ${JSON.stringify(cleanProcessHashes)}`);
  assert.equal(new Set(Object.values(cleanProcessCanonicalHashes)).size, 1,
    `clean-process canonical hashes diverged: ${JSON.stringify(cleanProcessCanonicalHashes)}`);
  const labUrl = new URL(page.url());
  labUrl.searchParams.set("replay-hub", "1");
  labUrl.searchParams.delete("ghostlab");
  await page.goto(labUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-surface="replay-hub"]');
  await page.waitForSelector("#tear-ghost-lab");
  await page.getByRole("button", { name: "Launch disposable run" }).click();
  await page.waitForFunction(() => document.querySelector("#tear-ghost-lab-state")?.textContent.includes("\"running\""));
  const labText = await page.locator("#tear-ghost-lab-state").textContent();
  assert.match(labText, /"observation"/);
  assert.match(labText, /"events"/);
  assert.match(labText, /"rng"/);
  assert.match(labText, /"invariants"/);
  const legacyLabUrl = new URL(page.url());
  legacyLabUrl.searchParams.delete("replay-hub");
  legacyLabUrl.searchParams.set("ghostlab", "1");
  await page.goto(legacyLabUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tear-ghost-lab");
  await page.waitForSelector('[data-surface="replay-hub"]');
  console.log("C22 live Tear runtime bridge passed");
});
