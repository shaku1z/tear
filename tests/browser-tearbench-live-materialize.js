/*
 * C26 live-run materializer.
 *
 * This is deliberately a browser script, rather than a Node simulation
 * adapter: it drives the actual test-build gameplay composition through the
 * immutable Class A TearBench bridge.  The bridge is compiled only when
 * __TEAR_TEST_BUILD__ is true, and this runner refuses every other build
 * directory before opening a browser.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "src", "tearbench", "canonical-scenarios.json"), "utf8"));
const BLOOM_WELL_SCENARIO_ID = "verdant-bloom-well-cycle";
const BLOOM_WELL_LIFECYCLE_TICKS = 744;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new TypeError(`${name} requires a value`);
  return value;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unavailable";
  }
}

function parseMaxTicks(value, maximum) {
  const ticks = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(ticks) || ticks < 1 || ticks > maximum) {
    throw new RangeError(`--max-ticks must be an integer from 1 through the selected scenario horizon ${String(maximum)}`);
  }
  return ticks;
}

function generatedActions(maxTicks) {
  const entries = [
    [1, { type: "move", x: 1000, y: 0 }],
    [10, { type: "jump", phase: "pressed" }],
    [11, { type: "jump", phase: "released" }],
    [25, { type: "dash", x: 1000, y: 0 }],
    [40, { type: "aim", turn: 0, magnitude: 1000 }],
    [41, { type: "weapon", intent: "primary", phase: "pressed" }],
    [43, { type: "weapon", intent: "primary", phase: "released" }],
    [80, { type: "move", x: -1000, y: 0 }],
  ].filter(([tick]) => tick <= maxTicks);
  return entries.map(([tick, command], index) => ({ kind: "command", tick, id: index + 1, command }));
}

function readActionTrace(file, maxTicks) {
  if (file === undefined) return generatedActions(maxTicks);
  const parsed = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const actions = Array.isArray(parsed) ? parsed : parsed.actions;
  return validateActionTrace(actions, maxTicks, "--actions");
}

function validateActionTrace(actions, maxTicks, source) {
  if (!Array.isArray(actions)) throw new TypeError(`${source} must contain an array of command envelopes`);
  const normalized = actions.map((entry) => ({ ...entry }));
  let previousId = 0;
  for (const entry of normalized) {
    if (entry?.kind !== "command" || !Number.isSafeInteger(entry.tick) || entry.tick < 1 || entry.tick > maxTicks
      || !Number.isSafeInteger(entry.id) || entry.id <= previousId || entry.command === null || typeof entry.command !== "object") {
      throw new TypeError(`${source} contains an invalid, out-of-range, or non-monotonic command envelope`);
    }
    previousId = entry.id;
  }
  return normalized;
}

function readProductionHeadlessTerminal(file) {
  const parsed = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
    || parsed.format !== "tearbench-production-headless-terminal" || parsed.schemaVersion !== 1) {
    throw new TypeError("--production-headless-terminal must contain a versioned C30 terminal artifact");
  }
  const scenario = parsed.scenario;
  if (scenario === null || typeof scenario !== "object" || Array.isArray(scenario)
    || scenario.format !== "tear-contract" || scenario.kind !== "scenario" || scenario.schemaVersion !== 1
    || typeof scenario.id !== "string" || !Number.isSafeInteger(scenario.version)
    || typeof scenario.description !== "string" || scenario.stateClass !== "recorded-canonical"
    || scenario.executionClass !== "training" || typeof scenario.seed !== "string" || !Number.isSafeInteger(scenario.maxTicks)
    || scenario.maxTicks < 1 || scenario.maxTicks > 720) {
    throw new TypeError("--production-headless-terminal scenario is not a TearScenarioV1 coordinate");
  }
  const start = scenario.start;
  if (start === null || typeof start !== "object" || Array.isArray(start)
    || start.mode !== "endless" || !["normal", "onehit"].includes(start.difficulty) || start.weapon !== "sword"
    || Object.keys(start).some((key) => !["mode", "difficulty", "weapon"].includes(key))) {
    throw new TypeError("--production-headless-terminal currently admits natural endless/normal-or-onehit/sword runs only");
  }
  const terminal = parsed.terminal;
  if (terminal === null || typeof terminal !== "object" || Array.isArray(terminal)
    || !Number.isSafeInteger(terminal.tick) || terminal.tick < 1 || terminal.tick > scenario.maxTicks
    || typeof terminal.semanticHash !== "string" || !/^[a-f0-9]{16}$/u.test(terminal.semanticHash)
    || typeof terminal.terminated !== "boolean" || typeof terminal.truncated !== "boolean"
    || terminal.terminated === terminal.truncated) {
    throw new TypeError("--production-headless-terminal has an invalid terminal disposition");
  }
  return Object.freeze({
    scenario: Object.freeze({ ...scenario, start: Object.freeze({ ...start }) }),
    actions: Object.freeze(validateActionTrace(parsed.actions, terminal.tick, "--production-headless-terminal actions")),
    terminal: Object.freeze({ ...terminal }),
  });
}

function readJsonOption(name) {
  const file = option(name);
  return file === undefined ? undefined : JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function normalizePresentation(parsed) {
  if (parsed === undefined) return Object.freeze({
    viewport: Object.freeze({ width: 1600, height: 900 }),
    colorScheme: "no-preference",
    reducedMotion: "no-preference",
  });
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("--presentation must contain an object");
  const presentation = { ...parsed };
  if (presentation.viewport !== undefined) {
    const viewport = presentation.viewport;
    if (viewport === null || typeof viewport !== "object" || Array.isArray(viewport)
      || !Number.isSafeInteger(viewport.width) || !Number.isSafeInteger(viewport.height)
      || viewport.width < 320 || viewport.width > 3840 || viewport.height < 240 || viewport.height > 2160) {
      throw new TypeError("--presentation viewport must be an integer width/height within the supported browser bounds");
    }
  }
  if (presentation.colorScheme !== undefined && !["light", "dark", "no-preference"].includes(presentation.colorScheme)) {
    throw new TypeError("--presentation colorScheme is invalid");
  }
  if (presentation.reducedMotion !== undefined && !["reduce", "no-preference"].includes(presentation.reducedMotion)) {
    throw new TypeError("--presentation reducedMotion is invalid");
  }
  return Object.freeze(presentation);
}

function readPresentation(file, fallback) {
  return normalizePresentation(file === undefined ? fallback : JSON.parse(fs.readFileSync(path.resolve(file), "utf8")));
}

function actionSchedule(actions) {
  const schedule = {};
  for (const entry of actions) (schedule[entry.tick] ??= []).push(entry);
  return schedule;
}

function relativeArtifactPath(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

/** Run TearBench's canonical invariant implementation after the browser bridge returns its real observations. */
async function validateLiveObservations(observations, assertions) {
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const { runInvariantChecks } = await server.ssrLoadModule("/src/tearbench/invariants.ts");
    const failures = [];
    for (let index = 0; index < observations.length; index += 1) {
      failures.push(...runInvariantChecks(observations[index], assertions, undefined, observations[index - 1]));
    }
    return failures;
  } finally {
    await server.close();
  }
}

async function validateCanonicalStructuredAssertions(observations, assertions) {
  if (assertions.length === 0) return;
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const { assertCanonicalStructuredObservations } = await server.ssrLoadModule("/src/tearbench/canonical-structured-assertions.ts");
    assertCanonicalStructuredObservations(assertions, observations);
  } finally {
    await server.close();
  }
}

/** Resolve the source-owned canonical scenario so browser artifacts carry the
 * same effective assertions as the typed runner. */
async function loadCanonicalScenario(entry) {
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const { materializeCanonicalScenario } = await server.ssrLoadModule("/src/tearbench/canonical-scenarios.ts");
    const { paleCanonicalDocumentForScenario } = await server.ssrLoadModule("/src/tearbench/pale-canonical-scenario-bridge.ts");
    const { resolveTearSdl } = await server.ssrLoadModule("/src/tearbench/tearsdl.ts");
    const scenario = materializeCanonicalScenario(entry);
    const document = paleCanonicalDocumentForScenario(scenario.id);
    return Object.freeze({ scenario, resolved: document === undefined ? undefined : resolveTearSdl(document) });
  } finally {
    await server.close();
  }
}

const requestedDirectory = process.env.TEAR_BROWSER_BUILD_DIR;
if (requestedDirectory !== undefined && requestedDirectory !== "test-standalone") {
  throw new Error("C26 live materialization only accepts dist/test-standalone; production and non-test builds are forbidden");
}

const headlessTerminalPath = option("--production-headless-terminal");
const headlessTerminal = headlessTerminalPath === undefined ? undefined : readProductionHeadlessTerminal(headlessTerminalPath);
if (headlessTerminal !== undefined && (process.argv.includes("--scenario") || (process.argv[2] !== undefined && !process.argv[2].startsWith("--"))
  || option("--seed") !== undefined || option("--max-ticks") !== undefined || option("--actions") !== undefined
  || option("--snapshot") !== undefined || option("--replay-context") !== undefined)) {
  throw new TypeError("--production-headless-terminal owns scenario, seed, horizon, actions, and origin; do not override them");
}
const scenarioId = headlessTerminal?.scenario.id ?? (process.argv.includes("--scenario") ? option("--scenario") : process.argv[2]);
if (!scenarioId) throw new TypeError("usage: node tests/browser-tearbench-live-materialize.js <scenario-id> [--seed value] [--max-ticks value] [--actions path] [--snapshot state-forge-snapshot.json] [--presentation inputs.json] [--artifact path] | --production-headless-terminal terminal.json [--artifact path]");
const catalogEntry = catalog.find((entry) => entry.id === scenarioId);
if (!catalogEntry) throw new RangeError(`unknown canonical TearBench scenario: ${scenarioId}`);
const seed = headlessTerminal?.scenario.seed ?? option("--seed", "1001");
const maxTicks = headlessTerminal?.scenario.maxTicks
  ?? parseMaxTicks(option("--max-ticks", String(Math.min(catalogEntry.maxTicks, 120))), catalogEntry.maxTicks);
if (catalogEntry.id === BLOOM_WELL_SCENARIO_ID && maxTicks !== BLOOM_WELL_LIFECYCLE_TICKS) {
  throw new RangeError(`${BLOOM_WELL_SCENARIO_ID} requires its complete ${String(BLOOM_WELL_LIFECYCLE_TICKS)}-tick live lifecycle`);
}
const submittedActions = headlessTerminal?.actions ?? readActionTrace(option("--actions"), maxTicks);
const replayContextArtifact = readJsonOption("--replay-context");
if (replayContextArtifact !== undefined && (replayContextArtifact.format !== "tearbench-run" || replayContextArtifact.replayContext === undefined)) {
  throw new TypeError("--replay-context must contain a materialized tearbench-run with persisted replayContext");
}
const explicitSnapshot = readJsonOption("--snapshot");
if (explicitSnapshot !== undefined && replayContextArtifact !== undefined) throw new TypeError("--snapshot and --replay-context cannot be combined");
const requestedSnapshot = explicitSnapshot ?? replayContextArtifact?.replayContext.initialSnapshot;
if (requestedSnapshot !== undefined && (requestedSnapshot.format !== "tear-contract" || requestedSnapshot.kind !== "snapshot" || requestedSnapshot.schemaVersion !== 1)) {
  throw new TypeError("--snapshot must contain a persisted TearSnapshotV1 State Forge artifact");
}
if (option("--presentation") !== undefined && replayContextArtifact !== undefined) throw new TypeError("--presentation and --replay-context cannot be combined");
const presentation = readPresentation(option("--presentation"), replayContextArtifact?.replayContext.presentation);
const defaultArtifact = path.join(root, "artifacts", "tearbench", "live", `${scenarioId}-${seed}-${maxTicks}.json`);
const artifactPath = path.resolve(option("--artifact", defaultArtifact));
const artifactStem = artifactPath.replace(/\.json$/u, "");
const actionTracePath = `${artifactStem}.actions.json`;
const screenshotPath = `${artifactStem}.png`;
const scenarioStart = headlessTerminal?.scenario.start ?? catalogEntry.start;
const runtimeScenario = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: catalogEntry.id,
  version: 1,
  description: headlessTerminal?.scenario.description ?? catalogEntry.description,
  // Natural live reset is intentionally restricted to canonical, reachable
  // opening states. Surgical state construction belongs to State Forge.
  stateClass: "recorded-canonical",
  executionClass: headlessTerminal?.scenario.executionClass ?? "engineering",
  seed,
  start: scenarioStart,
  maxTicks,
  assertions: [],
  tags: [...catalogEntry.tags, ...(headlessTerminal === undefined ? ["c26"] : ["c30", "headless-terminal-rerun"]), "live-runtime-materialized"],
};

async function main() {
const { materializedRunStatus } = await import("../scripts/tearbench-run-artifact.mjs");
const canonicalLaunch = await loadCanonicalScenario(catalogEntry);
const canonicalScenario = canonicalLaunch.scenario;
if (catalogEntry.stateForge !== undefined && seed !== canonicalScenario.seed) {
  throw new RangeError(`canonical State Forge scenario ${scenarioId} requires its authoritative catalog seed ${canonicalScenario.seed}`);
}
Object.assign(runtimeScenario, {
  subject: canonicalScenario.subject,
  backends: canonicalScenario.backends,
  stateClass: canonicalScenario.stateClass,
  seed: canonicalScenario.seed,
  // The typed canonical materializer owns assertion applicability. Adding
  // privileged checks here would make ordinary non-boss/non-UI subjects lie.
  assertions: canonicalScenario.assertions,
});
let materialized;
await withJourney({
  name: `C26 live TearBench materialization (${scenarioId})`, port: 8166,
  viewport: presentation.viewport,
  colorScheme: presentation.colorScheme,
  reducedMotion: presentation.reducedMotion,
}, async ({ page }) => {
  const result = await page.evaluate(({ scenario, resolved, schedule, actions, snapshot }) => {
    if (!window.__TEAR_RUNTIME_ENVIRONMENT__) throw new Error("test-only Tear runtime bridge was not installed");
    const environment = window.__TEAR_RUNTIME_ENVIRONMENT__.create("A");
    if (resolved !== undefined) {
      const forged = environment.forgeResolvedScenario(resolved);
      if (!forged.ok) throw new Error(`canonical State Forge launch failed for ${scenario.id}: ${forged.phase} ${JSON.stringify(forged.issues)}`);
    } else {
      environment.reset(scenario);
    }
    const expectedSnapshotClass = scenario.stateClass;
    const expectedSnapshotSeed = resolved === undefined ? undefined : scenario.seed;
    const initialSnapshot = snapshot ?? environment.captureSnapshot(
      `c26-${scenario.id}-initial`, expectedSnapshotClass,
      resolved === undefined ? undefined : expectedSnapshotSeed,
    );
    if (resolved !== undefined && (initialSnapshot.stateClass !== expectedSnapshotClass || initialSnapshot.seed !== expectedSnapshotSeed)) {
      throw new Error(`initial snapshot provenance does not match canonical scenario ${scenario.id}`);
    }
    if (snapshot) {
      const restored = environment.restoreSnapshot(snapshot);
      if (!restored.ok) throw new Error(`State Forge snapshot restore failed during materialization: ${restored.phase}`);
    }
    const observations = [environment.observe()];
    const transitions = [];
    for (let tick = 1; tick <= scenario.maxTicks; tick += 1) {
      const transition = environment.step(schedule[tick] ?? []);
      transitions.push(transition);
      observations.push(transition.observation);
      if (transition.terminated) break;
    }
    const screenshot = environment.screenshot();
    return {
      accessClass: environment.accessClass,
      observations,
      events: environment.events(),
      transitions: transitions.map((transition) => ({
        tick: transition.observation.tick,
        acceptedActions: transition.actions,
        terminated: transition.terminated,
        truncated: transition.truncated,
        stateHash: transition.info.stateHash,
        canonicalStateHash: transition.info.canonicalStateHash,
      })),
      submittedActions: actions,
      metrics: environment.metrics(),
      semanticHash: environment.stateHash(),
      screenshot,
      initialSnapshot,
    };
  }, { scenario: runtimeScenario, resolved: canonicalLaunch.resolved, schedule: actionSchedule(submittedActions), actions: submittedActions, snapshot: requestedSnapshot });
  materialized = result;
});

assert.ok(materialized, "the live browser materializer returned no run result");
assert.equal(materialized.accessClass, "A", "C26 materializer must use the privileged test-build runtime only");
assert.equal(materialized.observations[0]?.tick, 0, "live trace starts at fixed tick zero");
assert.ok(materialized.observations.length >= 2, "live trace must contain an actual stepped observation");
const finalObservation = materialized.observations.at(-1);
const terminalTransition = materialized.transitions.at(-1);
assert.equal(materialized.metrics.fixedTicks, finalObservation.tick, "materialized ticks come from the live fixed-step scheduler");
assert.equal(materialized.metrics.acceptedActions, submittedActions.length, "all persisted commands were accepted by the live bridge");
assert.ok(materialized.events.some((event) => event.type === "run.started"), "live event stream must include run.started");
assert.match(materialized.screenshot, /^data:image\/png;base64,/u, "live materialization captures a rendered PNG");
if (headlessTerminal !== undefined) {
  assert.deepEqual(materialized.submittedActions, headlessTerminal.actions,
    "the browser rerun must consume the terminal artifact's exact accepted command trace");
  assert.equal(finalObservation.tick, headlessTerminal.terminal.tick,
    "the browser rerun must reach the terminal artifact's fixed-tick horizon");
  assert.equal(terminalTransition?.terminated, headlessTerminal.terminal.terminated,
    "the browser rerun must retain the terminal disposition");
  assert.equal(terminalTransition?.truncated, headlessTerminal.terminal.truncated,
    "the browser rerun must retain the terminal truncation disposition");
}

const buildDirectory = path.join(root, "dist", "test-standalone");
assert.ok(fs.existsSync(path.join(buildDirectory, "index.html")), "dist/test-standalone is required; run pnpm build:test:standalone first");
const servedBuildInfo = JSON.parse(fs.readFileSync(path.join(buildDirectory, "build-info.json"), "utf8"));
assert.equal(servedBuildInfo.format, "tear-build-info", "materialization requires attributed build-info metadata");
assert.equal(servedBuildInfo.target, "standalone", "materialization only accepts the standalone test target");
assert.equal(typeof servedBuildInfo.mode, "string", "materialization requires the served build mode");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const revision = servedBuildInfo.sourceRevision ?? gitRevision();
const build = {
  version: packageJson.version,
  revision,
  sha: servedBuildInfo.sha,
  target: servedBuildInfo.target,
  mode: servedBuildInfo.mode,
  runtimeTarget: "test-standalone-live-runtime",
  rulesetVersion: "tear-live-runtime-v1",
  artifactHash: servedBuildInfo.artifactHash,
  sourceRevision: servedBuildInfo.sourceRevision,
  sourceState: servedBuildInfo.sourceState,
  sourceFingerprint: servedBuildInfo.sourceFingerprint,
  contentHash: `sha256:${servedBuildInfo.artifactHash}`,
  // The scenario, action trace, fixed-tick horizon, and State Forge state are
  // replay coordinates. They must be allowed to shrink during C26
  // minimization without pretending the compiled build/configuration changed.
  configHash: sha256(canonicalJson({ target: servedBuildInfo.target, mode: servedBuildInfo.mode, presentation })),
};
const actionTrace = {
  format: "tearbench-semantic-action-trace",
  schemaVersion: 1,
  scenarioId: runtimeScenario.id,
  scenarioVersion: runtimeScenario.version,
  seed,
  actions: submittedActions,
  actionsHash: sha256(canonicalJson(submittedActions)),
};
const failures = await validateLiveObservations(materialized.observations, runtimeScenario.assertions);
await validateCanonicalStructuredAssertions(materialized.observations, catalogEntry.structuredAssertions ?? []);
const artifact = {
  format: "tearbench-run",
  schemaVersion: 1,
  // A replay artifact is evidence for a particular build. Including the
  // resolved revision keeps two clean-worktree materializations from silently
  // sharing an ID during branch comparison/minimization.
  id: `live-${scenarioId}-${seed}-${maxTicks}-${revision.slice(0, 16)}`.replace(/[^a-zA-Z0-9._-]/gu, "_"),
  createdAt: new Date().toISOString(),
  build,
  resolvedScenario: runtimeScenario,
  seed,
  status: materializedRunStatus({
    failures, finalTick: finalObservation.tick, maxTicks,
    fixedTicks: materialized.metrics.fixedTicks,
    surgical: runtimeScenario.stateClass === "surgical-valid" && catalogEntry.stateForge !== undefined,
    terminated: terminalTransition?.terminated === true,
  }),
  ticks: finalObservation.tick,
  actions: submittedActions,
  events: materialized.events,
  observations: materialized.observations,
  metrics: materialized.metrics,
  failures,
  console: [],
  hashes: { semantic: materialized.semanticHash },
  attachments: {
    actionTrace: relativeArtifactPath(actionTracePath),
    screenshot: relativeArtifactPath(screenshotPath),
  },
  rerun: {
    scenarioId: runtimeScenario.id,
    scenarioVersion: runtimeScenario.version,
    seed,
    actionTrace: relativeArtifactPath(actionTracePath),
  },
  replayContext: {
    initialSnapshot: materialized.initialSnapshot,
    presentation,
  },
  liveRuntime: {
    evidenceClass: "A",
    bridge: "__TEAR_RUNTIME_ENVIRONMENT__.create('A')",
    buildDirectory: "dist/test-standalone",
    submittedActions: submittedActions.length,
    transitionHashes: materialized.transitions,
    presentation,
    ...(headlessTerminal === undefined ? {} : {
      headlessTerminal: {
        format: "tearbench-production-headless-terminal", schemaVersion: 1,
        terminal: headlessTerminal.terminal,
      },
    }),
  },
};

fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(actionTracePath, `${JSON.stringify(actionTrace, null, 2)}\n`);
fs.writeFileSync(screenshotPath, Buffer.from(materialized.screenshot.slice("data:image/png;base64,".length), "base64"));
fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`${artifact.status.toUpperCase()} ${scenarioId} seed=${seed} ticks=${String(artifact.ticks)} class=A live-runtime${headlessTerminal === undefined ? "" : " headless-terminal-rerun"}`);
console.log(`artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
