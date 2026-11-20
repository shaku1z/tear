import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkAsyncProperty,
  checkProperty,
  DEFAULT_PROPERTY_SEED,
  fc,
  propertySettings,
  replayCommands,
} from "./property-harness";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs|js)$/u.test(entry.name) ? [path.replaceAll("\\", "/")] : [];
  });
}

describe("property test convention", () => {
  const tests = sourceFiles("tests");
  const propertyFiles = tests.filter((path) => path.endsWith(".property.test.ts"));

  it("keeps every property file in tests/unit, on the shared harness", () => {
    expect(propertyFiles.length).toBeGreaterThan(0);
    for (const path of propertyFiles) {
      const text = readFileSync(path, "utf8");
      expect(path, "property files live in tests/unit").toMatch(/^tests\/unit\/[^/]+\.property\.test\.ts$/u);
      expect(text, `${path} imports the harness`).toMatch(/from "\.\/property-harness"/u);
      expect(text, `${path} calls checkProperty, not fc.assert or fc.check`).not.toMatch(/\bfc\.(assert|check)\(/u);
    }
  });

  it("lets only the harness import fast-check, and nothing in src", () => {
    // The quoted module name, as Prettier writes every import; split so this file does not match itself.
    const moduleName = ['"fast', 'check"'].join("-");
    const importers = execFileSync("git", ["grep", "-lF", "--untracked", moduleName, "--", "src", "scripts", "tests"], {
      encoding: "utf8",
    })
      .split(/\r?\n/u)
      .filter((path) => path !== "");
    expect(importers).toEqual(["tests/unit/property-harness.ts"]);
  });
});

describe("property settings", () => {
  it("uses the fixed seed and budget unless overridden", () => {
    expect(propertySettings({})).toEqual({ seed: DEFAULT_PROPERTY_SEED, scale: 1, path: undefined });
    expect(
      propertySettings({ TEAR_PROPERTY_SEED: "-42", TEAR_PROPERTY_SCALE: "50", TEAR_PROPERTY_PATH: "12:0:3" }),
    ).toEqual({ seed: -42, scale: 50, path: "12:0:3" });
  });

  it("refuses an override it cannot read instead of ignoring it", () => {
    expect(() => propertySettings({ TEAR_PROPERTY_SEED: "random" })).toThrow("TEAR_PROPERTY_SEED");
    expect(() => propertySettings({ TEAR_PROPERTY_SCALE: "0" })).toThrow("TEAR_PROPERTY_SCALE");
    expect(() => propertySettings({ TEAR_PROPERTY_SEED: "1", TEAR_PROPERTY_PATH: "a:b" })).toThrow(
      "TEAR_PROPERTY_PATH",
    );
    expect(() => propertySettings({ TEAR_PROPERTY_PATH: "1:2" })).toThrow("needs the TEAR_PROPERTY_SEED");
  });
});

describe("property failure report", () => {
  const failing = fc.property(fc.integer({ min: 0, max: 1_000_000 }), (value) => {
    if (value >= 1_000) throw new Error(`too large: ${String(value)}`);
  });

  function failure(run: () => void): string {
    try {
      run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    throw new Error("the property was expected to fail");
  }

  it("prints the seed, the shrunk input, the reason and the replay commands", () => {
    const message = failure(() => {
      checkProperty(failing);
    });
    expect(message).toContain(`seed: ${String(DEFAULT_PROPERTY_SEED)}`);
    expect(message).toContain("Counterexample: [1000]");
    expect(message).toContain("Failure: too large: 1000");
    expect(message).toMatch(
      /Bash: +TEAR_PROPERTY_SEED=1117 TEAR_PROPERTY_PATH=[\d:]+ pnpm exec vitest run tests\/unit\/property-harness\.test\.ts -t "/u,
    );
    expect(message).toContain("PowerShell: $env:TEAR_PROPERTY_SEED");
  });

  it("gives the same failure on every run", () => {
    const run = () =>
      failure(() => {
        checkProperty(failing);
      });
    expect(run()).toBe(run());
  });

  it("reports an async property the same way", async () => {
    const asyncFailing = fc.asyncProperty(fc.integer({ min: 0, max: 1_000_000 }), async (value) => {
      await Promise.resolve();
      if (value >= 1_000) throw new Error(`too large: ${String(value)}`);
    });
    await expect(checkAsyncProperty(asyncFailing)).rejects.toThrow("Failure: too large: 1000");
  });

  it("writes replay commands for both shells", () => {
    expect(replayCommands(7, "3:1", "C:\\repo\\tests\\unit\\a.property.test.ts", 'saves "x"')).toEqual([
      'Bash:       TEAR_PROPERTY_SEED=7 TEAR_PROPERTY_PATH=3:1 pnpm exec vitest run tests/unit/a.property.test.ts -t "saves \\"x\\""',
      'PowerShell: $env:TEAR_PROPERTY_SEED = "7"; $env:TEAR_PROPERTY_PATH = "3:1"; pnpm exec vitest run tests/unit/a.property.test.ts -t "saves \\"x\\""; Remove-Item Env:TEAR_PROPERTY_SEED, Env:TEAR_PROPERTY_PATH',
    ]);
  });
});
