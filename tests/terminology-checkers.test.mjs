import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  runTerminologyCheck,
  validateRegistry,
} from "../scripts/check-terminology.mjs";
import {
  runActiveRosterCheck,
} from "../scripts/check-active-roster.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(repositoryRoot, "config", "terminology-registry.json");

function baseRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, "utf8"));
}

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tear-g4-terminology-"));
}

function writeFixture(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function writeRegistry(root, registry) {
  writeFixture(root, "registry.json", JSON.stringify(registry, null, 2));
}

function withFixture(callback) {
  const root = fixtureRoot();
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const weaponSource = `
export const WEAPON_IDS = Object.freeze([
  "sword",
  "hammer",
  "greatsword",
  "chainblade",
  "riftlock",
] as const);

export const WEAPON_SELECTION_MIGRATION = Object.freeze({
  spear: "greatsword",
  ringblade: "riftlock",
} as const satisfies Record<string, WeaponId>);
`;

test("terminology checker rejects a new unallowlisted deprecated label", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/presentation/screens/new-screen.ts", 'export const label = "Ghost Lab";\n');

    const result = runTerminologyCheck({ root, registryPath: "registry.json" });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /new-screen\.ts.*Ghost Lab/u);
  });
});

test("terminology checker accepts only the existing exact compatibility path", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/presentation/screens/menu-setup.ts", 'export const label = "Ghost Lab";\n');

    const result = runTerminologyCheck({ root, registryPath: "registry.json" });

    assert.equal(result.ok, true);
    assert.ok(result.findings.some((finding) => finding.allowlistId === "compat-menu-setup-surfaces"));
  });
});

test("generic Signal vocabulary is ignored outside the scoped player-music surfaces", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    registry.userFacingCopyScan.pathPatterns = ["src/**/*.ts"];
    writeRegistry(root, registry);
    writeFixture(root, "src/audio/unrelated-signal.ts", 'export const label = "Signal";\n');
    writeFixture(root, "src/presentation/settings-snapshots.ts", 'export const label = "Signal";\n');

    const result = runTerminologyCheck({ root, registryPath: "registry.json" });

    assert.equal(result.ok, true);
    assert.ok(result.findings.some((finding) => finding.relativePath === "src/presentation/settings-snapshots.ts" && finding.termId === "music"));
    assert.equal(result.findings.some((finding) => finding.relativePath === "src/audio/unrelated-signal.ts"), false);
  });
});

test("registry validation rejects duplicate aliases and broad mutable exceptions", () => {
  const registry = baseRegistry();
  registry.terms[1].deprecatedAliases.push("TearScore");
  registry.allowlists.mutableCompatibility.push({
    id: "bad-broad-exception",
    pathPattern: "src/**",
    termIds: ["music"],
    owner: "test",
    reason: "test",
    testEvidence: ["test"],
    expiry: { checkpoint: "test", condition: "test" },
  });

  const errors = validateRegistry(registry);

  assert.ok(errors.some((error) => /deprecated alias is duplicated/u.test(error)));
  assert.ok(errors.some((error) => /too broad for mutable compatibility/u.test(error)));
});

test("active-roster checker verifies canonical order and exact retired-ID migration", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/gameplay/weapon-selection.ts", weaponSource);

    const result = runActiveRosterCheck({ root, registryPath: "registry.json" });

    assert.equal(result.ok, true);
    assert.deepEqual(result.actualIds, ["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
    assert.deepEqual(result.actualMigration, { spear: "greatsword", ringblade: "riftlock" });
  });
});

test("active-roster checker rejects retired IDs in new current public copy", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/gameplay/weapon-selection.ts", weaponSource);
    writeFixture(root, "src/presentation/screens/new-screen.ts", 'export const label = "Spear";\n');

    const result = runActiveRosterCheck({ root, registryPath: "registry.json" });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /new-screen\.ts.*spear/iu);
  });
});
