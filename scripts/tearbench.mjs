import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createReleaseCertificate, verifyReleaseEvidenceManifest } from "./tearbench-release-evidence-verifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = resolve(root, "src", "tearbench", "canonical-scenarios.json");
const evidenceRoutesPath = resolve(root, "src", "tearbench", "evidence-routes.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const evidenceRoutes = JSON.parse(await readFile(evidenceRoutesPath, "utf8"));

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function scenarioById(id) {
  const scenario = catalog.find((entry) => entry.id === id);
  if (!scenario) throw new RangeError(`unknown TearBench scenario: ${id}`);
  return scenario;
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

function evidenceForDiff(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const matched = evidenceRoutes.filter((route) =>
    normalized.some((file) => route.prefixes.some((prefix) => file.startsWith(prefix))));
  const selected = matched.length > 0 ? matched : evidenceRoutes.filter((route) => route.id === "shared-runtime");
  const collect = (field) => [...new Set(selected.flatMap((route) => route[field]))].sort();
  return {
    format: "tearbench-evidence-selection",
    schemaVersion: 1,
    changedFiles: normalized,
    routes: selected.map((route) => route.id).sort(),
    scenarios: collect("scenarios"),
    graveyardCases: collect("graveyardCases"),
    journeyCheckpoints: [...new Set(selected.map((route) => route.journeyCheckpoint))].sort(),
    baseComparisons: [...new Set(selected.map((route) => route.baseComparison))].sort(),
    interactionMatrices: collect("interactionMatrices"),
    unrelatedUnitTestsAreGameplayEvidence: false,
  };
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

async function writeReleaseCertificate() {
  const manifestOption = option("--manifest");
  const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "release-certificate.json")));
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
      includes: ["legal-ledger", "opportunity-counts", "configuration-trace", "validation-report", "visible-episode", "snapshot", "replay", "metrics"],
      status: passed ? "passed" : "failed",
      evidence: { status: evidence.status, stdout: evidence.stdout, stderr: evidence.stderr },
    };
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(`${passed ? "PASS" : "FAIL"} hard-endless-wave-99-hammer`);
    console.log(`artifact: ${artifactPath}`);
    if (!passed) process.exitCode = 1;
  } else if (command === "select") {
    await writeSelection(evidenceForDiff(await changedFiles()));
  } else if (command === "ci") {
    const selection = evidenceForDiff(await changedFiles());
    const artifactPath = await writeSelection(selection);
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
    const evidence = runFiles(files);
    if (evidence.stdout) process.stdout.write(evidence.stdout);
    if (evidence.stderr) process.stderr.write(evidence.stderr);
    const graveyardReport = evidence.status === 0
      ? await executeSelectedGraveyardCases(selection.graveyardCases, {
        registryPath: option("--registry", resolve(root, "artifacts", "tearbench", "graveyard-registry.json")),
        artifactPath: resolve(root, "artifacts", "tearbench", "graveyard-rerun.json"),
      })
      : undefined;
    console.log(`selection: ${artifactPath}`);
    if (evidence.status !== 0 || graveyardReport?.status === "failed") process.exitCode = 1;
  } else if (command === "certify") {
    await writeReleaseCertificate();
  } else {
    console.log("TearBench CLI\n  list\n  run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]\n  rerun --artifact <run.json>\n  investigate --base <tearbench-run.json> --candidate <tearbench-run.json> [--artifact path]\n  failure --base <run.json> --candidate <run.json> [--investigation <investigation.json>] [--artifact path]\n  minimize --base <run.json> --candidate <run.json> --base-workspace <clean-worktree> --candidate-workspace <clean-worktree> [--repetitions 3] [--max-pairs 48] [--artifact path]\n  bisect --good <ancestor-revision> --bad <known-bad-revision> --scenario <canonical-id> [--seed value] [--actions trace.json] [--repetitions 3] [--max-revisions 24]\n  graveyard register --id <slug> --signature <signature> --original <failed-artifact.json> --minimal <failed-artifact.json> --minimal-replay <candidate-run.json> --fix-commit <revision> --fix-base <run.json> --fix-candidate <run.json> --invariant <id> --selectors comma,list --owner <owner> [--hints comma,list] [--registry path]\n  graveyard list [--registry path]\n  graveyard reopen --id <slug> --reason <reason> [--registry path]\n  graveyard run --cases <selector,selector> [--registry path] [--artifact path]\n  forge wave99 [--artifact path]\n  select [--files comma,list | --files-from path] [--artifact path]\n  ci [--files comma,list | --files-from path] [--registry path] [--artifact path]\n  certify --manifest <release-evidence.json> [--artifact path]");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
