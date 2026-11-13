import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Repository skills live in .agents/skills (read by Codex). Claude Code only
// discovers skills in .claude/skills, so each skill has a small pointer file
// there. The pointer must carry the same name and description so both agents
// trigger the skill on the same requests.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repositoryRoot, ".agents", "skills");
const mirrorRoot = path.join(repositoryRoot, ".claude", "skills");

function skillDirectories(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  assert.ok(match, `${file} must start with a frontmatter block`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = /^([A-Za-z][\w-]*):\s?(.*)$/u.exec(line);
    if (field) fields[field[1]] = field[2];
  }
  return { fields, body: text.slice(match[0].length) };
}

test("every repository skill has a Claude Code pointer with the same name and description", () => {
  const sources = skillDirectories(sourceRoot);
  assert.ok(sources.length > 0, "expected at least one skill under .agents/skills");
  for (const name of sources) {
    const mirrorFile = path.join(mirrorRoot, name, "SKILL.md");
    assert.ok(fs.existsSync(mirrorFile), `missing pointer .claude/skills/${name}/SKILL.md`);
    const source = readFrontmatter(path.join(sourceRoot, name, "SKILL.md"));
    const mirror = readFrontmatter(mirrorFile);
    assert.equal(source.fields.name, name, `.agents/skills/${name} frontmatter name must match its directory`);
    assert.equal(mirror.fields.name, source.fields.name, `${name}: pointer name differs from the source skill`);
    assert.equal(
      mirror.fields.description,
      source.fields.description,
      `${name}: pointer description differs from the source skill`,
    );
    assert.ok(
      mirror.body.includes(`.agents/skills/${name}/SKILL.md`),
      `${name}: pointer must name the source skill path`,
    );
  }
});

test("no Claude Code pointer exists without a repository skill", () => {
  const sources = new Set(skillDirectories(sourceRoot));
  for (const name of skillDirectories(mirrorRoot)) {
    assert.ok(sources.has(name), `.claude/skills/${name} has no matching .agents/skills/${name}`);
  }
});
