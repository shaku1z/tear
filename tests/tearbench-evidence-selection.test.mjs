import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { isPassedTearBenchRunArtifact, materializedRunStatus } from "../scripts/tearbench-run-artifact.mjs";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts", "tearbench.mjs");
const routesPath = resolve(root, "src", "tearbench", "evidence-routes.json");
const catalogPath = resolve(root, "src", "tearbench", "canonical-scenarios.json");
const temporaryRoot = mkdtempSync(join(tmpdir(), "tearbench-evidence-selection-"));
let artifactIndex = 0;

function select(files, overrides = {}) {
  const artifact = join(temporaryRoot, `selection-${String(artifactIndex++)}.json`);
  const args = [script, "select", "--files", files.join(","), "--artifact", artifact];
  if (overrides.routes) args.push("--routes", overrides.routes);
  if (overrides.catalog) args.push("--catalog", overrides.catalog);
  if (overrides.executeEvidence) args.push("--execute-evidence");
  execFileSync(process.execPath, args, { cwd: root, stdio: "pipe" });
  return JSON.parse(readFileSync(artifact, "utf8"));
}

function rejected(files, overrides = {}) {
  const artifact = join(temporaryRoot, `failure-${String(artifactIndex++)}.json`);
  const args = [script, "select", "--files", files.join(","), "--artifact", artifact];
  if (overrides.routes) args.push("--routes", overrides.routes);
  if (overrides.catalog) args.push("--catalog", overrides.catalog);
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

function mutatedCatalog(name, mutate) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  mutate(catalog);
  const path = join(temporaryRoot, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(catalog)}\n`, "utf8");
  return path;
}

function mutatedRoutes(name, mutate) {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  mutate(routes);
  const path = join(temporaryRoot, `${name}.routes.json`);
  writeFileSync(path, `${JSON.stringify(routes)}\n`, "utf8");
  return path;
}

test.after(() => { rmSync(temporaryRoot, { recursive: true, force: true }); });

test("materialized run status fails closed for failed or truncated artifacts", () => {
  const cases = [
    ["failed", "failed"],
    ["truncated", "truncated"],
    ["passed", "passed"],
  ];
  for (const [name, status] of cases) {
    const artifact = join(temporaryRoot, `run-status-${name}.json`);
    writeFileSync(artifact, JSON.stringify({ format: "tearbench-run", status }));
    assert.equal(isPassedTearBenchRunArtifact(artifact), status === "passed", name);
  }
  const malformed = join(temporaryRoot, "run-status-malformed.json");
  writeFileSync(malformed, "not-json");
  assert.equal(isPassedTearBenchRunArtifact(malformed), false);
});

test("surgical artifacts pass only at their exact live horizon", () => {
  const base = { failures: [], maxTicks: 240, surgical: true, terminated: false };
  assert.equal(materializedRunStatus({ ...base, finalTick: 240, fixedTicks: 240 }), "passed");
  assert.equal(materializedRunStatus({ ...base, finalTick: 239, fixedTicks: 239 }), "truncated");
  assert.equal(materializedRunStatus({ ...base, finalTick: 240, fixedTicks: 239 }), "truncated");
  assert.equal(materializedRunStatus({ ...base, finalTick: 239, fixedTicks: 239, terminated: true }), "truncated");
  assert.equal(materializedRunStatus({ ...base, finalTick: 240, fixedTicks: 240, failures: [{ id: "wrong" }] }), "failed");
  assert.equal(materializedRunStatus({ failures: [], finalTick: 240, maxTicks: 240, fixedTicks: 240, surgical: false, terminated: false }), "truncated");
});

test("documentation and governed plans select focused authority without gameplay builds", () => {
  for (const file of ["docs/example.md", "plans/current-alignment.md"]) {
    const selection = select([file]);
    assert.deepEqual(selection.routes, ["documentation-only"]);
    assert.deepEqual(selection.scenarios, []);
    assert.deepEqual(selection.buildTargets, []);
    assert.deepEqual(selection.authorityCommands, ["node scripts/check-docs.mjs"]);
  }
});

test("specialized routes expose an owner and route-owned evidence", () => {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const specialized = routes.filter((route) => route.specialized === true);
  assert.ok(specialized.length > 0);
  for (const route of specialized) {
    assert.equal(typeof route.owner, "string", route.id);
    assert.ok(route.requiredScenarios?.length > 0 || route.reducedDisposition, route.id);
  }
});

test("specialized route ownership fails closed when its owner or scenario proof is removed", () => {
  const mutations = [
    ["missing-owner", (routes) => { delete routes.find((route) => route.id === "verdant-c6-rootbinder-network").owner; }, /missing an explicit owner/u],
    ["missing-scenario", (routes) => {
      const route = routes.find((entry) => entry.id === "verdant-c6-rootbinder-network");
      route.scenarios = [];
      route.requiredScenarios = [];
      delete route.reducedDisposition;
    }, /no specialized scenario or reduced disposition/u],
    ["invalid-prefix", (routes) => { routes.find((route) => route.id === "verdant-c6-rootbinder-network").prefixes.push("src/not-a-real-route/"); }, /no tracked repository match/u],
    ["production-missing-reduced-disposition", (routes) => {
      delete routes.find((route) => route.id === "production-replay-headless-composition").reducedDisposition;
    }, /no specialized scenario or reduced disposition/u],
  ];
  for (const [name, mutate, expected] of mutations) {
    const result = rejected(["src/gameplay/environment/environment-runtime.ts"], { routes: mutatedRoutes(name, mutate) });
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}\n${result.stdout}`, expected, name);
  }
});

test("production composition exposes all required hook-family dispositions", () => {
  const selection = select(["src/tearbench/production-replay-composition.ts"]);
  assert.deepEqual(selection.backendDispositions.map((entry) => entry.family), [
    "area-damage", "blade-contact", "boss-add-clone", "hazards-support", "source-void", "weapon-abilities", "weapon-world-contact",
  ]);
  assert.equal(selection.backendDispositions.find((entry) => entry.family === "source-void").disposition, "unsupported");
  assert.ok(selection.backendDispositions.every((entry) => entry.evidenceRoute === "production-replay-headless-composition"));
});

test("production hook-family coverage and evidence ownership fail closed", () => {
  const mutations = [
    ["missing-family", (routes) => {
      const route = routes.find((entry) => entry.id === "production-replay-headless-composition");
      route.backendDispositions = route.backendDispositions.filter((entry) => entry.family !== "area-damage");
    }, /hook-family coverage is incomplete/u],
    ["invalid-disposition", (routes) => {
      routes.find((entry) => entry.id === "production-replay-headless-composition").backendDispositions[0].disposition = "unknown";
    }, /invalid disposition or evidence owner/u],
    ["invalid-evidence-command", (routes) => {
      routes.find((entry) => entry.id === "production-replay-headless-composition").backendDispositions[0].authorityCommands = ["node -e \\\"process.exit(0)\\\""];
    }, /unsupported TearBench evidence command|unowned authority command/u],
  ];
  for (const [name, mutate, expected] of mutations) {
    const result = rejected(["src/tearbench/production-replay-composition.ts"], { routes: mutatedRoutes(name, mutate) });
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}\n${result.stdout}`, expected, name);
  }
});

test("documentation-only CI actually checks authority and skips gameplay", () => {
  const artifact = join(temporaryRoot, `ci-${String(artifactIndex++)}.json`);
  const result = spawnSync(process.execPath, [script, "ci", "--files", "docs/example.md", "--artifact", artifact],
    { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const evidence = JSON.parse(readFileSync(artifact, "utf8")).evidenceExecution;
  assert.equal(evidence.status, "passed");
  assert.deepEqual(evidence.executions.map((entry) => entry.command), ["node scripts/check-docs.mjs"]);
});

test("production weapon authority covers every actual current weapon mechanic", () => {
  const selection = select(["src/gameplay/weapon-selection.ts"]);
  assert.deepEqual(selection.routes, ["current-game-authority"]);
  for (const weapon of ["sword", "hammer", "greatsword", "chainblade", "riftlock"]) {
    assert.ok(selection.scenarios.some((id) => id.startsWith(`${weapon}-`)), weapon);
  }
  assert.deepEqual(selection.buildTargets, ["test-standalone"]);
  assert.equal(selection.currentWeaponParity.required, true);
  assert.deepEqual(selection.currentWeaponParity.weapons, ["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
  assert.equal(selection.currentWeaponParity.scenarios.length, selection.currentWeaponParity.weapons.length);
  assert.ok(selection.authorityCommands.includes(
    "pnpm exec vitest run tests/unit/current-headless-weapon-parity.test.ts"));
});

test("Bloom Well selection reports the declared live-only backend and complete lifecycle horizon", () => {
  const selection = select(["src/gameplay/environment/bloom-well.ts"]);
  assert.ok(selection.routes.includes("verdant-c5-bloom-well"));
  const bloom = selection.evidenceCommands.filter((entry) => entry.id === "verdant-bloom-well-cycle");
  assert.deepEqual(bloom.map((entry) => entry.backend), ["live"]);
  assert.equal(select(["src/gameplay/environment/bloom-well.ts"]).scenarios.includes("verdant-bloom-well-cycle"), true);
});

test("multi-backend scenarios materialize one backend-specific evidence command per declaration", () => {
  const selection = select(["src/app/replay-hub.ts"]);
  const boot = selection.evidenceCommands.filter((entry) => entry.id === "boot-start-run");
  assert.deepEqual(boot.map((entry) => entry.backend), ["live", "headless"]);
  assert.match(boot[0].command, /browser-current-gameplay-scenarios/u);
  assert.match(boot[1].command, /vitest run tests\/unit\/run-lifecycle\.test\.ts/u);
  assert.notEqual(boot[0].command, boot[1].command);
});

test("Bloom Well selection rejects detached claims and truncated lifecycle metadata", () => {
  const detached = mutatedCatalog("bloom-detached-backend", (entries) => {
    const bloom = entries.find((entry) => entry.id === "verdant-bloom-well-cycle");
    bloom.backends = ["live", "headless"];
  });
  const detachedResult = rejected(["src/gameplay/environment/bloom-well.ts"], { catalog: detached });
  assert.notEqual(detachedResult.status, 0);
  assert.match(`${detachedResult.stderr}\n${detachedResult.stdout}`, /environment subject requires a supported environment evidence backend|Bloom Well evidence is live-only/u);

  const truncated = mutatedCatalog("bloom-truncated-horizon", (entries) => {
    const bloom = entries.find((entry) => entry.id === "verdant-bloom-well-cycle");
    bloom.maxTicks = 720;
  });
  const truncatedResult = rejected(["src/gameplay/environment/bloom-well.ts"], { catalog: truncated });
  assert.notEqual(truncatedResult.status, 0);
  assert.match(`${truncatedResult.stderr}\n${truncatedResult.stdout}`, /Bloom Well lifecycle horizon/u);

  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  routes.find((entry) => entry.id === "verdant-c5-bloom-well").backend = "headless";
  const routePath = join(temporaryRoot, "bloom-invalid-backend-route.json");
  writeFileSync(routePath, JSON.stringify(routes), "utf8");
  const routeResult = rejected(["src/gameplay/environment/bloom-well.ts"], { routes: routePath });
  assert.notEqual(routeResult.status, 0);
  assert.match(`${routeResult.stderr}\n${routeResult.stdout}`, /unsupported backend disposition/u);
});

test("current weapon parity rejects a unit-only downgrade or unsupported detached backend", () => {
  const unitOnly = mutatedCatalog("unit-only-weapon-parity", (entries) => {
    entries.find((entry) => entry.subject?.id === "riftlock").evidence.command =
      "pnpm exec vitest run tests/unit/current-weapon-scenario-mechanics.test.ts";
  });
  const downgraded = rejected(["src/gameplay/weapon-selection.ts"], { catalog: unitOnly });
  assert.notEqual(downgraded.status, 0);
  assert.match(`${downgraded.stderr}\n${downgraded.stdout}`, /requires a source-bound live-to-detached browser proof/u);

  const liveOnly = mutatedCatalog("live-only-weapon-parity", (entries) => {
    entries.find((entry) => entry.subject?.id === "hammer").backends = ["live"];
  });
  const unsupported = rejected(["src/gameplay/weapon-selection.ts"], { catalog: liveOnly });
  assert.notEqual(unsupported.status, 0);
  assert.match(`${unsupported.stderr}\n${unsupported.stdout}`, /requires both live and headless backends/u);
});

test("canonical selection rejects exact start metadata instead of silently dropping it", () => {
  for (const [field, value] of [["stage", "grounds"], ["wave", 4], ["bossPhase", "2"]]) {
    const surgical = mutatedCatalog(`surgical-${field}`, (entries) => {
      entries.find((entry) => entry.id === "movement-jump").start[field] = value;
    });
    const result = rejected(["src/gameplay/stages.ts"], { catalog: surgical });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /exact .* state; use State Forge/u);
  }
});

test("Pale State Forge selection rejects detached descriptors, false claims, and ad hoc route proof", () => {
  const mutations = [
    ["pale-missing-descriptor", (entries) => { delete entries.find((entry) => entry.id === "pale-aurora-track-behavior").stateForge; }, /exact .* state; use State Forge/u],
    ["pale-plain-live-substitute", (entries) => {
      const entry = entries.find((candidate) => candidate.id === "pale-rime-runner-behavior");
      delete entry.stateForge;
      entry.start.stage = undefined;
      entry.start.wave = undefined;
      entry.evidence.command = "node tests/browser-pale-variants.js";
    }, /source-owned gameplay subject|unknown current gameplay subject|State Forge/u],
    ["pale-false-backend", (entries) => { entries.find((entry) => entry.id === "pale-prism-seer-behavior").backends = ["headless"]; }, /invalid State Forge descriptor|live-only/u],
    ["pale-false-publication", (entries) => { entries.find((entry) => entry.id === "pale-snowfall-kite-behavior").tags.push("published"); }, /invalid State Forge publication/u],
    ["pale-wrong-descriptor", (entries) => { entries.find((entry) => entry.id === "pale-white-hart-phase-2").stateForge.documentId = "pale-white-hart-phase-3"; }, /invalid State Forge descriptor/u],
    ["pale-unknown-subject", (entries) => { entries.find((entry) => entry.id === "pale-hailcaster-behavior").subject.id = "pale-not-a-real-subject"; }, /unknown current gameplay subject/u],
  ];
  for (const [name, mutate, expected] of mutations) {
    const result = rejected(["src/tearbench/canonical-scenarios.ts"], { catalog: mutatedCatalog(name, mutate) });
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}\n${result.stdout}`, expected, name);
  }
  const missingRouteProof = rejected(["src/gameplay/environment/aurora-track.ts"], {
    routes: mutatedRoutes("pale-empty-ad-hoc-route", (routes) => {
      const route = routes.find((entry) => entry.id === "pale-aurora-rimehound");
      route.requiredScenarios = [];
      route.scenarios = [];
      delete route.reducedDisposition;
    }),
  });
  assert.notEqual(missingRouteProof.status, 0);
  assert.match(`${missingRouteProof.stderr}\n${missingRouteProof.stdout}`, /no specialized scenario or reduced disposition/u);
});

test("current five-weapon live-versus-detached parity is mandatory in the canonical functional gate", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:browser:current-weapon-parity"], /tearbench parity current-weapons/u);
  assert.equal(scripts["test:headless:current-weapon-parity"],
    "pnpm exec vitest run tests/unit/current-headless-weapon-parity.test.ts");
  assert.match(scripts["check:functional"], /pnpm test:headless:current-weapon-parity/u);
  assert.equal(scripts["test:headless:current-gameplay-scenarios"],
    "pnpm exec vitest run tests/unit/current-headless-gameplay-scenarios.test.ts");
  assert.match(scripts["check:functional"], /pnpm test:headless:current-gameplay-scenarios/u);
  assert.equal(scripts["test:browser:current-gameplay-scenarios"], "node tests/browser-current-gameplay-scenarios.js");
  assert.match(scripts["check:functional"], /pnpm test:browser:current-gameplay-scenarios/u);
  assert.match(scripts["check:functional"], /pnpm test:browser:current-weapon-parity/u);
  assert.equal(scripts["test:tearbench-selection"], "node --test tests/tearbench-evidence-selection.test.mjs");
  assert.match(scripts["check:workspace"], /pnpm test:tearbench-selection/u);
  assert.match(scripts["check:functional"], /pnpm check:workspace/u);
});

test("boss, stage, progression, event, and player owners receive current mapped evidence", () => {
  for (const file of ["src/gameplay/stages.ts", "src/gameplay/run/boss-definitions.ts",
    "src/gameplay/upgrades.ts",
    "src/gameplay/run/mode-catalog.ts", "src/gameplay/run/difficulty-catalog.ts",
    "src/gameplay/run/live-content-runtime.ts", "src/gameplay/run/live-enemy-spawn.ts",
    "src/gameplay/scoring/coin-awards.ts"]) {
    assert.ok(select([file]).routes.includes("current-game-authority"), file);
  }
  const event = select(["src/gameplay/runtime/gameplay-events.ts"]);
  assert.ok(event.routes.includes("current-event-runtime"));
  assert.ok(event.scenarios.includes("source-void-low-hp-rescue-seek"));
  assert.ok(event.authorityCommands.includes("pnpm exec vitest run tests/unit/gameplay-causal-events.test.ts"));
  for (const file of ["src/app/replay-hub.ts", "src/agents/run-monitor.ts",
    "src/app/live-ghost-lab-home.ts", "src/presentation/screens/ghost-lab.ts"]) {
    const surface = select([file]);
    assert.ok(surface.routes.includes("current-player-surfaces"));
    assert.deepEqual(surface.journeyCommands, ["node tests/browser-ghost-lab-home.js"]);
  }
});

test("production replay/headless composition is explicitly dispositioned", () => {
  const selection = select(["src/tearbench/production-combat-phases.ts", "src/tearbench/production-replay-composition.ts",
    "src/tearbench/production-headless-environment.ts"]);
  assert.ok(selection.routes.includes("production-replay-headless-composition"));
  assert.ok(selection.buildTargets.includes("test-standalone"));
  assert.ok(selection.authorityCommands.some((command) => command.includes("production-headless-environment.test.ts")));
});

test("published stages select exactly six live boss encounters without preview leakage", () => {
  const selection = select(["src/gameplay/stages.ts"]);
  for (const id of ["warden-grounds-live-encounter", "colossus-undercroft-live-encounter",
    "aldric-crimson-fields-live-encounter", "rootbound-verdant-sanctum-live-encounter",
    "echo-voidspire-live-encounter", "source-void-low-hp-rescue-seek"]) {
    assert.ok(selection.scenarios.includes(id), id);
  }
  assert.equal(selection.scenarios.includes("white-hart-pale-traverse-foundation-live-encounter"), false);
  const shared = selection.evidenceCommands.filter((entry) => entry.command ===
    "pnpm build:test:standalone && node tests/browser-boss-parity.js");
  assert.equal(shared.length, 5);
});

test("Pale authorities select natural White Hart plus surgical and browser evidence", () => {
  const aurora = select(["src/gameplay/environment/aurora-track-runtime.ts"]);
  assert.ok(aurora.routes.includes("pale-aurora-rimehound"));
  assert.ok(aurora.authorityCommands.some((command) => command.includes("pale-state-forge-scenarios.test.ts")));
  assert.ok(aurora.journeyCommands.includes("node tests/browser-pale-presentation.js"));

  const rimehound = select(["src/gameplay/entities/enemy-types/rimehound.ts"]);
  assert.ok(rimehound.routes.includes("pale-aurora-rimehound"));
  assert.ok(rimehound.journeyCommands.includes("node tests/browser-pale-rimehound.js"));

  const variants = select(["tests/unit/pale-variant-selection.test.ts"]);
  assert.ok(variants.routes.includes("pale-variant-selection"));
  assert.ok(variants.journeyCommands.includes("node tests/browser-pale-variants.js"));

  const hart = select(["src/gameplay/entities/enemy-types/white-hart.ts"]);
  assert.ok(hart.routes.includes("pale-white-hart"));
  assert.ok(hart.scenarios.includes("white-hart-pale-traverse-foundation-live-encounter"));
  assert.ok(hart.journeyCommands.includes("node tests/browser-pale-white-hart-phases.js"));

  const reference = select(["src/game-reference/game-reference.ts"]);
  assert.ok(reference.routes.includes("pale-wave-reference"));
  assert.ok(reference.authorityCommands.some((command) => command.includes("tests/unit/game-reference.test.ts")));
  assert.ok(reference.scenarios.includes("white-hart-pale-traverse-foundation-live-encounter"));
});

test("missing, duplicate, retired, or mismatched production stage/boss evidence fails closed", () => {
  const mutations = [
    ["missing-warden-encounter", (entries) => {
      entries.splice(entries.findIndex((entry) => entry.id === "warden-grounds-live-encounter"), 1);
    }, /stage grounds requires exactly one warden boss scenario/u],
    ["duplicate-warden-encounter", (entries) => {
      const original = entries.find((entry) => entry.id === "warden-grounds-live-encounter");
      entries.push({ ...original, id: "warden-grounds-duplicate-live-encounter" });
    }, /stage grounds requires exactly one warden boss scenario/u],
    ["missing-grounds-stage", (entries) => {
      const scenario = entries.find((entry) => entry.id === "warden-grounds-live-encounter");
      scenario.tags = scenario.tags.filter((tag) => tag !== "grounds");
    }, /stage grounds is not mapped to its authored warden boss scenario/u],
    ["retired-boss-encounter", (entries) => {
      entries.push({ ...entries.find((entry) => entry.id === "warden-grounds-live-encounter"),
        id: "retired-boss-live-encounter", subject: { kind: "boss", id: "retired-boss" } });
    }, /references a retired or unknown production boss/u],
  ];
  for (const [name, mutate, expected] of mutations) {
    const result = rejected(["src/gameplay/stages.ts"], { catalog: mutatedCatalog(name, mutate) });
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}\n${result.stdout}`, expected);
  }
});

test("current production authority and player-surface contracts cannot silently lose coverage", () => {
  const selection = select(["src/gameplay/upgrades.ts"]);
  assert.ok(selection.authorityCommands.includes("pnpm exec vitest run tests/unit/tearbench-current-game-authority.test.ts"));

  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const surfaces = routes.find((route) => route.id === "current-player-surfaces");
  assert.ok(surfaces);
  for (const path of surfaces.prefixes) assert.equal(existsSync(resolve(root, path)), true, path);
  assert.deepEqual(surfaces.journeyCommands, ["node tests/browser-ghost-lab-home.js"]);
});

test("current Adaptive Soundtrack vendor changes select the existing audio lifecycle route", () => {
  const selection = select(["public/vendor/tear-music/adaptive-soundtrack.provenance.json"]);
  assert.ok(selection.routes.includes("audio"));
});

test("unclassified shared runtime conservatively retains current weapon coverage", () => {
  const selection = select(["src/simulation/new-runtime-boundary.ts"]);
  assert.deepEqual(selection.routes, ["shared-runtime"]);
  assert.ok(selection.scenarios.includes("sword-reversal-threadcut-catch-seek"));
  assert.ok(selection.scenarios.includes("riftlock-loose-cannon-catch-seek"));
});

test("mixed mapped and unmapped changes retain conservative shared-runtime evidence", () => {
  const selection = select(["src/gameplay/weapon-selection.ts", "src/unmapped/new-runtime-boundary.ts"]);
  assert.ok(selection.routes.includes("current-game-authority"));
  assert.ok(selection.routes.includes("shared-runtime"));
  assert.ok(selection.scenarios.includes("sword-reversal-threadcut-catch-seek"));
  assert.ok(selection.scenarios.includes("riftlock-loose-cannon-catch-seek"));
});

test("documentation plus an unmapped change cannot masquerade as documentation-only", () => {
  const selection = select(["docs/example.md", "src/unmapped/new-runtime-boundary.ts"]);
  assert.ok(selection.routes.includes("documentation-only"));
  assert.ok(selection.routes.includes("shared-runtime"));
  assert.ok(selection.scenarios.length > 0);
  assert.ok(selection.buildTargets.includes("test-standalone"));
});

test("protected and scheduled TearBench workflows inspect complete intended commit ranges", () => {
  const pullRequestWorkflow = readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8");
  const scheduledWorkflow = readFileSync(join(root, ".github", "workflows", "tearbench-program.yml"), "utf8");
  assert.match(pullRequestWorkflow, /github\.event\.before/u);
  assert.doesNotMatch(pullRequestWorkflow, /github\.sha\s*\}\}"\^/u);
  assert.doesNotMatch(scheduledWorkflow, /HEAD\^\s+HEAD/u);
  assert.match(scheduledWorkflow, /git rev-list --max-parents=0 HEAD/u);
  assert.ok((scheduledWorkflow.match(/fetch-depth: 0/gu) ?? []).length >= 2);
});

test("missing active weapon evidence fails closed", () => {
  const catalog = mutatedCatalog("missing-riftlock", (entries) => {
    entries.splice(entries.findIndex((entry) => entry.subject?.id === "riftlock"), 1);
  });
  const result = rejected(["src/gameplay/weapon-selection.ts"], { catalog });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /no TearBench scenario covers active weapon: riftlock/u);
});

test("retired weapon-mechanic terminology fails when the current production identity is missing", () => {
  const catalog = mutatedCatalog("retired-sword-mechanic", (entries) => {
    const sword = entries.find((entry) => entry.subject?.id === "sword");
    sword.id = "sword-seam-crosscut-catch-seek";
    sword.tags = ["sword", "seam", "crosscut", "catch"];
  });
  const result = rejected(["src/gameplay/weapon-selection.ts"], { catalog });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /omits current sword throw identity: Threadcut/u);
});

test("catalog starts cannot drift from the executable current browser proof", () => {
  const catalog = mutatedCatalog("stale-browser-start", (entries) => {
    entries.find((entry) => entry.subject?.id === "sword").start.mode = "campaign";
  });
  const result = rejected(["src/gameplay/weapon-selection.ts"], { catalog });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}\n${result.stdout}`, /browser evidence start disagrees with its catalog start/u);
});

test("wrong subject, retired content, missing backend, and impossible boss starts fail closed", () => {
  const mutations = [
    ["unknown-subject", (entries) => { entries.find((entry) => entry.id === "boot-start-run").subject.kind = "mystery"; },
      /malformed evidence subject/u],
    ["empty-subject", (entries) => { entries.find((entry) => entry.id === "boot-start-run").subject.id = ""; },
      /malformed evidence subject/u],
    ["unknown-gameplay-subject", (entries) => {
      entries.find((entry) => entry.id === "boot-start-run").subject.id = "invented-gameplay";
    }, /unknown current gameplay subject/u],
    ["unsupported-headless-gameplay-subject", (entries) => {
      entries.find((entry) => entry.subject.id === "parry").backends.push("headless");
    }, /no source-owned ordinary-headless subject transition/u],
    ["wrong-subject", (entries) => {
      entries.find((entry) => entry.id === "hammer-meteor-terrain-catch-seek").tags.push("sword");
    }, /wrong weapon subject: expected sword/u],
    ["retired-weapon", (entries) => {
      entries.find((entry) => entry.id === "sword-reversal-threadcut-catch-seek").tags.push("spear");
    }, /references retired weapon: spear/u],
    ["missing-backend", (entries) => {
      const scenario = entries.find((entry) => entry.id === "boot-start-run");
      scenario.testFiles = []; delete scenario.evidence;
    },
      /boot-start-run has no executable (?:live )?evidence backend/u],
    ["wrong-boss", (entries) => {
      entries.find((entry) => entry.id === "source-void-low-hp-rescue-seek").start.boss = "warden";
    }, /boss start requires its matching authoritative boss subject/u],
    ["disguised-boss", (entries) => {
      const boss = entries.find((entry) => entry.id === "source-void-low-hp-rescue-seek");
      boss.subject = { kind: "gameplay", id: "boss-disguise" };
      boss.backends = ["live", "headless"];
    }, /boss start requires its matching authoritative boss subject/u],
  ];
  for (const [name, mutate, expected] of mutations) {
    const result = rejected(["src/gameplay/weapon-selection.ts"], { catalog: mutatedCatalog(name, mutate) });
    assert.notEqual(result.status, 0, name);
    assert.match(`${result.stderr}\n${result.stdout}`, expected);
  }
});

test("unsafe evidence commands and unknown route references fail closed", () => {
  const catalog = mutatedCatalog("unsafe-command", (entries) => {
    entries.find((entry) => entry.id === "boot-start-run").evidence = { command: "node -e \"process.exit(0)\"" };
  });
  const unsafe = rejected(["src/app/replay-hub.ts"], { catalog });
  assert.notEqual(unsafe.status, 0);
  assert.match(`${unsafe.stderr}\n${unsafe.stdout}`, /unsupported TearBench evidence command/u);

  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  routes.find((route) => route.id === "current-game-authority").scenarios.push("unknown-scenario");
  const routePath = join(temporaryRoot, "unknown-route.json");
  writeFileSync(routePath, JSON.stringify(routes), "utf8");
  const unknown = rejected(["src/gameplay/weapon-selection.ts"], { routes: routePath });
  assert.notEqual(unknown.status, 0);
  assert.match(`${unknown.stderr}\n${unknown.stdout}`, /unknown TearBench scenario: unknown-scenario/u);
});

test("selected player journeys are actually dispatched through safe evidence execution", () => {
  const routes = JSON.parse(readFileSync(routesPath, "utf8"));
  const route = routes.find((entry) => entry.id === "current-player-surfaces");
  route.buildTargets = [];
  route.journeyCommands = ["node --check tests/browser-ghost-lab-home.js"];
  const routePath = join(temporaryRoot, "journey-fixture.json");
  writeFileSync(routePath, JSON.stringify(routes), "utf8");
  const catalog = mutatedCatalog("journey-execution", (entries) => {
    for (const id of ["boot-start-run", "draft-selection-to-gameplay"]) {
      entries.find((entry) => entry.id === id).evidence = { command: "node --check tests/browser-ghost-lab-home.js" };
    }
  });
  const selection = select(["src/app/replay-hub.ts"], { routes: routePath, catalog, executeEvidence: true });
  assert.equal(selection.evidenceExecution.status, "passed");
  assert.ok(selection.evidenceExecution.executions.some((entry) =>
    entry.id === "journey:node --check tests/browser-ghost-lab-home.js"));
  const executions = selection.evidenceExecution.executions.filter((entry) =>
    entry.command === "node --check tests/browser-ghost-lab-home.js");
  assert.equal(executions.length, 3);
  assert.equal(executions[0].reusedExecutionId, undefined);
  assert.ok(executions.slice(1).every((entry) => entry.reusedExecutionId === executions[0].id));
  assert.ok(executions.every((entry) => entry.receipts.some((receipt) => receipt.status === "passed")));
});

test("selection records timestamp, exact source identity, and explicit diff scope", () => {
  const selection = select(["docs/identity-check.md"]);
  assert.doesNotThrow(() => new Date(selection.generatedAt).toISOString());
  assert.match(selection.source.revision, /^[0-9a-f]{40}$/u);
  assert.match(selection.source.fingerprint, /^[0-9a-f]{64}$/u);
  assert.match(selection.source.worktreeFingerprint, /^[0-9a-f]{64}$/u);
  assert.ok(["clean", "dirty"].includes(selection.source.state));
  assert.deepEqual(selection.scope.changedFiles, ["docs/identity-check.md"]);
  assert.deepEqual(selection.scope.routes, selection.routes);
  assert.deepEqual(selection.scope.scenarios, selection.scenarios);
  assert.deepEqual(selection.scope.journeyCommands, selection.journeyCommands);
  assert.deepEqual(selection.scope.authorityCommands, selection.authorityCommands);
  assert.match(selection.scopeDigest, /^[0-9a-f]{64}$/u);
  assert.match(selection.routeDefinitionDigest, /^[0-9a-f]{64}$/u);
});

test("diff scope canonicalization deduplicates and sorts changed files", () => {
  const selection = select(["docs/z.md", "docs/a.md", "docs/z.md", "docs\\a.md"]);
  assert.deepEqual(selection.scope.changedFiles, ["docs/a.md", "docs/z.md"]);
  assert.equal(selection.changedFiles.join(","), "docs/a.md,docs/z.md");
});

test("dirty development evidence receipts remain bound to the executed source", () => {
  const id = `identity-receipt-${String(artifactIndex++)}`;
  const artifact = join(root, "artifacts", "tearbench", "receipts", `${id}.json`);
  const result = spawnSync(process.execPath, [script, "evidence", "record", "--id", id,
    "--artifact", artifact, "--", "node", "--version"],
  { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(readFileSync(artifact, "utf8"));
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.commit, receipt.source.revision);
  assert.equal(receipt.worktreeFingerprint, receipt.source.worktreeFingerprint);
  assert.equal(receipt.scope.subject, `artifacts/tearbench/generated/receipt-subjects/${id}.json`);
  assert.equal(receipt.scope.id, receipt.id);
  assert.match(receipt.source.fingerprint, /^[0-9a-f]{64}$/u);
});

test("evidence receipts reject noncanonical current artifact filenames", () => {
  const result = spawnSync(process.execPath, [script, "evidence", "record", "--id", "canonical-receipt-test",
    "--artifact", join(root, "artifacts", "tearbench", "receipts", "alternate-name.json"), "--", "node", "--version"],
  { cwd: root, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /receipt artifact must use the canonical/u);
});

test("served build identity refuses stale revision and source fingerprint", async () => {
  const previousArgv = process.argv, previousLog = console.log;
  process.argv = [process.execPath, script, "identity-test-import"];
  console.log = () => {};
  let canReuseDiffCapabilityReport, formatFailedEvidenceExecution, validateServedBuildIdentity, verifyCurrentWeaponParityExecution;
  try {
    ({ canReuseDiffCapabilityReport, formatFailedEvidenceExecution, validateServedBuildIdentity, verifyCurrentWeaponParityExecution } = await import(pathToFileURL(script).href));
  } finally {
    console.log = previousLog;
    process.argv = previousArgv;
  }
  const source = { revision: "a".repeat(40), state: "dirty", fingerprint: "b".repeat(64),
    worktreeFingerprint: "c".repeat(64) };
  const build = { target: "standalone", sha: source.revision, sourceRevision: source.revision,
    sourceState: source.state, sourceFingerprint: source.fingerprint, artifactHash: "c".repeat(64) };
  assert.equal(validateServedBuildIdentity(build, source), build);
  assert.throws(() => validateServedBuildIdentity({ ...build, sha: "d".repeat(40) }, source), /revision/u);
  assert.throws(() => validateServedBuildIdentity({ ...build, sourceFingerprint: "e".repeat(64) }, source), /fingerprint/u);

  const selection = { source, currentWeaponParity: { required: true,
    weapons: ["sword"], scenarios: ["sword-reversal-threadcut-catch-seek"] } };
  const receipt = { kind: "node", status: "passed", source };
  const execution = { id: selection.currentWeaponParity.scenarios[0], status: "passed", build, receipts: [receipt] };
  assert.equal(verifyCurrentWeaponParityExecution(selection, { status: "passed", executions: [execution] })
    .currentWeaponParity.status, "passed");
  assert.throws(() => verifyCurrentWeaponParityExecution(selection, { status: "passed", executions: [] }),
    /parity evidence is missing or failed/u);
  assert.throws(() => verifyCurrentWeaponParityExecution(selection, { status: "passed",
    executions: [{ ...execution, receipts: [{ ...receipt, source: { ...source, fingerprint: "e".repeat(64) } }] }] }),
  /stale source identity/u);

  const diagnostic = formatFailedEvidenceExecution({ status: "failed", executions: [{
    id: "linux-browser-proof", command: "node tests/browser-proof.js", status: "failed",
    receipts: [{ kind: "node", status: "failed", exitCode: 1, stdout: "captured stdout", stderr: "captured stderr" }],
  }] }, 80);
  assert.match(diagnostic, /linux-browser-proof/u);
  assert.match(diagnostic, /node tests\/browser-proof\.js/u);
  assert.match(diagnostic, /captured stdout/u);
  assert.match(diagnostic, /captured stderr/u);
  assert.equal(formatFailedEvidenceExecution({ status: "passed", executions: [] }), "");

  const scope = { kind: "diff", changedFiles: ["src/gameplay/weapon-selection.ts"], routes: ["current-game-authority"],
    scenarios: ["sword-reversal-threadcut-catch-seek"], journeyCheckpoints: ["current-game-authority"],
    buildTargets: ["test-standalone"], journeyCommands: [], authorityCommands: [], backendDispositions: [] };
  const reusableSelection = { source, scope, scopeDigest: "d".repeat(64), routeDefinitionDigest: "f".repeat(64) };
  const report = { format: "tearbench-diff-capability", schemaVersion: 2, kind: "last-run-diff", cumulative: false,
    status: "passed", source, scope, scopeDigest: reusableSelection.scopeDigest,
    routeDefinitionDigest: reusableSelection.routeDefinitionDigest };
  assert.equal(canReuseDiffCapabilityReport(reusableSelection, report), true);
  assert.equal(canReuseDiffCapabilityReport(reusableSelection, { ...report, format: "tearbench-current-capability" }), false);
  assert.equal(canReuseDiffCapabilityReport(reusableSelection, { ...report, scope: { ...scope, scenarios: [] } }), false);
  assert.equal(canReuseDiffCapabilityReport(reusableSelection, { ...report, scopeDigest: "e".repeat(64) }), false);
  assert.equal(canReuseDiffCapabilityReport({ ...reusableSelection, source: { ...source, state: "clean" } }, report), false);
  assert.equal(canReuseDiffCapabilityReport({ ...reusableSelection,
    source: { ...source, worktreeFingerprint: "0".repeat(64) } }, report), false);
  assert.equal(canReuseDiffCapabilityReport({ ...reusableSelection,
    routeDefinitionDigest: "1".repeat(64) }, report), false);

  const broaderRequestedScope = { ...scope,
    scenarios: [...scope.scenarios, "hammer-meteor-terrain-catch-seek"] };
  assert.equal(canReuseDiffCapabilityReport({ ...reusableSelection,
    scope: broaderRequestedScope }, report), false);
});
