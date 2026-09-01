import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const workflow = await readFile(new URL("../.github/workflows/tearbench-canary.yml", import.meta.url), "utf8");
const validate = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const registry = JSON.parse(await readFile(new URL("../src/tearbench/task-registry.json", import.meta.url), "utf8"));

test("parallel canary is manual and non-required while Validate keeps plain browser entrypoints", () => {
  assert.match(workflow, /^name: TearBench Parallel Canary[\s\S]+?workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s+(?:pull_request|push):/u);
  assert.match(validate, /xvfb-run -a pnpm check:functional/u);
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium/u);
  assert.doesNotMatch(workflow, /playwright[^\n]*--shard|--workers(?:=|\s)/u);
  assert.ok(!registry.profiles.release.includes("certify.release"), "aggregate certification must not recursively certify itself as a task");
});

test("parallel canary preserves bounded isolation, failure uploads, collision checks, and aggregate rejection", () => {
  assert.equal([...workflow.matchAll(/fail-fast: false/gu)].length, 2);
  assert.match(workflow, /if: \$\{\{ always\(\) && !cancelled\(\) \}\}/u);
  assert.match(workflow, /tearbench-canary-compose\.mjs/u);
  assert.match(workflow, /--plant-failure/u);
  assert.match(workflow, /tearbench:record-build-provider/u);
  assert.match(workflow, /id: aggregate-provider[\s\S]+?tearbench-canary-provider-/u);
  assert.match(workflow, /--provider-bundle downloads\/parallel\/provider\/provider-build-bundle\.json/u);
  assert.match(workflow, /steps\.aggregate-provider\.outcome == 'success'/u);
  assert.equal([...workflow.matchAll(/--ready-at/gu)].length, 4);
  assert.equal([...workflow.matchAll(/^\s+- id: ready$/gmu)].length, 2);
  assert.ok([...workflow.matchAll(/uses: actions\/upload-artifact@v4/gu)].length >= 8);
  assert.ok([...workflow.matchAll(/if: always\(\)/gu)].length >= 6);
  for (const job of ["browser", "core"]) assert.match(workflow, new RegExp(`name: tearbench-canary-\\$\\{\\{ matrix\\.shardId \\}\\}`), job);
});
