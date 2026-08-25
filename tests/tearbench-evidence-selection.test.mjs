import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

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

test.after(() => { rmSync(temporaryRoot, { recursive: true, force: true }); });

test("documentation and governed plans select focused authority without gameplay builds", () => {
  for (const file of ["docs/example.md", "plans/current-alignment.md"]) {
    const selection = select([file]);
    assert.deepEqual(selection.routes, ["documentation-only"]);
    assert.deepEqual(selection.scenarios, []);
    assert.deepEqual(selection.buildTargets, []);
    assert.deepEqual(selection.authorityCommands, ["node scripts/check-docs.mjs"]);
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

test("current five-weapon live-versus-detached parity is mandatory in the canonical functional gate", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:browser:current-weapon-parity"], /tearbench parity current-weapons/u);
  assert.match(scripts["check:functional"], /pnpm test:browser:current-weapon-parity/u);
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
    ["wrong-subject", (entries) => {
      entries.find((entry) => entry.id === "hammer-meteor-terrain-catch-seek").tags.push("sword");
    }, /wrong weapon subject: expected sword/u],
    ["retired-weapon", (entries) => {
      entries.find((entry) => entry.id === "sword-reversal-threadcut-catch-seek").tags.push("spear");
    }, /references retired weapon: spear/u],
    ["missing-backend", (entries) => { entries.find((entry) => entry.id === "boot-start-run").testFiles = []; },
      /boot-start-run has no executable evidence backend/u],
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
});

test("dirty development evidence receipts remain bound to the executed source", () => {
  const artifact = join(temporaryRoot, `receipt-${String(artifactIndex++)}.json`);
  const result = spawnSync(process.execPath, [script, "evidence", "record", "--id", "identity-receipt-test",
    "--subject", "package.json", "--artifact", artifact, "--", "node", "--version"],
  { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(readFileSync(artifact, "utf8"));
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.commit, receipt.source.revision);
  assert.equal(receipt.worktreeFingerprint, receipt.source.worktreeFingerprint);
  assert.equal(receipt.scope.subject, "package.json");
  assert.equal(receipt.scope.id, receipt.id);
  assert.match(receipt.source.fingerprint, /^[0-9a-f]{64}$/u);
});

test("served build identity refuses stale revision and source fingerprint", async () => {
  const previousArgv = process.argv, previousLog = console.log;
  process.argv = [process.execPath, script, "identity-test-import"];
  console.log = () => {};
  let validateServedBuildIdentity, verifyCurrentWeaponParityExecution;
  try {
    ({ validateServedBuildIdentity, verifyCurrentWeaponParityExecution } = await import(pathToFileURL(script).href));
  } finally {
    console.log = previousLog;
    process.argv = previousArgv;
  }
  const source = { revision: "a".repeat(40), state: "dirty", fingerprint: "b".repeat(64) };
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
});
