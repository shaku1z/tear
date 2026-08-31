import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { calculateArtifactHash, readSourceIdentitySync } from "./release-artifact.mjs";
import { shadowTaskDefinitionDigest } from "./tearbench-shadow-plan.mjs";
import { canonicalJson, createPlanCertificate, createTaskAttemptReceipt, expectedTaskBindings, receiptSha256 } from "./tearbench-task-receipts.mjs";

const root = resolve(import.meta.dirname, "..");
const registry = JSON.parse(await readFile(resolve(root, "src/tearbench/task-registry.json"), "utf8"));
const packageSource = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

function strictOptions(argumentsList, allowed, usage) {
  if (argumentsList.length !== allowed.length * 2) throw new TypeError(usage);
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index], value = argumentsList[index + 1];
    if (!allowed.includes(name) || Object.hasOwn(values, name) || value === undefined || value.startsWith("--")) throw new TypeError(usage);
    values[name] = value;
  }
  if (allowed.some((name) => !Object.hasOwn(values, name))) throw new TypeError(usage);
  return values;
}
function sourceIdentity() {
  const source = readSourceIdentitySync(root);
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0) throw new Error(status.stderr || "unable to inspect task source");
  return Object.freeze({ ...source,
    worktreeFingerprint: createHash("sha256").update(status.stdout).digest("hex") });
}
function originFromEnvironment() {
  if (process.env.GITHUB_ACTIONS !== "true") return Object.freeze({ kind: "local" });
  return Object.freeze({ kind: "github-actions", repository: process.env.GITHUB_REPOSITORY ?? "",
    workflow: process.env.GITHUB_WORKFLOW ?? "", runId: process.env.GITHUB_RUN_ID ?? "",
    job: process.env.GITHUB_JOB ?? "", attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? "0") });
}
function executeTask(task) {
  const runner = task.runner;
  const executable = runner.kind === "node" && runner.executable === "node" ? process.execPath : process.execPath;
  const args = runner.kind === "node" && runner.executable === "node"
    ? runner.args : [resolve(root, runner.executable), ...runner.args];
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, TEARBENCH_TASK_ID: task.taskId } });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  return result;
}
async function workspacePath(stored) {
  if (typeof stored !== "string" || stored.length === 0 || isAbsolute(stored) || stored.includes("..") || stored.includes("\\")) {
    throw new TypeError(`unsafe task output path: ${String(stored)}`);
  }
  const absolute = resolve(root, stored), canonicalRoot = await realpath(root), canonical = await realpath(absolute);
  const resolved = relative(canonicalRoot, canonical).replaceAll("\\", "/");
  if (resolved === "" || resolved.startsWith("../") || isAbsolute(resolved)) throw new TypeError(`task output escapes workspace: ${stored}`);
  return { absolute: canonical, stored: resolved };
}
async function workspaceInput(path, label) {
  const requested = resolve(path), lexical = relative(root, requested).replaceAll("\\", "/");
  const direct = await lstat(requested);
  if (direct.isSymbolicLink()) throw new TypeError(`${label} is a symlink or junction`);
  const canonicalRoot = await realpath(root), canonical = await realpath(requested);
  const stored = relative(canonicalRoot, canonical).replaceAll("\\", "/");
  if (stored === "" || stored.startsWith("../") || isAbsolute(stored) || stored !== lexical) throw new TypeError(`${label} resolves outside the workspace or through an alias`);
  return { absolute: canonical, stored };
}
async function workspaceOutput(path, requiredPrefix, label) {
  const absolute = resolve(path), stored = relative(root, absolute).replaceAll("\\", "/");
  if (!stored.startsWith(requiredPrefix) || stored.includes("..") || isAbsolute(stored)) throw new TypeError(`${label} is outside ${requiredPrefix}`);
  let existing = dirname(absolute);
  while (!existsSync(existing)) existing = dirname(existing);
  const canonicalRoot = await realpath(root), canonicalExisting = await realpath(existing);
  const lexicalExisting = relative(root, existing).replaceAll("\\", "/");
  const resolvedExisting = relative(canonicalRoot, canonicalExisting).replaceAll("\\", "/");
  if (resolvedExisting !== lexicalExisting) throw new TypeError(`${label} parent uses a symlink or junction alias`);
  await mkdir(dirname(absolute), { recursive: true });
  const canonicalParent = await realpath(dirname(absolute));
  const parent = relative(canonicalRoot, canonicalParent).replaceAll("\\", "/");
  const lexicalParent = relative(root, dirname(absolute)).replaceAll("\\", "/");
  if (parent.startsWith("../") || isAbsolute(parent) || parent !== lexicalParent) throw new TypeError(`${label} parent resolves outside the workspace or through an alias`);
  return { absolute, stored };
}
async function directoryManifest(path) {
  const entries = [];
  const visit = async (directory, prefix = "") => {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      const absolute = resolve(directory, name), stored = prefix === "" ? name : `${prefix}/${name}`;
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new TypeError(`task output contains a symlink or junction: ${stored}`);
      if (metadata.isDirectory()) await visit(absolute, stored);
      else if (metadata.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path: stored, sha256: receiptSha256(bytes), size: bytes.length });
      } else throw new TypeError(`task output contains a non-file entry: ${stored}`);
    }
  };
  await visit(path);
  return Buffer.from(canonicalJson(entries), "utf8");
}
async function artifactDescriptor(output) {
  const direct = await lstat(resolve(root, output.path));
  if (direct.isSymbolicLink()) throw new TypeError(`task output is a symlink or junction: ${output.path}`);
  const value = await workspacePath(output.path), metadata = await stat(value.absolute);
  const bytes = metadata.isDirectory() ? await directoryManifest(value.absolute) : await readFile(value.absolute);
  return { path: value.stored, kind: metadata.isDirectory() ? "directory-manifest" : "file",
    sha256: receiptSha256(bytes), size: bytes.length, outputId: output.outputId, bytes };
}
function toolchainBinding() {
  return Object.freeze({ node: process.version, pnpm: process.env.npm_config_user_agent ?? packageSource.packageManager,
    playwright: packageSource.devDependencies?.playwright ?? packageSource.dependencies?.playwright ?? "unknown" });
}
function environmentBinding(task) {
  return Object.freeze({ platform: platform(), arch: arch(), runner: process.env.RUNNER_NAME ?? "local",
    runnerImage: process.env.ImageOS ?? "local", resourceClass: task.resourceClass, resourceKeys: [...task.resourceKeys].sort() });
}
async function buildBinding(requirement, plan) {
  const attestations = [];
  for (const dependency of requirement.dependencies) {
    const buildInfoPath = `${dependency.path}/build-info.json`;
    const input = await workspaceInput(resolve(root, buildInfoPath), "dependency build-info");
    if (input.stored !== buildInfoPath) throw new TypeError(`dependency build-info uses a symlink or alias: ${buildInfoPath}`);
    const bytes = await readFile(input.absolute), info = JSON.parse(bytes.toString("utf8"));
    const artifact = await calculateArtifactHash(resolve(root, dependency.path));
    if (info.format !== "tear-build-info" || info.schemaVersion !== 1 || info.sourceRevision !== plan.source.revision
      || info.sourceFingerprint !== plan.source.fingerprint || !/^[0-9a-f]{64}$/u.test(info.artifactHash)
      || info.artifactHash !== artifact.hash) {
      throw new TypeError(`dependency build-info is stale or malformed: ${buildInfoPath}`);
    }
    attestations.push({ ...dependency, buildInfoPath, buildInfoSha256: receiptSha256(bytes), artifactHash: info.artifactHash,
      sourceRevision: info.sourceRevision, sourceFingerprint: info.sourceFingerprint, target: info.target, mode: info.mode ?? null });
  }
  return Object.freeze({ requirement, attestations: Object.freeze(attestations), produced: Object.freeze([]) });
}
async function producedBuildAttestations(requirement, plan) {
  const produced = [];
  for (const output of requirement.outputs) {
    const buildInfoPath = `${output.path}/build-info.json`;
    if (!existsSync(resolve(root, buildInfoPath))) continue;
    const input = await workspaceInput(resolve(root, buildInfoPath), "produced build-info");
    if (input.stored !== buildInfoPath) throw new TypeError(`produced build-info uses a symlink or alias: ${buildInfoPath}`);
    const bytes = await readFile(input.absolute), info = JSON.parse(bytes.toString("utf8"));
    const artifact = await calculateArtifactHash(resolve(root, output.path));
    if (info.format !== "tear-build-info" || info.schemaVersion !== 1 || info.sourceRevision !== plan.source.revision
      || info.sourceFingerprint !== plan.source.fingerprint || !/^[0-9a-f]{64}$/u.test(info.artifactHash)
      || info.artifactHash !== artifact.hash) throw new TypeError(`produced build-info is stale or malformed: ${buildInfoPath}`);
    produced.push({ ...output, buildInfoPath, buildInfoSha256: receiptSha256(bytes), artifactHash: info.artifactHash,
      sourceRevision: info.sourceRevision, sourceFingerprint: info.sourceFingerprint, target: info.target, mode: info.mode ?? null });
  }
  return Object.freeze(produced);
}
export async function executePlanTask({ planPath, taskId, missionId, attemptNumber }) {
  const planInput = await workspaceInput(planPath, "task plan");
  const plan = JSON.parse(await readFile(planInput.absolute, "utf8"));
  const task = registry.tasks.find((entry) => entry.taskId === taskId);
  const node = plan.taskNodes?.find((entry) => entry.taskId === taskId);
  if (task === undefined || node === undefined || !plan.requiredTaskIds?.includes(taskId)) throw new RangeError(`plan does not require registered task ${taskId}`);
  const { planDigest, ...planPayload } = plan;
  if (receiptSha256(planPayload) !== planDigest) throw new TypeError("task plan digest is stale or malformed");
  if (shadowTaskDefinitionDigest(task, registry.definitionPolicyVersion) !== node.taskDefinitionDigest) throw new TypeError(`task definition drift: ${taskId}`);
  const before = sourceIdentity();
  if (canonicalJson(before) !== canonicalJson(plan.source)) throw new Error(`task ${taskId} source drifted from its plan`);
  if (["pull-request", "protected-main", "release"].includes(plan.profileId) && before.state !== "clean") {
    throw new Error(`task ${taskId} release-authority source is dirty`);
  }
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 2) throw new TypeError("task attempts are limited to one initial run and one retry");
  const origin = originFromEnvironment();
  const bindings = expectedTaskBindings(plan, taskId);
  if (canonicalJson(toolchainBinding()) !== canonicalJson(bindings.toolchain)
    || canonicalJson(environmentBinding(task)) !== canonicalJson(bindings.environment)) {
    throw new Error(`task ${taskId} toolchain or environment drifted from its plan`);
  }
  let verifiedBuild = await buildBinding(bindings.build, plan);
  const attemptDirectory = resolve(root, `artifacts/tearbench/missions/${missionId}/${taskId}`);
  await workspaceOutput(resolve(attemptDirectory, "preflight-placeholder"), "artifacts/tearbench/missions/", "task attempt receipt");
  const currentMatches = (await readdir(attemptDirectory)).filter((name) => name.startsWith(`attempt-${String(attemptNumber).padStart(4, "0")}-`));
  if (currentMatches.length > 0) throw new Error(`task ${taskId} attempt ${String(attemptNumber)} already exists`);
  let retryOf = null;
  if (attemptNumber > 1) {
    const matches = (await readdir(attemptDirectory)).filter((name) => name.startsWith(`attempt-${String(attemptNumber - 1).padStart(4, "0")}-`));
    if (matches.length !== 1) throw new Error(`task ${taskId} retry requires exactly one immutable prior attempt`);
    const previous = await workspaceInput(resolve(attemptDirectory, matches[0]), "prior task attempt receipt");
    if (previous.stored !== `artifacts/tearbench/missions/${missionId}/${taskId}/${matches[0]}`) throw new TypeError("prior task attempt uses a symlink or alias");
    retryOf = JSON.parse(await readFile(previous.absolute, "utf8")).receiptDigest;
  }
  const startedAt = new Date().toISOString(), result = executeTask(task), finishedAt = new Date().toISOString();
  const after = sourceIdentity();
  if (canonicalJson(before) !== canonicalJson(after)) throw new Error(`task ${taskId} changed its source identity`);
  const descriptors = [];
  for (const output of task.outputs) {
    if (!existsSync(resolve(root, output.path))) continue;
    descriptors.push(await artifactDescriptor(output));
  }
  verifiedBuild = Object.freeze({ ...verifiedBuild, produced: await producedBuildAttestations(bindings.build, plan) });
  const outputsComplete = descriptors.length === task.outputs.length;
  const status = result.status === 0 && outputsComplete ? "passed" : "failed";
  const exitCode = status === "passed" ? 0 : result.status === 0 ? 1 : result.status ?? 1;
  const receipt = createTaskAttemptReceipt({ missionId, plan, taskId, attemptNumber, retryOf,
    retryAuthorization: attemptNumber > 1 ? process.env.TEARBENCH_RETRY_AUTHORIZATION ?? null : null,
    source: before, authority: origin.kind === "github-actions" ? "protected-ci" : "local-engineering", origin,
    build: verifiedBuild, toolchain: bindings.toolchain, environment: bindings.environment, evidence: bindings.evidence,
    status, exitCode, startedAt, finishedAt,
    stdout: result.stdout ?? "", stderr: `${result.stderr ?? ""}${outputsComplete ? "" : "\nmissing declared task output"}`,
    artifacts: descriptors.map((entry) => ({ outputId: entry.outputId, path: entry.path, sha256: entry.sha256, size: entry.size })) });
  const output = await workspaceOutput(resolve(root, receipt.immutablePath), "artifacts/tearbench/missions/", "task attempt receipt");
  await writeFile(output.absolute, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ receipt, path: output.absolute });
}

export async function certifyPlanMission({ planPath, receiptPaths, artifactPath }) {
  const planInput = await workspaceInput(planPath, "certificate plan");
  const plan = JSON.parse(await readFile(planInput.absolute, "utf8"));
  const receipts = await Promise.all(receiptPaths.map(async (path) => {
    const input = await workspaceInput(path, "task attempt receipt");
    if (!input.stored.startsWith("artifacts/tearbench/missions/")) throw new TypeError("task attempt receipt is outside the immutable mission store");
    const receipt = JSON.parse(await readFile(input.absolute, "utf8"));
    if (input.stored !== receipt.immutablePath) throw new TypeError("task attempt receipt path does not match its immutable identity");
    return receipt;
  }));
  const artifactBytes = {}, buildArtifactHashes = {};
  for (const receipt of receipts) for (const artifact of receipt.artifacts ?? []) {
    try { artifactBytes[artifact.path] = (await artifactDescriptor({ path: artifact.path, outputId: artifact.outputId })).bytes; }
    catch { /* The pure certifier reports a missing/altered artifact. */ }
  }
  for (const receipt of receipts) for (const attestation of [
    ...(receipt.bindings?.build?.attestations ?? []), ...(receipt.bindings?.build?.produced ?? []),
  ]) {
    try {
      artifactBytes[attestation.buildInfoPath] = await readFile((await workspaceInput(attestation.buildInfoPath, "build-info attestation")).absolute);
      buildArtifactHashes[attestation.path] = (await calculateArtifactHash(resolve(root, attestation.path))).hash;
    }
    catch { /* The pure certifier reports a missing/altered build attestation. */ }
  }
  const certificate = createPlanCertificate({ plan, receipts, expectedOrigin: originFromEnvironment(), artifactBytes,
    buildArtifactHashes, generatedAt: new Date().toISOString() });
  const output = await workspaceOutput(artifactPath, "artifacts/tearbench/generated/", "plan certificate");
  await writeFile(output.absolute, `${JSON.stringify(certificate, null, 2)}\n`, { flag: "wx" });
  return Object.freeze({ certificate, path: output.absolute });
}

const invoked = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === "run-task") {
    const usage = "usage: node scripts/tearbench-task-execution.mjs run-task --plan path --task id --mission id --attempt number";
    const values = strictOptions(process.argv.slice(3), ["--plan", "--task", "--mission", "--attempt"], usage);
    const result = await executePlanTask({ planPath: values["--plan"], taskId: values["--task"],
      missionId: values["--mission"], attemptNumber: Number(values["--attempt"]) });
    console.log(`${result.receipt.result.status.toUpperCase()} ${result.receipt.attemptId}`); console.log(`receipt: ${result.path}`);
    if (result.receipt.result.status !== "passed") process.exitCode = result.receipt.result.exitCode;
  } else if (action === "certify") {
    const usage = "usage: node scripts/tearbench-task-execution.mjs certify --plan path --receipts path,path --artifact path";
    const values = strictOptions(process.argv.slice(3), ["--plan", "--receipts", "--artifact"], usage);
    const receipts = values["--receipts"].split(",").map((entry) => entry.trim()).filter(Boolean);
    const result = await certifyPlanMission({ planPath: values["--plan"], receiptPaths: receipts, artifactPath: values["--artifact"] });
    console.log(`${result.certificate.status.toUpperCase()} ${result.certificate.planDigest}`); console.log(`certificate: ${result.path}`);
    if (result.certificate.status !== "certified") process.exitCode = 1;
  } else throw new TypeError("usage: node scripts/tearbench-task-execution.mjs <run-task|certify> ...");
}
