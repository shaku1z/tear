// docs/REPOSITORY_MAP.md must name every tracked top-level entry, and only those; tracked files in the
// evidence and document folders stay under the size cap unless config/size-caps.json allows them.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkSizeCaps,
  mappedEntries,
  trackedGeneratedEntries,
  trackedTopLevelEntries,
  untrackedEntries,
} from "../../scripts/check-repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const map = fs.readFileSync(path.join(root, "docs/REPOSITORY_MAP.md"), "utf8");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
  .split("\0")
  .filter(Boolean);

describe("repository map", () => {
  it("names every tracked top-level entry", () => {
    const mapped = new Set(mappedEntries(map));
    expect(trackedTopLevelEntries(tracked).filter((entry) => !mapped.has(entry))).toEqual([]);
  });

  it("names no tracked entry that no longer exists", () => {
    const present = new Set(trackedTopLevelEntries(tracked));
    expect(mappedEntries(map).filter((entry) => !present.has(entry))).toEqual([]);
  });

  it("detects an unmapped new top-level entry", () => {
    const withNew = [...tracked, "newtool/run.mjs", "NOTES.md"];
    const mapped = new Set(mappedEntries(map));
    expect(trackedTopLevelEntries(withNew).filter((entry) => !mapped.has(entry))).toEqual(["NOTES.md", "newtool/"]);
  });
});

describe("generated folders", () => {
  it("lists the build, cache and evidence folders as not tracked", () => {
    expect(untrackedEntries(map)).toEqual(
      expect.arrayContaining([
        ".tmp-tone-host-esm/",
        ".wrangler/",
        "artifacts/",
        "coverage/",
        "dist/",
        "node_modules/",
        "test-results/",
      ]),
    );
  });

  it("tracks none of them", () => {
    expect(trackedGeneratedEntries(map, tracked)).toEqual([]);
  });

  it("flags a committed build output or evidence file", () => {
    const withOutput = [...tracked, "dist/standalone/index.html", "artifacts/tearbench/run.json"];
    expect(trackedGeneratedEntries(map, withOutput)).toEqual(["artifacts/", "dist/"]);
  });
});

describe("size caps", () => {
  it("tracked files in capped folders are within their cap", () => {
    expect(checkSizeCaps(root, tracked).errors).toEqual([]);
  });

  it("flags an oversized file and an allowlisted file that grew past its ceiling", () => {
    const sizes = new Map([
      ["docs/huge.json", 600 * 1024],
      ["tests/fixtures/tutorial-gold-reference-proof.json", 5 * 1024 * 1024],
      ["src/big.png", 9 * 1024 * 1024],
    ]);
    const errors = checkSizeCaps(root, [...sizes.keys()], (file) => sizes.get(file) ?? 0).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/docs\/huge\.json/u);
    expect(errors[1]).toMatch(/tutorial-gold-reference-proof\.json/u);
  });
});
