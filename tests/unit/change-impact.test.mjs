// Change-impact completeness: every tracked path is either matched by a TearBench evidence route
// (src/tearbench/evidence-routes.json) or explicitly declared in config/change-impact-defaults.json
// as falling back to the shared-runtime route. A new file that neither routes nor declares fails here,
// so nobody adds code whose changes are silently judged by the generic fallback. See
// docs/CHANGE_IMPACT.md for how unknown paths are treated today.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const routes = JSON.parse(fs.readFileSync(path.join(root, "src/tearbench/evidence-routes.json"), "utf8"));
const defaults = JSON.parse(fs.readFileSync(path.join(root, "config/change-impact-defaults.json"), "utf8"));
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
  .split("\0")
  .filter(Boolean);

// The same rule as prefixMatches() in scripts/tearbench.mjs.
function prefixMatches(file, prefix) {
  return prefix.endsWith("/") || prefix.endsWith("-") ? file.startsWith(prefix) : file === prefix;
}

const routePrefixes = routes.flatMap((route) => route.prefixes);
const declared = defaults.fallback.flatMap((group) => group.paths);
const routed = (file) => routePrefixes.some((prefix) => prefixMatches(file, prefix));
const isDeclared = (file) => declared.some((prefix) => prefixMatches(file, prefix));

describe("change-impact completeness", () => {
  it("every tracked path matches an evidence route or a declared fallback", () => {
    const unclassified = tracked.filter((file) => !routed(file) && !isDeclared(file));
    expect(
      unclassified,
      "add the path to a route in src/tearbench/evidence-routes.json, or declare it in config/change-impact-defaults.json",
    ).toEqual([]);
  });

  it("declared fallback entries are not dangling", () => {
    const dangling = declared.filter((prefix) => !tracked.some((file) => prefixMatches(file, prefix)));
    expect(dangling, "remove fallback entries that match no tracked file").toEqual([]);
  });

  it("declared single files under src/ are really unrouted (no stale declarations)", () => {
    const stale = declared.filter((entry) => entry.startsWith("src/") && !entry.endsWith("/") && routed(entry));
    expect(stale, "these files now match a route; remove them from the fallback list").toEqual([]);
  });

  it("src/ fallbacks are listed file by file, never by folder", () => {
    expect(
      declared.filter((entry) => entry.startsWith("src/") && (entry.endsWith("/") || entry.endsWith("-"))),
    ).toEqual([]);
  });

  it("the shared-runtime fallback route exists, as scripts/tearbench.mjs requires", () => {
    expect(routes.some((route) => route.id === defaults.fallbackRoute)).toBe(true);
  });
});
