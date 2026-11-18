// Guards for the rules in docs/PITFALLS.md. Each test names the row it protects.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { indexedTestFiles } from "../../scripts/test-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;

function listFiles(directory, extensions) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
}

/** Body rows of the PITFALLS table, each as its trimmed cells (header and separator dropped). */
function pitfallRows(markdown) {
  return markdown
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("|") && !/^\|\s*(?:What happened|-{3})/u.test(line))
    .map((line) =>
      line
        .replace(/^\||\|$/gu, "")
        .split(" | ")
        .map((cell) => cell.trim()),
    );
}

/** Cells in column `index` that appear in more than one row, compared ignoring case and spacing. */
function duplicateCells(rows, index) {
  const seen = new Map();
  for (const cells of rows) {
    const key = (cells[index] ?? "").toLowerCase().replace(/\s+/gu, " ");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([key]) => key);
}

describe("pitfall guards", () => {
  it("no package script can publish: every wrangler deploy is a dry run (pnpm deploy --help)", () => {
    for (const [name, command] of Object.entries(scripts)) {
      for (const match of command.matchAll(/wrangler\s+deploy\b[^&|;]*/gu))
        expect(match[0], `${name} runs a real wrangler deploy`).toContain("--dry-run");
      expect(command, `${name} calls wrangler publish`).not.toMatch(/wrangler\s+(?:publish|versions\s+deploy)\b/u);
    }
    expect(scripts.deploy).toBe("pnpm deploy:dry-run");
  });

  it("every preview launch configuration fails instead of moving to another port", () => {
    const launch = JSON.parse(fs.readFileSync(path.join(root, ".claude", "launch.json"), "utf8"));
    expect(launch.configurations.length).toBeGreaterThan(0);
    for (const configuration of launch.configurations) {
      if (configuration.runtimeExecutable === undefined) continue;
      expect(configuration.runtimeArgs, configuration.name).toContain("--strictPort");
      expect(configuration.runtimeArgs, configuration.name).toContain(String(configuration.port));
    }
  });

  it("no browser test server listens on a fixed port; each takes a free one and reads its URL back", () => {
    const fixedPort = [
      // listen() and listen(0, …) take a free port; anything else names one.
      /\.listen\(\s*(?!0\s*[,)]|\))/u,
      /\bport:\s*\d/u,
      /(?:127\.0\.0\.1|localhost):\d/u,
      /_PORT\s*\|\|/u,
    ];
    const files = listFiles("tests", [".js", ".cjs", ".mjs"]).filter((file) => !file.startsWith("tests/unit/"));
    expect(files).toContain("tests/browser-journey-harness.js");
    const offenders = files.flatMap((file) =>
      fs
        .readFileSync(path.join(root, file), "utf8")
        .split(/\r?\n/u)
        .flatMap((line, index) =>
          fixedPort.some((pattern) => pattern.test(line)) ? [`${file}:${String(index + 1)}: ${line.trim()}`] : [],
        ),
    );
    expect(offenders).toEqual([]);
  });

  it("no script, workflow or package command skips the Git hooks", () => {
    const sources = [
      ...listFiles("scripts", [".mjs", ".js", ".ts", ".ps1", ".sh"]),
      ...listFiles(".github", [".yml", ".yaml"]),
    ];
    const offenders = sources.filter((file) => /--no-verify\b/u.test(fs.readFileSync(path.join(root, file), "utf8")));
    for (const [name, command] of Object.entries(scripts)) if (/--no-verify\b/u.test(command)) offenders.push(name);
    expect(offenders).toEqual([]);
  });

  it("lint starts ESLint with a raised heap, and the lint script goes through it", () => {
    const lint = fs.readFileSync(path.join(root, "scripts", "lint.mjs"), "utf8");
    expect(lint).toMatch(/--max-old-space-size=\d{4,}/u);
    expect(scripts.lint).toBe("node scripts/lint.mjs");
  });

  it("no current document states a line-count module limit; the size rule lives in ARCHITECTURE.md", () => {
    const rootDocuments = fs.readdirSync(root).filter((name) => name.endsWith(".md"));
    const current = [rootDocuments, ...["docs", "plans", ".agents"].map((folder) => listFiles(folder, [".md"]))]
      .flat()
      .filter((file) => !/^docs\/(?:history|checkpoints)\//u.test(file) && !file.startsWith("plans/completed/"));
    const stale = /\b(?:700|500)[- ](?:physical[- ])?lines?\b(?! equivalents)|\bbelow 500\b/iu;
    const offenders = current.filter((file) => stale.test(fs.readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(path.join(root, "docs", "ARCHITECTURE.md"), "utf8")).toContain("**The module size rule.**");
  });
  it("docs/PITFALLS.md has no duplicate rows: no two rows share an incident or a rule, and every row names its guard", () => {
    const rows = pitfallRows(fs.readFileSync(path.join(root, "docs", "PITFALLS.md"), "utf8"));
    expect(rows.length).toBeGreaterThan(0);
    expect(duplicateCells(rows, 0)).toEqual([]);
    expect(duplicateCells(rows, 2)).toEqual([]);
    expect(rows.filter((cells) => cells.length !== 4 || cells[3] === "").map((cells) => cells[0])).toEqual([]);
    const sample =
      "| What happened | Cause | Rule | Guard |\n| --- | --- | --- | --- |\n| A | B | C | D |\n| a  | x | y | z |\n";
    expect(duplicateCells(pitfallRows(sample), 0)).toEqual(["a"]);
  });

  describe("a test or check runs once, and that run is its verdict (flaky tests are fixed, never retried)", () => {
    it("finds every way of asking for a retry, and nothing else", () => {
      for (const text of [
        "export default defineConfig({ test: { retry: 2 } });",
        "module.exports = { retries: process.env.CI ? 2 : 0 };",
        '{ "retries": 1 }',
        'it("loads", { retry: 3 }, () => {});',
        "test.describe.configure({ mode: 'serial', retries: 2 });",
        "this.retries(2);",
        "jest.retryTimes(3);",
        '"test": "vitest run --retry=2"',
        "run: npx playwright test --retries 2",
        "node --test --test-retries=1 tests/a.test.mjs",
        // Re-running GitHub jobs that already ran is a retry too: the same code, the same main.
        'gh(["run", "rerun", String(run.id), "--failed"]);',
        "gh run rerun 44070220239 --failed",
        "gh run rerun 44070220239 --job 134559336319",
        "gh api -X POST repos/shaku1z/tear/actions/runs/44070220239/rerun-failed-jobs",
        "api(`repos/${slug}/actions/runs/${run.id}/rerun`, { method: 'POST' });",
        "gh api -X POST repos/shaku1z/tear/actions/jobs/134559336319/rerun",
      ])
        expect(retryRequests(text), text).not.toEqual([]);
      for (const text of [
        "retry: () => { restarts += 1; },",
        "retry: async () => undefined,",
        'await clickLabel("RETRY", "playing");',
        "let retries = 0; retries += 1;",
        '{ reason: "retry" }',
        "curl --fail --location --retry 3 --retry-all-errors --output out.tgz https://example.test/a.tgz",
        // A fresh run of the head merged with current main is new evidence, not a retry.
        'gh(["workflow", "run", "ci.yml", "--ref", pr.headRefName]);',
        "pnpm tearbench rerun --artifact run.json",
      ])
        expect(retryRequests(text), text).toEqual([]);
    });

    it("no test, test configuration, check list, package script, script or workflow asks for one", () => {
      const sources = [
        ...listFiles("tests", [".js", ".mjs", ".cjs", ".ts", ".json"]),
        ...listFiles("scripts", [".js", ".mjs", ".cjs", ".ts", ".ps1", ".sh"]),
        ...listFiles(".github", [".yml", ".yaml"]),
        ...listFiles("config", [".json"]),
        ...fs.readdirSync(root).filter((name) => /\.config\.[cm]?[jt]s$/u.test(name) || name === "package.json"),
      ].filter((file) => file !== "tests/unit/pitfall-guards.test.mjs");
      const offenders = sources.flatMap((file) =>
        retryRequests(fs.readFileSync(path.join(root, file), "utf8")).map((line) => `${file}: ${line}`),
      );
      expect(offenders).toEqual([]);
    });
  });

  describe("test runs collect only files in git's index (a stale untracked copy ran in #233)", () => {
    it("an untracked test file on disk is not collected by the unit runner", async () => {
      const probe = `tests/unit/untracked-probe-${process.pid}.test.mjs`;
      fs.writeFileSync(
        path.join(root, probe),
        'import { it } from "vitest";\nit("must never run", () => { throw new Error("untracked test ran"); });\n',
      );
      try {
        const { default: config } = await import("../../vitest.config.ts");
        const include = config.test.include;
        expect(fs.existsSync(path.join(root, probe))).toBe(true);
        expect(include).toContain("tests/unit/pitfall-guards.test.mjs");
        expect(include).not.toContain(probe);
        expect(include.every((file) => !file.includes("*"))).toBe(true);
      } finally {
        fs.rmSync(path.join(root, probe), { force: true });
      }
    });

    it("both runner configurations take their files from the index", () => {
      for (const file of ["vitest.config.ts", "vitest.endurance.config.ts"])
        expect(fs.readFileSync(path.join(root, file), "utf8"), file).toMatch(/include: indexedTestFiles\(/u);
    });

    it("asks git for index entries with glob pathspecs and refuses names it cannot pass back as globs", () => {
      const calls = [];
      const git = (files) => (args) => {
        calls.push(args);
        return files.join("\0") + "\0";
      };
      expect(indexedTestFiles(["tests/unit/**/*.test.ts"], { git: git(["tests/unit/a.test.ts"]) })).toEqual([
        "tests/unit/a.test.ts",
      ]);
      expect(calls[0]).toEqual(["ls-files", "-z", "--", ":(glob)tests/unit/**/*.test.ts"]);
      expect(() => indexedTestFiles(["tests/**/*.test.ts"], { git: git(["tests/unit/[a].test.ts"]) })).toThrow(
        /glob characters/u,
      );
    });
  });
});

/**
 * The lines of `text` that ask a test runner or check to run again after a failure: a `retry` or
 * `retries` setting whose value is not a function (a function is a game or port method named
 * retry), a retry flag, Mocha's and Jest's retry calls, or a re-run of GitHub jobs that already
 * ran (`gh run rerun`, in a shell or as `gh([...])` arguments, and the REST `rerun` and
 * `rerun-failed-jobs` endpoints). A download may retry the network, so a retry flag on a `curl`
 * command is not one; dispatching a fresh run (`gh workflow run`) is new evidence, not a retry.
 */
function retryRequests(text) {
  const setting = /["']?\bretr(?:y|ies)["']?\s*:\s*(?!\(|async\b|function\b)\S/u;
  const flag = /(?:^|\s)--(?:[\w-]+-)?retr(?:y|ies)\b/u;
  const call = /\bthis\.retries\s*\(|\bretryTimes\s*\(/u;
  const jobRerun = /\bgh\b\W+run\W+rerun\b|\/actions\/(?:runs|jobs)\/[^\s"'`/]+\/rerun(?:-failed-jobs)?\b/u;
  if (!/retr(?:y|ies)|rerun/iu.test(text)) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        setting.test(line) ||
        call.test(line) ||
        jobRerun.test(line) ||
        (flag.test(line) && !/(?:^|\s)curl\s/u.test(line)),
    );
}
