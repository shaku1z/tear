/* eslint-disable @typescript-eslint/no-require-imports -- browser proof is executed directly by Node. */
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");

// This is deliberately a Hammer-specific forensic journey. It forges a normal
// endless state and uses only semantic intent; it never writes an embedded or
// meteor state into the production world.
const resolved = Object.freeze({
  document: Object.freeze({
    format: "tearsdl", schemaVersion: 1, id: "c40.hammer-meteor-terrain-catch-seek",
    stateClass: "reconstructed-reachable", seed: "c40-hammer-meteor-terrain",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "hammer" }),
    state: Object.freeze({ player: Object.freeze({ x: 500, y: 620, vx: 0, vy: 0 }) }),
    constraints: Object.freeze({ legalProgression: true }), tags: Object.freeze(["c40", "hammer", "meteor", "terrain", "catch", "seek"]), maxTicks: 720,
  }),
  scenario: Object.freeze({
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "c40.hammer-meteor-terrain-catch-seek", version: 1,
    description: "Hammer terrain Meteor to catch Ghost V3 seek proof", stateClass: "reconstructed-reachable", executionClass: "engineering",
    seed: "c40-hammer-meteor-terrain", start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "hammer", wave: 1 }),
    maxTicks: 720, assertions: Object.freeze(["runtime.finite-state", "player.valid-health", "runtime.no-softlock"]), tags: Object.freeze(["c40", "hammer", "meteor", "terrain", "catch", "seek"]),
  }),
  structural: Object.freeze({ valid: true, issues: Object.freeze([]) }), reachability: Object.freeze({ reachable: true, reasons: Object.freeze([]) }),
  plausibility: Object.freeze({ plausible: true, provisional: false, reasons: Object.freeze([]) }), resolvedHash: "c40-hammer-meteor-terrain",
});

withJourney({ name: "C40 Hammer terrain Meteor Ghost seek", port: 8306, query: { "ghost-v3-profile": "forensic-qa" } }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__ && window.__TEAR_GHOST_V3__, undefined, { timeout: 15_000 });
  const result = await page.evaluate((scenario) => {
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    const launched = environment.forgeResolvedScenario(scenario);
    if (!launched.ok) return { launched };
    let id = 1;
    const command = (value) => environment.step([{ kind: "command", tick: environment.observe().tick + 1, id: id++, command: value }]);
    const preThrow = environment.captureSnapshot("c40-hammer-prethrow");
    // Down-right semantic aim makes the ballistic Hammer meet the authored
    // ground through the ordinary platform collision path.
    command({ type: "aim", turn: 462000 });
    command({ type: "weapon", intent: "throw", phase: "pressed" });
    const bladeStates = [];
    let embedded = null;
    let embeddedTick = null;
    for (let frame = 0; frame < 360; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      const blade = environment.observe().blade;
      if (bladeStates.at(-1) !== blade.state) bladeStates.push(blade.state);
      if (blade.state === "embedded") {
        embeddedTick = environment.observe().tick;
        while (environment.observe().tick < 120) environment.advanceApplicationFrame(1 / 120);
        embedded = environment.captureSnapshot("c40-hammer-meteor-embedded-resolve");
        break;
      }
    }
    if (embedded) command({ type: "weapon", intent: "recall", phase: "pressed" });
    let caught = null;
    for (let frame = 0; frame < 480; frame += 1) {
      environment.advanceApplicationFrame(1 / 120);
      if (environment.observe().blade.state === "held") {
        while (environment.observe().tick < 180) environment.advanceApplicationFrame(1 / 120);
        caught = environment.captureSnapshot("c40-hammer-postcatch");
        break;
      }
    }
    // Let the shared recorder consume the native catch edge before sealing.
    if (caught) for (let frame = 0; frame < 12; frame += 1) environment.advanceApplicationFrame(1 / 120);
    const eventProjection = environment.engineEventProjection();
    environment.terminate();
    return { launched, bladeStates, preThrow, embedded, embeddedTick, caught, eventProjection };
  }, resolved);
  assert.equal(result.launched.ok, true, JSON.stringify(result.launched));
  assert.ok(result.embedded, `no terrain Meteor embed: ${JSON.stringify(result.bladeStates)}`);
  assert.ok(result.caught, `no Meteor catch: ${JSON.stringify(result.bladeStates)}`);
  assert.ok(result.embeddedTick < 120, `Meteor must meet authored terrain before ordinary throw expiry: ${JSON.stringify(result)}`);
  assert.equal(result.embedded.state["tear.blade.v1"].state, "embedded");
  assert.equal(result.caught.state["tear.blade.v1"].state, "held");
  const nativeTypes = result.eventProjection.map((event) => event.type);
  assert.ok(nativeTypes.includes("blade.thrown"), "generic native launch must reach the shared event port");
  assert.ok(nativeTypes.includes("blade.throw-resolved"), "terrain Meteor must publish the generic native resolve fact");
  assert.ok(nativeTypes.includes("blade.caught"), "generic native catch must reach the shared event port");
  await page.waitForFunction(() => window.__TEAR_GHOST_V3__.manifest() !== null || window.__TEAR_GHOST_V3__.failure() !== null, undefined, { timeout: 20_000 });
  assert.equal(await page.evaluate(() => window.__TEAR_GHOST_V3__.failure()), null);
  const manifest = await page.evaluate(() => window.__TEAR_GHOST_V3__.manifest());
  const capsule = await page.evaluate((id) => window.__TEAR_GHOST_V3__.read(id), manifest.id);
  assert.equal(manifest.status, "complete"); assert.equal(manifest.recordingProfile, "forensic-qa");
  assert.equal((await page.evaluate((id) => window.__TEAR_GHOST_V3__.verify(id), manifest.id)).status, "verified");
  const commands = capsule.tracks.commands.map((entry) => entry.value.command);
  assert.ok(commands.some((value) => value.type === "aim") && commands.some((value) => value.type === "weapon" && value.intent === "throw")
    && commands.some((value) => value.type === "weapon" && value.intent === "recall"), "sealed V3 capsule must retain semantic aim/throw/recall");
  const causalTypes = capsule.tracks.events.map((entry) => entry.value.type);
  assert.ok(causalTypes.includes("blade.thrown") && causalTypes.includes("blade.throw-resolved") && causalTypes.includes("blade.caught"),
    `sealed V3 capsule must retain generic native launch/resolve/catch facts: ${JSON.stringify(causalTypes)}`);
  for (const [label, snapshot] of [["prethrow", result.preThrow], ["embedded-resolve", result.embedded], ["postcatch", result.caught]]) {
    const receipt = capsule.tracks.results.find((entry) => entry.tick === snapshot.tick && entry.value.kind === "authoritative-hash");
    assert.ok(receipt, `${label} must retain an authoritative hash receipt`);
    const seeks = await page.evaluate(async ({ id, tick }) => Promise.all([window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick), window.__TEAR_GHOST_V3__.seek(id, tick)]), { id: manifest.id, tick: snapshot.tick });
    assert.ok(seeks.every((seek) => seek?.tick === snapshot.tick && seek.usedSnapshotId), `${label} seeks must reopen fresh production worlds`);
    assert.equal(new Set(seeks.map((seek) => seek.semanticHash)).size, 1, `${label} seeks diverged semantically`);
    assert.equal(seeks[0].semanticHash, receipt.value.stateHash, `${label} seek did not reproduce recorded hash`);
  }
  console.log("C40 Hammer terrain Meteor -> resolve -> catch V3 capture and fresh production seeks passed");
});
