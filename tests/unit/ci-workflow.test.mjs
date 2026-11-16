// What the Validate workflow must do, tested by behaviour rather than by its exact text.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { loadChecks, selectChecks } from "../../scripts/run-checks.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/gu, "\n");
const workflow = read(".github/workflows/ci.yml");

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

describe("Validate workflow", () => {
  it("runs for ready pull requests, main pushes and by hand, and skips drafts", () => {
    const { names, types } = triggers(workflow);
    expect(names).toEqual(["pull_request", "push", "workflow_dispatch"]);
    expect(types).toEqual(expect.arrayContaining(["opened", "synchronize", "reopened", "ready_for_review"]));
    expect(workflow).toMatch(
      /^ {2}check:\n {4}if: github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft$/mu,
    );
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

  it("checks a pull request as its head merged with current main, and records both", () => {
    // GitHub's prepared merge ref is reused by a re-run and can be stale after a reopen.
    expect(workflow).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    const merge = workflow.indexOf("- name: Merge current main into the change");
    const record = workflow.indexOf("- name: Record what was checked");
    const install = workflow.indexOf("- run: pnpm install --frozen-lockfile");
    expect(merge).toBeGreaterThan(0);
    expect(record).toBeGreaterThan(merge);
    expect(install).toBeGreaterThan(record);
    expect(workflow.slice(merge, record)).toMatch(
      /git fetch --quiet origin main\n.*merge --quiet --no-edit origin\/main/u,
    );
    // scripts/merge-ready.mjs parses exactly this annotation.
    expect(workflow).toContain('echo "::notice title=checked::head=$head main=$main"');
    // Every later step must expect the commit checked out here, not GitHub's GITHUB_SHA: the
    // workspace check, the build's attribution and the artifact verification all read these.
    const recordStep = workflow.slice(record, install);
    expect(recordStep).toContain('echo "TEAR_RELEASE_SHA=$(git rev-parse HEAD)" >> "$GITHUB_ENV"');
    expect(recordStep).toContain('echo "TEAR_BUILD_GIT_SHA=$(git rev-parse HEAD)" >> "$GITHUB_ENV"');
  });

  it("has every script that compares HEAD with GITHUB_SHA prefer the checked commit", () => {
    for (const [file, variable] of [
      ["scripts/check-workspace.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/release-preflight.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/verify-plan-certificate.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/verify-release-artifact.mjs", "TEAR_RELEASE_SHA"],
      ["scripts/build-target.mjs", "TEAR_BUILD_GIT_SHA"],
    ]) {
      expect(read(file), `${file} must read ${variable} before GITHUB_SHA`).toMatch(
        new RegExp(`${variable}[\\s\\S]{0,200}GITHUB_SHA`, "u"),
      );
    }
  });

  it("runs every gate group of config/checks.json, in the listed order, and nothing else", () => {
    const config = loadChecks();
    const groups = [...workflow.matchAll(/node scripts\/run-checks\.mjs (\w+)/gu)].map((match) => match[1]);
    expect(groups).toEqual(config.gate);
    expect(config.gate.slice(0, 1)).toEqual(["static"]);
    // The cheap, likely-to-fail checks come first, so a failure shows within minutes.
    expect(config.groups.static.slice(0, 4).map((check) => check.id)).toEqual([
      "format",
      "docs",
      "terminology",
      "repository-guards",
    ]);
    expect(workflow).not.toMatch(/check:functional|tearbench (?:ci|tasks)/u);
  });

  it("lists every check once, with a command that names a file that exists", () => {
    const config = loadChecks();
    for (const group of Object.keys(config.groups)) {
      const ids = selectChecks(config, group).map((check) => check.id);
      expect(new Set(ids).size, `duplicate id in ${group}`).toBe(ids.length);
      for (const check of selectChecks(config, group)) {
        const [command, file] = check.args;
        expect(command, check.id).toBe("node");
        if (!file.startsWith("--")) expect(existsSync(resolve(root, file)), `${group}.${check.id}: ${file}`).toBe(true);
      }
    }
  });

  it("gives no step a key twice (GitHub rejects such a file)", () => {
    for (const step of workflow.split(/\n(?= {6}- )/u)) {
      const keys = [...step.matchAll(/^ {6}(?:- | {2})([a-z-]+):/gmu)].map((match) => match[1]);
      expect(new Set(keys).size, `duplicate key in step: ${step.split("\n")[0]}`).toBe(keys.length);
    }
  });

  it("uploads the release build once, under the name and layout the deploy workflows read", () => {
    const uploads =
      workflow.match(
        /upload-artifact@v4\n(?: {8}if: .*\n)? {8}with:\n(?: {10}#.*\n)* {10}name: tear-release-targets-\$\{\{ steps\.checked\.outputs\.commit \}\}/gu,
      ) ?? [];
    expect(uploads).toHaveLength(1);
    // Two paths keep the repository root as the archive root, so deploys find dist/standalone.
    expect(workflow).toMatch(/path: \|\n {12}dist\/standalone\n {12}artifacts\/packages\/tear-crazygames\.zip\n/u);
    expect(read(".github/workflows/deploy-production.yml")).toContain(
      "name: tear-release-targets-${{ steps.validation.outputs.sha }}",
    );
    const preview = read(".github/workflows/deploy-preview.yml");
    expect(preview).toContain("/^tear-release-targets-[0-9a-f]{40}$/");
    expect(preview).toContain("candidate-release/dist/standalone");
  });

  it("serves the dev build of the same commit below /dev/ on preview, and never on production", () => {
    // Built and uploaded on main pushes only, as its own artifact.
    expect(workflow).toMatch(
      /if: github\.event_name == 'push' && [^\n]*\n {8}run: node scripts\/build-target\.mjs test-standalone --preview-dev\n/u,
    );
    expect(workflow).toMatch(
      /if: github\.event_name == 'push' && [^\n]*\n {8}with:\n {10}name: tear-preview-dev-\$\{\{ steps\.checked\.outputs\.commit \}\}\n {10}path: dist\/preview-dev\n/u,
    );
    const preview = read(".github/workflows/deploy-preview.yml");
    expect(preview).toContain("const devName = `tear-preview-dev-${artifactSha}`;");
    expect(preview).toContain("node scripts/verify-release-artifact.mjs standalone candidate-dev test-standalone");
    expect(preview).toContain("cp -r candidate-dev preview-site/dev");
    expect(preview).toContain("--assets preview-site \\");
    // The path the deploy uses is the base the dev build is built for.
    expect(read("vite.config.ts")).toContain('export const PREVIEW_DEV_BASE = "/dev/";');
    for (const file of ["deploy-production.yml", "deploy-wiki.yml"]) {
      expect(read(`.github/workflows/${file}`), file).not.toMatch(/preview-dev|candidate-dev/u);
    }
  });
  it("sets the job limit to at least twice the recorded time of the gate plus setup", () => {
    // Setup is checkout, install and the Chromium download: about 3 minutes on a runner.
    const setupSeconds = 180;
    const config = loadChecks();
    const gateSeconds = config.gate
      .flatMap((group) => selectChecks(config, group))
      .reduce((total, check) => total + check.seconds, 0);
    const limits = [...workflow.matchAll(/^ {4}timeout-minutes: (\d+)$/gmu)].map((match) => Number(match[1]));
    expect(limits, "one job-level timeout-minutes").toHaveLength(1);
    expect(
      gateSeconds + setupSeconds,
      `recorded ${String(gateSeconds)} s of checks plus ${String(setupSeconds)} s setup against a ${String(limits[0])}-minute limit`,
    ).toBeLessThanOrEqual((limits[0] * 60) / 2);
  });

  it("checks out the full history (the oracle comparison reads an old commit)", () => {
    const checkouts = [...workflow.matchAll(/uses: actions\/checkout@v4\n {8}with:\n {10}fetch-depth: (\d+)/gu)];
    expect(checkouts.map((match) => match[1])).toEqual(["0"]);
    expect(workflow.match(/actions\/checkout@/gu)).toHaveLength(1);
  });
});
