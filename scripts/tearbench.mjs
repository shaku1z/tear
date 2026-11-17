import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSourceIdentitySync, verifyReleaseArtifact } from "./release-artifact.mjs";
import { verifyContentAddressedBuild } from "./tearbench-build-artifact.mjs";
import { isPassedTearBenchRunArtifact } from "./tearbench-run-artifact.mjs";
import { createTearBenchShadowPlan } from "./tearbench-shadow-plan.mjs";
import { executionEnvironmentBinding, executionToolchainBinding } from "./tearbench-runtime-identity.mjs";
import { dependencyOrderedTaskIds, registryTaskEnvironment } from "./tearbench-task-profile.mjs";
import { taskResourceKeys, withResourceLeases } from "./tearbench-resource-leases.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BLOOM_WELL_LIFECYCLE_TICKS = 744;
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const canonicalCatalogPath = resolve(root, "src", "tearbench", "canonical-scenarios.json");
const canonicalEvidenceRoutesPath = resolve(root, "src", "tearbench", "evidence-routes.json");
const catalogPath = resolve(option("--catalog", canonicalCatalogPath));
const evidenceRoutesPath = resolve(option("--routes", canonicalEvidenceRoutesPath));
const enforceCanonicalTaskProjections =
  catalogPath === canonicalCatalogPath && evidenceRoutesPath === canonicalEvidenceRoutesPath;
const evidencePolicyPath = resolve(root, "src", "tearbench", "evidence-policy.json");
const taskRegistryPath = resolve(root, "src", "tearbench", "task-registry.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const evidenceRoutes = JSON.parse(await readFile(evidenceRoutesPath, "utf8"));
const evidencePolicy = JSON.parse(await readFile(evidencePolicyPath, "utf8"));
const taskRegistry = JSON.parse(await readFile(taskRegistryPath, "utf8"));
const packageSource = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const publicationBoundary = JSON.parse(
  await readFile(resolve(root, "config", "campaign-publication-boundary.json"), "utf8"),
);
const trackedPathsResult = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
if (trackedPathsResult.status !== 0)
  throw new Error(`unable to validate evidence prefixes: ${trackedPathsResult.stderr || trackedPathsResult.stdout}`);
const trackedRepositoryPaths = trackedPathsResult.stdout
  .split("\0")
  .filter(Boolean)
  .map((value) => value.replaceAll("\\", "/"));
const REQUIRED_PRODUCTION_HOOK_FAMILIES = Object.freeze([
  "weapon-abilities",
  "hazards-support",
  "weapon-world-contact",
  "source-void",
  "boss-add-clone",
  "blade-contact",
  "area-damage",
]);
const KNOWN_BACKEND_DISPOSITIONS = new Set(["supported", "reduced", "unsupported"]);
const EVIDENCE_KINDS = new Set(["scenario-live", "scenario-headless", "journey", "authority"]);
const TASK_RUNNER_KINDS = new Set([
  "node",
  "vitest",
  "typescript",
  "eslint",
  "build-target",
  "wrangler",
  "tearbench",
  "certifier",
]);
const TASK_RESOURCE_CLASSES = new Set(["static", "unit", "headless", "build", "browser", "endurance"]);
if (
  taskRegistry?.schemaVersion !== 1 ||
  !Number.isSafeInteger(taskRegistry.definitionPolicyVersion) ||
  !Array.isArray(taskRegistry.tasks) ||
  taskRegistry.profiles === null ||
  typeof taskRegistry.profiles !== "object"
) {
  throw new TypeError("TearBench task registry is malformed");
}
const taskIds = taskRegistry.tasks.map((task) => task?.taskId);
if (
  new Set(taskIds).size !== taskIds.length ||
  taskRegistry.tasks.some(
    (task) =>
      typeof task?.taskId !== "string" ||
      !/^[a-z][a-z0-9.-]*$/u.test(task.taskId) ||
      !TASK_RUNNER_KINDS.has(task.runner?.kind) ||
      !TASK_RESOURCE_CLASSES.has(task.resourceClass) ||
      typeof task.runner?.executable !== "string" ||
      !Array.isArray(task.runner?.args) ||
      /[;&|<>`$()\r\n]/u.test(task.runner.executable) ||
      task.runner.args.some((argument) => typeof argument !== "string" || /[;&|<>`$()\r\n]/u.test(argument)),
  )
) {
  throw new TypeError("TearBench task registry has duplicate, unsupported, or unsafe task definitions");
}
const taskById = new Map(taskRegistry.tasks.map((task) => [task.taskId, task]));
if (
  evidencePolicy?.schemaVersion !== 1 ||
  evidencePolicy.matrices === null ||
  typeof evidencePolicy.matrices !== "object" ||
  Array.isArray(evidencePolicy.matrices) ||
  !Array.isArray(evidencePolicy.capabilityClaims) ||
  evidencePolicy.buildTargets === null ||
  typeof evidencePolicy.buildTargets !== "object" ||
  Array.isArray(evidencePolicy.buildTargets)
) {
  throw new TypeError("TearBench evidence policy is malformed");
}
const canonicalMatrixIds = new Set(Object.keys(evidencePolicy.matrices));
const capabilityClaimIds = new Set(evidencePolicy.capabilityClaims);
const buildTargetIds = new Set(Object.keys(evidencePolicy.buildTargets));
if (
  canonicalMatrixIds.size === 0 ||
  capabilityClaimIds.size !== evidencePolicy.capabilityClaims.length ||
  [...evidencePolicy.capabilityClaims].some((id) => typeof id !== "string" || id.trim() === "") ||
  [...canonicalMatrixIds].some((id) => !/^[a-z][A-Za-z0-9-]*$/u.test(id))
) {
  throw new TypeError("TearBench evidence policy has invalid canonical IDs");
}
for (const [id, policy] of Object.entries(evidencePolicy.matrices)) {
  if (
    policy === null ||
    typeof policy !== "object" ||
    !Array.isArray(policy.variants) ||
    !Array.isArray(policy.evidenceKinds) ||
    policy.evidenceKinds.length === 0 ||
    policy.evidenceKinds.some((kind) => !EVIDENCE_KINDS.has(kind))
  ) {
    throw new TypeError(`TearBench matrix policy ${id} is malformed`);
  }
}
for (const [id, target] of Object.entries(evidencePolicy.buildTargets)) {
  const task = target === null || typeof target !== "object" ? undefined : taskById.get(target.taskId);
  if (task === undefined || task.runner.kind !== "build-target" || task.runner.args.length !== 1) {
    throw new TypeError(`TearBench build target policy ${id} is malformed`);
  }
}

function displayCommandForTask(taskId) {
  const task = taskById.get(taskId);
  if (task === undefined) throw new RangeError(`unknown TearBench task: ${taskId}`);
  if (task.runner.kind === "build-target" && task.runner.args.length === 1) {
    return task.runner.args[0].startsWith("test-")
      ? `pnpm build:test:${task.runner.args[0].replace(/^test-/u, "")}`
      : `pnpm build:${task.runner.args[0]}`;
  }
  if (task.runner.kind === "vitest") return `pnpm exec vitest ${task.runner.args.join(" ")}`;
  if (task.runner.kind === "tearbench") return `pnpm tearbench ${task.runner.args.join(" ")}`;
  if (task.runner.kind === "node" && task.runner.executable === "node") return `node ${task.runner.args.join(" ")}`;
  throw new TypeError(`TearBench task ${taskId} has no approved compatibility command`);
}

function commandForTaskIds(taskIds, label) {
  if (
    !Array.isArray(taskIds) ||
    taskIds.length === 0 ||
    taskIds.some((id) => typeof id !== "string" || !taskById.has(id))
  ) {
    throw new TypeError(`${label} has missing or unknown TearBench task IDs`);
  }
  return taskIds.map(displayCommandForTask).join(" && ");
}

function projectedTaskCommand(taskIds, projectedCommand, label) {
  if (typeof projectedCommand === "string") parseApprovedEvidenceCommand(projectedCommand);
  if (!enforceCanonicalTaskProjections && typeof projectedCommand === "string") return projectedCommand;
  const command = commandForTaskIds(taskIds, label);
  if (projectedCommand !== undefined && projectedCommand !== command) {
    throw new TypeError(`${label} command projection disagrees with the typed task registry`);
  }
  return command;
}

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
  const match = tearbenchRegistrySource.match(
    new RegExp(`export const ${name}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\s*as const\\)`, "u"),
  );
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
  const match = weaponSource.match(
    /export const WEAPON_SELECTION_MIGRATION\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\s*as const/u,
  );
  if (!match) throw new TypeError("could not read the production weapon migration catalog for evidence validation");
  return [...match[1].matchAll(/^\s*([a-z][a-z0-9-]*)\s*:/gmu)].map((entry) => entry[1]);
}

function currentWeaponThrowIdentities() {
  const matches = [
    ...weaponDefinitionSource.matchAll(/^\s{4}id:\s*"([a-z][a-z0-9-]*)",[\s\S]*?^\s{4}throwIdentity:\s*"([^"]+)"/gmu),
  ];
  const identities = new Map(matches.map((match) => [match[1], match[2]]));
  for (const weapon of activeWeaponIds()) {
    if (!identities.has(weapon)) throw new TypeError(`production weapon ${weapon} has no source-owned throw identity`);
  }
  return identities;
}

function currentStageBossPairs() {
  const authoredPairs = [
    ...stageSource.matchAll(/^\s{4}id:\s*"([a-z][a-z0-9-]*)",[\s\S]*?^\s{4}boss:\s*"([a-z][a-z0-9-]*)"/gmu),
  ].map((entry) => Object.freeze({ stage: entry[1], boss: entry[2] }));
  if (
    publicationBoundary?.status !== "public" ||
    !Array.isArray(publicationBoundary.activeStageIds) ||
    !Array.isArray(publicationBoundary.previewStageIds)
  ) {
    throw new TypeError("could not read the current source-owned stage publication boundary");
  }
  const publishedStageIds = new Set(publicationBoundary.activeStageIds);
  const unpublishedStageIds = new Set(publicationBoundary.previewStageIds);
  if (
    publishedStageIds.size !== publicationBoundary.activeStageIds.length ||
    unpublishedStageIds.size !== publicationBoundary.previewStageIds.length ||
    [...publishedStageIds].some((id) => unpublishedStageIds.has(id))
  ) {
    throw new TypeError("current source-owned stage publication boundary overlaps or duplicates stage IDs");
  }
  const authoredByStage = new Map(authoredPairs.map((pair) => [pair.stage, pair]));
  const governedStageIds = new Set([...publishedStageIds, ...unpublishedStageIds]);
  if (
    authoredByStage.size !== authoredPairs.length ||
    authoredPairs.length !== governedStageIds.size ||
    authoredPairs.some((pair) => !governedStageIds.has(pair.stage))
  ) {
    throw new RangeError(
      "production stage ownership and the publication boundary do not cover the same authored stages",
    );
  }
  const pairs = publicationBoundary.activeStageIds.map((stage) => {
    const pair = authoredByStage.get(stage);
    if (pair === undefined) throw new RangeError(`published stage ${String(stage)} has no production boss ownership`);
    return pair;
  });
  const stageIds = pairs.map((pair) => pair.stage);
  const definitions = bossDefinitionSource.match(
    /export const BOSS_DEFINITIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s*as const satisfies readonly BossDefinition\[\]\)/u,
  );
  if (definitions === null) throw new TypeError("could not read the production boss definition catalog");
  const bossIds = [
    ...definitions[1].matchAll(/Object\.freeze\(\{\s*id:\s*"([a-z][a-z0-9-]*)"|([A-Z][A-Z0-9_]*_DEFINITION)/gu),
  ].map((entry) => {
    if (entry[1] !== undefined) return entry[1];
    const reference = entry[2];
    const resolved = bossDefinitionSource.match(
      new RegExp(`export const ${reference}\\s*=\\s*Object\\.freeze\\(\\{\\s*id:\\s*"([a-z][a-z0-9-]*)"`, "u"),
    );
    if (resolved === null) throw new TypeError(`could not resolve production boss definition ${String(reference)}`);
    return resolved[1];
  });
  if (
    stageIds.length === 0 ||
    new Set(stageIds).size !== stageIds.length ||
    new Set(bossIds).size !== bossIds.length ||
    pairs.some((pair) => !bossIds.includes(pair.boss))
  ) {
    throw new RangeError("production stage/boss ownership has missing, retired, duplicated, or mismatched definitions");
  }
  return Object.freeze(pairs);
}

function sharedBossProofIds(source) {
  if (
    !source.includes('require("../src/tearbench/canonical-scenarios.json")') ||
    !source.includes('entry.subject.kind === "boss"') ||
    !source.includes(".startBoss(") ||
    !source.includes("for (const bossId of BOSSES)") ||
    !source.includes(".bossStage(id)") ||
    !source.includes(".engineEventProjection()")
  ) {
    throw new TypeError("shared production boss proof has no inspectable source-derived encounter and biome evidence");
  }
  const ids = catalog
    .filter((entry) => entry.subject?.kind === "boss" && !(entry.tags ?? []).includes("unpublished-preview"))
    .map((entry) => entry.subject.id);
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
  if (
    relative(root, absolute).replaceAll("\\", "/") !== path ||
    !existsSync(absolute) ||
    !statSync(absolute).isFile()
  ) {
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
    if (
      tokens[0] === "pnpm" &&
      tokens[1] === "tearbench" &&
      tokens[2] === "run" &&
      tokens.length === 4 &&
      /^[a-z][a-z0-9-]*$/u.test(tokens[3])
    ) {
      return { kind: "canonical-live", scenarioId: tokens[3] };
    }
    if (part === "node scripts/check-docs.mjs") {
      return {
        kind: "docs-check",
        file: safeRepoFile("scripts/check-docs.mjs", /^scripts\/check-docs\.mjs$/u, "docs authority checker"),
      };
    }
    if (
      tokens[0] === "pnpm" &&
      tokens[1] === "exec" &&
      tokens[2] === "vitest" &&
      tokens[3] === "run" &&
      tokens.length > 4
    ) {
      return {
        kind: "vitest",
        files: tokens.slice(4).map((file) => safeRepoFile(file, /^tests\/[A-Za-z0-9._/-]+\.ts$/u, "unit test")),
      };
    }
    if (tokens[0] === "node" && tokens.length === 2) {
      if (tokens[1] === "--version") return { kind: "node-version" };
      return { kind: "node", file: safeRepoFile(tokens[1], /^tests\/browser-[A-Za-z0-9._-]+\.js$/u, "browser proof") };
    }
    if (
      tokens[0] === "node" &&
      tokens[1] === "--check" &&
      tokens.length === 3 &&
      tokens[2] === "tests/browser-scripted-agent-autonomy.js"
    ) {
      return {
        kind: "node-check",
        file: safeRepoFile(tokens[2], /^tests\/browser-[A-Za-z0-9._-]+\.js$/u, "check fixture"),
      };
    }
    throw new TypeError(`unsupported TearBench evidence command: ${command}`);
  });
}

function validateScenarioMetadata(scenario) {
  const surgicalFields = ["stage", "wave", "bossPhase"].filter(
    (field) => scenario.start !== null && typeof scenario.start === "object" && Object.hasOwn(scenario.start, field),
  );
  const stateForge = scenario.stateForge;
  if (surgicalFields.length > 0 && stateForge === undefined) {
    throw new RangeError(`scenario ${scenario.id} requests exact ${surgicalFields.join(", ")} state; use State Forge`);
  }
  if (stateForge !== undefined) {
    if (
      stateForge === null ||
      typeof stateForge !== "object" ||
      Array.isArray(stateForge) ||
      stateForge.documentId !== scenario.id ||
      typeof scenario.seed !== "string" ||
      !Array.isArray(scenario.backends) ||
      scenario.backends.length !== 1 ||
      scenario.backends[0] !== "live"
    ) {
      throw new TypeError(`scenario ${scenario.id} has an invalid State Forge descriptor`);
    }
    if (scenario.start?.stage !== "pale-traverse" || !Number.isSafeInteger(scenario.start?.wave)) {
      throw new RangeError(
        `scenario ${scenario.id} State Forge start must retain its exact Pale stage and wave coordinates`,
      );
    }
    if (
      scenario.id.startsWith("pale-white-hart-phase-") &&
      (scenario.start?.boss !== "white-hart" || !["1", "2", "3"].includes(scenario.start?.bossPhase))
    ) {
      throw new RangeError(
        `scenario ${scenario.id} State Forge start must retain its exact White Hart phase coordinates`,
      );
    }
    const tags = new Set(scenario.tags ?? []);
    if (
      !tags.has("engineering-only") ||
      !tags.has("unpublished-preview") ||
      ["published", "headless", "replay", "seek"].some((tag) => tags.has(tag))
    ) {
      throw new RangeError(`scenario ${scenario.id} has an invalid State Forge publication/backend claim`);
    }
    if (
      !Array.isArray(scenario.structuredAssertions) ||
      scenario.structuredAssertions.length === 0 ||
      scenario.structuredAssertions.some((assertion) => typeof assertion !== "string" || assertion.trim() === "")
    ) {
      throw new RangeError(`scenario ${scenario.id} requires subject-specific structured assertions`);
    }
  }
  if (
    Object.hasOwn(scenario, "backends") &&
    (!Array.isArray(scenario.backends) ||
      scenario.backends.length === 0 ||
      scenario.backends.some((backend) => !["live", "headless"].includes(backend)) ||
      new Set(scenario.backends).size !== scenario.backends.length)
  ) {
    throw new TypeError(`scenario ${scenario.id} has invalid evidence backends`);
  }
  const subject = scenario.subject;
  if (subject === undefined) return;
  if (
    subject === null ||
    typeof subject !== "object" ||
    !["gameplay", "weapon", "boss", "environment-field", "environment-combat-object"].includes(subject.kind) ||
    typeof subject.id !== "string" ||
    subject.id.trim() === ""
  ) {
    throw new TypeError(`scenario ${scenario.id} has malformed evidence subject`);
  }
  if (stateForge === undefined && subject.kind === "gameplay" && subject.id.startsWith("pale-")) {
    throw new RangeError(`source-owned Pale scenario ${scenario.id} requires its State Forge descriptor`);
  }
  const isRootboundGraft =
    subject.kind === "environment-combat-object" &&
    subject.id === "rootbound-graft-anchor" &&
    scenario.start?.boss === "rootbound";
  const isPaleWhiteHartPhase = subject.kind === "gameplay" && scenario.id.startsWith("pale-white-hart-phase-");
  if (
    scenario.start?.boss !== undefined &&
    !isRootboundGraft &&
    !isPaleWhiteHartPhase &&
    (subject.kind !== "boss" || subject.id !== scenario.start.boss)
  ) {
    throw new TypeError(`scenario ${scenario.id} boss start requires its matching authoritative boss subject`);
  }
  if (subject.kind === "gameplay") {
    if (!currentGameplayScenarioSubjects("GAMEPLAY_SCENARIO_SUBJECT_IDS").includes(subject.id)) {
      throw new RangeError(`scenario ${scenario.id} has an unknown current gameplay subject: ${subject.id}`);
    }
    if (
      scenario.backends?.includes("headless") &&
      !currentGameplayScenarioSubjects("HEADLESS_GAMEPLAY_SCENARIO_SUBJECT_IDS").includes(subject.id)
    ) {
      throw new RangeError(`scenario ${scenario.id} has no source-owned ordinary-headless subject transition`);
    }
  } else if (subject.kind === "weapon") {
    const peers = [
      scenario.weapon,
      scenario.source?.weapon,
      scenario.source?.id,
      scenario.start?.weapon,
      scenario.start?.subject?.weapon,
      scenario.start?.subject?.id,
    ].filter((value) => typeof value === "string");
    if (peers.some((value) => value !== subject.id)) {
      throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${subject.id}`);
    }
    const identity = currentWeaponThrowIdentities().get(subject.id);
    if (identity === undefined)
      throw new RangeError(`scenario ${scenario.id} has no current production weapon identity`);
    const normalizedIdentity = identity.toLowerCase().replace(/[^a-z0-9]/gu, "");
    const declaredIdentity = `${scenario.id} ${(scenario.tags ?? []).join(" ")}`
      .toLowerCase()
      .replace(/[^a-z0-9]/gu, "");
    if (!declaredIdentity.includes(normalizedIdentity)) {
      throw new RangeError(`scenario ${scenario.id} omits current ${subject.id} throw identity: ${identity}`);
    }
  } else if (subject.kind === "boss") {
    if (
      scenario.start?.mode !== "bossonly" ||
      scenario.start?.boss !== subject.id ||
      !Array.isArray(scenario.backends) ||
      scenario.backends.length !== 1 ||
      scenario.backends[0] !== "live"
    ) {
      throw new TypeError(`scenario ${scenario.id} boss subject requires live-only bossonly evidence`);
    }
  } else if (subject.kind === "environment-field" || subject.kind === "environment-combat-object") {
    const expected = subject.kind === "environment-field" ? "generic-field" : "generic-combat-object";
    const isSupportedBloomWell = subject.kind === "environment-field" && subject.id === "verdant-bloom-well";
    const isSupportedRootNetwork =
      subject.kind === "environment-combat-object" && subject.id === "verdant-root-network";
    const isSupportedRootboundGraft =
      subject.kind === "environment-combat-object" && subject.id === "rootbound-graft-anchor";
    const supportedBackends = isSupportedBloomWell
      ? Array.isArray(scenario.backends) && scenario.backends.length === 1 && scenario.backends[0] === "live"
      : isSupportedRootNetwork
        ? Array.isArray(scenario.backends) && scenario.backends.length === 1 && scenario.backends[0] === "live"
        : Array.isArray(scenario.backends) && scenario.backends.length === 1 && scenario.backends[0] === "live";
    if (
      (subject.id !== expected && !isSupportedBloomWell && !isSupportedRootNetwork && !isSupportedRootboundGraft) ||
      !supportedBackends
    ) {
      throw new TypeError(
        `scenario ${scenario.id} environment subject requires a supported environment evidence backend`,
      );
    }
    if (isSupportedBloomWell && scenario.maxTicks !== BLOOM_WELL_LIFECYCLE_TICKS) {
      throw new RangeError(
        `scenario ${scenario.id} must use the Bloom Well lifecycle horizon of ${String(BLOOM_WELL_LIFECYCLE_TICKS)} ticks`,
      );
    }
  }
  const command =
    scenario.evidence === undefined
      ? undefined
      : projectedTaskCommand(
          scenario.backendTaskIds?.live,
          scenario.evidence.command,
          `scenario ${scenario.id} live evidence`,
        );
  if (typeof command !== "string") return;
  const proof = parseApprovedEvidenceCommand(command).find((entry) => entry.kind === "node");
  if (proof === undefined) return;
  // Surgical State Forge scenarios are materialized by the typed live bridge;
  // their complementary browser journeys intentionally begin from a natural
  // UI setup and cannot prove the forged coordinates through source text.
  if (stateForge !== undefined) return;
  const source = readFileSync(proof.file, "utf8");
  if (
    subject.kind === "gameplay" &&
    relative(root, proof.file).replaceAll("\\", "/") === "tests/browser-current-gameplay-scenarios.js"
  ) {
    if (
      !source.includes('require("../src/tearbench/canonical-scenarios.json")') ||
      !source.includes('entry.subject.kind === "gameplay"') ||
      !source.includes("environment.reset(scenario)") ||
      !source.includes(`case "${subject.id}":`)
    ) {
      throw new RangeError(
        `scenario ${scenario.id} shared browser evidence does not exercise its ${subject.id} subject`,
      );
    }
    return;
  }
  if (
    (subject.kind === "environment-field" || subject.kind === "environment-combat-object") &&
    relative(root, proof.file).replaceAll("\\", "/") === "tests/browser-current-gameplay-scenarios.js"
  ) {
    if (
      !source.includes('entry.subject.kind === "environment-field"') ||
      !source.includes('entry.subject.kind === "environment-combat-object"') ||
      !source.includes("environment.environment()")
    ) {
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
  const starts = [
    ...source.matchAll(
      /start:\s*Object\.freeze\(\{\s*mode:\s*"([^"]+)",\s*difficulty:\s*"([^"]+)",\s*weapon:\s*"([^"]+)"/gu,
    ),
  ];
  if (starts.length === 0) throw new TypeError(`scenario ${scenario.id} browser evidence has no inspectable start`);
  for (const [, mode, difficulty, weapon] of starts) {
    if (
      mode !== scenario.start?.mode ||
      difficulty !== scenario.start?.difficulty ||
      weapon !== scenario.start?.weapon
    ) {
      throw new RangeError(`scenario ${scenario.id} browser evidence start disagrees with its catalog start`);
    }
  }
}

function evidenceCommandsForScenario(scenario) {
  validateScenarioMetadata(scenario);
  const declaredBackends = scenario.backends;
  if (!Array.isArray(declaredBackends) || declaredBackends.length === 0) {
    throw new RangeError(`scenario ${scenario.id} has no executable evidence backend declaration`);
  }
  const command =
    scenario.evidence === undefined
      ? undefined
      : projectedTaskCommand(
          scenario.backendTaskIds?.live,
          scenario.evidence.command,
          `scenario ${scenario.id} live evidence`,
        );
  return declaredBackends.map((backend) => {
    if (backend === "live" && typeof command === "string" && command.trim() !== "") {
      const parsed = parseApprovedEvidenceCommand(command);
      const mismatched = parsed.find((step) => step.kind === "canonical-live" && step.scenarioId !== scenario.id);
      if (mismatched !== undefined)
        throw new RangeError(`scenario ${scenario.id} evidence command targets ${mismatched.scenarioId}`);
      return Object.freeze({ backend, command });
    }
    if (backend === "headless") {
      const derivedCommand = commandForTaskIds(
        scenario.backendTaskIds?.headless,
        `scenario ${scenario.id} headless evidence`,
      );
      parseApprovedEvidenceCommand(derivedCommand);
      return Object.freeze({ backend, command: derivedCommand });
    }
    throw new RangeError(`scenario ${scenario.id} has no executable ${String(backend)} evidence backend`);
  });
}

function evidenceCommandForScenario(scenario, backend = "live") {
  const evidence = evidenceCommandsForScenario(scenario).find((entry) => entry.backend === backend);
  if (evidence === undefined)
    throw new RangeError(`scenario ${scenario.id} does not declare the ${backend} evidence backend`);
  return evidence;
}

function validateScenarioSubject(scenario) {
  validateScenarioMetadata(scenario);
  const retired = new Set(retiredWeaponIds());
  const declared = [scenario.weapon, scenario.subject?.kind === "weapon" ? scenario.subject.id : undefined].filter(
    (weapon) => typeof weapon === "string",
  );
  const retiredSubject =
    (scenario.tags ?? []).find((tag) => retired.has(tag)) ?? declared.find((weapon) => retired.has(weapon));
  if (retiredSubject) throw new RangeError(`scenario ${scenario.id} references retired weapon: ${retiredSubject}`);
}

function validateActiveWeaponSubject(scenario, weapon) {
  const declared = [scenario.weapon, scenario.subject?.kind === "weapon" ? scenario.subject.id : undefined].find(
    (value) => typeof value === "string",
  );
  if (declared !== undefined && declared !== weapon) {
    throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${weapon}, found ${declared}`);
  }
  if (declared === undefined && !scenario.id.startsWith(`${weapon}-`)) {
    throw new RangeError(`scenario ${scenario.id} has wrong weapon subject: expected ${weapon}`);
  }
}

function prefixMatches(file, prefix) {
  return prefix.endsWith("/") || prefix.endsWith("-") ? file.startsWith(prefix) : file === prefix;
}

function validateRoutePrefix(prefix, routeId) {
  if (
    typeof prefix !== "string" ||
    prefix.trim() === "" ||
    isAbsolute(prefix) ||
    prefix.includes("..") ||
    prefix !== prefix.replaceAll("\\", "/")
  ) {
    throw new TypeError(`route ${routeId} has an unsafe evidence prefix: ${String(prefix)}`);
  }
  if (!prefix.endsWith("/") && !prefix.endsWith("-") && !trackedRepositoryPaths.includes(prefix)) {
    throw new RangeError(`route ${routeId} has an unsafe evidence prefix boundary: ${prefix}`);
  }
  if (!trackedRepositoryPaths.some((file) => prefixMatches(file, prefix))) {
    throw new RangeError(`route ${routeId} has an evidence prefix with no tracked repository match: ${prefix}`);
  }
}

function canonicalEvidenceBindings(values) {
  if (!Array.isArray(values)) throw new TypeError("TearBench route obligations must be an array");
  const normalized = values.map((value) => {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.route !== "string" ||
      typeof value.obligation !== "string" ||
      !Array.isArray(value.commands) ||
      value.commands.length === 0 ||
      value.commands.some((command) => typeof command !== "string" || command.trim() === "")
    ) {
      throw new TypeError("TearBench route obligation binding is malformed");
    }
    return { route: value.route, obligation: value.obligation, commands: [...new Set(value.commands)].sort() };
  });
  const keys = normalized.map((value) => `${value.route}\0${value.obligation}`);
  if (new Set(keys).size !== keys.length) throw new TypeError("TearBench route obligations must be unique");
  return normalized.sort(
    (left, right) => left.route.localeCompare(right.route) || left.obligation.localeCompare(right.obligation),
  );
}

function routeEvidenceCandidates(route, scenarioIds) {
  const candidates = [];
  for (const id of scenarioIds) {
    for (const evidence of evidenceCommandsForScenario(scenarioById(id))) {
      candidates.push({ kind: `scenario-${evidence.backend}`, command: evidence.command });
    }
  }
  const journeyCommands =
    route.journeyTaskIds === undefined && !enforceCanonicalTaskProjections
      ? (route.journeyCommands ?? [])
      : (route.journeyTaskIds ?? []).map((id) => displayCommandForTask(id));
  const authorityCommands =
    route.authorityTaskIds === undefined && !enforceCanonicalTaskProjections
      ? (route.authorityCommands ?? [])
      : (route.authorityTaskIds ?? []).map((id) => displayCommandForTask(id));
  if (
    enforceCanonicalTaskProjections &&
    route.journeyCommands !== undefined &&
    JSON.stringify(journeyCommands) !== JSON.stringify(route.journeyCommands)
  ) {
    throw new TypeError(`route ${route.id} journey command projection disagrees with typed tasks`);
  }
  if (
    enforceCanonicalTaskProjections &&
    route.authorityCommands !== undefined &&
    JSON.stringify(authorityCommands) !== JSON.stringify(route.authorityCommands)
  ) {
    throw new TypeError(`route ${route.id} authority command projection disagrees with typed tasks`);
  }
  for (const command of journeyCommands) candidates.push({ kind: "journey", command });
  for (const command of authorityCommands) candidates.push({ kind: "authority", command });
  return [...new Map(candidates.map((value) => [`${value.kind}\0${value.command}`, value])).values()];
}

function materializeRouteObligations(route, scenarioIds) {
  const candidates = routeEvidenceCandidates(route, scenarioIds);
  const bindings = [];
  for (const matrix of route.interactionMatrices) {
    const allowedKinds = evidencePolicy.matrices[matrix].evidenceKinds;
    const commands = candidates
      .filter((candidate) => allowedKinds.includes(candidate.kind))
      .map((candidate) => candidate.command);
    if (commands.length === 0) throw new RangeError(`route ${route.id} matrix ${matrix} has no executable evidence`);
    bindings.push({ route: route.id, obligation: `matrix:${matrix}`, commands });
  }
  for (const capability of route.capabilityClaims ?? []) {
    if (candidates.length === 0)
      throw new RangeError(`route ${route.id} capability ${capability} has no executable evidence`);
    bindings.push({
      route: route.id,
      obligation: `capability:${capability}`,
      commands: candidates.map((candidate) => candidate.command),
    });
  }
  return bindings;
}

function validateRouteObligations(route, scenarioIds) {
  if (
    !Array.isArray(route.interactionMatrices) ||
    route.interactionMatrices.some((id) => typeof id !== "string" || !canonicalMatrixIds.has(id)) ||
    new Set(route.interactionMatrices).size !== route.interactionMatrices.length
  ) {
    throw new TypeError(`route ${route.id} has unknown or duplicate interaction matrix IDs`);
  }
  const capabilities = route.capabilityClaims ?? [];
  if (
    !Array.isArray(capabilities) ||
    capabilities.some((id) => typeof id !== "string" || !capabilityClaimIds.has(id)) ||
    new Set(capabilities).size !== capabilities.length ||
    route.interactionMatrices.some((id) => capabilities.includes(id))
  ) {
    throw new TypeError(`route ${route.id} has unknown or duplicate capability claims`);
  }
  const buildTargets = route.buildTargets ?? [];
  if (
    !Array.isArray(buildTargets) ||
    buildTargets.some((id) => typeof id !== "string" || !buildTargetIds.has(id)) ||
    new Set(buildTargets).size !== buildTargets.length
  ) {
    throw new TypeError(`route ${route.id} has unknown or duplicate build targets`);
  }
  return canonicalEvidenceBindings(materializeRouteObligations(route, scenarioIds));
}

function validateRouteDisposition(route) {
  if (route.specialized === true) {
    if (typeof route.owner !== "string" || route.owner.trim() === "") {
      throw new TypeError(`specialized route ${route.id} is missing an explicit owner`);
    }
    const required = route.requiredScenarios;
    if (
      required !== undefined &&
      (!Array.isArray(required) ||
        required.some((id) => typeof id !== "string" || id.trim() === "") ||
        new Set(required).size !== required.length)
    ) {
      throw new TypeError(`specialized route ${route.id} has invalid required scenarios`);
    }
    const available = new Set(route.scenarios);
    for (const id of required ?? [])
      if (!available.has(id)) {
        throw new RangeError(`specialized route ${route.id} required scenario is not routed: ${id}`);
      }
    const disposition = route.reducedDisposition;
    if (
      route.scenarios.length === 0 &&
      (route.scenarioSubjects?.length ?? 0) === 0 &&
      (typeof disposition !== "string" || disposition.trim() === "")
    ) {
      throw new RangeError(`specialized route ${route.id} has no specialized scenario or reduced disposition`);
    }
    if (disposition !== undefined && (typeof disposition !== "string" || disposition.trim() === "")) {
      throw new TypeError(`specialized route ${route.id} has an invalid reduced disposition`);
    }
  }
  if (route.id !== "production-replay-headless-composition") return;
  const families = route.backendDispositions;
  if (!Array.isArray(families)) throw new TypeError("production composition route is missing hook-family dispositions");
  const familyIds = families.map((entry) => entry?.family);
  if (
    familyIds.some((id) => typeof id !== "string" || id.trim() === "") ||
    new Set(familyIds).size !== familyIds.length
  ) {
    throw new TypeError("production composition hook-family IDs must be unique and nonempty");
  }
  if (
    REQUIRED_PRODUCTION_HOOK_FAMILIES.some((id) => !familyIds.includes(id)) ||
    familyIds.some((id) => !REQUIRED_PRODUCTION_HOOK_FAMILIES.includes(id))
  ) {
    throw new RangeError("production composition hook-family coverage is incomplete");
  }
  for (const family of families) {
    if (
      typeof family.backend !== "string" ||
      family.backend.trim() === "" ||
      !KNOWN_BACKEND_DISPOSITIONS.has(family.disposition) ||
      family.evidenceRoute !== route.id ||
      !Array.isArray(family.authorityCommands) ||
      family.authorityCommands.length === 0
    ) {
      throw new TypeError(
        `production hook family ${String(family.family)} has an invalid disposition or evidence owner`,
      );
    }
    for (const command of family.authorityCommands) {
      parseApprovedEvidenceCommand(command);
      if (!route.authorityCommands?.includes(command)) {
        throw new RangeError(`production hook family ${family.family} references an unowned authority command`);
      }
    }
  }
}

function routeScenarioIds(route) {
  if (typeof route.id !== "string" || !Array.isArray(route.prefixes) || !Array.isArray(route.scenarios)) {
    throw new TypeError(`malformed TearBench evidence route: ${String(route.id)}`);
  }
  for (const prefix of route.prefixes) validateRoutePrefix(prefix, route.id);
  validateRouteDisposition(route);
  for (const command of [...(route.journeyCommands ?? []), ...(route.authorityCommands ?? [])])
    parseApprovedEvidenceCommand(command);
  const ids = new Set(route.scenarios);
  for (const id of ids) {
    const scenario = scenarioById(id);
    validateScenarioSubject(scenario);
    evidenceCommandForScenario(scenario);
  }
  for (const subject of route.scenarioSubjects ?? []) {
    if (subject === "active-weapons") {
      for (const weapon of activeWeaponIds()) {
        const matches = catalog.filter(
          (scenario) =>
            (Array.isArray(scenario.tags) && scenario.tags.includes(weapon)) ||
            (scenario.subject?.kind === "weapon" && scenario.subject.id === weapon),
        );
        if (matches.length === 0) throw new RangeError(`no TearBench scenario covers active weapon: ${weapon}`);
        for (const scenario of matches) {
          validateScenarioSubject(scenario);
          validateActiveWeaponSubject(scenario, weapon);
          ids.add(scenario.id);
        }
      }
    } else if (subject === "current-stage-bosses") {
      const pairs = currentStageBossPairs();
      const encounters = catalog.filter(
        (scenario) => scenario.subject?.kind === "boss" && !(scenario.tags ?? []).includes("unpublished-preview"),
      );
      for (const scenario of encounters) {
        if (!pairs.some((pair) => pair.boss === scenario.subject.id)) {
          throw new RangeError(`scenario ${scenario.id} references a retired or unknown production boss`);
        }
      }
      for (const { stage, boss } of pairs) {
        const matches = encounters.filter((scenario) => scenario.subject.id === boss);
        if (matches.length !== 1)
          throw new RangeError(`production stage ${stage} requires exactly one ${boss} boss scenario`);
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
  for (const id of ids) {
    const scenario = scenarioById(id);
    validateScenarioSubject(scenario);
    evidenceCommandForScenario(scenario);
  }
  if (route.backend !== undefined) {
    if (route.backend !== "live-only") throw new TypeError(`route ${route.id} has an unsupported backend disposition`);
    const nonLiveScenario = [...ids]
      .map((id) => scenarioById(id))
      .find((scenario) => scenario.backends.length !== 1 || scenario.backends[0] !== "live");
    if (nonLiveScenario !== undefined) {
      throw new TypeError(`route ${route.id} is live-only but scenario ${nonLiveScenario.id} declares another backend`);
    }
  }
  validateRouteObligations(route, [...ids]);
  return [...ids];
}

const routeIds = evidenceRoutes.map((route) => route.id);
if (new Set(routeIds).size !== routeIds.length) throw new TypeError("TearBench evidence route IDs must be unique");
for (const route of evidenceRoutes) routeScenarioIds(route);
if (!evidenceRoutes.some((route) => route.id === "shared-runtime")) {
  throw new TypeError("TearBench evidence routes must include a shared-runtime fallback");
}

function buildTestStandalone(spawnTask = spawnSync) {
  if (process.env.TEARBENCH_REUSE_VERIFIED_BUILDS === "1") {
    validateServedBuildIdentity(readServedBuildInfo(), readSourceIdentity());
    return;
  }
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry)
    throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
  const build = spawnTask(process.execPath, [pnpmEntry, "build:test:standalone"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) throw new Error(`test-build materialization build failed:\n${build.stderr || build.stdout}`);
}

function materializeLiveRun(
  scenario,
  seed,
  artifactPath,
  actionTracePath,
  maxTicks = scenario.maxTicks,
  contextPaths = {},
  replayContextPath,
  spawnTask = spawnSync,
) {
  const argumentsList = [
    "tests/browser-tearbench-live-materialize.js",
    scenario.id,
    "--seed",
    seed,
    "--max-ticks",
    String(maxTicks),
    "--artifact",
    artifactPath,
  ];
  if (actionTracePath) argumentsList.push("--actions", actionTracePath);
  if (contextPaths.snapshotPath) argumentsList.push("--snapshot", contextPaths.snapshotPath);
  if (contextPaths.presentationPath) argumentsList.push("--presentation", contextPaths.presentationPath);
  if (replayContextPath) argumentsList.push("--replay-context", replayContextPath);
  return spawnTask(process.execPath, argumentsList, { cwd: root, encoding: "utf8" });
}

function runLiveMaterializer(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath, spawnTask) {
  buildTestStandalone(spawnTask);
  const invocations = [];
  for (let index = 0; index < repeat; index += 1) {
    const attemptArtifact =
      index === repeat - 1 ? artifactPath : artifactPath.replace(/\.json$/u, `.attempt-${String(index + 1)}.json`);
    const result = materializeLiveRun(
      scenario,
      seed,
      attemptArtifact,
      actionTracePath,
      scenario.maxTicks,
      {},
      replayContextPath,
      spawnTask,
    );
    invocations.push({
      index,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      artifact: attemptArtifact,
    });
    if (result.status !== 0) break;
  }
  return invocations;
}

function runFiles(files) {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry)
    throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
  return spawnSync(process.execPath, [pnpmEntry, "exec", "vitest", "run", ...files], {
    cwd: root,
    encoding: "utf8",
  });
}

async function changedFiles() {
  const revision = option("--revision");
  if (revision !== undefined) {
    if (!/^[0-9a-f]{7,40}$/u.test(revision)) throw new TypeError("TearBench changed-file revision must be a Git SHA");
    const parent = spawnSync("git", ["rev-parse", `${revision}^1`], { cwd: root, encoding: "utf8" });
    if (parent.status !== 0)
      throw new RangeError(`TearBench changed-file revision has no resolvable parent: ${revision}`);
    const diff = spawnSync("git", ["diff", "--name-only", parent.stdout.trim(), revision], {
      cwd: root,
      encoding: "utf8",
    });
    if (diff.status !== 0)
      throw new Error(`unable to resolve changed files for ${revision}: ${diff.stderr || diff.stdout}`);
    return diff.stdout
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const file = option("--files-from");
  if (file)
    return (await readFile(resolve(file), "utf8"))
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  const inline = option("--files", "");
  return inline
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function canonicalList(values, normalize = (value) => value) {
  return [...new Set(values.map(normalize))].sort();
}

function canonicalBackendDispositions(values) {
  const normalized = values.map((value) => ({
    family: String(value.family).trim(),
    backend: String(value.backend).trim(),
    disposition: String(value.disposition).trim(),
    evidenceRoute: String(value.evidenceRoute).trim(),
    authorityCommands: canonicalList(value.authorityCommands ?? []),
  }));
  return [...new Map(normalized.map((value) => [canonicalJson(value), value])).values()].sort((left, right) => {
    if (left.family !== right.family) return left.family < right.family ? -1 : 1;
    if (left.backend !== right.backend) return left.backend < right.backend ? -1 : 1;
    return left.disposition < right.disposition ? -1 : left.disposition > right.disposition ? 1 : 0;
  });
}

function canonicalDiffScope(scope) {
  const normalizePath = (value) => {
    const normalized = String(value).replaceAll("\\", "/").trim();
    if (normalized === "" || isAbsolute(normalized) || normalized.split("/").includes("..")) {
      throw new TypeError(`unsafe changed-file scope path: ${String(value)}`);
    }
    return normalized;
  };
  return Object.freeze({
    kind: "diff",
    changedFiles: Object.freeze(canonicalList(scope.changedFiles ?? [], normalizePath)),
    routes: Object.freeze(canonicalList(scope.routes ?? [])),
    scenarios: Object.freeze(canonicalList(scope.scenarios ?? [])),
    journeyCheckpoints: Object.freeze(canonicalList(scope.journeyCheckpoints ?? [])),
    baseComparisons: Object.freeze(canonicalList(scope.baseComparisons ?? [])),
    interactionMatrices: Object.freeze(canonicalList(scope.interactionMatrices ?? [])),
    capabilityClaims: Object.freeze(canonicalList(scope.capabilityClaims ?? [])),
    buildTargets: Object.freeze(canonicalList(scope.buildTargets ?? [])),
    journeyCommands: Object.freeze(canonicalList(scope.journeyCommands ?? [])),
    authorityCommands: Object.freeze(canonicalList(scope.authorityCommands ?? [])),
    backendDispositions: Object.freeze(canonicalBackendDispositions(scope.backendDispositions ?? [])),
    obligationBindings: Object.freeze(canonicalEvidenceBindings(scope.obligationBindings ?? [])),
  });
}

function diffScopeDigest(scope) {
  return createHash("sha256")
    .update(canonicalJson(canonicalDiffScope(scope)))
    .digest("hex");
}

function routeDefinitionDigest() {
  return createHash("sha256").update(canonicalJson(evidenceRoutes)).digest("hex");
}

function currentWeaponParityPlan(routes, scenarioIds) {
  const required = routes.some((route) => (route.scenarioSubjects ?? []).includes("active-weapons"));
  if (!required) return Object.freeze({ required: false, weapons: Object.freeze([]), scenarios: Object.freeze([]) });
  const headlessProof = safeRepoFile(
    "tests/unit/current-headless-weapon-parity.test.ts",
    /^tests\/unit\/current-headless-weapon-parity\.test\.ts$/u,
    "current production-headless weapon proof",
  );
  const headlessSource = readFileSync(headlessProof, "utf8");
  if (
    !headlessSource.includes("it.each(WEAPON_IDS)") ||
    !headlessSource.includes("createProductionHeadlessEnvironment") ||
    !headlessSource.includes("environment.step(actions)") ||
    !headlessSource.includes("blade.thrown") ||
    !headlessSource.includes("projectile.spawned")
  ) {
    throw new TypeError("active weapons require source-derived ordinary-headless mechanic and native-event evidence");
  }
  const weapons = activeWeaponIds();
  const scenarios = weapons.map((weapon) => {
    const matches = catalog.filter((scenario) => scenario.subject?.kind === "weapon" && scenario.subject.id === weapon);
    if (matches.length !== 1)
      throw new RangeError(`active weapon ${weapon} requires exactly one current parity scenario`);
    const scenario = matches[0];
    if (!scenarioIds.includes(scenario.id))
      throw new RangeError(`active weapon ${weapon} parity scenario was not selected`);
    if (
      !Array.isArray(scenario.backends) ||
      !scenario.backends.includes("live") ||
      !scenario.backends.includes("headless")
    ) {
      throw new RangeError(`active weapon ${weapon} requires both live and headless backends`);
    }
    const browser = parseApprovedEvidenceCommand(evidenceCommandForScenario(scenario).command).find(
      (entry) => entry.kind === "node",
    );
    const source = browser === undefined ? "" : readFileSync(browser.file, "utf8");
    const browserPath = browser === undefined ? "" : relative(root, browser.file).replaceAll("\\", "/");
    const expectedProof = new RegExp(`^tests/browser-c40-${weapon}-[A-Za-z0-9._-]+-ghost-seek\\.js$`, "u");
    if (
      browser === undefined ||
      !expectedProof.test(browserPath) ||
      !source.includes(".seek(") ||
      !source.includes('entry.value.kind === "authoritative-hash"') ||
      !/assert\.equal\(\s*seeks\[0\]\.semanticHash\s*,\s*receipt\.value\.stateHash\s*,/u.test(source)
    ) {
      throw new TypeError(`active weapon ${weapon} requires a source-bound live-to-detached browser proof`);
    }
    return scenario.id;
  });
  return Object.freeze({ required: true, weapons: Object.freeze(weapons), scenarios: Object.freeze(scenarios) });
}

function evidenceForDiff(files) {
  const normalized = canonicalList(files, (file) => file.replaceAll("\\", "/").trim());
  const matched = evidenceRoutes.filter((route) =>
    normalized.some((file) => route.prefixes.some((prefix) => prefixMatches(file, prefix))),
  );
  const unmatched = normalized.filter(
    (file) => !evidenceRoutes.some((route) => route.prefixes.some((prefix) => prefixMatches(file, prefix))),
  );
  const fallback = evidenceRoutes.find((route) => route.id === "shared-runtime");
  const selected = [...matched];
  if ((selected.length === 0 || unmatched.length > 0) && fallback !== undefined && !selected.includes(fallback)) {
    selected.push(fallback);
  }
  if (selected.length === 0) throw new TypeError("TearBench evidence selection has no applicable route");
  const collect = (field) => [...new Set(selected.flatMap((route) => route[field] ?? []))].sort();
  const selectedRouteScenarios = selected.map((route) => ({ route, scenarioIds: routeScenarioIds(route) }));
  const scenarios = [...new Set(selectedRouteScenarios.flatMap((entry) => entry.scenarioIds))].sort();
  const obligationBindings = canonicalEvidenceBindings(
    selectedRouteScenarios.flatMap(({ route, scenarioIds }) => materializeRouteObligations(route, scenarioIds)),
  );
  const currentWeaponParity = currentWeaponParityPlan(selected, scenarios);
  const authorityTaskIds = collect("authorityTaskIds");
  const authorityCommands = authorityTaskIds.map(displayCommandForTask);
  const backendDispositions = canonicalBackendDispositions(
    selected.flatMap((route) => route.backendDispositions ?? []),
  );
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
    routeScenarios: selectedRouteScenarios
      .map(({ route, scenarioIds }) => ({ routeId: route.id, scenarioIds: [...scenarioIds].sort() }))
      .sort((left, right) => left.routeId.localeCompare(right.routeId)),
    scenarios,
    currentWeaponParity,
    evidenceCommands: scenarios.flatMap((id) =>
      evidenceCommandsForScenario(scenarioById(id)).map((evidence) => ({ id, ...evidence })),
    ),
    journeyCheckpoints: [...new Set(selected.map((route) => route.journeyCheckpoint))].sort(),
    baseComparisons: [...new Set(selected.map((route) => route.baseComparison))].sort(),
    interactionMatrices: collect("interactionMatrices"),
    capabilityClaims: collect("capabilityClaims"),
    obligationBindings,
    buildTargets: collect("buildTargets"),
    journeyCommands: collect("journeyCommands"),
    journeyTaskIds: collect("journeyTaskIds"),
    authorityTaskIds,
    authorityCommands,
    backendDispositions,
    scope: canonicalDiffScope({
      changedFiles: normalized,
      routes: selected.map((route) => route.id),
      scenarios,
      journeyCheckpoints: selected.map((route) => route.journeyCheckpoint),
      baseComparisons: selected.map((route) => route.baseComparison),
      interactionMatrices: collect("interactionMatrices"),
      capabilityClaims: collect("capabilityClaims"),
      buildTargets: collect("buildTargets"),
      journeyCommands: collect("journeyCommands"),
      authorityCommands,
      backendDispositions,
      obligationBindings,
    }),
    unrelatedUnitTestsAreGameplayEvidence: false,
    scopeDigest: diffScopeDigest({
      changedFiles: normalized,
      routes: selected.map((route) => route.id),
      scenarios,
      journeyCheckpoints: selected.map((route) => route.journeyCheckpoint),
      baseComparisons: selected.map((route) => route.baseComparison),
      interactionMatrices: collect("interactionMatrices"),
      capabilityClaims: collect("capabilityClaims"),
      buildTargets: collect("buildTargets"),
      journeyCommands: collect("journeyCommands"),
      authorityCommands,
      backendDispositions,
      obligationBindings,
    }),
    routeDefinitionDigest: routeDefinitionDigest(),
  };
}

async function executeApprovedEvidence(command, state) {
  const steps = parseApprovedEvidenceCommand(command),
    receipts = [];
  for (const step of steps) {
    const resources =
      step.kind === "build"
        ? ["resources/build"]
        : ["canonical-live", "node"].includes(step.kind)
          ? ["resources/browser", "resources/build"]
          : [];
    const receipt = await withResourceLeases(resources, (spawnStep) =>
      executeApprovedEvidenceStep(step, state, spawnStep),
    );
    receipts.push(receipt);
    if (!["passed", "skipped"].includes(receipt.status)) break;
  }
  return {
    status:
      receipts.length === steps.length &&
      receipts.every((entry) => entry.status === "passed" || entry.status === "skipped")
        ? "passed"
        : "failed",
    receipts,
  };
}

function executeApprovedEvidenceStep(step, state, spawnStep) {
  const before = readSourceIdentity();
  if (state.source === undefined) state.source = before;
  else if (state.source.fingerprint !== before.fingerprint || state.source.revision !== before.revision) {
    throw new Error("selected evidence source changed before execution");
  }
  let result;
  if (step.kind === "build") {
    if (state.testStandaloneBuilt)
      return { kind: step.kind, status: "skipped", reason: "deduplicated test-standalone build" };
    if (process.env.TEARBENCH_REUSE_VERIFIED_BUILDS === "1") {
      state.build = validateServedBuildIdentity(readServedBuildInfo(), before);
      state.testStandaloneBuilt = true;
      return {
        kind: step.kind,
        status: "skipped",
        reason: "verified plan dependency reuse",
        source: before,
        build: state.build,
      };
    }
    result = spawnStep(process.execPath, [resolve(root, "scripts", "build-target.mjs"), "test-standalone"], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status === 0) state.testStandaloneBuilt = true;
  } else if (step.kind === "canonical-live") {
    const pnpmEntry = process.env.npm_execpath;
    if (!pnpmEntry)
      throw new Error(
        "TearBench must be launched through pnpm so canonical live evidence can reuse the pinned package manager",
      );
    result = spawnStep(process.execPath, [resolve(root, "scripts", "tearbench.mjs"), "run", step.scenarioId], {
      cwd: root,
      encoding: "utf8",
    });
  } else if (step.kind === "vitest") {
    result = spawnStep(
      process.execPath,
      [resolve(root, "node_modules", "vitest", "vitest.mjs"), "run", ...step.files],
      { cwd: root, encoding: "utf8" },
    );
  } else if (step.kind === "docs-check") {
    result = spawnStep(process.execPath, [step.file], { cwd: root, encoding: "utf8" });
  } else if (step.kind === "node-version") {
    result = spawnStep(process.execPath, ["--version"], { cwd: root, encoding: "utf8" });
  } else {
    result = spawnStep(process.execPath, step.kind === "node-check" ? ["--check", step.file] : [step.file], {
      cwd: root,
      encoding: "utf8",
    });
  }
  const after = readSourceIdentity();
  if (after.fingerprint !== before.fingerprint || after.revision !== before.revision) {
    throw new Error(`selected evidence command changed source identity (${step.kind})`);
  }
  if (step.kind === "build" && result.status === 0)
    state.build = validateServedBuildIdentity(readServedBuildInfo(), after);
  return {
    kind: step.kind,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    source: after,
    ...(state.build === undefined ? {} : { build: state.build }),
  };
}

function writeDiffCapabilityReport(scope, state, executions) {
  if (scope.scenarios.length === 0 && scope.buildTargets.length === 0 && scope.journeyCommands.length === 0)
    return undefined;
  const canonicalScope = canonicalDiffScope(scope);
  const report = {
    format: "tearbench-diff-capability",
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    kind: "last-run-diff",
    cumulative: false,
    executionClass: "engineering",
    source: state.source ?? readSourceIdentity(),
    ...(state.build === undefined ? {} : { build: state.build }),
    scope: canonicalScope,
    scopeDigest: diffScopeDigest(canonicalScope),
    routeDefinitionDigest: routeDefinitionDigest(),
    status: executions.every((entry) => entry.status === "passed") ? "passed" : "failed",
    executions,
  };
  const path = resolve(root, "artifacts", "tearbench", "generated", "diff-capability.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return workspaceRelativePath(path);
}

async function executeSelectedEvidence(
  scenarios,
  journeyCommands = [],
  buildTargets = [],
  authorityCommands = [],
  scope = {},
) {
  const state = { testStandaloneBuilt: false, source: readSourceIdentity() },
    executions = [],
    completedCommands = new Map();
  const executionScope = canonicalDiffScope({ scenarios, journeyCommands, buildTargets, ...scope });
  const runOne = async (id, command, backend = "explicit-command") => {
    const completed = completedCommands.get(command);
    if (completed !== undefined) {
      executions.push({ ...completed, id, backend, reusedExecutionId: completed.id });
      return true;
    }
    const execution = await executeApprovedEvidence(command, state);
    const result = {
      id,
      backend,
      command,
      status: execution.status,
      receipts: execution.receipts,
      source: state.source,
      ...(state.build === undefined ? {} : { build: state.build }),
    };
    executions.push(result);
    if (execution.status === "passed") completedCommands.set(command, result);
    return execution.status === "passed";
  };
  for (const target of buildTargets) {
    const policy = evidencePolicy.buildTargets[target];
    if (policy === undefined) throw new TypeError(`unknown TearBench build target: ${target}`);
    if (!(await runOne(`build-target:${target}`, displayCommandForTask(policy.taskId))))
      return { status: "failed", executions };
  }
  for (const id of scenarios) {
    for (const evidence of evidenceCommandsForScenario(scenarioById(id))) {
      if (!(await runOne(id, evidence.command, evidence.backend))) break;
    }
    if (!executions.every((entry) => entry.status === "passed")) break;
  }
  if (executions.every((entry) => entry.status === "passed")) {
    for (const command of journeyCommands) if (!(await runOne(`journey:${command}`, command))) break;
  }
  if (executions.every((entry) => entry.status === "passed")) {
    for (const command of authorityCommands) if (!(await runOne(`authority:${command}`, command))) break;
  }
  const status = executions.every((entry) => entry.status === "passed") ? "passed" : "failed";
  const obligationExecution = canonicalEvidenceBindings(scope.obligationBindings ?? []).map((binding) => {
    const matched = executions.filter((entry) => binding.commands.includes(entry.command));
    return {
      ...binding,
      status: matched.length > 0 && matched.every((entry) => entry.status === "passed") ? "passed" : "failed",
      executionIds: matched.map((entry) => entry.id),
    };
  });
  const generatedArtifact = writeDiffCapabilityReport(executionScope, state, executions);
  return { status, executions, obligationExecution, ...(generatedArtifact === undefined ? {} : { generatedArtifact }) };
}

function executeRegistryTask(task, spawnTask) {
  const runner = task.runner;
  const options = { cwd: root, stdio: "inherit", env: registryTaskEnvironment(task) };
  if (runner.kind === "build-target") {
    return spawnTask(process.execPath, [resolve(root, runner.executable), ...runner.args], options);
  }
  if (runner.kind === "node" && runner.executable === "node") {
    return spawnTask(process.execPath, runner.args, options);
  }
  if (["vitest", "typescript", "eslint", "wrangler", "tearbench", "certifier"].includes(runner.kind)) {
    return spawnTask(process.execPath, [resolve(root, runner.executable), ...runner.args], options);
  }
  throw new TypeError(`unsupported TearBench task runner: ${String(runner.kind)}`);
}

async function verifyRegistryBuildDependencies(task) {
  for (const dependency of task.dependencies.filter((entry) => entry.outputId === "build-artifact")) {
    const producer = taskById.get(dependency.taskId),
      output = producer?.outputs.find((entry) => entry.outputId === "build-artifact");
    const mode = producer?.runner.kind === "build-target" ? producer.runner.args[0] : undefined;
    if (output === undefined || typeof mode !== "string")
      throw new TypeError(`${task.taskId} has an invalid build dependency`);
    const target = mode.endsWith("crazygames") ? "crazygames" : "standalone";
    const directory = resolve(root, output.path),
      info = JSON.parse(await readFile(resolve(directory, "build-info.json"), "utf8"));
    const verified = await verifyReleaseArtifact({
      directory,
      expectedRepository: info.repository,
      expectedSha: info.sha,
      expectedTarget: target,
      expectedMode: mode,
      sourceDirectory: root,
      allowDirty: true,
    });
    const record = JSON.parse(
      await readFile(resolve(root, "artifacts", "tearbench", "generated", "builds", `${mode}.json`), "utf8"),
    );
    if (record.buildIdentityDigest !== verified.metadata.buildIdentityDigest) {
      throw new Error(`${task.taskId} build dependency does not match its immutable build record`);
    }
    await verifyContentAddressedBuild({
      workspaceRoot: root,
      directory: resolve(root, record.contentAddressedPath),
      expectedRecord: record,
    });
  }
}

async function runTaskProfile() {
  const usage = "usage: pnpm tearbench tasks <list-profile|run-profile> <profile-id>";
  const action = process.argv[3],
    profileId = process.argv[4];
  if (!["list-profile", "run-profile"].includes(action) || typeof profileId !== "string" || process.argv.length !== 5) {
    throw new TypeError(usage);
  }
  const profile = taskRegistry.profiles[profileId];
  if (!Array.isArray(profile) || profile.some((id) => !taskById.has(id)))
    throw new RangeError(`unknown or invalid TearBench task profile: ${profileId}`);
  const ordered = dependencyOrderedTaskIds(profile, taskRegistry.tasks);
  if (action === "list-profile") {
    console.log(
      JSON.stringify(
        { format: "tearbench-task-profile", schemaVersion: 1, profileId, declaredTaskIds: profile, taskIds: ordered },
        null,
        2,
      ),
    );
    return;
  }
  for (const [index, taskId] of ordered.entries()) {
    const task = taskById.get(taskId);
    console.log(`TASK ${String(index + 1)}/${String(ordered.length)} ${taskId}`);
    const result = await withResourceLeases(taskResourceKeys(task), async (spawnTask) => {
      await verifyRegistryBuildDependencies(task);
      return executeRegistryTask(task, spawnTask);
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

async function writeShadowPlan(explain = false) {
  const usage =
    "usage: pnpm tearbench <plan|explain> --profile <development|pull-request|protected-main|release|nightly|endurance> [--files comma,list | --files-from path | --revision sha] [--artifact path]";
  const profileId = option("--profile");
  if (!["development", "pull-request", "protected-main", "release", "nightly", "endurance"].includes(profileId))
    throw new TypeError(usage);
  const selection = evidenceForDiff(await changedFiles());
  selection.executionRequirements = Object.freeze({
    toolchain: executionToolchainBinding(packageSource),
    environment: executionEnvironmentBinding(),
  });
  const requestedRevision = option("--revision");
  if (requestedRevision !== undefined) {
    const revision = spawnSync("git", ["rev-parse", requestedRevision], { cwd: root, encoding: "utf8" });
    const parent = spawnSync("git", ["rev-parse", `${requestedRevision}^1`], { cwd: root, encoding: "utf8" });
    if (revision.status !== 0 || parent.status !== 0)
      throw new RangeError(`TearBench historical planning basis is not resolvable: ${requestedRevision}`);
    selection.planningBasis = Object.freeze({
      kind: "historical-commit",
      revision: revision.stdout.trim(),
      parentRevision: parent.stdout.trim(),
    });
  }
  const plan = createTearBenchShadowPlan({
    registry: taskRegistry,
    policy: evidencePolicy,
    selection,
    catalog,
    routes: evidenceRoutes,
    profileId,
  });
  const output = await prepareWorkspaceOutput(
    resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "generated", "shadow-plan.json"))),
    "artifacts/tearbench/generated/",
    "shadow plan",
  );
  await writeFile(output.absolute, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  console.log(`${plan.diagnostics.status.toUpperCase()} shadow plan ${plan.planDigest}`);
  console.log(`profile: ${plan.profileId} (${String(plan.requiredTaskIds.length)} unique task(s))`);
  console.log(`critical-path upper bound: ${String(plan.estimates.dependencyCriticalPathMs)} ms`);
  console.log(`artifact: ${output.absolute}`);
  if (explain)
    for (const entry of plan.explanations) {
      console.log(`${entry.taskId}: ${entry.selectedBecause.join(", ")}`);
      if (entry.unprovedWithout.length > 0) console.log(`  unproved without: ${entry.unprovedWithout.join(", ")}`);
    }
  if (plan.diagnostics.status !== "complete") process.exitCode = 1;
}

export function formatFailedEvidenceExecution(evidenceExecution, outputLimit = 8_000) {
  if (evidenceExecution?.status !== "failed" || !Array.isArray(evidenceExecution.executions)) return "";
  const failures = evidenceExecution.executions.filter((entry) => entry?.status === "failed");
  const lines = [];
  const appendOutput = (label, value) => {
    const output = typeof value === "string" ? value.trim() : "";
    if (output === "") return;
    const bounded = output.length > outputLimit ? `${output.slice(0, outputLimit)}\n...[truncated]` : output;
    lines.push(`${label}:\n${bounded}`);
  };
  for (const failure of failures) {
    lines.push(`TearBench selected evidence failed: ${String(failure.id ?? "<unknown>")}`);
    if (typeof failure.command === "string") lines.push(`command: ${failure.command}`);
    for (const receipt of Array.isArray(failure.receipts) ? failure.receipts : []) {
      if (receipt?.status !== "failed") continue;
      lines.push(`step: ${String(receipt.kind ?? "<unknown>")} exit=${String(receipt.exitCode ?? 1)}`);
      appendOutput("stdout", receipt.stdout);
      appendOutput("stderr", receipt.stderr);
    }
  }
  return lines.join("\n");
}

export function verifyCurrentWeaponParityExecution(selection, evidence) {
  if (selection.currentWeaponParity.required !== true) return evidence;
  // Preserve the first real execution failure so callers can emit its captured
  // receipts. Parity completeness is only meaningful once the selected
  // evidence set itself passed; otherwise a later missing weapon masks the
  // command that actually stopped execution.
  if (evidence?.status !== "passed") return evidence;
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
    if (
      browser.source?.fingerprint !== selection.source.fingerprint ||
      browser.source?.revision !== selection.source.revision
    ) {
      throw new Error(`required current ${weapon} live-to-detached parity evidence has stale source identity`);
    }
    if (browser.build !== undefined) validateServedBuildIdentity(browser.build, selection.source);
  }
  return {
    ...evidence,
    currentWeaponParity: {
      status: "passed",
      weapons: [...selection.currentWeaponParity.weapons],
      scenarios: [...selection.currentWeaponParity.scenarios],
    },
  };
}

export function currentWeaponParitySelection() {
  const selected = evidenceForDiff(["src/gameplay/weapon-selection.ts"]);
  const scenarios = [...selected.currentWeaponParity.scenarios];
  const scope = canonicalDiffScope({
    ...selected.scope,
    scenarios,
    journeyCheckpoints: ["current-five-weapon-live-detached-parity"],
    buildTargets: ["test-standalone"],
    journeyCommands: [],
    authorityCommands: [],
  });
  return {
    ...selected,
    scenarios,
    evidenceCommands: scenarios.flatMap((id) =>
      evidenceCommandsForScenario(scenarioById(id)).map((evidence) => ({ id, ...evidence })),
    ),
    journeyCommands: [],
    authorityCommands: [],
    scope,
    scopeDigest: diffScopeDigest(scope),
  };
}

async function executeCurrentWeaponParity() {
  const selection = currentWeaponParitySelection();
  const scope = selection.scope;
  const existingPath = resolve(root, "artifacts", "tearbench", "generated", "diff-capability.json");
  const reused = await withResourceLeases(["resources/browser", "resources/build"], async () => {
    if (existsSync(existingPath)) {
      try {
        const existing = JSON.parse(readFileSync(existingPath, "utf8"));
        if (canReuseDiffCapabilityReport({ ...selection, scope }, existing)) {
          return {
            ...selection,
            evidenceExecution: {
              ...verifyCurrentWeaponParityExecution(selection, existing),
              reusedExactSourceEvidence: true,
            },
          };
        }
      } catch {
        // Missing, incomplete, stale, or mismatched evidence is replaced by fresh real browser proof.
      }
    }
    return undefined;
  });
  if (reused !== undefined) return reused;
  return {
    ...selection,
    evidenceExecution: verifyCurrentWeaponParityExecution(
      selection,
      await executeSelectedEvidence(selection.scenarios, [], ["test-standalone"], [], scope),
    ),
  };
}

async function writeSelection(selection) {
  const artifactPath = resolve(
    option("--artifact", resolve(root, "artifacts", "tearbench", "generated", "evidence-selection.json")),
  );
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(selection, null, 2));
  console.log(`artifact: ${artifactPath}`);
  return artifactPath;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function canReuseDiffCapabilityReport(selection, existing) {
  if (
    existing?.format !== "tearbench-diff-capability" ||
    existing.schemaVersion !== 2 ||
    existing.kind !== "last-run-diff" ||
    existing.cumulative !== false ||
    existing.status !== "passed"
  )
    return false;
  const source = selection.source;
  const exactSource =
    existing.source?.revision === source.revision &&
    existing.source?.state === source.state &&
    existing.source?.fingerprint === source.fingerprint &&
    existing.source?.worktreeFingerprint === source.worktreeFingerprint;
  const exactScope =
    existing.scopeDigest === selection.scopeDigest &&
    canonicalJson(existing.scope ?? {}) === canonicalJson(selection.scope);
  return exactSource && exactScope && existing.routeDefinitionDigest === selection.routeDefinitionDigest;
}

/** Share the same tracked/untracked source digest used by actual standalone builds. */
export function readSourceIdentity() {
  const source = readSourceIdentitySync(root);
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  });
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  return Object.freeze({ ...source, worktreeFingerprint: createHash("sha256").update(status.stdout).digest("hex") });
}

function readServedBuildInfo() {
  const path = resolve(root, "dist", "test-standalone", "build-info.json");
  if (!existsSync(path)) throw new Error("selected evidence requires dist/test-standalone/build-info.json");
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (
    value?.format !== "tear-build-info" ||
    value?.schemaVersion !== 1 ||
    typeof value.sha !== "string" ||
    typeof value.target !== "string" ||
    typeof value.sourceRevision !== "string" ||
    typeof value.sourceState !== "string" ||
    typeof value.sourceFingerprint !== "string" ||
    typeof value.artifactHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.toolchain?.digest) ||
    !/^[0-9a-f]{64}$/u.test(value.configuration?.digest) ||
    !/^[0-9a-f]{64}$/u.test(value.buildIdentityDigest) ||
    value.contentAddressedPath !== `artifacts/tearbench/builds/${value.buildIdentityDigest}/payload`
  ) {
    throw new TypeError("served test build has incomplete build-info identity");
  }
  return Object.freeze({
    sha: value.sha,
    target: value.target,
    mode: value.mode,
    sourceRevision: value.sourceRevision,
    sourceState: value.sourceState,
    sourceFingerprint: value.sourceFingerprint,
    artifactHash: value.artifactHash,
    artifactFiles: value.artifactFiles,
    toolchainDigest: value.toolchain.digest,
    configurationDigest: value.configuration.digest,
    buildIdentityDigest: value.buildIdentityDigest,
    contentAddressedPath: value.contentAddressedPath,
  });
}

export function validateServedBuildIdentity(build, source = readSourceIdentity()) {
  if (build.target !== "standalone")
    throw new Error(`selected evidence build target is ${String(build.target)}, expected standalone`);
  if (build.sha !== source.revision || build.sourceRevision !== source.revision) {
    throw new Error("selected evidence build revision does not match the executed source");
  }
  if (build.sourceState !== source.state || build.sourceFingerprint !== source.fingerprint) {
    throw new Error("selected evidence build source fingerprint/state does not match the executed source");
  }
  return build;
}

async function executeRun(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath) {
  return await withResourceLeases(["resources/browser", "resources/build"], (spawnTask) =>
    executeLeasedRun(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath, spawnTask),
  );
}

async function executeLeasedRun(scenario, seed, repeat, artifactPath, actionTracePath, replayContextPath, spawnTask) {
  if (scenario.stateForge !== undefined && seed !== scenario.seed) {
    throw new RangeError(
      `canonical State Forge scenario ${scenario.id} requires its authoritative catalog seed ${scenario.seed}`,
    );
  }
  const invocations = runLiveMaterializer(
    scenario,
    seed,
    repeat,
    artifactPath,
    actionTracePath,
    replayContextPath,
    spawnTask,
  );
  const passed =
    invocations.length === repeat &&
    invocations.every((entry) => entry.status === 0) &&
    existsSync(artifactPath) &&
    isPassedTearBenchRunArtifact(artifactPath);
  if (!passed && !existsSync(artifactPath)) {
    const diagnostic = {
      format: "tearbench-run-materialization-diagnostic",
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      status: "failed",
      source: readSourceIdentity(),
      requested: Object.freeze({ scenarioId: scenario.id, seed, repeat }),
      declaredEvidence: evidenceCommandsForScenario(scenario),
      rerunSupported: false,
      reason: "the live materializer exited before producing a replayable tearbench-run artifact",
      invocations: invocations.map((entry) =>
        Object.freeze({
          index: entry.index,
          exitCode: entry.status ?? 1,
          stdout: entry.stdout ?? "",
          stderr: entry.stderr ?? "",
          artifact: workspaceRelativePath(entry.artifact),
        }),
      ),
    };
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(diagnostic, null, 2)}\n`, "utf8");
  }
  console.log(`${passed ? "PASS" : "FAIL"} ${scenario.id} seed=${seed} repeat=${String(repeat)}`);
  console.log(`artifact: ${artifactPath}`);
  if (!passed) {
    for (const invocation of invocations.filter((entry) => entry.status !== 0)) {
      const stdout = typeof invocation.stdout === "string" ? invocation.stdout.trim() : "";
      const stderr = typeof invocation.stderr === "string" ? invocation.stderr.trim() : "";
      if (stdout !== "") console.error(`materializer stdout (attempt ${String(invocation.index + 1)}):\n${stdout}`);
      if (stderr !== "") console.error(`materializer stderr (attempt ${String(invocation.index + 1)}):\n${stderr}`);
    }
    process.exitCode = 1;
  }
}

function workspaceRelativePath(path) {
  const resolved = resolve(path);
  const stored = relative(root, resolved).replaceAll("\\", "/");
  if (stored === "" || stored.startsWith("../") || isAbsolute(stored))
    throw new TypeError(`artifacts must remain inside the workspace: ${path}`);
  return stored;
}

function assertCanonicalContainment(canonicalRoot, canonicalPath, label, allowRoot = false) {
  const stored = relative(canonicalRoot, canonicalPath).replaceAll("\\", "/");
  if ((!allowRoot && stored === "") || stored.startsWith("../") || isAbsolute(stored))
    throw new TypeError(`${label} resolves outside the workspace`);
}

async function prepareWorkspaceOutput(path, requiredPrefix, label) {
  const stored = workspaceRelativePath(path);
  if (!stored.startsWith(requiredPrefix)) throw new TypeError(`${label} must remain under ${requiredPrefix}`);
  const absolute = resolve(root, stored);
  const canonicalRoot = await realpath(root);
  let ancestor = dirname(absolute);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new TypeError(`${label} has no resolvable workspace ancestor`);
    ancestor = parent;
  }
  assertCanonicalContainment(canonicalRoot, await realpath(ancestor), label, true);
  await mkdir(dirname(absolute), { recursive: true });
  assertCanonicalContainment(canonicalRoot, await realpath(dirname(absolute)), label);
  try {
    const outputInfo = await lstat(absolute);
    if (outputInfo.isSymbolicLink()) throw new TypeError(`${label} cannot overwrite a symbolic link or junction`);
    assertCanonicalContainment(canonicalRoot, await realpath(absolute), label);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return Object.freeze({ stored, absolute });
}

const command = process.argv[2] ?? "help";
try {
  if (command === "list") {
    for (const entry of catalog) console.log(`${entry.id}\t${entry.description}`);
  } else if (command === "run") {
    const id = process.argv[3];
    if (!id)
      throw new TypeError(
        "usage: pnpm tearbench run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]",
      );
    const scenario = scenarioById(id);
    const seed = option("--seed", scenario.stateForge === undefined ? "1001" : scenario.seed);
    const repeat = Number.parseInt(option("--repeat", "1"), 10);
    if (!Number.isSafeInteger(repeat) || repeat < 1 || repeat > 100)
      throw new RangeError("--repeat must be an integer from 1 through 100");
    const defaultArtifact = resolve(root, "artifacts", "tearbench", "runs", `${id}-${seed}.json`);
    await executeRun(scenario, seed, repeat, resolve(option("--artifact", defaultArtifact)), option("--actions"));
  } else if (command === "rerun") {
    const artifactPath = option("--artifact");
    if (!artifactPath) throw new TypeError("usage: pnpm tearbench rerun --artifact <run.json>");
    const prior = JSON.parse(await readFile(resolve(artifactPath), "utf8"));
    if (prior.format !== "tearbench-run") throw new TypeError("rerun requires a materialized tearbench-run artifact");
    const scenario = scenarioById(prior.resolvedScenario?.id);
    await executeRun(
      scenario,
      prior.seed,
      1,
      resolve(artifactPath),
      prior.rerun?.actionTrace ?? undefined,
      resolve(artifactPath),
    );
  } else if (command === "forge" && process.argv[3] === "wave99") {
    const artifactPath = resolve(
      option("--artifact", resolve(root, "artifacts", "tearbench", "hard-endless-wave-99-hammer.json")),
    );
    const evidence = runFiles([
      "tests/unit/tearbench-tearsdl.test.ts",
      "tests/unit/tearbench-progression-ledger.test.ts",
    ]);
    const passed = evidence.status === 0;
    const artifact = {
      format: "tearbench-forge-command",
      schemaVersion: 1,
      scenarioId: "hard-endless-wave-99-hammer",
      request: { mode: "endless", difficulty: "hard", weapon: "hammer", wave: 99, seed: "990099" },
      generatedBy: "createWave99HammerPackage",
      artifacts: Object.fromEntries(
        [
          ["legal-ledger", "The forge does not materialize a legal-ledger artifact."],
          ["opportunity-counts", "The forge does not materialize opportunity-counts."],
          ["configuration-trace", "The forge does not materialize a configuration trace."],
          ["validation-report", "Test output is captured, but no report file is created."],
          ["visible-episode", "The forge does not launch a visible episode."],
          ["snapshot", "The forge does not materialize a snapshot."],
          ["replay", "The forge does not materialize a replay."],
          ["metrics", "The forge does not materialize metrics."],
        ].map(([id, reason]) => [id, { status: "unavailable", reason }]),
      ),
      status: passed ? "passed" : "failed",
      evidence: {
        status: evidence.status,
        command:
          "pnpm exec vitest run tests/unit/tearbench-tearsdl.test.ts tests/unit/tearbench-progression-ledger.test.ts",
        stdout: evidence.stdout,
        stderr: evidence.stderr,
      },
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`${passed ? "PASS" : "FAIL"} hard-endless-wave-99-hammer`);
    console.log(`artifact: ${artifactPath}`);
    if (!passed) process.exitCode = 1;
  } else if (command === "parity" && process.argv[3] === "current-weapons") {
    const result = await executeCurrentWeaponParity();
    if (result.evidenceExecution.status !== "passed") process.exitCode = 1;
    await writeSelection(result);
  } else if (command === "select") {
    const selection = evidenceForDiff(await changedFiles());
    const result = process.argv.includes("--execute-evidence")
      ? {
          ...selection,
          evidenceExecution: verifyCurrentWeaponParityExecution(
            selection,
            await executeSelectedEvidence(
              selection.scenarios,
              selection.journeyCommands,
              selection.buildTargets,
              selection.authorityCommands,
              selection.scope,
            ),
          ),
        }
      : selection;
    if (result.evidenceExecution?.status === "failed") process.exitCode = 1;
    await writeSelection(result);
  } else if (command === "ci") {
    const selection = evidenceForDiff(await changedFiles());
    const artifactPath = await writeSelection(selection);
    const docsOnly = selection.routes.length === 1 && selection.routes[0] === "documentation-only";
    const scenarioFiles = selection.scenarios.flatMap((id) => scenarioById(id).testFiles);
    const files = [...new Set(["tests/unit/tearbench-runner.test.ts", ...scenarioFiles])];
    const docsEvidence = docsOnly
      ? await executeSelectedEvidence([], [], [], selection.authorityCommands, selection.scope)
      : undefined;
    const evidence = docsOnly
      ? { status: docsEvidence.status === "passed" ? 0 : 1, stdout: "", stderr: "" }
      : runFiles(files);
    if (evidence.stdout) process.stdout.write(evidence.stdout);
    if (evidence.stderr) process.stderr.write(evidence.stderr);
    const evidenceExecution = docsOnly
      ? docsEvidence
      : evidence.status === 0
        ? verifyCurrentWeaponParityExecution(
            selection,
            await executeSelectedEvidence(
              selection.scenarios,
              selection.journeyCommands,
              selection.buildTargets,
              selection.authorityCommands,
              selection.scope,
            ),
          )
        : { status: "skipped", reason: "selected unit evidence failed", executions: [] };
    await writeFile(artifactPath, `${JSON.stringify({ ...selection, evidenceExecution }, null, 2)}\n`, "utf8");
    const failureDiagnostics = formatFailedEvidenceExecution(evidenceExecution);
    if (failureDiagnostics !== "") process.stderr.write(`${failureDiagnostics}\n`);
    console.log(`selection: ${artifactPath}`);
    if (evidence.status !== 0 || evidenceExecution.status === "failed") process.exitCode = 1;
  } else if (command === "plan" || command === "explain") {
    await writeShadowPlan(command === "explain");
  } else if (command === "tasks") {
    await runTaskProfile();
  } else {
    console.log(
      "TearBench CLI\n  list\n  plan --profile <profile> [--files comma,list | --files-from path] [--artifact path]\n  explain --profile <profile> [--files comma,list | --files-from path] [--artifact path]\n  tasks <list-profile|run-profile> <profile-id>\n  run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]\n  rerun --artifact <run.json>\n  forge wave99 [--artifact path]\n  select [--files comma,list | --files-from path] [--artifact path]\n  ci [--files comma,list | --files-from path] [--registry path] [--artifact path]",
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
