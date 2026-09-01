import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createTearBenchShadowPlan } from "../scripts/tearbench-shadow-plan.mjs";

const root = resolve(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const registry = readJson("src/tearbench/task-registry.json");
const policy = readJson("src/tearbench/evidence-policy.json");
const catalog = readJson("src/tearbench/canonical-scenarios.json");
const routes = readJson("src/tearbench/evidence-routes.json");

function combatSelection() {
  const route = routes.find((entry) => entry.id === "combat");
  const scenario = catalog.find((entry) => entry.id === "blade-valid-cut");
  const invariantScenario = catalog.find((entry) => (entry.assertions?.length ?? 0) > 0);
  assert.ok(route); assert.ok(scenario); assert.ok(invariantScenario);
  const command = scenario.evidence.command;
  const obligationBindings = route.interactionMatrices.map((matrix) => ({ route: route.id, obligation: `matrix:${matrix}`, commands: [command] }));
  const scenarioIds = [scenario.id, invariantScenario.id].sort();
  const scope = { kind: "diff", changedFiles: ["src/gameplay/combat/kill-runtime.ts"], routes: [route.id], scenarios: scenarioIds,
    journeyCheckpoints: [route.journeyCheckpoint], baseComparisons: [route.baseComparison], interactionMatrices: route.interactionMatrices,
    capabilityClaims: [], buildTargets: route.buildTargets, journeyCommands: [], authorityCommands: [], backendDispositions: [], obligationBindings };
  return { format: "tearbench-evidence-selection", schemaVersion: 1,
    source: { revision: "1".repeat(40), state: "clean", fingerprint: "2".repeat(64), worktreeFingerprint: "3".repeat(64) },
    routes: [route.id], routeScenarios: [{ routeId: route.id, scenarioIds }], scenarios: scenarioIds, graveyardCases: [], currentWeaponParity: { required: false },
    buildTargets: route.buildTargets, backendDispositions: [], obligationBindings, scope, scopeDigest: "4".repeat(64), routeDefinitionDigest: "5".repeat(64) };
}

test("shadow plan is deterministic, source-bound, explained, and complete", () => {
  const input = { registry, policy, selection: combatSelection(), catalog, routes, profileId: "development" };
  const left = createTearBenchShadowPlan(input), right = createTearBenchShadowPlan(input);
  assert.deepEqual(left, right);
  assert.equal(left.diagnostics.status, "complete");
  assert.match(left.planDigest, /^[0-9a-f]{64}$/u);
  assert.match(left.taskRegistryDigest, /^[0-9a-f]{16}$/u);
  assert.match(left.policyDigest, /^[0-9a-f]{64}$/u);
  assert.ok(left.obligations.some((entry) => entry.obligationId === "combat:matrix:frameRate"));
  assert.ok(left.obligations.some((entry) => entry.kind === "backend"));
  assert.ok(left.obligations.some((entry) => entry.kind === "invariant"));
  assert.ok(left.explanations.every((entry) => entry.selectedBecause.length > 0));
  assert.ok(left.diagnostics.taskReuse.length > 0);
  assert.deepEqual(left.diagnostics.profileOccurrenceDuplicates, []);
  assert.ok(left.obligations.some((entry) => entry.obligationId.includes("runtime.finite-state")));
  assert.ok(left.estimates.resourceTotals.length > 0);
  assert.ok(left.estimates.resourceContentionGroups.length > 0);
  assert.ok(left.dependencyGraph.edges.length > 0);
  const changed = structuredClone(input); changed.selection.scopeDigest = "6".repeat(64);
  assert.notEqual(createTearBenchShadowPlan(changed).planDigest, left.planDigest);
  for (const field of ["registry", "policy", "routes"]) {
    const drifted = structuredClone(input);
    if (field === "registry") drifted.registry.tasks[0].timeoutMs += 1;
    if (field === "policy") drifted.policy.schemaVersion = 99;
    if (field === "routes") drifted.selection.routeDefinitionDigest = "7".repeat(64);
    assert.notEqual(createTearBenchShadowPlan(drifted).planDigest, left.planDigest, field);
  }
});

test("shadow plan fails closed for missing matrix and backend task materialization", () => {
  const selection = combatSelection(); selection.obligationBindings = selection.obligationBindings.filter((entry) => entry.obligation !== "matrix:frameRate");
  const matrix = createTearBenchShadowPlan({ registry, policy, selection, catalog, routes, profileId: "development" });
  assert.equal(matrix.diagnostics.status, "incomplete");
  assert.ok(matrix.diagnostics.missing.includes("combat:matrix:frameRate"));
  const brokenCatalog = structuredClone(catalog);
  brokenCatalog.find((entry) => entry.id === "blade-valid-cut").backendTaskIds.live = [];
  const backend = createTearBenchShadowPlan({ registry, policy, selection: combatSelection(), catalog: brokenCatalog, routes, profileId: "development" });
  assert.equal(backend.diagnostics.status, "incomplete");
  assert.ok(backend.diagnostics.missing.includes("backend:blade-valid-cut:live"));
});

test("all six shadow profiles are represented without becoming authoritative", () => {
  for (const profileId of ["development", "pull-request", "protected-main", "release", "nightly", "endurance"]) {
    const plan = createTearBenchShadowPlan({ registry, policy, selection: combatSelection(), catalog, routes, profileId });
    assert.equal(plan.profileId, profileId); assert.equal(plan.executionMode, "shadow-only"); assert.equal(plan.authoritativeGateUnchanged, true);
    assert.equal(plan.diagnostics.status, "complete", profileId);
  }
});

test("planner classifies profile duplicates, task reuse, replicas, and selected graveyard cases without execution", () => {
  const selected = combatSelection();
  selected.graveyardCases = ["audio-lifecycle-history"];
  const mutatedRegistry = structuredClone(registry);
  mutatedRegistry.profiles.nightly.push(mutatedRegistry.profiles.nightly[0]);
  const markerTask = mutatedRegistry.tasks.find((task) => task.taskId === "graveyard.audio-lifecycle-history");
  markerTask.runner.executable = "this-executable-must-never-run";
  markerTask.intentionalReplica = "independent-rerun";
  markerTask.replicaGroup = "graveyard-canary";
  const plan = createTearBenchShadowPlan({ registry: mutatedRegistry, policy, selection: selected, catalog, routes, profileId: "nightly" });
  assert.equal(plan.diagnostics.status, "complete");
  assert.deepEqual(plan.diagnostics.profileOccurrenceDuplicates,
    [{ taskId: mutatedRegistry.profiles.nightly[0], occurrenceCount: 2 }]);
  assert.ok(plan.diagnostics.taskReuse.length > 0);
  assert.ok(plan.diagnostics.intentionalReplicas.some((entry) => entry.taskId === "graveyard.audio-lifecycle-history"
    && entry.classification === "independent-rerun" && entry.replicaGroup === "graveyard-canary"));
  assert.ok(plan.requiredTaskIds.includes("graveyard.audio-lifecycle-history"));
});

test("CLI shadow planning covers every route family and conservative selection boundary", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/u).filter(Boolean).map((path) => path.replaceAll("\\", "/"));
  const prefixMatches = (file, prefix) => prefix.endsWith("/") || prefix.endsWith("-") ? file.startsWith(prefix) : file === prefix;
  const cases = routes.map((route) => {
    const file = tracked.find((candidate) => route.prefixes.some((prefix) => prefixMatches(candidate, prefix)));
    assert.ok(file, `route ${route.id} has no tracked shadow fixture`); return { id: route.id, files: file };
  });
  cases.push({ id: "mapped-plus-unmapped", files: "src/gameplay/combat/kill-runtime.ts,unmapped-shadow-fixture.txt" });
  cases.push({ id: "central-fanout", files: "src/tearbench/evidence-routes.json" });
  for (const fixture of cases) {
    const artifact = resolve(root, "artifacts", "tearbench", "generated", `shadow-route-${fixture.id}.json`);
    execFileSync(process.execPath, [resolve(root, "scripts", "tearbench.mjs"), "plan", "--profile", "development", "--files", fixture.files, "--artifact", artifact], { cwd: root, stdio: "pipe" });
    const plan = JSON.parse(readFileSync(artifact, "utf8"));
    assert.equal(plan.diagnostics.status, "complete", fixture.id); assert.equal(plan.executionMode, "shadow-only", fixture.id);
    rmSync(artifact, { force: true });
  }
});
