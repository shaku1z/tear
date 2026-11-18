// Guards for the rules in docs/PITFALLS.md. Each test names the row it protects.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
      ])
        expect(retryRequests(text), text).not.toEqual([]);
      for (const text of [
        "retry: () => { restarts += 1; },",
        "retry: async () => undefined,",
        'await clickLabel("RETRY", "playing");',
        "let retries = 0; retries += 1;",
        '{ reason: "retry" }',
        "curl --fail --location --retry 3 --retry-all-errors --output out.tgz https://example.test/a.tgz",
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
});

/**
 * The lines of `text` that ask a test runner or check to run again after a failure: a `retry` or
 * `retries` setting whose value is not a function (a function is a game or port method named
 * retry), a retry flag, or Mocha's and Jest's retry calls. A download may retry the network, so a
 * retry flag on a `curl` command is not one.
 */
function retryRequests(text) {
  const setting = /["']?\bretr(?:y|ies)["']?\s*:\s*(?!\(|async\b|function\b)\S/u;
  const flag = /(?:^|\s)--(?:[\w-]+-)?retr(?:y|ies)\b/u;
  const call = /\bthis\.retries\s*\(|\bretryTimes\s*\(/u;
  if (!/retr(?:y|ies)/iu.test(text)) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => setting.test(line) || call.test(line) || (flag.test(line) && !/(?:^|\s)curl\s/u.test(line)));
}
