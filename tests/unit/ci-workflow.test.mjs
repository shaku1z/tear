// What the Validate workflow must do, tested by behaviour rather than by its exact text.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
        /upload-artifact@v4\n(?: {8}if: .*\n)? {8}with:\n {10}name: tear-release-targets-\$\{\{ github\.sha \}\}/gu,
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
});
