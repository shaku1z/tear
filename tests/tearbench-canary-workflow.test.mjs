import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const workflow = await readFile(new URL("../.github/workflows/tearbench-canary.yml", import.meta.url), "utf8");
const validate = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const registry = JSON.parse(await readFile(new URL("../src/tearbench/task-registry.json", import.meta.url), "utf8"));
const shardRunner = await readFile(new URL("../scripts/tearbench-canary-run-shard.mjs", import.meta.url), "utf8");
const detachedParityRunner = await readFile(new URL("../scripts/run-current-live-detached-parity.mjs", import.meta.url), "utf8");

test("parallel canary is manual and non-required while Validate keeps plain browser entrypoints", () => {
  assert.match(workflow, /^name: TearBench Parallel Canary[\s\S]+?workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /\n\s+(?:pull_request|push):/u);
  assert.match(validate, /xvfb-run -a pnpm check:functional/u);
  assert.match(validate, /timeout-minutes: 30/u);
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
  assert.equal([...workflow.matchAll(/mkdir -p artifacts\/tearbench\/missions/gu)].length, 2);
  const aggregateJob = workflow.slice(workflow.indexOf("\n  aggregate:"));
  assert.match(aggregateJob, /id: aggregate-provider[\s\S]+?name: tearbench-canary-provider-/u);
  assert.equal([...workflow.matchAll(/--ready-at/gu)].length, 5);
  assert.equal([...workflow.matchAll(/^\s+- id: ready$/gmu)].length, 2);
  assert.ok([...workflow.matchAll(/uses: actions\/upload-artifact@v4/gu)].length >= 8);
  assert.ok([...workflow.matchAll(/if: always\(\)/gu)].length >= 6);
  for (const job of ["browser", "core"]) assert.match(workflow, new RegExp(`name: tearbench-canary-\\$\\{\\{ matrix\\.shardId \\}\\}`), job);
  assert.match(workflow, /performance:\n\s+needs: \[plan, build, browser, core\]/u);
  assert.match(workflow, /Run isolated performance task after all parallel work/u);
  assert.match(workflow, /name: tearbench-canary-performance-1-/u);
  assert.match(workflow, /serial:\n\s+needs: \[plan, performance\]/u);
  assert.match(aggregateJob, /steps\.aggregate-performance\.outcome == 'success'/u);
});

test("parallel canary retries only the failed atomic task and records authorization", () => {
  assert.match(shardRunner, /result\.receipt\.result\.status !== "passed"/u);
  assert.match(shardRunner, /attemptNumber: 2/u);
  assert.match(shardRunner, /performanceSampleAllowsRetry\(result\.receipt\.result\.sampleValidity\)/u);
  assert.match(shardRunner, /`bounded-canary-invalid-sample-retry:\$\{values\["--mission"\]\}:\$\{taskId\}`/u);
  assert.match(shardRunner, /`bounded-canary-single-retry:\$\{values\["--mission"\]\}:\$\{taskId\}`/u);
  assert.match(shardRunner, /delete process\.env\.TEARBENCH_RETRY_AUTHORIZATION/u);
});

test("detached parity resolves pnpm from PATH outside a parent pnpm process", () => {
  assert.doesNotMatch(detachedParityRunner, /npm_execpath/u);
  assert.match(detachedParityRunner, /else run\("pnpm", parityArgs\)/u);
  assert.match(detachedParityRunner, /process\.env\.ComSpec \?\? "cmd\.exe"/u);
  assert.doesNotMatch(detachedParityRunner, /shell:/u);
});
