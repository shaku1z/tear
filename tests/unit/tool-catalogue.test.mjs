// Every package script and every tool entry point under scripts/ is registered in
// config/tool-catalogue.json with a purpose, side-effect classes and a typical duration, and nothing
// registered is dangling. Library modules (imported, never run) and type declarations are listed
// separately so a new file has to be classified one way or the other.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const catalogue = JSON.parse(fs.readFileSync(path.join(root, "config/tool-catalogue.json"), "utf8"));
const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
const tracked = execFileSync("git", ["ls-files", "-z", "scripts"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const TOOL_FILE = /\.(?:mjs|js|cjs|py|ps1|sh|cmd)$/u;
const EFFECTS = new Set(Object.keys(catalogue.effectClasses));
const DURATIONS = new Set(Object.keys(catalogue.durations));

function checkEntry(name, entry) {
  const problems = [];
  if (typeof entry.purpose !== "string" || entry.purpose.trim().length < 10 || entry.purpose.length > 160)
    problems.push(`${name}: purpose must be one line of 10 to 160 characters`);
  if (
    !Array.isArray(entry.effects) ||
    entry.effects.length === 0 ||
    entry.effects.some((effect) => !EFFECTS.has(effect))
  )
    problems.push(`${name}: effects must be a non-empty list of ${[...EFFECTS].join(", ")}`);
  if (entry.effects?.includes("read-only") && entry.effects.length > 1)
    problems.push(`${name}: read-only cannot be combined with another effect`);
  if (!DURATIONS.has(entry.duration)) problems.push(`${name}: duration must be one of ${[...DURATIONS].join(", ")}`);
  return problems;
}

describe("tool catalogue", () => {
  it("registers every package script, in package.json order, and no other", () => {
    expect(Object.keys(catalogue.scripts)).toEqual(Object.keys(scripts));
  });

  it("classifies every tracked tool file under scripts/ exactly once", () => {
    const toolFiles = tracked.filter((file) => TOOL_FILE.test(file)).sort();
    const classified = [...Object.keys(catalogue.entryPoints), ...Object.keys(catalogue.libraries)].sort();
    expect(classified).toEqual(toolFiles);
    const declarations = tracked.filter((file) => file.endsWith(".d.mts")).sort();
    expect([...catalogue.declarations].sort()).toEqual(declarations);
  });

  it("gives every entry a purpose, known effect classes and a known duration", () => {
    const problems = [
      ...Object.entries(catalogue.scripts).flatMap(([name, entry]) => checkEntry(name, entry)),
      ...Object.entries(catalogue.entryPoints).flatMap(([name, entry]) => checkEntry(name, entry)),
    ];
    expect(problems).toEqual([]);
  });

  it("names the package scripts that run each entry point, or who else runs it", () => {
    const problems = [];
    for (const [file, entry] of Object.entries(catalogue.entryPoints)) {
      for (const name of entry.via) {
        if (scripts[name] === undefined) problems.push(`${file}: via names unknown script ${name}`);
        else if (!scripts[name].includes(file)) problems.push(`${file}: script ${name} does not run it`);
      }
      if (entry.via.length === 0) {
        if (!Array.isArray(entry.runBy) || entry.runBy.length === 0)
          problems.push(`${file}: no package script runs it, so runBy must name the files that do`);
        for (const runner of entry.runBy ?? []) {
          const text = fs.existsSync(path.join(root, runner)) ? fs.readFileSync(path.join(root, runner), "utf8") : null;
          if (text === null) problems.push(`${file}: runBy ${runner} does not exist`);
          else if (!text.includes(path.posix.basename(file)))
            problems.push(`${file}: runBy ${runner} does not mention it`);
        }
      }
    }
    for (const [name, command] of Object.entries(scripts))
      for (const match of command.matchAll(/scripts\/[\w./-]+\.(?:mjs|js|py)/gu))
        if (catalogue.entryPoints[match[0]]?.via.includes(name) !== true)
          problems.push(`${match[0]}: entry point does not list package script ${name} in via`);
    expect(problems).toEqual([]);
  });

  it("lists for each library at least one file that imports it", () => {
    const problems = [];
    for (const [file, importers] of Object.entries(catalogue.libraries)) {
      if (importers.length === 0) problems.push(`${file}: a library nothing imports is dead code`);
      for (const importer of importers) {
        const text = fs.existsSync(path.join(root, importer)) ? fs.readFileSync(path.join(root, importer), "utf8") : "";
        if (!text.includes(path.posix.basename(file, path.extname(file))))
          problems.push(`${file}: ${importer} does not import it`);
      }
    }
    expect(problems).toEqual([]);
  });
});
