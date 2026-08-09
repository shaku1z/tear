/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// Class-A State Forge supplies only the legal normal encounter. Circuit, its
// remote steer, boundary bounce, return, and catch are all live semantics.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.ringblade-circuit-bounce-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-ringblade-circuit-bounce",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "ringblade" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "ringblade", "circuit", "steer", "bounce", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.ringblade-circuit-bounce-catch-seek", version: 1,
    description: "Ringblade Circuit remote-steer bounce to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-ringblade-circuit-bounce", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "ringblade", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "ringblade", "circuit", "steer", "bounce", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-ringblade-circuit-bounce",
});

withJourney({ name: "C40 Ringblade Circuit Ghost seek", port: 8307, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
    // Build held Orbit using ordinary semantic aim motion, never state seeding.
    for (let frame = 0; frame < 60; frame += 1) {
      command({ type: "aim", turn: (frame * 17_000) % 1_000_000, magnitude: 1000 });
      environment.advanceApplicationFrame(1 / 120);
    }
    while (environment.observe().tick < 120) environment.advanceApplicationFrame(1 / 120);
    const preThrow = environment.captureSnapshot("c40-ringblade-prethrow");
    command({ type: "aim", turn: 0, magnitude: 1000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
    const circuit = environment.captureSnapshot("c40-ringblade-circuit");
    // Remote steering starts only after its own retained Circuit receipt.
    command({ type: "aim", turn: 875000, magnitude: 1000 });
    let bounced = null;
    let previousEnergy = environment.observe().blade.circuitEnergy;
    for (let frame = 0; frame < 360; frame += 1) {
      const blade = environment.observe().blade;
      environment.advanceApplicationFrame(1 / 120);
      const advancedBlade = environment.observe().blade;
      if (previousEnergy != null && advancedBlade.state === "circuiting" && advancedBlade.circuitEnergy > 0 && advancedBlade.circuitEnergy < previousEnergy - 0.2) {
        while (environment.observe().tick % 60 !== 0) environment.advanceApplicationFrame(1 / 120);
        bounced = environment.captureSnapshot("c40-ringblade-steer-bounce"); break;
      }
      previousEnergy = advancedBlade.circuitEnergy;
    }
    if (bounced) command({ type: "weapon", intent: "recall", phase: "pressed" });
    let caught = null;
    for (let frame = 0; frame < 720; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "held") {
        while (environment.observe().tick % 60 !== 0) environment.advanceApplicationFrame(1 / 120);
        caught = environment.captureSnapshot("c40-ringblade-postcatch"); break;
      }
    }
    if (caught) for (let frame = 0; frame < 12; frame += 1) environment.advanceApplicationFrame(1 / 120);
    const eventProjection = environment.engineEventProjection();
    environment.terminate();
    return { launched, preThrow, circuit, bounced, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.circuit, `Circuit never launched: ${JSON.stringify(result)}`);
  assert.ok(result.bounced, `Circuit never paid a live bounce cost: ${JSON.stringify(result)}`);
  assert.ok(result.caught, `Circuit never returned to held: ${JSON.stringify(result)}`);
  const circuitBlade = result.circuit.state["tear.blade.v1"];
  const bouncedBlade = result.bounced.state["tear.blade.v1"];
  assert.equal(circuitBlade.state, "circuiting");
  assert.ok(circuitBlade.circuitEnergy > 0, "Circuit must carry live finite energy");
  assert.ok(circuitBlade.orbit >= 0, "Circuit receipt must retain the real held Orbit value");
  assert.equal(bouncedBlade.state, "circuiting");
  assert.ok(bouncedBlade.circuitEnergy < circuitBlade.circuitEnergy, "remote steer/bounce must spend native Circuit energy");
  assert.equal(result.caught.state["tear.blade.v1"].state, "held");
  const nativeTypes = result.eventProjection.map((event) => event.type);
  assert.ok(nativeTypes.includes("blade.thrown") && nativeTypes.includes("blade.caught"), "generic native transport facts must reach the shared event port");
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(manifest.status, "complete"); assert.equal(manifest.recordingProfile, "forensic-qa");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id)).status, "verified");
  const commands = capsule.tracks.commands.map((entry) => entry.value.command);
  assert.ok(commands.some((value) => value.type === "aim") && commands.some((value) => value.type === "weapon" && value.intent === "throw") && commands.some((value) => value.type === "weapon" && value.intent === "recall"));
  const causalTypes = capsule.tracks.events.map((entry) => entry.value.type);
  assert.ok(causalTypes.includes("blade.thrown") && causalTypes.includes("blade.caught"), "sealed V3 capsule must retain generic native transport facts");
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["circuit", result.circuit], ["steer-bounce", result.bounced], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick)]), { id: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  console.log("C40 Ringblade Circuit -> remote steer/bounce -> catch V3 capture and fresh production seeks passed");
});
