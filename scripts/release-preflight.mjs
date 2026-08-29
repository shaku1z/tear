import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_REPOSITORY } from "./release-artifact.mjs";
import { assertCampaignPublicationAllowed, readCampaignPublicationPolicy } from "./campaign-publication-boundary.mjs";

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

export async function validateReleaseRepository({
  root,
  evidencePath,
  expectedRepository = RELEASE_REPOSITORY,
  expectedSha,
  fetch = true,
}) {
  const repositoryRoot = resolve(root);
  const status = runGit(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status !== "") throw new Error(`release checkout is dirty:\n${status}`);
  const branch = runGit(repositoryRoot, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`release checkout must be on main, found ${branch || "detached HEAD"}`);
  const upstream = runGit(repositoryRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (upstream !== "origin/main") throw new Error(`main must track origin/main, found ${upstream}`);
  if (fetch) runGit(repositoryRoot, ["fetch", "--no-tags", "origin", "main"]);
  const head = runGit(repositoryRoot, ["rev-parse", "HEAD"]).toLowerCase();
  const remote = runGit(repositoryRoot, ["rev-parse", "origin/main"]).toLowerCase();
  const [aheadText, behindText] = runGit(repositoryRoot, ["rev-list", "--left-right", "--count", "HEAD...origin/main"])
    .split(/\s+/u);
  const ahead = Number(aheadText);
  const behind = Number(behindText);
  if (head !== remote || ahead !== 0 || behind !== 0) {
    throw new Error(`main must exactly equal origin/main (ahead=${String(ahead)}, behind=${String(behind)}, HEAD=${head}, origin/main=${remote})`);
  }
  if (expectedSha !== undefined && head !== expectedSha.toLowerCase()) {
    throw new Error(`release HEAD ${head} does not equal expected validated SHA ${expectedSha.toLowerCase()}`);
  }
  const evidence = JSON.parse(await readFile(resolve(evidencePath), "utf8"));
  const evidenceErrors = [];
  if (evidence.format !== "tear-release-evidence" || evidence.schemaVersion !== 1) evidenceErrors.push("unsupported evidence format");
  if (evidence.repository !== expectedRepository) evidenceErrors.push(`repository ${String(evidence.repository)} != ${expectedRepository}`);
  if (evidence.sha !== head) evidenceErrors.push(`SHA ${String(evidence.sha)} != ${head}`);
  if (evidence.validationWorkflow !== "Validate") evidenceErrors.push("validation workflow is not Validate");
  if (evidence.validationConclusion !== "success") evidenceErrors.push("validation conclusion is not success");
  if (!/^[1-9][0-9]*$/u.test(String(evidence.validationRunId))) evidenceErrors.push("validation run ID is missing");
  if (evidenceErrors.length > 0) throw new Error(`release evidence rejected:\n- ${evidenceErrors.join("\n- ")}`);
  assertCampaignPublicationAllowed(await readCampaignPublicationPolicy(repositoryRoot));
  return Object.freeze({ repository: expectedRepository, sha: head, validationRunId: String(evidence.validationRunId) });
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = resolve(import.meta.dirname, "..");
  const evidenceIndex = process.argv.indexOf("--evidence");
  const evidencePath = evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : process.env.TEAR_RELEASE_EVIDENCE;
  if (!evidencePath) throw new Error("release preflight requires --evidence <path> or TEAR_RELEASE_EVIDENCE");
  const result = await validateReleaseRepository({
    root: projectRoot,
    evidencePath,
    expectedRepository: process.env.TEAR_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY,
    expectedSha: process.env.TEAR_RELEASE_SHA || process.env.GITHUB_SHA,
    fetch: !process.argv.includes("--no-fetch"),
  });
  console.log(`PASS release preflight: ${result.repository}@${result.sha} (Validate ${result.validationRunId})`);
}
