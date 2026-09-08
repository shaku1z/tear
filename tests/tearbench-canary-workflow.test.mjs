import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const workflow = await readFile(new URL("../.github/workflows/tearbench-canary.yml", import.meta.url), "utf8");
const validate = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const registry = JSON.parse(await readFile(new URL("../src/tearbench/task-registry.json", import.meta.url), "utf8"));
const shardRunner = await readFile(new URL("../scripts/tearbench-canary-run-shard.mjs", import.meta.url), "utf8");
const detachedParityRunner = await readFile(new URL("../scripts/run-current-live-detached-parity.mjs", import.meta.url), "utf8");
const browserPerformance = await readFile(new URL("browser-performance.js", import.meta.url), "utf8");
const performanceBrowserAction = await readFile(
  new URL("../.github/actions/install-tear-performance-browser/action.yml", import.meta.url), "utf8");

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
  assert.match(workflow, /if: \$\{\{ always\(\) && !cancelled\(\) && \(inputs\.mode == 'normal' \|\| inputs\.mode == 'planted-failure'\) \}\}/u);
  assert.match(workflow, /tearbench-canary-compose\.mjs/u);
  assert.match(workflow, /--plant-failure/u);
  assert.match(workflow, /--campaign-slot \$\{\{ inputs\.campaign_slot \}\}/u);
  assert.match(workflow, /tearbench:record-build-provider/u);
  assert.match(workflow, /id: aggregate-provider[\s\S]+?tearbench-canary-provider-/u);
  assert.match(workflow, /--provider-bundle downloads\/parallel\/provider\/provider-build-bundle\.json/u);
  assert.match(workflow, /steps\.aggregate-provider\.outcome == 'success'/u);
  assert.equal([...workflow.matchAll(/mkdir -p artifacts\/tearbench\/missions/gu)].length, 2);
  const aggregateJob = workflow.slice(workflow.indexOf("\n  aggregate:"));
  assert.match(aggregateJob, /id: aggregate-provider[\s\S]+?name: tearbench-canary-provider-/u);
  assert.equal([...workflow.matchAll(/--ready-at/gu)].length, 5);
  assert.equal([...workflow.matchAll(/^\s+- id: ready$/gmu)].length, 3);
  assert.ok([...workflow.matchAll(/uses: actions\/upload-artifact@v4/gu)].length >= 8);
  assert.ok([...workflow.matchAll(/if: always\(\)/gu)].length >= 6);
  for (const job of ["browser", "core"]) assert.match(workflow, new RegExp(`name: tearbench-canary-\\$\\{\\{ matrix\\.shardId \\}\\}`), job);
  assert.match(workflow, /performance:\r?\n\s+needs: \[plan, build, browser, core\]/u);
  assert.match(workflow, /Run isolated performance task after all parallel work/u);
  assert.match(workflow, /name: tearbench-canary-performance-1-/u);
  assert.match(workflow, /serial:\r?\n\s+needs: \[plan, performance\]/u);
  assert.match(workflow, /TEAR_PERF_BROWSER: pinned/u);
  assert.match(workflow, /TEAR_PERF_BROWSER_VERSION: "152\.0\.7977\.64"/u);
  assert.match(workflow, /TEAR_PERF_BROWSER_ARCHIVE_SHA256: 8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e/u);
  assert.equal([...workflow.matchAll(/uses: \.\/\.github\/actions\/install-tear-performance-browser/gu)].length, 4,
    "parallel, serial, paired and boundary measurements must install the same pinned Chrome");
  assert.match(performanceBrowserAction,
    /https:\/\/storage\.googleapis\.com\/chrome-for-testing-public\/\$\{TEAR_PERF_BROWSER_VERSION\}\/linux64\/chrome-linux64\.zip/u);
  assert.match(performanceBrowserAction, /sha256sum --check --strict/u);
  assert.match(performanceBrowserAction, /TEAR_PERF_BROWSER_PATH=.*\$GITHUB_ENV/u);
  assert.match(aggregateJob, /steps\.aggregate-performance\.outcome == 'success'/u);
});

test("normal qualification campaign exposes exactly five bounded slots and validates them in the plan job", () => {
  assert.match(workflow, /campaign_slot:[\s\S]+?default: single[\s\S]+?options: \[single, sample-1, sample-2, sample-3, sample-4, sample-5\]/u);
  assert.match(workflow,
    /group: tearbench-parallel-canary-\$\{\{ github\.ref \}\}-\$\{\{ inputs\.mode \}\}-\$\{\{ inputs\.campaign_slot == 'single' && 'single' \|\| 'qualification' \}\}/u);
  const plan = workflow.slice(workflow.indexOf("\n  plan:"), workflow.indexOf("\n  build:"));
  assert.match(plan, /name: Validate bounded campaign slot/u);
  assert.match(plan, /\[\[ "\$CAMPAIGN_SLOT" == "single" \|\| "\$CAMPAIGN_SLOT" =~ \^sample-\[1-5\]\$ \]\]/u);
  assert.match(plan, /\[\[ "\$MODE" == "normal" \|\| "\$CAMPAIGN_SLOT" == "single" \]\]/u);
  assert.match(plan, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/u);
  assert.match(plan, /gh api repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/main --jq \.object\.sha/u);
  assert.equal([...workflow.matchAll(/name: Validate bounded campaign slot/gu)].length, 1);
  assert.match(workflow, /cancel-in-progress: \$\{\{ inputs\.campaign_slot == 'single' \}\}/u,
    "the five campaign slots must share a non-cancelling sequential lock");
});

test("paired performance mode is isolated, exact-source bound, alternating, and artifact retaining", () => {
  assert.match(workflow, /options: \[normal, planted-failure, paired-performance, simulation-boundary\]/u);
  assert.match(workflow, /paired_scenario:[\s\S]+?default: verdant[\s\S]+?options: \[constrained, verdant\]/u);
  assert.match(workflow,
    /group: tearbench-parallel-canary-\$\{\{ github\.ref \}\}-\$\{\{ inputs\.mode \}\}-\$\{\{ inputs\.campaign_slot == 'single' && 'single' \|\| 'qualification' \}\}/u);
  assert.match(workflow, /plan:\r?\n\s+if: \$\{\{ inputs\.mode == 'normal' \|\| inputs\.mode == 'planted-failure' \}\}/u);
  const paired = workflow.slice(workflow.indexOf("\n  paired-performance:"), workflow.indexOf("\n  certify-serial:"));
  assert.match(paired, /if: \$\{\{ inputs\.mode == 'paired-performance' \}\}/u);
  assert.match(paired, /name: Reject campaign slots outside normal mode[\s\S]+?test "\$CAMPAIGN_SLOT" = "single"/u);
  assert.match(paired, /PAIRED_SCENARIO: \$\{\{ inputs\.paired_scenario \}\}/u);
  assert.match(paired, /\[\[ "\$PAIRED_SCENARIO" == "constrained" \|\| "\$PAIRED_SCENARIO" == "verdant" \]\]/u);
  assert.match(paired, /\[\[ "\$BASELINE_REVISION" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u);
  assert.match(paired, /git worktree add --detach "\$baseline" "\$BASELINE_REVISION"/u);
  assert.match(paired, /git worktree add --detach "\$candidate" "\$CANDIDATE_REVISION"/u);
  assert.match(paired, /TEAR_BUILD_GIT_SHA="\$BASELINE_REVISION" pnpm --dir "\$baseline" build:test:standalone/u);
  assert.match(paired, /TEAR_BUILD_GIT_SHA="\$CANDIDATE_REVISION" pnpm --dir "\$candidate" build:test:standalone/u);
  assert.equal([...paired.matchAll(/run_sample baseline/gu)].length, 3);
  assert.equal([...paired.matchAll(/run_sample candidate/gu)].length, 3);
  assert.deepEqual([...paired.matchAll(/^\s+run_sample (baseline|candidate) /gmu)].map((match) => match[1]),
    ["baseline", "candidate", "baseline", "candidate", "baseline", "candidate"]);
  assert.match(paired, /readFileSync\(process\.argv\[1\],"utf8"\)[\s\S]+?performanceBuild:[\s\S]+?sourceRevision:b\.sourceRevision/u);
  assert.match(paired, /baseline\/config\/browser-performance-budgets\.json/u);
  assert.match(paired, /candidate\/config\/browser-performance-budgets\.json/u);
  assert.match(paired, /TEAR_PERF_BUILD_IDENTITY_EMITTED=1 TEAR_PERF_SCENARIO="\$PAIRED_SCENARIO"/u);
  assert.match(paired, />> "\$samples\/\$side-\$index\.stdout"/u);
  assert.match(browserPerformance,
    /if \(process\.env\.TEAR_PERF_BUILD_IDENTITY_EMITTED !== "1"\) console\.log\(JSON\.stringify\(\{ performanceBuild \}\)\)/u);
  assert.match(paired, /--scenario "\$PAIRED_SCENARIO"/u);
  assert.match(paired, /--workflow-revision "\$GITHUB_SHA"/u);
  assert.ok(browserPerformance.indexOf("JSON.stringify({ performanceBuild })")
    < browserPerformance.indexOf("JSON.stringify({ browserRuntime })"),
  "performance build identity must be emitted before runtime and scenario assertions");
  assert.match(paired, /tearbench-paired-performance-report\.mjs/u);
  assert.match(paired, /tearbench-paired-performance-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
});

test("simulation-boundary mode runs one exact constrained sample and retains its diagnostic", () => {
  const boundary = workflow.slice(workflow.indexOf("\n  simulation-boundary:"), workflow.indexOf("\n  certify-serial:"));
  assert.match(boundary, /if: \$\{\{ inputs\.mode == 'simulation-boundary' \}\}/u);
  assert.match(boundary, /name: Reject campaign slots outside normal mode[\s\S]+?test "\$CAMPAIGN_SLOT" = "single"/u);
  assert.match(boundary, /\[\[ "\$CANDIDATE_REVISION" =~ \^\[0-9a-f\]\{40\}\$ \]\]/u);
  assert.match(boundary, /git worktree add --detach "\$candidate" "\$CANDIDATE_REVISION"/u);
  assert.match(boundary, /TEAR_BUILD_GIT_SHA="\$CANDIDATE_REVISION" pnpm --dir "\$candidate" build:test:standalone/u);
  assert.match(boundary, /candidate\/config\/browser-performance-budgets\.json/u);
  assert.equal([...boundary.matchAll(/TEAR_PERF_SCENARIO=constrained/gu)].length, 1);
  assert.match(boundary, /tearbench-simulation-boundary-report\.mjs/u);
  assert.match(boundary, /tearbench-simulation-boundary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(browserPerformance, /canonicalTick: snapshot\.canonicalTick/u);
  assert.match(browserPerformance, /simulationStepPoll/u);
});

test("parallel canary retries only the failed atomic task and records authorization", () => {
  assert.match(shardRunner, /result\.receipt\.result\.status !== "passed"/u);
  assert.match(shardRunner, /attemptNumber: 2/u);
  assert.match(shardRunner, /performanceSampleAllowsRetry\(result\.receipt\.result\.sampleValidity\)/u);
  assert.match(shardRunner, /`bounded-canary-invalid-sample-retry:\$\{values\["--mission"\]\}:\$\{taskId\}`/u);
  assert.match(shardRunner, /`bounded-canary-single-retry:\$\{values\["--mission"\]\}:\$\{taskId\}`/u);
  assert.match(shardRunner, /delete process\.env\.TEARBENCH_RETRY_AUTHORIZATION/u);
});

test("serial timing excludes the preceding parallel experiment but retains its own queue and setup", () => {
  const serial = workflow.slice(workflow.indexOf("\n  serial:"), workflow.indexOf("\n  build:"));
  const performance = workflow.slice(workflow.indexOf("\n  performance:"), workflow.indexOf("\n  certify-serial:"));
  assert.match(performance, /outputs:\s+ready_at: \$\{\{ steps\.ready\.outputs\.ready_at \}\}/u);
  assert.match(performance, /- id: ready\s+if: always\(\)\s+run: echo "ready_at=\$\(date -u \+%FT%T\.%3NZ\)" >> "\$GITHUB_OUTPUT"/u);
  assert.match(serial, /--run-created '\$\{\{ needs\.performance\.outputs\.ready_at \}\}' --ready-at '\$\{\{ needs\.performance\.outputs\.ready_at \}\}'/u);
  assert.doesNotMatch(serial, /--run-created '\$\{\{ needs\.plan\.outputs\.run_created \}\}'/u);
  assert.match(serial, /--job-start '\$\{\{ steps\.clock\.outputs\.job_start \}\}'/u);
});

test("detached parity resolves pnpm from PATH outside a parent pnpm process", () => {
  assert.doesNotMatch(detachedParityRunner, /npm_execpath/u);
  assert.match(detachedParityRunner, /else run\("pnpm", parityArgs\)/u);
  assert.match(detachedParityRunner, /process\.env\.ComSpec \?\? "cmd\.exe"/u);
  assert.doesNotMatch(detachedParityRunner, /shell:/u);
});

test("provider-clock accounting tracks the current workflow dependency topology", () => {
  // Revisit provider accounting when a job dependency changes, even if its name stays stable.
  const expected = { build: "plan", browser: "plan, build", core: "plan, build", performance: "plan, build, browser, core",
    serial: "plan, performance", "certify-serial": "plan, serial", "certify-parallel": "plan, build, browser, core, performance",
    aggregate: "plan, serial, build, browser, core, performance, certify-serial, certify-parallel" };
  for (const [job, needs] of Object.entries(expected)) {
    const section = workflow.slice(workflow.indexOf(`\n  ${job}:`));
    const declared = section.match(new RegExp(`^\\n  ${job}:\\r?\\n\\s+needs: ([^\\r\\n]+)`, "u"));
    assert.ok(declared, `missing dependency contract for ${job}`);
    assert.deepEqual(declared[1].replaceAll("[", "").replaceAll("]", "").split(",").map((name) => name.trim()).sort(), needs.split(", ").sort());
  }
});
