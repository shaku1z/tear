// A release build fails when developer-only code contributes to a bundle. This covers the
// decision the Vite config delegates to scripts/release-developer-code.mjs, against the real role map.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  developerModulesInBundle,
  loadDeveloperOnlyMatcher,
  sourcePathOfModule,
} from "../../scripts/release-developer-code.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isDeveloperOnly = loadDeveloperOnlyMatcher();
const tracked = execFileSync("git", ["ls-files", "src"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

describe("developer-only code in a release bundle", () => {
  it("reads a bundler module id as a source path, whatever the platform or query", () => {
    expect(sourcePathOfModule("C:\\repo\\src\\agents\\scripted-policy.ts")).toBe("src/agents/scripted-policy.ts");
    expect(sourcePathOfModule("/repo/src/ghost/theater.ts?worker")).toBe("src/ghost/theater.ts");
    expect(sourcePathOfModule("/repo/node_modules/pkg/src/index.js")).toBeUndefined();
    expect(sourcePathOfModule("\0vite/preload-helper.js")).toBeUndefined();
  });

  it("reports each developer-only module that contributes code, once, sorted", () => {
    const found = developerModulesInBundle(
      [
        ["/repo/src/tearbench/browser/state-editor.ts", 900],
        ["/repo/src/agents/scripted-policy.ts", 1200],
        ["/repo/src/agents/scripted-policy.ts", 1200],
        ["/repo/src/app/engineering/debug-harness.ts", 10],
        ["/repo/src/playtest/boss-fight.ts", 1],
        ["/repo/src/ghost/theater.ts", 5000],
      ],
      isDeveloperOnly,
    );
    expect(found).toEqual([
      "src/agents/scripted-policy.ts",
      "src/app/engineering/debug-harness.ts",
      "src/playtest/boss-fight.ts",
      "src/tearbench/browser/state-editor.ts",
    ]);
  });

  it("does not report a developer-only module the bundler shook down to nothing", () => {
    expect(developerModulesInBundle([["/repo/src/tearbench/test-support/index.ts", 0]], isDeveloperOnly)).toEqual([]);
  });

  it("does not report the TearBench and engineering modules that release replay uses", () => {
    const release = [
      "src/tearbench/contracts.ts",
      "src/tearbench/detached-world-hydrator.ts",
      "src/tearbench/production-replay-composition.ts",
      "src/app/engineering/state-setup-adapter.ts",
      "src/app/engineering/test-build-journals.ts",
    ];
    for (const file of release) expect(tracked, file).toContain(file);
    expect(
      developerModulesInBundle(
        release.map((file) => [`/repo/${file}`, 100]),
        isDeveloperOnly,
      ),
    ).toEqual([]);
  });

  it("covers every tracked file of the developer-only directories", () => {
    const directories = ["src/agents/", "src/playtest/", "src/tearbench/browser/", "src/tearbench/test-support/"];
    const files = tracked.filter((file) => directories.some((directory) => file.startsWith(directory)));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(isDeveloperOnly(file), file).toBe(true);
  });
});
