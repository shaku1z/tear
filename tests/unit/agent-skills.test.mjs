// Repository skills live in .agents/skills (read by Codex and any other agent). Claude Code only
// discovers skills in .claude/skills, so each skill has a small pointer file there with the same name
// and description, and both agents trigger the skill on the same requests.
//
// A skill is only useful while what it cites exists. These tests also fail when a skill names a
// repository path, a relative link or a package script that is not there, and when a skill uses one
// agent's own syntax for calling another skill.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(root, ".agents", "skills");
const mirrorRoot = path.join(root, ".claude", "skills");
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;

/** The top-level folders a backticked token must start with to be read as a repository path. */
const PATH_ROOTS = ["src", "tests", "scripts", "docs", "config", "plans", "public", "wiki", ".github", ".agents"];
const REPOSITORY_PATH = new RegExp(
  `^(?:${PATH_ROOTS.map((name) => name.replace(".", "\\.")).join("|")})/[\\w./-]*$`,
  "u",
);
/** What may follow `pnpm` besides a package script. */
const PNPM_COMMANDS = new Set(["exec", "install"]);

function skillDirectories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  if (!match) throw new Error(`${file} must start with a frontmatter block`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = /^([A-Za-z][\w-]*):\s?(.*)$/u.exec(line);
    if (field) fields[field[1]] = field[2];
  }
  return { fields, body: text.slice(match[0].length) };
}

/** Every Markdown file of every skill, as repository-relative paths with forward slashes. */
function skillDocuments() {
  return skillDirectories(sourceRoot).flatMap((name) =>
    fs
      .readdirSync(path.join(sourceRoot, name), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/")),
  );
}

/** The text of a skill document outside fenced code blocks, where examples may name oracle-only paths. */
function prose(file) {
  return fs
    .readFileSync(path.join(root, file), "utf8")
    .replaceAll("\r\n", "\n")
    .replace(/^```[\s\S]*?^```$/gmu, "");
}

const backticked = (text) => [...text.matchAll(/`([^`\n]+)`/gu)].map((match) => match[1]);

/** What a skill document cites that the repository does not have. */
function brokenCitations(file, text = prose(file)) {
  const problems = [];
  for (const [, target] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)\s]*)?\)/gu)) {
    if (/^[a-z]+:/u.test(target)) continue;
    if (!fs.existsSync(path.resolve(root, path.dirname(file), target))) problems.push(`link ${target}`);
  }
  for (const token of backticked(text)) {
    if (REPOSITORY_PATH.test(token) && !fs.existsSync(path.join(root, token))) problems.push(`path ${token}`);
    for (const [, name] of token.matchAll(/\bpnpm ([a-z][\w:-]*)/gu)) {
      if (!(name in scripts) && !PNPM_COMMANDS.has(name)) problems.push(`script pnpm ${name}`);
    }
  }
  if (/\$tear-/u.test(text)) problems.push("a `$tear-…` call: name the skill plainly, so every agent can follow it");
  return problems;
}

describe("repository skills", () => {
  const sources = skillDirectories(sourceRoot);

  it("has at least one skill", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)("%s has a Claude Code pointer with the same name and description", (name) => {
    const mirrorFile = path.join(mirrorRoot, name, "SKILL.md");
    expect(fs.existsSync(mirrorFile), `missing pointer .claude/skills/${name}/SKILL.md`).toBe(true);
    const source = readFrontmatter(path.join(sourceRoot, name, "SKILL.md"));
    const mirror = readFrontmatter(mirrorFile);
    expect(source.fields.name, "frontmatter name must match the directory").toBe(name);
    expect(source.fields.description, "a skill needs a one-line description").toBeTruthy();
    expect(mirror.fields.name).toBe(source.fields.name);
    expect(mirror.fields.description).toBe(source.fields.description);
    expect(mirror.body, "the pointer must name the source skill path").toContain(`.agents/skills/${name}/SKILL.md`);
  });

  it("has no Claude Code pointer without a repository skill", () => {
    expect(skillDirectories(mirrorRoot).filter((name) => !sources.includes(name))).toEqual([]);
  });

  it.each(skillDocuments())("%s cites only paths, links and scripts that exist", (file) => {
    expect(brokenCitations(file)).toEqual([]);
  });

  it("reports a missing path, a dead link, an unknown script and an agent-specific call", () => {
    const text = [
      "Read `src/no-such-file.ts` and [the plan](../../../plans/no-such-plan.md).",
      "Run `pnpm no-such-script`, then `pnpm exec vitest run tests/unit/<area>.test.ts` and `pnpm typecheck`.",
      "Finish with $tear-change-gate. See `src/presentation/ui*.ts` and `docs/README.md`.",
    ].join("\n");
    expect(brokenCitations(".agents/skills/tear-change-gate/SKILL.md", text)).toEqual([
      "link ../../../plans/no-such-plan.md",
      "path src/no-such-file.ts",
      "script pnpm no-such-script",
      "a `$tear-…` call: name the skill plainly, so every agent can follow it",
    ]);
  });
});
