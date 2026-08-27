import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSourceIdentitySync } from "./release-artifact.mjs";
import { createReleaseCertificate, verifyReleaseEvidenceManifest } from "./tearbench-release-evidence-verifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const catalogPath = resolve(option("--catalog", resolve(root, "src", "tearbench", "canonical-scenarios.json")));
const evidenceRoutesPath = resolve(option("--routes", resolve(root, "src", "tearbench", "evidence-routes.json")));
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const evidenceRoutes = JSON.parse(await readFile(evidenceRoutesPath, "utf8"));

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function scenarioById(id) {
  const scenario = catalog.find((entry) => entry.id === id);
  if (!scenario) throw new RangeError(`unknown TearBench scenario: ${id}`);
  return scenario;
}

const weaponSource = await readFile(resolve(root, "src", "gameplay", "weapon-selection.ts"), "utf8");
const weaponDefinitionSource = await readFile(resolve(root, "src", "gameplay", "weapons.ts"), "utf8");
const stageSource = await readFile(resolve(root, "src", "gameplay", "stages.ts"), "utf8");
const bossDefinitionSource = await readFile(resolve(root, "src", "gameplay", "run", "boss-definitions.ts"), "utf8");
const tearbenchRegistrySource = await readFile(resolve(root, "src", "tearbench", "registries.ts"), "utf8");

function currentGameplayScenarioSubjects(name) {
  const match = tearbenchRegistrySource.match(new RegExp(
    `export const ${name}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\s*as const\\)`, "u",
  ));
  if (match === null) throw new TypeError(`could not read the current ${name} scenario capability authority`);
  const ids = [...match[1].matchAll(/"([a-z][a-z0-9-]*)"/gu)].map((entry) => entry[1]);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new TypeError(`invalid current ${name} scenario capability authority`);
  }
  return ids;
}

function activeWeaponIds() {
  const match = weaponSource.match(/export const WEAPON_IDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s*as const\)/u);
  if (!match) throw new TypeError("could not read the production weapon catalog for evidence coverage");
  const ids = [...match[1].matchAll(/"([a-z][a-z0-9-]*)"/gu)].map((entry) => entry[1]);
  if (ids.length === 0) throw new TypeError("production weapon catalog is empty for evidence coverage");
  return ids;
}

function retiredWeaponIds() {
  const match = weaponSource.match(/export const WEAPON_SELECTION_MIGRATION\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\s*as const/u);
  if (!match) throw new TypeError("could not read the production weapon migration catalog for evidence validation");
  return [...match[1].matchAll(/^\s*([a-z][a-z0-9-]*)\s*:/gmu)].map((entry) => entry[1]);
}

function currentWeaponThrowIdentities() {
  const matches = [...weaponDefinitionSource.matchAll(
    /^\s{4}id:\s*"([a-z][a-z0-9-]*)",[\s\S]*?^\s{4}throwIdentity:\s*"([^"]+)"/gmu,
  )];
  const identities = new Map(matches.map((match) => [match[1], match[2]]));
  for (const weapon of activeWeaponIds()) {
    if (!identities.has(weapon)) throw new TypeError(`production weapon ${weapon} has no source-owned throw identity`);
  }
  return identities;
}

function currentStageBossPairs() {
  const pairs = [...stageSource.matchAll(
    /^\s{4}id:\s*"([a-z][a-z0-9-]*)",[\s\S]*?^\s{4}boss:\s*"([a-z][a-z0-9-]*)"/gmu,
  )].map((entry) => Object.freeze({ stage: entry[1], boss: entry[2] }));
  const stageIds = pairs.map((pair) => pair.stage);
  const bossIds = [...bossDefinitionSource.matchAll(/Object\.freeze\(\{\s*id:\s*"([a-z][a-z0-9-]*)"/gu)]
    .map((entry) => entry[1]);
  if (stageIds.length === 0 || bossIds.length !== pairs.length
    || new Set(stageIds).size !== stageIds.length || new Set(bossIds).size !== bossIds.length
    || pairs.some((pair) => !bossIds.includes(pair.boss))) {
    throw new RangeError("production stage/boss ownership has missing, retired, duplicated, or mismatched definitions");
  }
  return Object.freeze(pairs);
}

function sharedBossProofIds(source) {
  if (!source.includes("require(\"../src/tearbench/canonical-scenarios.json\")")
    || !source.includes("entry.subject.kind === \"boss\"") || !source.includes(".startBoss(")
    || !source.includes("for (const bossId of BOSSES)") || !source.includes(".bossStage(id)")
    || !source.includes(".engineEventProjection()")) {
    throw new TypeError("shared production boss proof has no inspectable source-derived encounter and biome evidence");
  }
  const ids = catalog.filter((entry) => entry.subject?.kind === "boss").map((entry) => entry.subject.id);
  const production = currentStageBossPairs().map((pair) => pair.boss);
  if (ids.length !== production.length || ids.some((id, index) => id !== production[index])) {
    throw new RangeError("shared production boss proof does not exactly cover the current authored boss catalog");
  }
  return ids;
}

function safeRepoFile(path, pattern, label) {
  if (typeof path !== "string" || !pattern.test(path) || path.includes("..")) {
    throw new TypeError(`unsafe ${label} path in TearBench evidence command: ${String(path)}`);
  }
  const absolute = resolve(root, path);
  if (relative(root, absolute).replaceAll("\\", "/") !== path || !existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new RangeError(`TearBench evidence ${label} does not name an existing repository file: ${path}`);
  }
  return absolute;
}

function parseApprovedEvidenceCommand(command) {
  if (typeof command !== "string" || command.trim() === "") throw new TypeError("TearBench evidence command is empty");
  const parts = command.split("&&").map((part) => part.trim());
  if (parts.some((part) => part === "" || /[;&|<>`$()"']/u.test(part))) {
    throw new TypeError(`unsupported TearBench evidence command: ${command}`);
  }
  return parts.map((part) => {
    const tokens = part.split(/\s+/u);
    if (part === "pnpm build:test:standalone") return { kind: "build" };
    if (part === "node scripts/check-docs.mjs") {
      return { kind: "docs-check", file: safeRepoFile("scripts/check-docs.mjs", /^scripts\/check-docs\.mjs$/u, "docs authority checker") };
    }
    if (tokens[0] === "pnpm" && tokens[1] === "exec" && tokens[2] === "vitest" && tokens[3] === "run" && tokens.length > 4) {
      return { kind: "vitest", files: tokens.slice(4).map((file) =>
        safeRepoFile(file, /^tests\/[A-Za-z0-9._/-]+\.ts$/u, "unit test")) };
    }
    if (tokens[0] === "node" && tokens.length === 2) {
      return { kind: "node", file: safeRepoFile(tokens[1], /^tests\/browser-[A-Za-z0-9._-]+\.js$/u, "browser proof") };
    }
    if (tokens[0] === "node" && tokens[1] === "--check" && tokens.length === 3
      && tokens[2] === "tests/browser-ghost-lab-home.js") {
      return { kind: "node-check", file: safeRepoFile(tokens[2], /^tests\/browser-[A-Za-z0-9._-]+\.js$/u, "check fixture") };
    }
    throw new TypeError(`unsupported TearBench evidence command: ${command}`);
  });
}

function validateScenarioMetadata(scenario) {
  const surgicalFields = ["stage", "wave", "bossPhase"].filter((field) =>
    scenario.start !== null && typeof scenario.start === "object" && Object.hasOwn(scenario.start, field));
  if (surgicalFields.length > 0) {
    throw new RangeError(`scenario ${scenario.id} requests exact ${surgicalFields.join(", ")} state; use State Forge`);
  }
  if (Object.hasOwn(scenario, "backends") && (!Array.isArray(scenario.backends) || scenario.backends.length === 0
    || scenario.backends.some((backend) => !["live", "headless"].includes(backend)))) {
    throw new TypeError(`scenario ${scenario.id} has invalid evidence backends`);
  }
  const subject = scenario.subject;
  if (subject === undefined) return;
  if (subject === null || typeof subject !== "object" || !["gameplay", "weapon", "boss", "environment-field", "environment-combat-object"].includes(subject.kind)
    || typeof subject.id !== "string" || subject.id.trim() === "") {
    throw new TypeError(`scenario ${scenario.id} has malformed evidence subject`);
  }
  if (scenario.start?.boss !== undefined && (subject.kind !== "boss" || subject.id !== scenario.start.boss)) {
    throw new TypeError(`scenario ${scenario.id} boss start requires its matching authoritative boss subject`);
  }
  if (subject.kind === "gameplay") {
    if (!currentGameplayScenarioSubjects("GAMEPLAY_SCENARIO_SUBJECT_IDS").includes(subject.id)) {
      throw new RangeError(`scenario ${scenario.id} has an unknown current gameplay subject: ${subject.id}`);
    }
    if (scenario.backends?.includes("headless")
      && !currentGameplayScenarioSubjects("HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS").includes(subject.id)) {
      throw new RangeError(`scenario ${scenario.id} has no source-owned ordinary-headless subject transition`);
    }
  } else if (subject.kind === "weapon") {
    const peers = [scenario.weapon, scenario.source?.weapon, scenario.source?.id, scenario.start?.weapon,
      scenario.start?.subject?.weapon, scenario.start?.subject?.id].filter((value) => typeof value === "string");
    if (peers.some((value) => value !== subject.id)) {
      throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${subject.id}`);
    }
    const identity = currentWeaponThrowIdentities().get(subject.id);
    if (identity === undefined) throw new RangeError(`scenario ${scenario.id} has no current production weapon identity`);
    const normalizedIdentity = identity.toLowerCase().replace(/[^a-z0-9]/gu, "");
    const declaredIdentity = `${scenario.id} ${(scenario.tags ?? []).join(" ")}`.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (!declaredIdentity.includes(normalizedIdentity)) {
      throw new RangeError(`scenario ${scenario.id} omits current ${subject.id} throw identity: ${identity}`);
    }
  } else if (subject.kind === "boss") {
    if (scenario.start?.mode !== "bossonly" || scenario.start?.boss !== subject.id
      || !Array.isArray(scenario.backends) || scenario.backends.length !== 1 || scenario.backends[0] !== "live") {
      throw new TypeError(`scenario ${scenario.id} boss subject requires live-only bossonly evidence`);
    }
  } else if (subject.kind === "environment-field" || subject.kind === "environment-combat-object") {
    const expected = subject.kind === "environment-field" ? "generic-field" : "generic-combat-object";
    if (subject.id !== expected || !Array.isArray(scenario.backends) || scenario.backends.length !== 1 || scenario.backends[0] !== "live") {
      throw new TypeError(`scenario ${scenario.id} environment subject requires live-only generic evidence`);
    }
  }
  const command = scenario.evidence?.command;
  if (typeof command !== "string") return;
  const proof = parseApprovedEvidenceCommand(command).find((entry) => entry.kind === "node");
  if (proof === undefined) return;
  const source = readFileSync(proof.file, "utf8");
  if (subject.kind === "gameplay"
    && relative(root, proof.file).replaceAll("\\", "/") === "tests/browser-current-gameplay-scenarios.js") {
    if (!source.includes("require(\"../src/tearbench/canonical-scenarios.json\")")
      || !source.includes("entry.subject.kind === \"gameplay\"")
      || !source.includes("environment.reset(scenario)") || !source.includes(`case "${subject.id}":`)) {
      throw new RangeError(`scenario ${scenario.id} shared browser evidence does not exercise its ${subject.id} subject`);
    }
    return;
  }
  if ((subject.kind === "environment-field" || subject.kind === "environment-combat-object")
    && relative(root, proof.file).replaceAll("\\", "/") === "tests/browser-current-gameplay-scenarios.js") {
    if (!source.includes("entry.subject.kind === \"environment-field\"")
      || !source.includes("entry.subject.kind === \"environment-combat-object\"")
      || !source.includes("environment.environment()")) {
      throw new RangeError(`scenario ${scenario.id} shared browser evidence does not exercise its environment subject`);
    }
    return;
  }
  if (subject.kind === "boss" && relative(root, proof.file).replaceAll("\\", "/") === "tests/browser-boss-parity.js") {
    if (!sharedBossProofIds(source).includes(subject.id)) {
      throw new RangeError(`scenario ${scenario.id} shared boss evidence does not execute ${subject.id}`);
    }
    return;
  }
  const starts = [...source.matchAll(
    /start:\s*Object\.freeze\(\{\s*mode:\s*"([^"]+)",\s*difficulty:\s*"([^"]+)",\s*weapon:\s*"([^"]+)"/gu,
  )];
  if (starts.length === 0) throw new TypeError(`scenario ${scenario.id} browser evidence has no inspectable start`);
  for (const [, mode, difficulty, weapon] of starts) {
    if (mode !== scenario.start?.mode || difficulty !== scenario.start?.difficulty || weapon !== scenario.start?.weapon) {
      throw new RangeError(`scenario ${scenario.id} browser evidence start disagrees with its catalog start`);
    }
  }
}

function evidenceCommandForScenario(scenario) {
  const command = scenario.evidence?.command;
  if (typeof command === "string" && command.trim() !== "") {
    parseApprovedEvidenceCommand(command);
    return { backend: "catalog-command", command };
  }
  if (Array.isArray(scenario.testFiles) && scenario.testFiles.length > 0
    && scenario.testFiles.every((file) => typeof file === "string" && file.trim() !== "")) {
    const derivedCommand = `pnpm exec vitest run ${scenario.testFiles.join(" ")}`;
    parseApprovedEvidenceCommand(derivedCommand);
    return { backend: "catalog-test-files", command: derivedCommand };
  }
  throw new RangeError(`scenario ${scenario.id} has no executable evidence backend`);
}

function validateScenarioSubject(scenario) {
  validateScenarioMetadata(scenario);
  const retired = new Set(retiredWeaponIds());
  const declared = [scenario.weapon, scenario.subject?.kind === "weapon" ? scenario.subject.id : undefined]
    .filter((weapon) => typeof weapon === "string");
  const retiredSubject = (scenario.tags ?? []).find((tag) => retired.has(tag)) ?? declared.find((weapon) => retired.has(weapon));
  if (retiredSubject) throw new RangeError(`scenario ${scenario.id} references retired weapon: ${retiredSubject}`);
}

function validateActiveWeaponSubject(scenario, weapon) {
  const declared = [scenario.weapon, scenario.subject?.kind === "weapon" ? scenario.subject.id : undefined]
    .find((value) => typeof value === "string");
  if (declared !== undefined && declared !== weapon) {
    throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${weapon}, found ${declared}`);
  }
  if (declared === undefined && !scenario.id.startsWith(`${weapon}-`)) {
    throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${weapon}`);
  }
}

function routeScenarioIds(route) {
  if (typeof route.id !== "string" || !Array.isArray(route.prefixes) || !Array.isArray(route.scenarios)) {
    throw new TypeError(`malformed TearBench evidence route: ${String(route.id)}`);
  }
  for (const command of [...(route.journeyCommands ?? []), ...(route.authorityCommands ?? [])]) parseApprovedEvidenceCommand(command);
  const ids = new Set(route.scenarios);
  for (const id of ids) { const scenario = scenarioById(id); validateScenarioSubject(scenario); evidenceCommandForScenario(scenario); }
  for (const subject of route.scenarioSubjects ?? []) {
    if (subject === "active-weapons") {
      for (const weapon of activeWeaponIds()) {
        const matches = catalog.filter((scenario) => (Array.isArray(scenario.tags) && scenario.tags.includes(weapon))
          || (scenario.subject?.kind === "weapon" && scenario.subject.id === weapon));
        if (matches.length === 0) throw new RangeError(`no TearBench scenario covers active weapon: ${weapon}`);
        for (const scenario of matches) { validateScenarioSubject(scenario); validateActiveWeaponSubject(scenario, weapon); ids.add(scenario.id); }
      }
    } else if (subject === "current-stage-bosses") {
      const pairs = currentStageBossPairs();
      const encounters = catalog.filter((scenario) => scenario.subject?.kind === "boss");
      for (const scenario of encounters) {
        if (!pairs.some((pair) => pair.boss === scenario.subject.id)) {
          throw new RangeError(`scenario ${scenario.id} references a retired or unknown production boss`);
        }
      }
      for (const { stage, boss } of pairs) {
        const matches = encounters.filter((scenario) => scenario.subject.id === boss);
        if (matches.length !== 1) throw new RangeError(`production stage ${stage} requires exactly one ${boss} boss scenario`);
        const scenario = matches[0];
        if (!Array.isArray(scenario.tags) || !scenario.tags.includes(stage)) {
          throw new RangeError(`production stage ${stage} is not mapped to its authored ${boss} boss scenario`);
        }
        validateScenarioSubject(scenario);
        evidenceCommandForScenario(scenario);
        ids.add(scenario.id);
      }
    } else {
      throw new TypeError(`unknown TearBench route scenario subject: ${String(subject)}`);
    }
  }
  for (const id of ids) { const scenario = scenarioById(id); validateScenarioSubject(scenario); evidenceCommandForScenario(scenario); }
  return [...ids];
}

for (const route of evidenceRoutes) routeScenarioIds(route);
if (!evidenceRoutes.some((route) => route.id === "shared-runtime")) {
  throw new TypeError("TearBench evidence routes must include a shared-runtime fallback");
}

function buildTestStandalone() {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
  const build = spawnSync(process.execPath, [pnpmEntry, "build:test:standalone"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`test-build materialization build failed:\n${build.stderr || build.stdout}`);
}

function materializeLiveRun(scenario, seed, artifactPath, actionTracePath, maxTicks = scenario.maxTicks, contextPaths = {}, replayContextPath) {
  const argumentsList = ["tests/browser-tearbench-live-materialize.js", scenario.id, "--seed", seed, "--max-ticks", String(maxTicks), "--artifact", artifactPath];
  if (actionTracePath) argumentsList.push("--actions", actionTracePath);
  if (contextPaths.snapshotPath) argumentsList.push("--snapshot", contextPaths.snapshotPath);
  if (contextPaths.presentationPath) argumentsList.push("--presentation", contextPaths.presentationPath);
  if (replayContextPath) argumentsList.push("--replay-context", replayContextPath);
  return spawnSync(process.execPath, argumentsList, { cwd: root, encoding: "utf8" });
}

function runLiveMaterializer(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath) {
  buildTestStandalone();
  const invocations = [];
  for (let index = 0; index < repeat; index += 1) {
    const attemptArtifact = index === repeat - 1 ? artifactPath : artifactPath.replace(/\.json$/u, `.attempt-${String(index + 1)}.json`);
    const result = materializeLiveRun(scenario, seed, attemptArtifact, actionTracePath, Math.min(720, scenario.maxTicks), {}, replayContextPath);
    invocations.push({ index, status: result.status, stdout: result.stdout, stderr: result.stderr, artifact: attemptArtifact });
    if (result.status !== 0) break;
  }
  return invocations;
}

function runFiles(files) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
  return spawnSync(process.execPath, [pnpmEntry, "exec", "vitest", "run", ...files], {
    cwd: root,
    encoding: "utf8",
  });
}

async function changedFiles() {
  const file = option("--files-from");
  if (file) return (await readFile(resolve(file), "utf8")).split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
  const inline = option("--files", "");
  return inline.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function currentWeaponParityPlan(routes, scenarioIds) {
  const required = routes.some((route) => (route.scenarioSubjects ?? []).includes("active-weapons"));
  if (!required) return Object.freeze({ required: false, weapons: Object.freeze([]), scenarios: Object.freeze([]) });
  const headlessProof = safeRepoFile("tests/unit/current-headless-weapon-parity.test.ts",
    /^tests\/unit\/current-headless-weapon-parity\.test\.ts$/u, "current production-headless weapon proof");
  const headlessSource = readFileSync(headlessProof, "utf8");
  if (!headlessSource.includes("it.each(WEAPON_IDS)") || !headlessSource.includes("createProductionHeadlessEnvironment")
    || !headlessSource.includes("environment.step(actions)") || !headlessSource.includes("blade.thrown")
    || !headlessSource.includes("projectile.spawned")) {
    throw new TypeError("active weapons require source-derived ordinary-headless mechanic and native-event evidence");
  }
  const weapons = activeWeaponIds();
  const scenarios = weapons.map((weapon) => {
    const matches = catalog.filter((scenario) => scenario.subject?.kind === "weapon" && scenario.subject.id === weapon);
    if (matches.length !== 1) throw new RangeError(`active weapon ${weapon} requires exactly one current parity scenario`);
    const scenario = matches[0];
    if (!scenarioIds.includes(scenario.id)) throw new RangeError(`active weapon ${weapon} parity scenario was not selected`);
    if (!Array.isArray(scenario.backends) || !scenario.backends.includes("live") || !scenario.backends.includes("headless")) {
      throw new RangeError(`active weapon ${weapon} requires both live and headless backends`);
    }
    const browser = parseApprovedEvidenceCommand(evidenceCommandForScenario(scenario).command)
      .find((entry) => entry.kind === "node");
    const source = browser === undefined ? "" : readFileSync(browser.file, "utf8");
    const browserPath = browser === undefined ? "" : relative(root, browser.file).replaceAll("\\", "/");
    const expectedProof = new RegExp(`^tests/browser-c40-${weapon}-[A-Za-z0-9._-]+-ghost-seek\\.js$`, "u");
    if (browser === undefined || !expectedProof.test(browserPath) || !source.includes(".seek(")
      || !source.includes('entry.value.kind === "authoritative-hash"')
      || !/assert\.equal\(\s*seeks\[0\]\.semanticHash\s*,\s*receipt\.value\.stateHash\s*,/u.test(source)) {
      throw new TypeError(`active weapon ${weapon} requires a source-bound live-to-detached browser proof`);
    }
    return scenario.id;
  });
  return Object.freeze({ required: true, weapons: Object.freeze(weapons), scenarios: Object.freeze(scenarios) });
}

function evidenceForDiff(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const matched = evidenceRoutes.filter((route) =>
    normalized.some((file) => route.prefixes.some((prefix) => file.startsWith(prefix))));
  const unmatched = normalized.filter((file) =>
    !evidenceRoutes.some((route) => route.prefixes.some((prefix) => file.startsWith(prefix))));
  const fallback = evidenceRoutes.find((route) => route.id === "shared-runtime");
  const selected = [...matched];
  if ((selected.length === 0 || unmatched.length > 0) && fallback !== undefined && !selected.includes(fallback)) {
    selected.push(fallback);
  }
  if (selected.length === 0) throw new TypeError("TearBench evidence selection has no applicable route");
  const collect = (field) => [...new Set(selected.flatMap((route) => route[field] ?? []))].sort();
  const scenarios = [...new Set(selected.flatMap((route) => routeScenarioIds(route)))].sort();
  const currentWeaponParity = currentWeaponParityPlan(selected, scenarios);
  const authorityCommands = collect("authorityCommands");
  if (currentWeaponParity.required) {
    const command = "pnpm exec vitest run tests/unit/current-headless-weapon-parity.test.ts";
    parseApprovedEvidenceCommand(command);
    if (!authorityCommands.includes(command)) authorityCommands.push(command);
    authorityCommands.sort();
  }
  return {
    format: "tearbench-evidence-selection",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: readSourceIdentity(),
    changedFiles: normalized,
    routes: selected.map((route) => route.id).sort(),
    scenarios,
    currentWeaponParity,
    evidenceCommands: scenarios.map((id) => ({ id, ...evidenceCommandForScenario(scenarioById(id)) })),
    graveyardCases: collect("graveyardCases"),
    journeyCheckpoints: [...new Set(selected.map((route) => route.journeyCheckpoint))].sort(),
    baseComparisons: [...new Set(selected.map((route) => route.baseComparison))].sort(),
    interactionMatrices: collect("interactionMatrices"),
    buildTargets: collect("buildTargets"),
    journeyCommands: collect("journeyCommands"),
    authorityCommands,
    scope: Object.freeze({
      kind: "diff", changedFiles: Object.freeze([...normalized]),
      routes: Object.freeze(selected.map((route) => route.id).sort()),
      scenarios: Object.freeze([...scenarios]),
      journeyCheckpoints: Object.freeze([...new Set(selected.map((route) => route.journeyCheckpoint))].sort()),
      buildTargets: Object.freeze(collect("buildTargets")),
    }),
    unrelatedUnitTestsAreGameplayEvidence: false,
  };
}

function executeApprovedEvidence(command, state) {
  const steps = parseApprovedEvidenceCommand(command), receipts = [];
  for (const step of steps) {
    const before = readSourceIdentity();
    if (state.source === undefined) state.source = before;
    else if (state.source.fingerprint !== before.fingerprint || state.source.revision !== before.revision) {
      throw new Error("selected evidence source changed before execution");
    }
    let result;
    if (step.kind === "build") {
      if (state.testStandaloneBuilt) { receipts.push({ kind: step.kind, status: "skipped", reason: "deduplicated test-standalone build" }); continue; }
      result = spawnSync(process.execPath, [resolve(root, "scripts", "build-target.mjs"), "test-standalone"], { cwd: root, encoding: "utf8" });
      if (result.status === 0) state.testStandaloneBuilt = true;
    } else if (step.kind === "vitest") {
      result = spawnSync(process.execPath, [resolve(root, "node_modules", "vitest", "vitest.mjs"), "run", ...step.files], { cwd: root, encoding: "utf8" });
    } else if (step.kind === "docs-check") {
      result = spawnSync(process.execPath, [step.file], { cwd: root, encoding: "utf8" });
    } else {
      result = spawnSync(process.execPath, step.kind === "node-check" ? ["--check", step.file] : [step.file], { cwd: root, encoding: "utf8" });
    }
    const after = readSourceIdentity();
    if (after.fingerprint !== before.fingerprint || after.revision !== before.revision) {
      throw new Error(`selected evidence command changed source identity (${step.kind})`);
    }
    if (step.kind === "build" && result.status === 0) state.build = validateServedBuildIdentity(readServedBuildInfo(), after);
    const receipt = { kind: step.kind, status: result.status === 0 ? "passed" : "failed", exitCode: result.status ?? 1,
      stdout: result.stdout ?? "", stderr: result.stderr ?? "", source: after, ...(state.build === undefined ? {} : { build: state.build }) };
    receipts.push(receipt);
    if (receipt.status !== "passed") break;
  }
  return { status: receipts.length === steps.length && receipts.every((entry) => entry.status === "passed" || entry.status === "skipped")
    ? "passed" : "failed", receipts };
}

function writeCurrentCapabilityReport(scope, state, executions) {
  if (scope.scenarios.length === 0 && scope.buildTargets.length === 0 && scope.journeyCommands.length === 0) return undefined;
  const report = {
    format: "tearbench-current-capability", schemaVersion: 1, generatedAt: new Date().toISOString(),
    executionClass: "engineering", source: state.source ?? readSourceIdentity(),
    ...(state.build === undefined ? {} : { build: state.build }),
    scope: Object.freeze({ ...scope, scenarios: [...scope.scenarios], journeyCommands: [...scope.journeyCommands], buildTargets: [...scope.buildTargets] }),
    status: executions.every((entry) => entry.status === "passed") ? "passed" : "failed", executions,
  };
  const path = resolve(root, "artifacts", "tearbench", "generated", "current-capability.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return workspaceRelativePath(path);
}

function executeSelectedEvidence(scenarios, journeyCommands = [], buildTargets = [], authorityCommands = [], scope = {}) {
  const state = { testStandaloneBuilt: false, source: readSourceIdentity() }, executions = [], completedCommands = new Map();
  const executionScope = { scenarios: [...scenarios], journeyCommands: [...journeyCommands], buildTargets: [...buildTargets], ...scope };
  const runOne = (id, command, backend = "catalog-command") => {
    const completed = completedCommands.get(command);
    if (completed !== undefined) {
      executions.push({ ...completed, id, backend, reusedExecutionId: completed.id });
      return true;
    }
    const execution = executeApprovedEvidence(command, state);
    const result = { id, backend, command, status: execution.status, receipts: execution.receipts,
      source: state.source, ...(state.build === undefined ? {} : { build: state.build }) };
    executions.push(result);
    if (execution.status === "passed") completedCommands.set(command, result);
    return execution.status === "passed";
  };
  if (buildTargets.includes("test-standalone") && !runOne("build-target:test-standalone", "pnpm build:test:standalone")) {
    return { status: "failed", executions };
  }
  for (const id of scenarios) {
    const evidence = evidenceCommandForScenario(scenarioById(id));
    if (!runOne(id, evidence.command, evidence.backend)) break;
  }
  if (executions.every((entry) => entry.status === "passed")) {
    for (const command of journeyCommands) if (!runOne(`journey:${command}`, command)) break;
  }
  if (executions.every((entry) => entry.status === "passed")) {
    for (const command of authorityCommands) if (!runOne(`authority:${command}`, command)) break;
  }
  const status = executions.every((entry) => entry.status === "passed") ? "passed" : "failed";
  const generatedArtifact = writeCurrentCapabilityReport(executionScope, state, executions);
  return { status, executions, ...(generatedArtifact === undefined ? {} : { generatedArtifact }) };
}

export function verifyCurrentWeaponParityExecution(selection, evidence) {
  if (selection.currentWeaponParity.required !== true) return evidence;
  for (const [index, id] of selection.currentWeaponParity.scenarios.entries()) {
    const weapon = selection.currentWeaponParity.weapons[index];
    const execution = evidence.executions.find((entry) => entry.id === id);
    const expectedCommand = selection.evidenceCommands?.find((entry) => entry.id === id)?.command;
    const browser = execution?.receipts?.find((receipt) => receipt.kind === "node" && receipt.status === "passed");
    if (execution?.status !== "passed" || browser === undefined || execution.build === undefined) {
      throw new Error(`required current ${weapon} live-to-detached parity evidence is missing or failed`);
    }
    if (expectedCommand !== undefined && execution.command !== expectedCommand) {
      throw new Error(`required current ${weapon} live-to-detached parity evidence has the wrong browser proof`);
    }
    validateServedBuildIdentity(execution.build, selection.source);
    if (browser.source?.fingerprint !== selection.source.fingerprint
      || browser.source?.revision !== selection.source.revision) {
      throw new Error(`required current ${weapon} live-to-detached parity evidence has stale source identity`);
    }
    if (browser.build !== undefined) validateServedBuildIdentity(browser.build, selection.source);
  }
  return { ...evidence, currentWeaponParity: { status: "passed",
    weapons: [...selection.currentWeaponParity.weapons], scenarios: [...selection.currentWeaponParity.scenarios] } };
}

function executeCurrentWeaponParity() {
  const selected = evidenceForDiff(["src/gameplay/weapon-selection.ts"]);
  const scenarios = [...selected.currentWeaponParity.scenarios];
  const scope = { ...selected.scope, scenarios, journeyCheckpoints: ["current-five-weapon-live-detached-parity"],
    buildTargets: ["test-standalone"] };
  const selection = { ...selected, scenarios, evidenceCommands: scenarios.map((id) =>
    ({ id, ...evidenceCommandForScenario(scenarioById(id)) })), journeyCommands: [], authorityCommands: [], scope };
  const existingPath = resolve(root, "artifacts", "tearbench", "generated", "current-capability.json");
  if (existsSync(existingPath)) {
    try {
      const existing = JSON.parse(readFileSync(existingPath, "utf8"));
      if (existing.format === "tearbench-current-capability" && existing.status === "passed"
        && existing.source?.revision === selection.source.revision
        && existing.source?.fingerprint === selection.source.fingerprint) {
        return { ...selection, evidenceExecution: { ...verifyCurrentWeaponParityExecution(selection, existing),
          reusedExactSourceEvidence: true } };
      }
    } catch {
      // Missing, incomplete, stale, or mismatched evidence is replaced by fresh real browser proof.
    }
  }
  return { ...selection, evidenceExecution: verifyCurrentWeaponParityExecution(selection,
    executeSelectedEvidence(scenarios, [], ["test-standalone"], [], scope)) };
}

async function writeSelection(selection) {
  const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "evidence-selection.json")));
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(selection, null, 2));
  console.log(`artifact: ${artifactPath}`);
  return artifactPath;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

/** Share the same tracked/untracked source digest used by actual standalone builds. */
export function readSourceIdentity() {
  const source = readSourceIdentitySync(root);
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  return Object.freeze({ ...source, worktreeFingerprint: createHash("sha256").update(status.stdout).digest("hex") });
}

function readServedBuildInfo() {
  const path = resolve(root, "dist", "test-standalone", "build-info.json");
  if (!existsSync(path)) throw new Error("selected evidence requires dist/test-standalone/build-info.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value?.format !== "tear-build-info" || value?.schemaVersion !== 1
    || typeof value.sha !== "string" || typeof value.target !== "string"
    || typeof value.sourceRevision !== "string" || typeof value.sourceState !== "string"
    || typeof value.sourceFingerprint !== "string" || typeof value.artifactHash !== "string") {
    throw new TypeError("served test build has incomplete build-info identity");
  }
  return Object.freeze({ sha: value.sha, target: value.target, mode: value.mode,
    sourceRevision: value.sourceRevision, sourceState: value.sourceState,
    sourceFingerprint: value.sourceFingerprint, artifactHash: value.artifactHash,
    artifactFiles: value.artifactFiles });
}

export function validateServedBuildIdentity(build, source = readSourceIdentity()) {
  if (build.target !== "standalone") throw new Error(`selected evidence build target is ${String(build.target)}, expected standalone`);
  if (build.sha !== source.revision || build.sourceRevision !== source.revision) {
    throw new Error("selected evidence build revision does not match the executed source");
  }
  if (build.sourceState !== source.state || build.sourceFingerprint !== source.fingerprint) {
    throw new Error("selected evidence build source fingerprint/state does not match the executed source");
  }
  return build;
}

function gitCleanHead() {
  const source = readSourceIdentity();
  if (source.state !== "clean") throw new TypeError("clean-only certification requires a clean tracked worktree at HEAD");
  return { commit: source.revision, source, worktreeFingerprint: source.worktreeFingerprint };
}

function receiptPathFor(id) {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(id)) throw new TypeError("evidence receipt ID must be a safe non-empty slug");
  return resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "receipts", `${id}.json`)));
}

async function recordEvidenceReceipt() {
  const usage = "usage: pnpm tearbench evidence record --id <id> --subject <generated-artifact> -- <explicit command>";
  const id = requiredOption("--id", usage);
  const subjectPath = workspaceRelativePath(resolve(requiredOption("--subject", usage)));
  const separator = process.argv.indexOf("--");
  // pnpm consumes the conventional `--` separator before Node receives argv.
  // Accept the remaining positional arguments after --subject as the explicit
  // command in that launcher case, while retaining direct-node support.
  const commandParts = separator >= 0
    ? process.argv.slice(separator + 1)
    : process.argv.slice(process.argv.indexOf("--subject") + 2);
  if (commandParts.length === 0) throw new TypeError(usage);
  const command = commandParts.join(" ");
  const before = readSourceIdentity();
  const result = spawnSync(command, { cwd: root, encoding: "utf8", shell: true });
  const after = readSourceIdentity();
  if (after.revision !== before.revision || after.state !== before.state || after.fingerprint !== before.fingerprint) throw new Error("evidence command changed the executed source");
  const scope = Object.freeze({ kind: "receipt", id, subject: subjectPath, command });
  let subject;
  try {
    const contents = await readFile(resolve(root, subjectPath));
    subject = { path: subjectPath, sha256: createHash("sha256").update(contents).digest("hex"), size: (await stat(resolve(root, subjectPath))).size };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const receipt = { format: "tearbench-evidence-receipt", schemaVersion: 1, id, command, timestamp: new Date().toISOString(),
      commit: before.revision, worktreeFingerprint: before.worktreeFingerprint, source: before, scope,
      status: "failed", exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}\nsubject unavailable: ${detail}` };
    const path = receiptPathFor(id); await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    console.log(`FAIL ${id}`); console.log(`receipt: ${path}`); process.exitCode = 1; return;
  }
  const receipt = { format: "tearbench-evidence-receipt", schemaVersion: 1, id, command, timestamp: new Date().toISOString(),
    commit: before.revision, worktreeFingerprint: before.worktreeFingerprint, source: before, scope,
    status: result.status === 0 ? "passed" : "failed", exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "", subject };
  const path = receiptPathFor(id); await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`${receipt.status === "passed" ? "PASS" : "FAIL"} ${id}`); console.log(`receipt: ${path}`);
  if (receipt.status !== "passed") process.exitCode = 1;
}

async function composePartialEvidenceManifest() {
  const usage = "usage: pnpm tearbench evidence partial-manifest --receipts <receipt.json,receipt.json> [--artifact path]";
  // pnpm may normalize commas in a single argument to spaces on Windows.
  const values = requiredOption("--receipts", usage).split(/[\s,]+/u).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) throw new TypeError(usage);
  const binding = gitCleanHead();
  const evidence = [];
  for (const input of values) {
    const receiptPath = workspaceRelativePath(resolve(input));
    const contents = await readFile(resolve(root, receiptPath), "utf8");
    const receipt = JSON.parse(contents);
    if (receipt?.format !== "tearbench-evidence-receipt" || receipt?.schemaVersion !== 1) throw new TypeError(`invalid evidence receipt: ${receiptPath}`);
    evidence.push({ id: receipt.id, status: receipt.status, command: receipt.command, timestamp: receipt.timestamp, commit: receipt.commit,
      worktreeFingerprint: receipt.worktreeFingerprint, source: receipt.source, scope: receipt.scope,
      artifactPath: receipt.subject?.path, artifactSha256: receipt.subject?.sha256, artifactSize: receipt.subject?.size,
      receiptPath, receiptSha256: createHash("sha256").update(contents).digest("hex") });
  }
  const ids = evidence.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new TypeError("partial manifest receipts must have unique IDs");
  const manifest = { format: "tearbench-release-evidence-manifest", schemaVersion: 1, generatedAt: new Date().toISOString(),
    ...binding, scope: { kind: "partial-manifest", evidenceIds: ids }, evidence,
    coverage: { arbitraryStates: [], journeys: [], matrices: [] }, preservation: {} };
  const path = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "generated", "partial-release-evidence.json")));
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`PARTIAL ${evidence.length} receipt(s)`); console.log(`artifact: ${path}`);
}

async function writeReleaseCertificate() {
  const manifestOption = option("--manifest");
  // A certificate is a point-in-time verdict over a clean HEAD, never a
  // repository fixture. Keep the default under generated evidence so a stale
  // checked-in "certified" JSON object cannot be mistaken for current release
  // approval.
  const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "generated", "release-certificate.json")));
  const manifestPath = manifestOption === undefined ? undefined : workspaceRelativePath(resolve(manifestOption));
  let verification;
  try {
    if (option("--full-check") !== undefined || option("--commit") !== undefined) throw new Error("certification accepts only an immutable --manifest; --full-check and --commit assertions are forbidden");
    if (manifestOption === undefined) throw new TypeError("usage: pnpm tearbench certify --manifest <release-evidence.json> [--artifact path]");
    const manifest = JSON.parse(await readFile(resolve(manifestOption), "utf8"));
    verification = await verifyReleaseEvidenceManifest(manifest, {
      root,
      git: async (argumentsList) => {
        const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8" });
        if (result.status !== 0) throw new Error(result.stderr || `git ${argumentsList.join(" ")} failed`);
        return result.stdout;
      },
      readFile,
    });
  } catch (error) {
    const headResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const statusResult = spawnSync("git", ["status", "--porcelain=v1", "-z"], { cwd: root, encoding: "utf8" });
    verification = { verified: false, errors: [error instanceof Error ? error.message : String(error)], head: headResult.stdout.trim(), worktreeFingerprint: createHash("sha256").update(statusResult.stdout).digest("hex") };
  }
  const certificate = createReleaseCertificate({ manifestPath: manifestPath ?? "<missing>", verification, generatedAt: new Date().toISOString() });
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  console.log(`${certificate.status.toUpperCase()} ${certificate.commit}`);
  console.log(`artifact: ${artifactPath}`);
  if (!verification.verified) process.exitCode = 1;
}

async function executeRun(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath) {
  const invocations = runLiveMaterializer(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath);
  const passed = invocations.length === repeat && invocations.every((entry) => entry.status === 0);
  console.log(`${passed ? "PASS" : "FAIL"} ${scenario.id} seed=${seed} repeat=${String(repeat)}`);
  console.log(`artifact: ${artifactPath}`);
  if (!passed) process.exitCode = 1;
}

/** Compare two fully materialized runs through C26's typed contract. */
async function investigateRegression() {
  const basePath = option("--base");
  const candidatePath = option("--candidate");
  if (!basePath || !candidatePath) throw new TypeError("usage: pnpm tearbench investigate --base <tearbench-run.json> --candidate <tearbench-run.json> [--artifact path]");
  const [base, candidate] = await Promise.all([
    readFile(resolve(basePath), "utf8").then(JSON.parse),
    readFile(resolve(candidatePath), "utf8").then(JSON.parse),
  ]);
  if (base?.format !== "tearbench-run" || candidate?.format !== "tearbench-run") {
    throw new TypeError("investigate requires materialized tearbench-run artifacts, not CLI smoke artifacts");
  }
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const intelligence = await server.ssrLoadModule("/src/tearbench/regression-intelligence.ts");
    const investigation = intelligence.investigateRegressionRuns({ base, candidate, createdAt: new Date().toISOString() });
    const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "regression-investigation.json")));
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(investigation, null, 2)}\n`, "utf8");
    console.log(`${investigation.status.toUpperCase()} ${investigation.coordinates.scenarioId} seed=${investigation.coordinates.seed}`);
    if (investigation.comparison.firstMaterialDivergence) console.log(`first-divergence-tick: ${String(investigation.comparison.firstMaterialDivergence.tick)}`);
    console.log(`artifact: ${artifactPath}`);
  } finally {
    await server.close();
  }
}

/** Persist a typed branch-equivalence failure from materialized run evidence. */
async function materializeBranchFailure() {
  const usage = "usage: pnpm tearbench failure --base <run.json> --candidate <run.json> [--investigation <investigation.json>] [--artifact path]";
  const basePath = requiredOption("--base", usage);
  const candidatePath = requiredOption("--candidate", usage);
  const [base, candidate] = await Promise.all([
    readFile(resolve(basePath), "utf8").then(JSON.parse),
    readFile(resolve(candidatePath), "utf8").then(JSON.parse),
  ]);
  if (base?.format !== "tearbench-run" || candidate?.format !== "tearbench-run") throw new TypeError("branch failure requires materialized tearbench-run artifacts");
  const investigationPath = option("--investigation");
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const intelligence = await server.ssrLoadModule("/src/tearbench/regression-intelligence.ts");
    const investigation = investigationPath === undefined
      ? intelligence.investigateRegressionRuns({ base, candidate, createdAt: new Date().toISOString() })
      : JSON.parse(await readFile(resolve(investigationPath), "utf8"));
    const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "branch-divergence-failure.json")));
    const failure = intelligence.createBranchDivergenceFailure({
      investigation, candidate, baseRunPath: workspaceRelativePath(resolve(basePath)), candidateRunPath: workspaceRelativePath(resolve(candidatePath)),
      investigationPath: workspaceRelativePath(resolve(investigationPath ?? artifactPath.replace(/\.json$/u, ".investigation.json"))),
    });
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    console.log(`FAILED ${failure.invariantId} tick=${String(failure.firstFailureTick)}`);
    console.log(`artifact: ${artifactPath}`);
  } finally {
    await server.close();
  }
}

function cleanGitWorkspace(path, label) {
  const workspace = resolve(path);
  const inside = spawnSync("git", ["-C", workspace, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (inside.status !== 0 || inside.stdout.trim() !== "true") throw new TypeError(`${label} workspace is not a Git worktree: ${workspace}`);
  const status = spawnSync("git", ["-C", workspace, "status", "--porcelain"], { encoding: "utf8" });
  if (status.status !== 0) throw new Error(`could not inspect ${label} workspace: ${status.stderr || status.stdout}`);
  if (status.stdout.trim() !== "") throw new TypeError(`${label} workspace must be clean before C26 replay minimization: ${workspace}`);
  return workspace;
}

function buildCleanWorkspace(workspace, label) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
  const build = spawnSync(process.execPath, [pnpmEntry, "--dir", workspace, "build:test:standalone"], { cwd: workspace, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`${label} test-build failed:\n${build.stderr || build.stdout}`);
}

/**
 * Materialize an explicitly requested replay in a clean revision worktree.
 * This intentionally refuses the dirty primary workspace: reductions must be
 * validated against isolated base and candidate builds, not cached frames.
 */
async function minimizeRegression() {
  const usage = "usage: pnpm tearbench minimize --base <run.json> --candidate <run.json> --base-workspace <clean-worktree> --candidate-workspace <clean-worktree> [--repetitions 3] [--max-pairs 48] [--artifact path]";
  const basePath = requiredOption("--base", usage);
  const candidatePath = requiredOption("--candidate", usage);
  const baseWorkspace = cleanGitWorkspace(requiredOption("--base-workspace", usage), "base");
  const candidateWorkspace = cleanGitWorkspace(requiredOption("--candidate-workspace", usage), "candidate");
  if (baseWorkspace === candidateWorkspace) throw new TypeError("base and candidate workspaces must be separate clean worktrees");
  const repetitions = Number.parseInt(option("--repetitions", "3"), 10);
  const maxPairExecutions = Number.parseInt(option("--max-pairs", "48"), 10);
  const [base, candidate] = await Promise.all([
    readFile(resolve(basePath), "utf8").then(JSON.parse),
    readFile(resolve(candidatePath), "utf8").then(JSON.parse),
  ]);
  if (base?.format !== "tearbench-run" || candidate?.format !== "tearbench-run") throw new TypeError("minimize requires materialized tearbench-run base and candidate artifacts");
  buildCleanWorkspace(baseWorkspace, "base");
  buildCleanWorkspace(candidateWorkspace, "candidate");
  const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "regression-minimization.json")));
  const artifactStem = artifactPath.replace(/\.json$/u, "");
  const materializedPaths = new Map();
  const materialize = async ({ side, actions, maxTicks, context, attempt }) => {
    const workspace = side === "base" ? baseWorkspace : candidateWorkspace;
    const safeSide = side === "base" ? "base" : "candidate";
    const actionPath = `${artifactStem}.${safeSide}.${String(attempt)}.actions.json`;
    const runPath = `${artifactStem}.${safeSide}.${String(attempt)}.run.json`;
    const snapshotPath = `${artifactStem}.${safeSide}.${String(attempt)}.snapshot.json`;
    const presentationPath = `${artifactStem}.${safeSide}.${String(attempt)}.presentation.json`;
    await mkdir(dirname(runPath), { recursive: true });
    await writeFile(actionPath, `${JSON.stringify({ actions }, null, 2)}\n`, "utf8");
    if (context.initialSnapshot !== undefined) await writeFile(snapshotPath, `${JSON.stringify(context.initialSnapshot, null, 2)}\n`, "utf8");
    if (context.presentation !== undefined) await writeFile(presentationPath, `${JSON.stringify(context.presentation, null, 2)}\n`, "utf8");
    const scenario = side === "base" ? base.resolvedScenario : candidate.resolvedScenario;
    const argumentsList = [resolve(workspace, "tests", "browser-tearbench-live-materialize.js"), scenario.id,
      "--seed", scenario.seed, "--max-ticks", String(maxTicks), "--actions", actionPath,
      ...(context.initialSnapshot === undefined ? [] : ["--snapshot", snapshotPath]),
      ...(context.presentation === undefined ? [] : ["--presentation", presentationPath]),
      "--artifact", runPath];
    const result = spawnSync(process.execPath, argumentsList, { cwd: workspace, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`${safeSide} replay materialization failed:\n${result.stderr || result.stdout}`);
    const artifact = JSON.parse(await readFile(runPath, "utf8"));
    materializedPaths.set(artifact.id, workspaceRelativePath(runPath));
    return artifact;
  };
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    const minimizationModule = await server.ssrLoadModule("/src/tearbench/regression-minimization.ts");
    const minimization = await minimizationModule.minimizeRegressionReplay({
      originalBase: base, originalCandidate: candidate, executor: { materialize }, createdAt: new Date().toISOString(), repetitions, maxPairExecutions,
    });
    const output = { ...minimization, materializedArtifacts: Object.fromEntries(materializedPaths) };
    await writeFile(artifactPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`MINIMIZED ${minimization.coordinates.scenarioId} actions=${String(minimization.minimalChild.actions.length)} ticks=${String(minimization.minimalChild.maxTicks)}`);
    console.log(`artifact: ${artifactPath}`);
  } finally {
    await server.close();
  }
}

function requiredOption(name, usage) {
  const value = option(name);
  if (!value) throw new TypeError(usage);
  return value;
}

function workspaceRelativePath(path) {
  const resolved = resolve(path);
  const stored = relative(root, resolved).replaceAll("\\", "/");
  if (stored === "" || stored.startsWith("../") || isAbsolute(stored)) throw new TypeError(`graveyard artifacts and registries must remain inside the workspace: ${path}`);
  return stored;
}

async function withTearbenchModule(callback) {
  const { createServer } = await import("vite");
  const server = await createServer({ root, server: { middlewareMode: true } });
  try {
    return await callback(await server.ssrLoadModule("/src/tearbench/graveyard.ts"));
  } finally {
    await server.close();
  }
}

async function readJsonArtifact(path) {
  const absolute = resolve(path);
  return { path: workspaceRelativePath(absolute), artifact: JSON.parse(await readFile(absolute, "utf8")) };
}

async function readGraveyardRegistry(path, graveyard) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return graveyard.createGraveyardRegistry();
    throw error;
  }
}

async function artifactStoreForRegistry(registry) {
  const references = registry.entries.flatMap((entry) => [
    entry.original, entry.minimalChild, entry.minimalReplay.artifact,
    entry.fix.verification.base, entry.fix.verification.candidate,
  ]);
  const store = {};
  for (const reference of references) {
    const path = workspaceRelativePath(resolve(root, reference.path));
    if (path !== reference.path) throw new TypeError(`graveyard registry stores a non-canonical artifact path: ${reference.path}`);
    store[path] = JSON.parse(await readFile(resolve(root, path), "utf8"));
  }
  return store;
}

async function graveyardRegister() {
  const usage = "usage: pnpm tearbench graveyard register --id <slug> --signature <signature> --original <failed-artifact.json> --minimal <failed-artifact.json> --minimal-replay <candidate-run.json> --fix-commit <revision> --fix-base <run.json> --fix-candidate <run.json> --invariant <id> --selectors comma,list --owner <owner> [--hints comma,list] [--registry path]";
  const registryPath = resolve(option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")));
  workspaceRelativePath(registryPath);
  const [original, minimalChild, minimalReplay, fixedBase, fixedCandidate] = await Promise.all([
    readJsonArtifact(requiredOption("--original", usage)),
    readJsonArtifact(requiredOption("--minimal", usage)),
    readJsonArtifact(requiredOption("--minimal-replay", usage)),
    readJsonArtifact(requiredOption("--fix-base", usage)),
    readJsonArtifact(requiredOption("--fix-candidate", usage)),
  ]);
  await withTearbenchModule(async (graveyard) => {
    const registry = await readGraveyardRegistry(registryPath, graveyard);
    const existingArtifacts = await artifactStoreForRegistry(registry);
    graveyard.validateGraveyardRegistry(registry, existingArtifacts);
    const hints = option("--hints", "inspect the first material divergence").split(",").map((hint) => hint.trim()).filter(Boolean);
    const entry = graveyard.createGraveyardEntry({
      id: requiredOption("--id", usage),
      signature: requiredOption("--signature", usage),
      original: graveyard.createGraveyardArtifactReference(original.artifact, original.path),
      minimalChild: graveyard.createGraveyardArtifactReference(minimalChild.artifact, minimalChild.path),
      minimalReplay: { side: option("--minimal-side", "candidate"), artifact: graveyard.createGraveyardArtifactReference(minimalReplay.artifact, minimalReplay.path) },
      invariantId: requiredOption("--invariant", usage),
      selectors: requiredOption("--selectors", usage).split(",").map((selector) => selector.trim()).filter(Boolean),
      ownership: { owner: requiredOption("--owner", usage), hints },
      fix: {
        commit: requiredOption("--fix-commit", usage),
        verification: {
          base: graveyard.createGraveyardArtifactReference(fixedBase.artifact, fixedBase.path),
          candidate: graveyard.createGraveyardArtifactReference(fixedCandidate.artifact, fixedCandidate.path),
        },
        recordedAt: option("--recorded-at", new Date().toISOString()),
      },
      reopenHistory: [],
    });
    const next = graveyard.buryGraveyardEntry(registry, entry);
    graveyard.validateGraveyardRegistry(next, {
      ...existingArtifacts,
      [original.path]: original.artifact,
      [minimalChild.path]: minimalChild.artifact,
      [minimalReplay.path]: minimalReplay.artifact,
      [fixedBase.path]: fixedBase.artifact,
      [fixedCandidate.path]: fixedCandidate.artifact,
    });
    await mkdir(dirname(registryPath), { recursive: true });
    await writeFile(registryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`BURIED ${entry.id}`);
    console.log(`registry: ${registryPath}`);
  });
}

async function graveyardList() {
  const registryPath = resolve(option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")));
  await withTearbenchModule(async (graveyard) => {
    const registry = await readGraveyardRegistry(registryPath, graveyard);
    graveyard.validateGraveyardRegistry(registry, await artifactStoreForRegistry(registry));
    for (const entry of registry.entries) console.log(`${entry.id}\t${entry.status}\t${entry.invariantId}\t${entry.ownership.owner}\treopens=${String(entry.reopenHistory.length)}`);
    console.log(`registry: ${registryPath}`);
  });
}

async function graveyardReopen() {
  const usage = "usage: pnpm tearbench graveyard reopen --id <slug> --reason <reason> [--registry path]";
  const registryPath = resolve(option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")));
  await withTearbenchModule(async (graveyard) => {
    const registry = await readGraveyardRegistry(registryPath, graveyard);
    graveyard.validateGraveyardRegistry(registry, await artifactStoreForRegistry(registry));
    const next = graveyard.reopenGraveyardEntry(registry, requiredOption("--id", usage), {
      at: option("--at", new Date().toISOString()), reason: requiredOption("--reason", usage),
    });
    await writeFile(registryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    console.log(`REOPENED ${requiredOption("--id", usage)}`);
    console.log(`registry: ${registryPath}`);
  });
}

/**
 * Re-materialize closed cases from their persisted minimized replay, rather
 * than treating a registry entry as a label for a unit test.  The registry and
 * every retained artifact are read and byte-validated in this new Node process
 * before the test-only browser is launched.
 */
async function executeSelectedGraveyardCases(selectors, options = {}) {
  const registryPath = resolve(options.registryPath ?? resolve(root, "artifacts", "tearbench", "graveyard-registry.json"));
  const outputPath = resolve(options.artifactPath ?? resolve(root, "artifacts", "tearbench", "graveyard-rerun.json"));
  const result = await withTearbenchModule(async (graveyard) => {
    const registry = await readGraveyardRegistry(registryPath, graveyard);
    const artifacts = await artifactStoreForRegistry(registry);
    graveyard.validateGraveyardRegistry(registry, artifacts);
    const entries = graveyard.selectGraveyardEntries(registry, selectors);
    const cases = [];
    if (entries.length > 0) buildTestStandalone();
    for (const entry of entries) {
      const replay = graveyard.createGraveyardReplayRequest(entry, artifacts);
      if (replay.maxTicks < 1 || replay.maxTicks > 720) {
        throw new RangeError(`graveyard ${entry.id} replay horizon is outside the live materializer limit: ${String(replay.maxTicks)}`);
      }
      const scenario = scenarioById(replay.scenarioId);
      if (replay.scenarioVersion !== 1) throw new TypeError(`graveyard ${entry.id} references unsupported canonical scenario version ${String(replay.scenarioVersion)}`);
      const caseStem = resolve(dirname(outputPath), "graveyard-runs", entry.id);
      const actionsPath = `${caseStem}.replay.actions.json`;
      const runPath = `${caseStem}.run.json`;
      const snapshotPath = `${caseStem}.snapshot.json`;
      const presentationPath = `${caseStem}.presentation.json`;
      await mkdir(dirname(caseStem), { recursive: true });
      await writeFile(actionsPath, `${JSON.stringify({ actions: replay.actions }, null, 2)}\n`, "utf8");
      if (replay.replayContext?.initialSnapshot !== undefined) {
        await writeFile(snapshotPath, `${JSON.stringify(replay.replayContext.initialSnapshot, null, 2)}\n`, "utf8");
      }
      if (replay.replayContext?.presentation !== undefined) {
        await writeFile(presentationPath, `${JSON.stringify(replay.replayContext.presentation, null, 2)}\n`, "utf8");
      }
      const materialized = materializeLiveRun(scenario, replay.seed, runPath, actionsPath, replay.maxTicks, {
        ...(replay.replayContext?.initialSnapshot === undefined ? {} : { snapshotPath }),
        ...(replay.replayContext?.presentation === undefined ? {} : { presentationPath }),
      });
      if (materialized.stdout) process.stdout.write(materialized.stdout);
      if (materialized.stderr) process.stderr.write(materialized.stderr);
      if (materialized.status !== 0) {
        cases.push({ id: entry.id, status: "failed", reason: "materialization-failed", runArtifact: workspaceRelativePath(runPath) });
        continue;
      }
      const run = JSON.parse(await readFile(runPath, "utf8"));
      const invariantFailures = Array.isArray(run.failures) ? run.failures.filter((failure) => failure?.id === replay.invariantId) : [];
      const preservedActions = canonicalJson(run.actions) === canonicalJson(replay.actions);
      const preservedContext = canonicalJson(run.replayContext ?? {}) === canonicalJson(replay.replayContext ?? {});
      const passed = run.format === "tearbench-run" && run.seed === replay.seed
        && run.resolvedScenario?.id === replay.scenarioId
        && run.resolvedScenario?.version === replay.scenarioVersion
        && run.resolvedScenario?.maxTicks === replay.maxTicks
        && preservedActions && preservedContext && run.status !== "failed" && invariantFailures.length === 0;
      cases.push({
        id: entry.id,
        status: passed ? "passed" : "failed",
        invariantId: replay.invariantId,
        sourceMinimalArtifact: entry.minimalChild.path,
        runArtifact: workspaceRelativePath(runPath),
        ...(passed ? {} : { reason: "recorded-invariant-recurred-or-replay-mismatched" }),
      });
    }
    return { registry, entries, cases };
  });
  const report = {
    format: "tearbench-graveyard-rerun",
    schemaVersion: 1,
    registry: workspaceRelativePath(registryPath),
    selectors: [...selectors],
    selectedCaseIds: result.entries.map((entry) => entry.id),
    status: result.cases.every((entry) => entry.status === "passed") ? "passed" : "failed",
    cases: result.cases,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`${report.status.toUpperCase()} graveyard cases=${String(report.cases.length)}`);
  console.log(`artifact: ${outputPath}`);
  return report;
}

async function graveyardRun() {
  const usage = "usage: pnpm tearbench graveyard run --cases <selector,selector> [--registry path] [--artifact path]";
  const cases = requiredOption("--cases", usage).split(",").map((entry) => entry.trim()).filter(Boolean);
  if (cases.length === 0) throw new TypeError(usage);
  const report = await executeSelectedGraveyardCases(cases, {
    registryPath: option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")),
    artifactPath: option("--artifact", resolve(root, "artifacts", "tearbench", "graveyard-rerun.json")),
  });
  if (report.status !== "passed") process.exitCode = 1;
}

const command = process.argv[2] ?? "help";
try {
  if (command === "list") {
    for (const entry of catalog) console.log(`${entry.id}\t${entry.description}`);
  } else if (command === "run") {
    const id = process.argv[3];
    if (!id) throw new TypeError("usage: pnpm tearbench run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]");
    const scenario = scenarioById(id);
    const seed = option("--seed", "1001");
    const repeat = Number.parseInt(option("--repeat", "1"), 10);
    if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100) throw new RangeError("--repeat must be an integer from 1 through 100");
    const defaultArtifact = resolve(root, "artifacts", "tearbench", `${id}-${seed}.json`);
    await executeRun(scenario, seed, repeat, resolve(option("--artifact", defaultArtifact)), option("--actions"));
  } else if (command === "rerun") {
    const artifactPath = option("--artifact");
    if (!artifactPath) throw new TypeError("usage: pnpm tearbench rerun --artifact <run.json>");
    const prior = JSON.parse(await readFile(resolve(artifactPath), "utf8"));
    if (prior.format !== "tearbench-run") throw new TypeError("rerun requires a materialized tearbench-run artifact");
    const scenario = scenarioById(prior.resolvedScenario?.id);
    await executeRun(scenario, prior.seed, 1, resolve(artifactPath), prior.rerun?.actionTrace ?? undefined, resolve(artifactPath));
  } else if (command === "investigate") {
    await investigateRegression();
  } else if (command === "minimize") {
    await minimizeRegression();
  } else if (command === "failure") {
    await materializeBranchFailure();
  } else if (command === "bisect") {
    const result = spawnSync(process.execPath, [resolve(root, "scripts", "tearbench-bisect-worktree.mjs"), ...process.argv.slice(3)], { cwd: root, encoding: "utf8" });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  } else if (command === "graveyard" && process.argv[3] === "register") {
    await graveyardRegister();
  } else if (command === "graveyard" && process.argv[3] === "list") {
    await graveyardList();
  } else if (command === "graveyard" && process.argv[3] === "reopen") {
    await graveyardReopen();
  } else if (command === "graveyard" && process.argv[3] === "run") {
    await graveyardRun();
  } else if (command === "forge" && process.argv[3] === "wave99") {
    const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "hard-endless-wave-99-hammer.json")));
    const evidence = runFiles(["tests/unit/tearbench-tearsdl.test.ts", "tests/unit/tearbench-progression-ledger.test.ts"]);
    const passed = evidence.status === 0;
    const artifact = {
      format: "tearbench-forge-command",
      schemaVersion: 1,
      scenarioId: "hard-endless-wave-99-hammer",
      request: { mode: "endless", difficulty: "hard", weapon: "hammer", wave: 99, seed: "990099" },
      generatedBy: "createWave99HammerPackage",
      artifacts: Object.fromEntries([
        ["legal-ledger", "The forge does not materialize a legal-ledger artifact."],
        ["opportunity-counts", "The forge does not materialize opportunity-counts."],
        ["configuration-trace", "The forge does not materialize a configuration trace."],
        ["validation-report", "Test output is captured, but no report file is created."],
        ["visible-episode", "The forge does not launch a visible episode."],
        ["snapshot", "The forge does not materialize a snapshot."],
        ["replay", "The forge does not materialize a replay."],
        ["metrics", "The forge does not materialize metrics."],
      ].map(([id, reason]) => [id, { status: "unavailable", reason }])),
      status: passed ? "passed" : "failed",
      evidence: { status: evidence.status,
        command: "pnpm exec vitest run tests/unit/tearbench-tearsdl.test.ts tests/unit/tearbench-progression-ledger.test.ts",
        stdout: evidence.stdout, stderr: evidence.stderr },
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`${passed ? "PASS" : "FAIL"} hard-endless-wave-99-hammer`);
    console.log(`artifact: ${artifactPath}`);
    if (!passed) process.exitCode = 1;
  } else if (command === "evidence" && process.argv[3] === "record") {
    await recordEvidenceReceipt();
  } else if (command === "evidence" && process.argv[3] === "partial-manifest") {
    await composePartialEvidenceManifest();
  } else if (command === "parity" && process.argv[3] === "current-weapons") {
    const result = executeCurrentWeaponParity();
    if (result.evidenceExecution.status !== "passed") process.exitCode = 1;
    await writeSelection(result);
  } else if (command === "select") {
    const selection = evidenceForDiff(await changedFiles());
    const result = process.argv.includes("--execute-evidence")
      ? { ...selection, evidenceExecution: verifyCurrentWeaponParityExecution(selection,
        executeSelectedEvidence(selection.scenarios, selection.journeyCommands,
          selection.buildTargets, selection.authorityCommands, selection.scope)) } : selection;
    if (result.evidenceExecution?.status === "failed") process.exitCode = 1;
    await writeSelection(result);
  } else if (command === "ci") {
    const selection = evidenceForDiff(await changedFiles());
    const artifactPath = await writeSelection(selection);
    const docsOnly = selection.routes.length === 1 && selection.routes[0] === "documentation-only";
    const scenarioFiles = selection.scenarios.flatMap((id) => scenarioById(id).testFiles);
    const files = [...new Set([
      "tests/unit/tearbench-runner.test.ts",
      "tests/unit/tearbench-regression-intelligence.test.ts",
      "tests/unit/tearbench-graveyard.test.ts",
      "tests/unit/tearbench-regression-minimization.test.ts",
      "tests/unit/tearbench-bisection.test.ts",
      "tests/unit/tearbench-release-certification.test.ts",
      ...scenarioFiles,
    ])];
    const docsEvidence = docsOnly ? executeSelectedEvidence([], [], [], selection.authorityCommands, selection.scope) : undefined;
    const evidence = docsOnly ? { status: docsEvidence.status === "passed" ? 0 : 1, stdout: "", stderr: "" } : runFiles(files);
    if (evidence.stdout) process.stdout.write(evidence.stdout);
    if (evidence.stderr) process.stderr.write(evidence.stderr);
    const evidenceExecution = docsOnly ? docsEvidence
      : evidence.status === 0 ? verifyCurrentWeaponParityExecution(selection,
        executeSelectedEvidence(selection.scenarios, selection.journeyCommands,
          selection.buildTargets, selection.authorityCommands, selection.scope))
      : { status: "skipped", reason: "selected unit evidence failed", executions: [] };
    await writeFile(artifactPath, `${JSON.stringify({ ...selection, evidenceExecution }, null, 2)}\n`, "utf8");
    const graveyardReport = !docsOnly && evidence.status === 0 && evidenceExecution.status === "passed"
      ? await executeSelectedGraveyardCases(selection.graveyardCases, {
        registryPath: option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")),
        artifactPath: resolve(root, "artifacts", "tearbench", "graveyard-rerun.json"),
      })
      : undefined;
    console.log(`selection: ${artifactPath}`);
    if (evidence.status !== 0 || evidenceExecution.status === "failed" || graveyardReport?.status === "failed") process.exitCode = 1;
  } else if (command === "certify") {
    await writeReleaseCertificate();
  } else {
    console.log("TearBench CLI\n  list\n  run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]\n  rerun --artifact <run.json>\n  investigate --base <tearbench-run.json> --candidate <tearbench-run.json> [--artifact path]\n  failure --base <run.json> --candidate <run.json> [--investigation <investigation.json>] [--artifact path]\n  minimize --base <run.json> --candidate <run.json> --base-workspace <clean-worktree> --candidate-workspace <clean-worktree> [--repetitions 3] [--max-pairs 48] [--artifact path]\n  bisect --good <ancestor-revision> --bad <known-bad-revision> --scenario <canonical-id> [--seed value] [--actions trace.json] [--repetitions 3] [--max-revisions 24]\n  graveyard register --id <slug> --signature <signature> --original <failed-artifact.json> --minimal <failed-artifact.json> --minimal-replay <candidate-run.json> --fix-commit <revision> --fix-base <run.json> --fix-candidate <run.json> --invariant <id> --selectors comma,list --owner <owner> [--hints comma,list] [--registry path]\n  graveyard list [--registry path]\n  graveyard reopen --id <slug> --reason <reason> [--registry path]\n  graveyard run --cases <selector,selector> [--registry path] [--artifact path]\n  forge wave99 [--artifact path]\n  evidence record --id <id> --subject <generated-artifact> -- <explicit command>\n  evidence partial-manifest --receipts <receipt.json,receipt.json> [--artifact path]\n  select [--files comma,list | --files-from path] [--artifact path]\n  ci [--files comma,list | --files-from path] [--registry path] [--artifact path]\n  certify --manifest <release-evidence.json> [--artifact path]");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
