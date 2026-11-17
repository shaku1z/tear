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
});
