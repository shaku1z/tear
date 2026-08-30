import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  runTerminologyCheck,
  translateMutableGeneratedDescriptions,
  validateRegistry,
} from "../scripts/check-terminology.mjs";
import {
  runActiveRosterCheck,
} from "../scripts/check-active-roster.mjs";
import { buildRequirements } from "../scripts/tearbench-requirements.mjs";

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

test("terminology checker reports every unallowlisted repeated occurrence", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/presentation/screens/new-screen.ts", 'export const labels = "Ghost Lab Ghost Lab\nGhost Lab";\n');
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    const findings = result.findings.filter((finding) => finding.alias === "Ghost Lab");
    assert.equal(result.ok, false);
    assert.equal(findings.length, 3);
    assert.equal(result.errors.length, 3);
    assert.deepEqual(findings.map((finding) => finding.line), [1, 1, 2]);
    assert.ok(findings.every((finding) => finding.classification === "unallowlisted"));
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

test("Run Monitor vocabulary owners are scanned with only their exact historical panel exception", () => {
  const registry = baseRegistry();
  assert.ok(registry.userFacingCopyScan.pathPatterns.includes("src/agents/panel-surface.ts"));
  assert.ok(registry.userFacingCopyScan.pathPatterns.includes("src/app/live-player-watch-controller.ts"));

  withFixture((root) => {
    writeRegistry(root, registry);
    writeFixture(root, "src/agents/panel-surface.ts",
      'export const labels = "Watch Agent Watch Agent Watch Agent";\n');
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    const findings = result.findings.filter((finding) => finding.alias === "Watch Agent");
    assert.equal(result.ok, true);
    assert.equal(findings.length, 3);
    assert.ok(findings.every((finding) => finding.classification === "mutable-compatibility"
      && finding.allowlistId === "compat-run-monitor-panel-surface"));
  });

  withFixture((root) => {
    writeRegistry(root, registry);
    writeFixture(root, "src/app/live-player-watch-controller.ts", 'export const label = "Watch Agent";\n');
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding.alias === "Watch Agent"
      && finding.classification === "unallowlisted"));
  });
});

test("terminology checker scans active evidence JSON without misclassifying preserved notes", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "docs/tearbench-ghost3-evidence-catalog.json",
      '{"notes":"Foundry and Ghost Lab are retained source-era evidence labels."}\n');
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    const findings = result.findings.filter((finding) => finding.relativePath === "docs/tearbench-ghost3-evidence-catalog.json");
    assert.equal(result.ok, true);
    assert.deepEqual(findings.map((finding) => finding.alias).sort(), ["Foundry", "Ghost Lab"]);
    assert.ok(findings.every((finding) => finding.classification === "mutable-compatibility"
      && finding.allowlistId === "compat-current-generated-evidence-catalog"));
  });
});

test("terminology checker classifies every repeated compatibility and historical occurrence", () => {
  for (const [relativePath, classification, allowlistId] of [
    ["src/presentation/screens/menu-setup.ts", "mutable-compatibility", "compat-menu-setup-surfaces"],
    ["docs/TEARBENCH_GHOST3_TERMINOLOGY.md", "immutable-history", "history-ghost3-top-level-docs"],
  ]) withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    const content = relativePath.endsWith(".ts")
      ? 'export const labels = "Ghost Lab Ghost Lab\nGhost Lab";\n'
      : "Ghost Lab Ghost Lab\nGhost Lab\n";
    writeFixture(root, relativePath, content);
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    const findings = result.findings.filter((finding) => finding.alias === "Ghost Lab");
    assert.equal(result.ok, true);
    assert.deepEqual(findings.map((finding) => finding.line), [1, 1, 2]);
    assert.ok(findings.every((finding) => finding.classification === classification));
    assert.ok(findings.every((finding) => finding.allowlistId === allowlistId));
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

test("generated-description translation leaves source identity and hashes immutable", () => {
  const registry = baseRegistry();
  const generated = {
    id: "TG3-example",
    sourceStatement: "State Forge is historical source wording.",
    sourceTextHash: "ABC123",
    atomicTextHash: "DEF456",
    sourceVersion: "0.6",
    text: "State Forge is the current description.",
    description: "State Forge is the current description.",
  };
  const translated = translateMutableGeneratedDescriptions({ requirements: [generated] }, registry);
  const requirement = translated.requirements[0];
  assert.equal(requirement.id, generated.id);
  assert.equal(requirement.sourceStatement, generated.sourceStatement);
  assert.equal(requirement.sourceTextHash, generated.sourceTextHash);
  assert.equal(requirement.atomicTextHash, generated.atomicTextHash);
  assert.equal(requirement.sourceVersion, generated.sourceVersion);
  assert.equal(requirement.text, "Scenario Console is the current description.");
  assert.equal(requirement.description, "Scenario Console is the current description.");
});

test("generated requirements apply mutable terminology at the generator boundary", () => {
  const [requirement] = buildRequirements({
    occurrences: [{
      id: "SRC-example",
      kind: "paragraph",
      numberedSection: 1,
      startLine: 1,
      endLine: 1,
      headingPath: ["Requirements"],
      text: "State Forge is required.",
      textHash: "SOURCE-HASH",
    }],
  }, new Map());
  assert.ok(requirement);
  assert.equal(requirement.text, "Scenario Console is required.");
  assert.equal(requirement.sourceStatement, "State Forge is required.");
  assert.equal(requirement.sourceTextHash, "SOURCE-HASH");
  assert.equal(requirement.atomicTextHash,
    createHash("sha256").update("State Forge is required.").digest("hex"));
});

test("current-source checker rejects stale provisional definitions and checkpoint claims only on mutable paths", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    registry.currentSourcePolicy.mutableScanPaths = ["src/gameplay/run/boss-definitions.ts", "docs/**/*.md"];
    writeRegistry(root, registry);
    writeFixture(root, "src/gameplay/run/boss-definitions.ts",
      "export const WHITE_HART_PROVISIONAL_DEFINITION = {};");
    writeFixture(root, "docs/TEARBENCH_GHOST3_PROGRAM.md",
      "Current checkpoint C24: provisional pending implementation.\n");
    writeFixture(root, "docs/checkpoints/old-history.md",
      "Current checkpoint C24: provisional historical wording.\n");
    const result = runTerminologyCheck({ root, registryPath: "registry.json" });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => /stale provisional definition symbol/u.test(error)));
    assert.ok(result.errors.some((error) => /stale current-facing checkpoint claim/u.test(error)));
    assert.equal(result.errors.some((error) => error.includes("old-history.md")), false);
  });
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

test("active-roster checker reports every repeated retired ID at its actual source line", () => {
  withFixture((root) => {
    const registry = baseRegistry();
    writeRegistry(root, registry);
    writeFixture(root, "src/gameplay/weapon-selection.ts", weaponSource);
    writeFixture(root, "public/repeated.json", '{\n  "old": "spear",\n  "alsoOld": "spear ringblade"\n}\n');

    const result = runActiveRosterCheck({ root, registryPath: "registry.json" });
    const findings = result.findings.filter((finding) => finding.relativePath.endsWith("repeated.json"));

    assert.equal(result.ok, false);
    assert.deepEqual(findings.map(({ retiredId, line }) => ({ retiredId, line })), [
      { retiredId: "spear", line: 2 },
      { retiredId: "spear", line: 3 },
      { retiredId: "ringblade", line: 3 },
    ]);
    assert.equal(result.errors.filter((error) => error.includes("repeated.json")).length, 3);
  });
});
