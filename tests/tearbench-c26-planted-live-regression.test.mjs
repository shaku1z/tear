/*
 * C26 end-to-end proof.  This creates two disposable, committed source
 * revisions under ignored TearBench artifacts. The candidate changes actual
 * player dash gameplay; no production test hook or synthetic observation is
 * used to create the divergence.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import { describe, it } from "node:test";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proofRoot = resolve(root, "artifacts", "tearbench", "c26", "planted-live-regression");
// Keep disposable Git roots short enough for Windows worktree checkouts of the
// repository's long audio revision paths. This remains ignored workspace data.
const workspaceRoot = resolve(root, "artifacts", "t26w");
const sourceEntries = [".gitignore", "index.html", "package.json", "pnpm-lock.yaml", "vite.config.ts", "src", "tests", "scripts", "public"];
const pnpmEntry = process.env.npm_execpath
  ?? (process.env.APPDATA === undefined ? undefined : resolve(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.mjs"));

function withinArtifacts(path) {
  const relativePath = relative(resolve(root, "artifacts"), path);
  return relativePath !== "" && !relativePath.startsWith("..");
}

function command(executable, args, cwd = root) {
  return execFileSync(executable, args, {
    cwd, encoding: "utf8", stdio: "pipe", windowsHide: true,
  });
}

function pnpm(workspace, args) {
  if (pnpmEntry === undefined || !existsSync(pnpmEntry)) throw new Error("C26 proof requires pnpm's JavaScript entry point");
  return command(process.execPath, [pnpmEntry, "--dir", workspace, ...args], workspace);
}

function git(workspace, args) {
  return command("git", ["-C", workspace, ...args], workspace);
}

function copyBaseRevision(target) {
  for (const entry of sourceEntries) {
    const source = resolve(root, entry);
    if (existsSync(source)) cpSync(source, resolve(target, entry), { recursive: true, force: true });
  }
  git(target, ["init"]);
  git(target, ["config", "user.email", "tearbench@example.invalid"]);
  git(target, ["config", "user.name", "TearBench C26"]);
  git(target, ["add", "-A"]);
  git(target, ["commit", "-m", "baseline dash behavior"]);
  assert.equal(git(target, ["status", "--porcelain"]).trim(), "", "disposable revision must be clean");
}

function plantCandidateRevision(target) {
  const playerPath = resolve(target, "src", "gameplay", "entities", "player.ts");
  const original = readFileSync(playerPath, "utf8");
  const needle = "this.vx = this.dashX * D.speed;";
  assert.equal(original.split(needle).length - 1, 1, "planted branch mutation must target exactly one real dash velocity statement");
  writeFileSync(playerPath, original.replace(needle, "this.vx = this.dashX * (D.speed * 0.5); // C26 planted regression: horizontal dash distance halved."));
  git(target, ["add", "src/gameplay/entities/player.ts"]);
  git(target, ["commit", "-m", "plant dash regression"]);
  assert.equal(git(target, ["status", "--porcelain"]).trim(), "", "candidate revision must be clean");
}

function materialize(workspace, artifact, actionTrace, replayContext, maxTicks = 80) {
  pnpm(workspace, ["build:test:standalone"]);
  const args = [resolve(workspace, "tests", "browser-tearbench-live-materialize.js"), "movement-jump", "--seed", "c26-planted-dash", "--max-ticks", String(maxTicks), "--artifact", artifact];
  if (actionTrace !== undefined) args.push("--actions", actionTrace);
  if (replayContext !== undefined) args.push("--replay-context", replayContext);
  command(process.execPath, args, workspace);
}

function tearbench(args) {
  if (pnpmEntry === undefined || !existsSync(pnpmEntry)) throw new Error("C26 proof requires pnpm's JavaScript entry point");
  return command(process.execPath, [pnpmEntry, "tearbench", ...args], root);
}

describe("C26 planted live gameplay regression", () => {
  it("discovers, reproduces, minimizes, fixes, retains, and clean-process-reruns a real dash regression", { timeout: 360_000 }, () => {
    assert.ok(withinArtifacts(proofRoot), "the disposable proof directory must remain under ignored artifacts");
    assert.ok(withinArtifacts(workspaceRoot), "the disposable workspaces must remain under ignored artifacts");
    rmSync(proofRoot, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
    const workspaces = workspaceRoot;
    const baseWorkspace = resolve(workspaces, "base");
    const candidateWorkspace = resolve(workspaces, "candidate");
    mkdirSync(baseWorkspace, { recursive: true });
    copyBaseRevision(baseWorkspace);
    command("git", ["clone", baseWorkspace, candidateWorkspace]);
    plantCandidateRevision(candidateWorkspace);

    const baseRun = resolve(proofRoot, "base-original.json");
    const candidateRun = resolve(proofRoot, "candidate-original.json");
    materialize(baseWorkspace, baseRun);
    materialize(candidateWorkspace, candidateRun, `${baseRun.replace(/\.json$/u, "")}.actions.json`);
    const investigation = resolve(proofRoot, "investigation.json");
    tearbench(["investigate", "--base", baseRun, "--candidate", candidateRun, "--artifact", investigation]);
    const investigationArtifact = JSON.parse(readFileSync(investigation, "utf8"));
    assert.equal(investigationArtifact.status, "diverged");
    assert.equal(investigationArtifact.comparison.firstMaterialDivergence.tick, 25);

    const originalFailure = resolve(proofRoot, "original-failure.json");
    tearbench(["failure", "--base", baseRun, "--candidate", candidateRun, "--investigation", investigation, "--artifact", originalFailure]);

    const minimization = resolve(proofRoot, "minimization.json");
    tearbench(["minimize", "--base", baseRun, "--candidate", candidateRun,
      "--base-workspace", baseWorkspace, "--candidate-workspace", candidateWorkspace,
      "--repetitions", "2", "--max-pairs", "28", "--artifact", minimization]);
    const minimized = JSON.parse(readFileSync(minimization, "utf8"));
    assert.equal(minimized.signature.firstDivergenceTick, 25);
    assert.ok(minimized.minimalChild.actions.length < 8, "minimization must remove at least one original action");
    assert.ok(minimized.minimalChild.actions.some((action) => action.command.type === "dash"), "minimal replay must retain the causal dash action");
    assert.equal(minimized.minimalChild.maxTicks, 25);

    const minimalBase = resolve(root, minimized.materializedArtifacts[minimized.minimalChild.base.id]);
    const minimalCandidate = resolve(root, minimized.materializedArtifacts[minimized.minimalChild.candidate.id]);
    const baseCommit = git(baseWorkspace, ["rev-parse", "HEAD"]).trim();
    const candidateCommit = git(candidateWorkspace, ["rev-parse", "HEAD"]).trim();
    const bisection = resolve(candidateWorkspace, "artifacts", "tearbench", "c26-planted-bisection.json");
    command(process.execPath, [resolve(candidateWorkspace, "scripts", "tearbench-bisect-worktree.mjs"),
      "--good", baseCommit, "--bad", candidateCommit, "--scenario", "movement-jump", "--seed", "c26-planted-dash",
      "--actions", `${minimalBase.replace(/\.json$/u, "")}.actions.json`, "--repetitions", "2", "--max-revisions", "2", "--artifact", bisection], candidateWorkspace);
    const bisectionArtifact = JSON.parse(readFileSync(bisection, "utf8"));
    assert.equal(bisectionArtifact.result.status, "first-bad-found");
    assert.equal(bisectionArtifact.result.firstBadRevision, candidateCommit);
    assert.equal(bisectionArtifact.ownership.route.owner, "gameplay");
    const bisectionWorktreeRoot = resolve(candidateWorkspace, "artifacts", "tearbench", "bisect-worktrees");
    assert.deepEqual(existsSync(bisectionWorktreeRoot) ? readdirSync(bisectionWorktreeRoot) : [], [], "guarded bisection must remove its isolated worktree");

    const minimalInvestigation = resolve(proofRoot, "minimal-investigation.json");
    tearbench(["investigate", "--base", minimalBase, "--candidate", minimalCandidate, "--artifact", minimalInvestigation]);
    const minimalFailure = resolve(proofRoot, "minimal-failure.json");
    tearbench(["failure", "--base", minimalBase, "--candidate", minimalCandidate, "--investigation", minimalInvestigation, "--artifact", minimalFailure]);

    const fixedRun = resolve(proofRoot, "fixed-run.json");
    materialize(baseWorkspace, fixedRun, `${minimalBase.replace(/\.json$/u, "")}.actions.json`, minimalBase, minimized.minimalChild.maxTicks);
    const fixedComparison = resolve(proofRoot, "fixed-comparison.json");
    tearbench(["investigate", "--base", minimalBase, "--candidate", fixedRun, "--artifact", fixedComparison]);
    assert.equal(JSON.parse(readFileSync(fixedComparison, "utf8")).status, "equivalent");

    const registry = resolve(proofRoot, "graveyard-registry.json");
    const fixCommit = git(baseWorkspace, ["rev-parse", "HEAD"]).trim();
    tearbench(["graveyard", "register", "--id", "c26-planted-dash-distance", "--signature", "sha256:c26-planted-dash-distance",
      "--original", originalFailure, "--minimal", minimalFailure, "--minimal-replay", minimalCandidate, "--minimal-side", "candidate",
      "--fix-commit", fixCommit, "--fix-base", minimalBase, "--fix-candidate", fixedRun,
      "--invariant", "replay.branch-equivalence", "--selectors", "movement-boundary-history,all-shared-runtime-history", "--owner", "gameplay",
      "--registry", registry]);
    const rerun = resolve(proofRoot, "graveyard-rerun.json");
    tearbench(["graveyard", "run", "--cases", "all-shared-runtime-history", "--registry", registry, "--artifact", rerun]);
    const rerunArtifact = JSON.parse(readFileSync(rerun, "utf8"));
    assert.equal(rerunArtifact.status, "passed");
    assert.deepEqual(rerunArtifact.selectedCaseIds, ["c26-planted-dash-distance"]);

    // A later gameplay change is routed through TearBench CI, which selects
    // the retained case by the durable movement selector without naming it.
    tearbench(["ci", "--files", "src/gameplay/entities/player.ts", "--registry", registry]);
    const selectedByFutureChange = JSON.parse(readFileSync(resolve(root, "artifacts", "tearbench", "graveyard-rerun.json"), "utf8"));
    assert.equal(selectedByFutureChange.status, "passed");
    assert.deepEqual(selectedByFutureChange.selectedCaseIds, ["c26-planted-dash-distance"]);
  });
});
