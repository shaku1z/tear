// What the Validate workflow must do, tested by behaviour rather than by its exact text.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { hashMismatches } from "../../scripts/ci-build-hashes.mjs";
import { lockedPlaywrightVersion, playwrightImage } from "../../scripts/ci-playwright-image.mjs";
import { FIXED_JOBS, verdictProblems } from "../../scripts/ci-verdict.mjs";
import { loadChecks, selectChecks, shardChecks } from "../../scripts/run-checks.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/gu, "\n");
const workflow = read(".github/workflows/ci.yml");
const checkedCommit = read(".github/actions/checked-commit/action.yml");

/** The trigger names under `on:` with the activity types of `pull_request`. */
function triggers(text) {
  const block = /\non:\n((?: {2}.*\n|#.*\n)+)/u.exec(text)?.[1] ?? "";
  const names = [...block.matchAll(/^ {2}([a-z_]+):/gmu)].map((match) => match[1]);
  const types = /pull_request:\n {4}types: \[([^\]]*)\]/u
    .exec(block)?.[1]
    .split(",")
    .map((type) => type.trim());
  return { names, types };
}

/** Each job's block of ci.yml, by job id. */
function jobs(text) {
  const body = text.slice(text.indexOf("\njobs:\n") + "\njobs:\n".length);
  const blocks = {};
  for (const part of body.split(/\n(?= {2}[a-z][\w-]*:\n)/u)) {
    const id = /^ {2}([a-z][\w-]*):\n/u.exec(part)?.[1];
    if (id !== undefined) blocks[id] = part;
  }
  return blocks;
}

const jobBlocks = jobs(workflow);
const needsOf = (block) => {
  const line = /\n {4}needs: (.*)\n/u.exec(block)?.[1] ?? "";
  return line.startsWith("[")
    ? line
        .slice(1, -1)
        .split(",")
        .map((job) => job.trim())
    : line
      ? [line]
      : [];
};
const shardCount = Number(/--shard \$\{\{ matrix\.shard \}\}\/(\d+)/u.exec(workflow)?.[1]);

/** A job's results for ci-verdict: every job given `result`, then the overrides. */
function needs(result, overrides = {}, docsOnly = "false") {
  const all = Object.fromEntries([...FIXED_JOBS, ...loadChecks().gate].map((job) => [job, { result, outputs: {} }]));
  all.scope = { result: "success", outputs: { docs_only: docsOnly } };
  all.docs = { result: docsOnly === "true" ? "success" : "skipped", outputs: {} };
  for (const [job, value] of Object.entries(overrides)) all[job] = { ...all[job], result: value };
  // An override of undefined means the job is missing from `needs` altogether.
  return Object.fromEntries(Object.entries(all).filter(([job]) => !(job in overrides) || overrides[job] !== undefined));
}

describe("Validate workflow", () => {
  it("runs for ready pull requests, main pushes and by hand, and skips drafts", () => {
    const { names, types } = triggers(workflow);
    expect(names).toEqual(["pull_request", "push", "workflow_dispatch"]);
    expect(types).toEqual(expect.arrayContaining(["opened", "synchronize", "reopened", "ready_for_review"]));
    const draft = "(github.event_name != 'pull_request' || !github.event.pull_request.draft)";
    expect(jobBlocks.scope).toContain(`\n    if: ${draft.slice(1, -1)}\n`);
    // `check` runs even when a needed job failed, but not on a draft, whose run is skipped.
    expect(jobBlocks.check).toContain(`\n    if: always() && ${draft}\n`);
    for (const [id, block] of Object.entries(jobBlocks))
      if (id !== "scope" && id !== "check") expect(needsOf(block), id).toContain("scope");
  });

  it("cancels superseded pull-request runs but never a main run", () => {
    expect(workflow).toMatch(/cancel-in-progress: \$\{\{ github\.event_name != 'push' \}\}/u);
    expect(workflow).toMatch(
      /group: validate-\$\{\{ github\.ref \}\}-\$\{\{ github\.event_name == 'push' && github\.sha/u,
    );
    // A skipped draft run must not share a group with the run that marking ready starts.
    expect(workflow).toMatch(/github\.event\.pull_request\.draft && 'draft' \|\| 'latest'/u);
  });

  it("treats a pull request as docs-only exactly when every changed file is a document", { timeout: 30_000 }, () => {
    // Runs the workflow's own script, so a quoting or escaping mistake in the file fails here.
    const script = /git diff --name-only origin\/main HEAD \| node -e '([^']+)'; then$/mu.exec(workflow)?.[1];
    expect(script, "the docs-only scope script").toBeDefined();
    const docsOnly = (files) =>
      spawnSync(process.execPath, ["-e", script ?? ""], { input: `${files.join("\n")}\n` }).status === 0;
    expect(docsOnly(["docs/RELEASE_AUTHORITY.md", "AGENTS.md", "config/position.json"])).toBe(true);
    expect(docsOnly(["plans/active/x.md", ".github/pull_request_template.md", "README.md"])).toBe(true);
    expect(docsOnly(["wiki/content/notes/combat.md", "wiki/generator/build.mjs"])).toBe(true);
    expect(docsOnly(["docs/x.md", "src/main.ts"])).toBe(false);
    expect(docsOnly(["src/game-reference/wiki-data.ts"])).toBe(false);
    expect(docsOnly(["config/checks.json"])).toBe(false);
    expect(docsOnly(["docsx/a.md"])).toBe(false);
    expect(docsOnly([])).toBe(false);
  });

  it("checks one commit in every job: the head merged with the main commit the scope job picked", () => {
    // GitHub's prepared merge ref is reused by a re-run and can be stale after a reopen.
    for (const [id, block] of Object.entries(jobBlocks)) {
      expect(block, id).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
      if (id === "scope" || !block.includes("checked-commit")) continue;
      expect(block, id).toMatch(
        /uses: \.\/\.github\/actions\/checked-commit\n(?: {8}if: .*\n)? {8}with:\n {10}main: \$\{\{ needs\.scope\.outputs\.merge_main \}\}\n {10}commit: \$\{\{ needs\.scope\.outputs\.commit \}\}\n/u,
      );
    }
    for (const id of loadChecks().gate) expect(jobBlocks[id], id).toContain("./.github/actions/checked-commit");
    // scripts/merge-ready.mjs parses exactly this annotation, from the job named `check`.
    expect(jobBlocks.check).toContain('echo "::notice title=checked::head=$HEAD_SHA main=$MAIN"');
    // Every later step must expect the commit checked out here, not GitHub's GITHUB_SHA: the
    // workspace check, the build's attribution and the artifact verification all read these.
    expect(checkedCommit).toContain('echo "TEAR_RELEASE_SHA=$commit" >> "$GITHUB_ENV"');
    expect(checkedCommit).toContain('echo "TEAR_BUILD_GIT_SHA=$commit" >> "$GITHUB_ENV"');
  });

  it(
    "makes the identical merge commit in every job, and refuses a job that checked out another",
    { timeout: 60_000 },
    () => {
      const script = /\n {4}- name: Merge main into the change\n[\s\S]*?\n {6}run: \|\n((?: {8}.*\n|\n)+)/u
        .exec(checkedCommit)?.[1]
        ?.replace(/^ {8}/gmu, "");
      expect(script, "the merge script").toBeDefined();
      const work = mkdtempSync(join(tmpdir(), "tear-checked-commit-"));
      const sh = (cwd, command, env = {}) =>
        spawnSync("bash", ["-c", command], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
      try {
        const origin = join(work, "origin");
        const commits = ["git init --quiet -b main", "git config user.name t", "git config user.email t@invalid"];
        expect(sh(work, `mkdir origin && cd origin && ${commits.join(" && ")}`).status).toBe(0);
        sh(origin, "echo a > a && git add a && git commit --quiet -m a && git checkout --quiet -b change");
        sh(origin, "echo b > b && git add b && git commit --quiet -m b && git checkout --quiet main");
        sh(origin, "echo c > c && git add c && git commit --quiet -m c");
        const main = sh(origin, "git rev-parse main").stdout.trim();
        const merged = [];
        for (const name of ["one", "two"]) {
          expect(sh(work, `git clone --quiet origin ${name} && cd ${name} && git checkout --quiet change`).status).toBe(
            0,
          );
          const output = join(work, `${name}.out`);
          const env = { MAIN: main, EXPECTED: "", GITHUB_OUTPUT: output, GITHUB_ENV: join(work, `${name}.env`) };
          const result = sh(join(work, name), script ?? "", env);
          expect(result.status, result.stdout + result.stderr).toBe(0);
          merged.push(/commit=([0-9a-f]{40})/u.exec(readFileSync(output, "utf8"))?.[1]);
        }
        expect(merged[0]).toMatch(/^[0-9a-f]{40}$/u);
        expect(merged[1]).toBe(merged[0]);
        const env = {
          MAIN: main,
          EXPECTED: "0".repeat(40),
          GITHUB_OUTPUT: join(work, "x"),
          GITHUB_ENV: join(work, "y"),
        };
        sh(work, "git clone --quiet origin three && cd three && git checkout --quiet change");
        const refused = sh(join(work, "three"), script ?? "", env);
        expect(refused.status).not.toBe(0);
        expect(refused.stdout).toContain("not the commit the scope job recorded");
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
  );

  it("has every script that compares HEAD with GITHUB_SHA prefer the checked commit", () => {
    for (const [file, variable] of [
      ["scripts/check-workspace.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/release-preflight.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/verify-release-artifact.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/build-target.mjs", "TEAR_BUILD_GIT_SHA"],
    ]) {
      expect(read(file), `${file} must read ${variable} before GITHUB_SHA`).toMatch(
        new RegExp(`${variable}[\\s\\S]{0,200}GITHUB_SHA`, "u"),
      );
    }
  });

  it("runs every gate group of config/checks.json as its own job, and nothing else", () => {
    const config = loadChecks();
    const groups = [...workflow.matchAll(/node scripts\/run-checks\.mjs (\w+)/gu)].map((match) => match[1]);
    expect([...groups].sort()).toEqual([...config.gate].sort());
    for (const group of config.gate) expect(jobBlocks[group], `job ${group}`).toContain(`run-checks.mjs ${group}`);
    // The browser shards serve the builds, so they wait for the build job.
    expect(needsOf(jobBlocks.browser)).toContain("build");
    expect(config.groups.static.slice(0, 3).map((check) => check.id)).toEqual(["format", "docs", "terminology"]);
    expect(workflow).not.toMatch(/check:functional|tearbench (?:ci|tasks)/u);
  });

  it("splits the browser group into shards that together run every browser check once", () => {
    expect(shardCount).toBeGreaterThan(1);
    const matrix = /\n {8}shard: \[([^\]]*)\]\n/u.exec(jobBlocks.browser)?.[1].split(",").map(Number);
    expect(matrix).toEqual(Array.from({ length: shardCount }, (_, index) => index + 1));
    const all = selectChecks(loadChecks(), "browser");
    const parts = (matrix ?? []).map((part) => shardChecks(all, part, shardCount).map((check) => check.id));
    expect(parts.flat().sort()).toEqual(all.map((check) => check.id).sort());
    expect(parts.every((part) => part.length > 0)).toBe(true);
    // One shard's failure must not cancel the others, or it would hide their results.
    expect(jobBlocks.browser).toContain("\n      fail-fast: false\n");
  });

  it("lists every check once, and every file a command names exists", () => {
    const config = loadChecks();
    // A path-shaped argument (a slash or a file extension) must exist, because `node --test` and
    // vitest skip a missing file without failing. Files under artifacts/ are outputs a check writes.
    const namesFile = (argument) =>
      !argument.startsWith("-") && !argument.startsWith("artifacts/") && /\/|\.[a-z]+$/u.test(argument);
    for (const group of Object.keys(config.groups)) {
      const ids = selectChecks(config, group).map((check) => check.id);
      expect(new Set(ids).size, `duplicate id in ${group}`).toBe(ids.length);
      for (const check of selectChecks(config, group)) {
        const [command, ...args] = check.args;
        expect(command, check.id).toBe("node");
        for (const file of args.filter(namesFile))
          expect(existsSync(resolve(root, file)), `${group}.${check.id}: ${file}`).toBe(true);
      }
    }
  });

  it("gives no step a key twice (GitHub rejects such a file)", () => {
    for (const [text, indent] of [
      [workflow, 6],
      [checkedCommit, 4],
    ]) {
      for (const step of text.split(new RegExp(`\\n(?= {${String(indent)}}- )`, "u"))) {
        const keys = [...step.matchAll(new RegExp(`^ {${String(indent)}}(?:- | {2})([a-z-]+):`, "gmu"))].map(
          (match) => match[1],
        );
        expect(new Set(keys).size, `duplicate key in step: ${step.split("\n")[0]}`).toBe(keys.length);
      }
    }
  });

  it("uploads the release build once, from the build job, under the name and layout the deploy workflows read", () => {
    const uploads =
      workflow.match(
        /upload-artifact@v4\n(?: {8}if: .*\n)? {8}with:\n(?: {10}#.*\n)* {10}name: tear-release-targets-\$\{\{ needs\.scope\.outputs\.commit \}\}/gu,
      ) ?? [];
    expect(uploads).toHaveLength(1);
    expect(jobBlocks.build).toContain("name: tear-release-targets-");
    // Two paths keep the repository root as the archive root, so deploys find dist/standalone.
    expect(workflow).toMatch(/path: \|\n {12}dist\/standalone\n {12}artifacts\/packages\/tear-crazygames\.zip\n/u);
    expect(read(".github/workflows/deploy-production.yml")).toContain(
      "name: tear-release-targets-${{ steps.validation.outputs.sha }}",
    );
    const preview = read(".github/workflows/deploy-preview.yml");
    expect(preview).toContain("/^tear-release-targets-[0-9a-f]{40}$/");
    expect(preview).toContain("candidate-release/dist/standalone");
    // The build lands before the browser shards finish, so a deploy must refuse a run that failed.
    for (const file of ["deploy-preview.yml", "deploy-production.yml"])
      expect(read(`.github/workflows/${file}`), file).toContain(
        'if (run.conclusion !== "success") errors.push(`conclusion ${run.conclusion} is not success`);',
      );
  });

  it("has every browser shard test the release artifact's bytes, checked by hash before any test", () => {
    const shard = jobBlocks.browser;
    const download = shard.indexOf("name: tear-release-targets-${{ needs.scope.outputs.commit }}");
    const verify = shard.indexOf('run: node scripts/ci-build-hashes.mjs --expect "$EXPECTED"');
    const tests = shard.indexOf("run-checks.mjs browser");
    expect(download).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(download);
    expect(tests).toBeGreaterThan(verify);
    expect(shard).toContain("EXPECTED: ${{ needs.build.outputs.hashes }}");
    expect(jobBlocks.build).toContain('run: echo "hashes=$(node scripts/ci-build-hashes.mjs)" >> "$GITHUB_OUTPUT"');
    expect(jobBlocks.build.indexOf("ci-build-hashes.mjs")).toBeGreaterThan(
      jobBlocks.build.indexOf("run-checks.mjs build"),
    );
    const built = { standalone: "a", crazygames: "b", "test-standalone": "c", "test-crazygames": "d", package: "e" };
    expect(hashMismatches(built, { ...built })).toEqual([]);
    expect(hashMismatches(built, { ...built, standalone: "x" })).toEqual(["standalone"]);
    expect(hashMismatches({ ...built, package: undefined }, built)).toEqual(["package"]);
    expect(hashMismatches(null, built)).toEqual(Object.keys(built));
  });

  it("serves the dev build of the same commit below /dev/ on preview, and never on production", () => {
    // Built and uploaded on main pushes only, as its own artifact.
    expect(jobBlocks.build).toMatch(
      /if: github\.event_name == 'push'\n {8}run: node scripts\/build-target\.mjs test-standalone --preview-dev\n/u,
    );
    expect(jobBlocks.build).toMatch(
      /if: github\.event_name == 'push'\n {8}with:\n {10}name: tear-preview-dev-\$\{\{ needs\.scope\.outputs\.commit \}\}\n {10}path: dist\/preview-dev\n/u,
    );
    const preview = read(".github/workflows/deploy-preview.yml");
    expect(preview).toContain("const devName = `tear-preview-dev-${artifactSha}`;");
    expect(preview).toContain(
      'node scripts/verify-release-artifact.mjs standalone "$RUNNER_TEMP/candidate-dev" test-standalone',
    );
    // Its files are not ignored, so inside the checkout they would make it dirty and fail verification.
    expect(preview).toContain("path: ${{ runner.temp }}/candidate-dev");
    expect(preview).not.toMatch(/path: candidate-dev|cp -r candidate-dev/u);
    expect(preview).toContain('cp -r "$RUNNER_TEMP/candidate-dev" "$site/dev"');
    expect(preview).toContain('--assets "$RUNNER_TEMP/preview-site" \\');
    // The path the deploy uses is the base the dev build is built for.
    expect(read("vite.config.ts")).toContain('export const PREVIEW_DEV_BASE = "/dev/";');
    for (const file of ["deploy-production.yml", "deploy-wiki.yml"]) {
      expect(read(`.github/workflows/${file}`), file).not.toMatch(/preview-dev|candidate-dev/u);
    }
  });

  it("gives each job a limit of at least twice its recorded checks plus setup, and at least 10 minutes", () => {
    // Setup is checkout, install and, for a browser shard, the Chromium download: about 3 minutes.
    const setupSeconds = 180;
    const config = loadChecks();
    const recorded = (checks) => checks.reduce((total, check) => total + check.seconds, 0);
    const limit = (id) => Number(/\n {4}timeout-minutes: (\d+)\n/u.exec(jobBlocks[id] ?? "")?.[1]);
    for (const id of Object.keys(jobBlocks)) expect(limit(id), `${id} has a timeout-minutes`).toBeGreaterThan(0);
    for (const group of config.gate) {
      const checks = selectChecks(config, group);
      const slowest =
        group === "browser"
          ? Math.max(
              ...Array.from({ length: shardCount }, (_, part) => recorded(shardChecks(checks, part + 1, shardCount))),
            )
          : recorded(checks);
      const minutes = Math.max(10, Math.ceil(((slowest + setupSeconds) * 2) / 60));
      expect(limit(group), `${group}: ${String(slowest)} s recorded`).toBeGreaterThanOrEqual(minutes);
      // The point of the parallel jobs: no group may take the old single job's half hour.
      expect(limit(group), group).toBeLessThanOrEqual(20);
    }
  });

  it("gives no job more than read access, and uses no secret", () => {
    expect(workflow).toMatch(/\npermissions:\n {2}contents: read\n {2}actions: read\n/u);
    for (const [id, block] of Object.entries(jobBlocks)) {
      const permissions = /\n {4}permissions:\n((?: {6}.*\n)+)/u.exec(block)?.[1];
      expect(permissions, `${id} states its permissions`).toBeDefined();
      for (const line of (permissions ?? "").trim().split("\n"))
        expect(line.trim(), `${id}: ${line.trim()}`).toMatch(/^(?:contents|actions): read$/u);
    }
    expect(`${workflow}\n${checkedCommit}`).not.toMatch(/secrets\./u);
  });

  it("records batch members only on a run started by hand with a batch, passing the input through env", () => {
    const steps = workflow.split(/\n(?= {6}- )/u);
    const batchSteps = steps.filter((entry) => entry.includes("merge-batch.mjs"));
    // Checked in the scope job before any check runs, and recorded again by `check`, where
    // pnpm merge:ready and merge:batch read the annotation.
    expect(batchSteps).toHaveLength(2);
    expect(jobBlocks.scope).toContain("merge-batch.mjs --record");
    expect(jobBlocks.check).toContain("merge-batch.mjs --record");
    for (const step of batchSteps) {
      expect(step).toMatch(
        /\n {8}if: (?:needs\.scope\.result == 'success' && )?github\.event_name == 'workflow_dispatch' && inputs\.batch != ''\n/u,
      );
      expect(step).toMatch(/\n {10}BATCH: \$\{\{ inputs\.batch \}\}\n/u);
      expect(/\n {8}run: (.*)/u.exec(step)?.[1]).toBe('node scripts/merge-batch.mjs --record "$BATCH"');
    }
    // Nothing else reads the input or writes the batch annotation, so a pull request or main run emits none.
    const others = steps.filter((entry) => !batchSteps.includes(entry));
    expect(others.some((entry) => /BATCH: |title=batch|merge-batch\.mjs/u.test(entry))).toBe(false);
  });

  it("checks out the full history in every job (the oracle comparison reads an old commit)", () => {
    const checkouts = [...workflow.matchAll(/uses: actions\/checkout@v4\n {8}with:\n {10}fetch-depth: (\d+)/gu)];
    expect(checkouts.map((match) => match[1])).toEqual(Object.keys(jobBlocks).map(() => "0"));
    expect(workflow.match(/actions\/checkout@/gu)).toHaveLength(Object.keys(jobBlocks).length);
  });
});

describe("the required check job", () => {
  const gate = loadChecks().gate;

  it("needs the scope and docs jobs and every gate group", () => {
    expect(needsOf(jobBlocks.check).sort()).toEqual([...FIXED_JOBS, ...gate].sort());
    expect(jobBlocks.check).toContain("NEEDS: ${{ toJSON(needs) }}");
    expect(jobBlocks.check).toMatch(/\n {8}run: node scripts\/ci-verdict\.mjs\n?$/u);
  });

  it("passes when every gate job passed, or when a documents-only change passed its document checks", () => {
    expect(verdictProblems(needs("success"), gate)).toEqual([]);
    expect(verdictProblems(needs("skipped", {}, "true"), gate)).toEqual([]);
  });

  it("fails when a needed job failed, timed out, was cancelled or was skipped", () => {
    // A job that hits its timeout-minutes reports failure.
    for (const result of ["failure", "cancelled", "skipped"]) {
      for (const job of gate)
        expect(verdictProblems(needs("success", { [job]: result }), gate), `${job} ${result}`).toEqual([
          `${job}: ${result}`,
        ]);
    }
    expect(verdictProblems(needs("skipped", { docs: "failure" }, "true"), gate)).toEqual(["docs: failure"]);
    expect(verdictProblems(needs("skipped", { docs: "cancelled" }, "true"), gate)).toEqual(["docs: cancelled"]);
  });

  it("fails when the scope job did not pass or gave no answer", () => {
    for (const result of ["failure", "cancelled", "skipped"])
      expect(verdictProblems({ ...needs("skipped"), scope: { result, outputs: {} } }, gate)).toEqual([
        `scope: ${result}`,
      ]);
    expect(verdictProblems({ ...needs("success"), scope: { result: "success", outputs: {} } }, gate)).toEqual([
      "scope: docs_only is undefined",
    ]);
  });

  it("fails when a job ran that the scope said should not, or a needed job is missing or unknown", () => {
    expect(verdictProblems(needs("success", { docs: "success" }), gate)).toEqual([
      "docs: success where it should not run",
    ]);
    expect(verdictProblems(needs("success", {}, "true"), gate)).toEqual(
      gate.map((job) => `${job}: success where it should not run`),
    );
    expect(verdictProblems(needs("success", { unit: undefined }), gate)).toEqual(["unit: not among the needed jobs"]);
    expect(verdictProblems({ ...needs("success"), extra: { result: "success" } }, gate)).toEqual([
      "extra: needed but not a gate group, scope or docs",
    ]);
    expect(verdictProblems(null, gate)).toHaveLength(FIXED_JOBS.length + gate.length);
  });

  it("exits non-zero on a failing verdict and zero on a passing one, as the job runs it", () => {
    const run = (value) =>
      spawnSync(process.execPath, [resolve(root, "scripts/ci-verdict.mjs")], {
        encoding: "utf8",
        env: { ...process.env, NEEDS: JSON.stringify(value) },
      });
    expect(run(needs("success")).status).toBe(0);
    const failed = run(needs("success", { browser: "cancelled" }));
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("::error title=check::browser: cancelled");
    expect(run(null).status).toBe(1);
  });
});

describe("Nightly checks workflow", () => {
  const nightly = read(".github/workflows/nightly.yml");

  it("runs the nightly group on main once a day and by hand", () => {
    expect(nightly).toMatch(/schedule:\n {4}- cron: "\d{1,2} \d{1,2} \* \* \*"\n {2}workflow_dispatch:/u);
    // A schedule runs on the default branch, main; started by hand, it checks the chosen branch.
    // Naming a ref would test a commit other than the one the run builds and labels.
    expect(nightly).toMatch(/uses: actions\/checkout@v4/u);
    expect(nightly).not.toMatch(/\n\s+ref:/u);
    expect(nightly).toMatch(/run: xvfb-run -a node scripts\/run-checks\.mjs nightly --keep-going\n/u);
    expect(selectChecks(loadChecks(), "nightly").length).toBeGreaterThan(0);
  });

  it("is the only workflow that keeps going past a failing check", () => {
    const runs = [...workflow.matchAll(/run-checks\.mjs (\w+)[^\n]*/gu)].map((match) => match[0]);
    expect(new Set(runs.map((run) => run.split(" ")[1]))).toEqual(new Set(loadChecks().gate));
    for (const run of runs) expect(run).not.toMatch(/--keep-going/u);
  });

  it("records each check's result and keeps the file even when a check fails", () => {
    expect(nightly.indexOf("TEAR_CHECK_RESULTS=")).toBeLessThan(nightly.indexOf("run-checks.mjs nightly"));
    expect(nightly).toMatch(/- uses: actions\/upload-artifact@v4\n {8}if: always\(\)/u);
  });

  it("only reads the repository", () => {
    expect(nightly).toMatch(/permissions:\n {2}contents: read\n\n/u);
  });
});

describe("Check list override", () => {
  // TEAR_CHECKS_CONFIG swaps the list run-checks.mjs runs; only the runner's own tests may set it.
  const workflows = readdirSync(resolve(root, ".github/workflows")).filter((name) => /\.ya?ml$/u.test(name));

  it("is set by no workflow", () => {
    expect(workflows).toEqual(expect.arrayContaining(["ci.yml", "nightly.yml"]));
    for (const name of workflows) {
      expect(read(`.github/workflows/${name}`), name).not.toMatch(/TEAR_CHECKS_CONFIG/u);
    }
  });
});

describe("Browser jobs' container", () => {
  // Every job of every workflow, as { file, id, block }.
  const allJobs = readdirSync(resolve(root, ".github/workflows"))
    .filter((name) => /\.ya?ml$/u.test(name))
    .flatMap((name) =>
      Object.entries(jobs(read(`.github/workflows/${name}`))).map(([id, block]) => ({ file: name, id, block })),
    );
  const where = (job) => `${job.file}: ${job.id}`;
  // A job with an environment is owner-gated (a deploy); it is not run to test a change.
  const gated = (job) => /\n {4}environment:/u.test(job.block);

  it("takes its image from the version the lockfile installs", () => {
    const lockfile = read("pnpm-lock.yaml");
    const declared = JSON.parse(read("package.json")).devDependencies["@playwright/test"];
    expect(lockedPlaywrightVersion(lockfile)).toBe(declared);
    expect(playwrightImage("1.2.3")).toBe("mcr.microsoft.com/playwright:v1.2.3-noble");
    expect(() => lockedPlaywrightVersion("lockfileVersion: '9.0'\n")).toThrow(/no @playwright\/test/u);
  });

  it("is named by a job output in every workflow, never written by hand", () => {
    const containers = allJobs.filter((job) => /\n {4}container:/u.test(job.block));
    expect(containers.length).toBeGreaterThan(0);
    for (const job of containers) {
      const from = /\n {4}container:\n {6}image: \$\{\{ needs\.([\w-]+)\.outputs\.playwright_image \}\}\n/u.exec(
        job.block,
      )?.[1];
      expect(from, where(job)).toBeDefined();
      expect(needsOf(job.block), where(job)).toContain(from);
      const source = allJobs.find((other) => other.file === job.file && other.id === from);
      expect(source?.block, where(job)).toMatch(/node scripts\/ci-playwright-image\.mjs >> "\$GITHUB_OUTPUT"/u);
      expect(job.block, where(job)).toMatch(
        /\n {6}GIT_CONFIG_COUNT: 1\n {6}GIT_CONFIG_KEY_0: safe\.directory\n {6}GIT_CONFIG_VALUE_0: "\*"\n/u,
      );
    }
  });

  it("is where every job that needs a browser runs, so no such job installs one", () => {
    for (const job of allJobs.filter((each) => !gated(each))) {
      expect(job.block, where(job)).not.toMatch(/playwright install/u);
      if (/xvfb-run/u.test(job.block)) expect(job.block, where(job)).toMatch(/\n {4}container:/u);
    }
  });
});
