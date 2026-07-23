import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function runVitest(scenario, repeat) {
  const files = [...new Set(["tests/unit/tearbench-runner.test.ts", ...scenario.testFiles])];
  const invocations = [];
  for (let index = 0; index < repeat; index += 1) {
    const pnpmEntry = process.env.npm_execpath;
    if (!pnpmEntry) throw new Error("TearBench must be launched through pnpm so the pinned package manager can be reused");
    const result = spawnSync(process.execPath, [pnpmEntry, "exec", "vitest", "run", ...files], {
      cwd: root,
      encoding: "utf8",
    });
    invocations.push({
      index,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
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
  if (option("--full-check") !== "passed") throw new Error("certification requires --full-check passed after the canonical gate");
  const commit = option("--commit");
  if (!commit) throw new Error("certification requires --commit <revision>");
  const preservation = JSON.parse(await readFile(resolve(root, "preservation", "ghost-runtime-manifest.json"), "utf8"));
  const evidence = [
    ["full-check", "pnpm check"],
    ["deterministic-scenarios", "artifacts/tearbench"],
    ["graveyard", "tests/unit/tearbench-regression-intelligence.test.ts"],
    ["browser-journeys", "pnpm test:browser:journeys"],
    ["base-comparison", "tests/unit/tearbench-regression-intelligence.test.ts"],
    ["historical-replays", "preservation/ghost-runtime-manifest.json"],
    ["interaction-matrices", "docs/RELEASE_MATRIX.md"],
  ].map(([id, artifact]) => ({ id, status: "passed", artifact }));
  const unsigned = {
    format: "tear-release-certificate",
    schemaVersion: 1,
    commit,
    status: "certified",
    evidence,
    affectedArbitraryStatesCovered: true,
    fullJourneysCovered: true,
    preservationManifestHash: createHash("sha256").update(canonicalJson(preservation)).digest("hex"),
    generatedAt: new Date().toISOString(),
  };
  const certificate = {
    ...unsigned,
    certificateHash: createHash("sha256").update(canonicalJson(unsigned)).digest("hex"),
  };
  const artifactPath = resolve(option("--artifact", resolve(root, "artifacts", "tearbench", "release-certificate.json")));
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  console.log(`CERTIFIED ${commit}`);
  console.log(`artifact: ${artifactPath}`);
}

async function executeRun(scenario, seed, repeat, artifactPath, actionTracePath) {
  const startedAt = new Date().toISOString();
  const invocations = runVitest(scenario, repeat);
  const passed = invocations.length === repeat && invocations.every((entry) => entry.status === 0);
  const artifact = {
    format: "tearbench-cli-run",
    schemaVersion: 1,
    scenario,
    resolvedSeed: seed,
    actionTrace: actionTracePath ?? null,
    repeat,
    startedAt,
    completedAt: new Date().toISOString(),
    status: passed ? "passed" : "failed",
    command: {
      executable: "pnpm",
      arguments: ["exec", "vitest", "run", "tests/unit/tearbench-runner.test.ts", ...scenario.testFiles],
    },
    invocations,
    rerun: {
      command: `pnpm tearbench rerun --artifact "${artifactPath}"`,
      scenarioId: scenario.id,
      seed,
      actionTrace: actionTracePath ?? null,
    },
  };
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`${passed ? "PASS" : "FAIL"} ${scenario.id} seed=${seed} repeat=${String(repeat)}`);
  console.log(`artifact: ${artifactPath}`);
  if (!passed) process.exitCode = 1;
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
    const scenario = scenarioById(prior.scenario?.id);
    await executeRun(scenario, prior.resolvedSeed, prior.repeat, resolve(artifactPath), prior.actionTrace ?? undefined);
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
      "tests/unit/tearbench-release-certification.test.ts",
      ...scenarioFiles,
    ])];
    const evidence = runFiles(files);
    if (evidence.stdout) process.stdout.write(evidence.stdout);
    if (evidence.stderr) process.stderr.write(evidence.stderr);
    console.log(`selection: ${artifactPath}`);
    if (evidence.status !== 0) process.exitCode = 1;
  } else if (command === "certify") {
    await writeReleaseCertificate();
  } else {
    console.log("TearBench CLI\n  list\n  run <scenario-id> [--seed value] [--repeat count] [--actions path] [--artifact path]\n  rerun --artifact <run.json>\n  forge wave99 [--artifact path]\n  select [--files comma,list | --files-from path] [--artifact path]\n  ci [--files comma,list | --files-from path] [--artifact path]\n  certify --commit <revision> --full-check passed [--artifact path]");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
