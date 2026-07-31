/* eslint-disable @typescript-eslint/no-require-imports -- direct Node browser evidence script. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

// The live half of the C27A parity comparison. It captures, from the real
// application, the three things a detached world needs to be checked against:
// the State Forge origin snapshot, the sealed action schedule, and the
// authoritative per-tick state hashes. It is not itself a parity claim.
function scenarioFor(overrides) {
  return {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    version: 1,
    description: "C27A live authoritative trace for detached-world comparison",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    maxTicks: 180,
    assertions: ["runtime.finite-state", "player.finite-transform", "blade.finite-transform"],
    tags: ["c27a", "parity", "live-runtime"],
    ...overrides,
  };
}

// One scenario proves the pipe works; a matrix is what makes the shared-core
// claim more than anecdotal. Modes, difficulties, weapons, and run length all
// change which production code the tick executes.
const scenarios = [
  scenarioFor({
    id: "c27a.live-parity-trace",
    seed: "c27a-parity-seed",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.hard-hammer",
    seed: "c27a-parity-hard",
    start: { mode: "endless", difficulty: "hard", weapon: "hammer" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.playground",
    seed: "c27a-parity-playground",
    start: { mode: "playground", difficulty: "normal", weapon: "sword" },
  }),
  scenarioFor({
    id: "c27a.live-parity-trace.long",
    seed: "c27a-parity-long",
    start: { mode: "endless", difficulty: "normal", weapon: "sword" },
    maxTicks: 600,
  }),
];

function action(tick, id, command) {
  return { kind: "command", tick, id, command };
}

function actionsAt(tick) {
  if (tick === 2) return [action(tick, 1, { type: "aim", turn: 0, magnitude: 1000 })];
  if (tick === 4) return [action(tick, 2, { type: "move", x: 1000, y: 0 })];
  if (tick === 12) return [action(tick, 3, { type: "weapon", intent: "primary", phase: "pressed" })];
  if (tick === 40) return [action(tick, 4, { type: "weapon", intent: "primary", phase: "released" })];
  if (tick === 55) return [action(tick, 5, { type: "jump", phase: "pressed" })];
  if (tick === 56) return [action(tick, 6, { type: "jump", phase: "released" })];
  if (tick === 80) return [action(tick, 7, { type: "dash", x: 1000, y: 0 })];
  if (tick === 150) return [action(tick, 8, { type: "move", x: 0, y: 0 })];
  return [];
}

const ARTIFACT_DIR = path.join("artifacts", "tearbench", "c27a");

function artifactPath(scenario) {
  return path.join(ARTIFACT_DIR, `${scenario.id}.json`);
}

withJourney({ name: "C27A live parity trace", port: 8167 }, async ({ page }) => {
  await page.waitForFunction(() => window.__TEAR_RUNTIME_ENVIRONMENT__, undefined, { timeout: 15000 });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const written = [];

  for (const scenario of scenarios) {
    const schedule = Object.fromEntries(Array.from({ length: scenario.maxTicks }, (_, index) => {
      const tick = index + 1;
      return [tick, actionsAt(tick)];
    }));

    const captured = await page.evaluate(({ scenarioValue, scheduledActions }) => {
      const trace = (label) => {
        const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
        environment.reset(scenarioValue);
        // The origin snapshot is taken before the first stepped tick so a
        // detached world can start from exactly this state.
        const origin = environment.captureSnapshot(`${label}-origin`, "recorded-canonical");
        const hashes = [];
        const events = [];
        const checkpoints = [];
        for (let tick = 1; tick <= scenarioValue.maxTicks; tick += 1) {
          const transition = environment.step(scheduledActions[tick] ?? []);
          // A few full State Forge checkpoints make a hash mismatch diagnosable:
          // they say WHICH field diverged, not merely that something did.
          if (tick <= 3 || tick === 30 || tick === scenarioValue.maxTicks) {
            checkpoints.push({
              tick,
              canonical: environment.canonicalState(),
              state: environment.captureSnapshot(`${label}-tick-${String(tick)}`, "recorded-canonical").state,
            });
          }
          hashes.push({
            tick: transition.observation.tick,
            canonical: transition.info.canonicalStateHash,
            observed: transition.info.stateHash,
            // The canonical state is what the authoritative step hashed. Keeping
            // it per tick turns "the hashes differ" into "this field differs".
            state: environment.canonicalState(),
          });
          for (const event of transition.events) events.push({ tick: event.tick, type: event.type });
        }
        return {
          origin, hashes, events, checkpoints,
          rng: environment.rng(),
          finalObservation: environment.observe(),
        };
      };
      const first = trace("first");
      const second = trace("second");
      return { first, second };
    }, { scenarioValue: scenario, scheduledActions: schedule });

    const first = captured.first;
    const second = captured.second;
    const where = `${scenario.id} (${scenario.start.mode}/${scenario.start.difficulty}/${scenario.start.weapon})`;

    assert.equal(first.hashes.length, scenario.maxTicks, `${where}: the live trace must cover every scheduled tick`);
    assert.ok(first.hashes.every((entry) => typeof entry.canonical === "string" && entry.canonical.length > 0),
      `${where}: every live tick must publish an authoritative state hash`);
    assert.ok(new Set(first.hashes.map((entry) => entry.canonical)).size > 1,
      `${where}: a live trace whose hash never changes would not be exercising the world`);
    assert.deepEqual(first.hashes.map((entry) => entry.tick),
      Array.from({ length: scenario.maxTicks }, (_, index) => index + 1),
      `${where}: live ticks must advance one at a time from 1`);

    // Same seed, same actions, same application: the live side must be
    // deterministic before any detached comparison is meaningful.
    assert.deepEqual(second.hashes, first.hashes, `${where}: two live runs must produce one hash sequence`);
    assert.deepEqual(second.events, first.events, `${where}: two live runs must emit one event sequence`);
    assert.ok(first.checkpoints.length >= 3, `${where}: the live trace must carry diagnostic state checkpoints`);
    assert.deepEqual(second.rng, first.rng, `${where}: two live runs must end on one RNG state`);
    assert.ok(first.origin && typeof first.origin === "object", `${where}: the live trace must carry an origin snapshot`);

    const target = artifactPath(scenario);
    fs.writeFileSync(target, `${JSON.stringify({
      scenario, schedule, origin: first.origin, hashes: first.hashes, events: first.events,
      checkpoints: first.checkpoints,
      rng: first.rng, capturedAt: new Date().toISOString(),
    }, null, 2)}
`);
    written.push({ id: scenario.id, ticks: first.hashes.length, file: path.basename(target) });
    console.log(`  ${where}: ${String(first.hashes.length)} ticks`);
  }

  fs.writeFileSync(path.join(ARTIFACT_DIR, "live-parity-index.json"),
    `${JSON.stringify({ traces: written, capturedAt: new Date().toISOString() }, null, 2)}
`);
  console.log(`C27A live parity traces captured: ${String(written.length)} scenarios -> ${ARTIFACT_DIR}`);
});
