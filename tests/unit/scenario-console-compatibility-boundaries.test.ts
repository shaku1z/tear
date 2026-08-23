import { describe, expect, it } from "vitest";

import {
  GhostCapsuleReader,
  GhostLocalVault,
  GhostStreamingRecorder,
  createMemoryGhostVaultBackend,
  mapGhostCapsuleToReplayEnvelope,
} from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  selectDiffAwareEvidence,
  TearCheckpointBank,
  TearStateTimeline,
  migrateTimelineArchive,
  parseTearSdl,
  resolveTearSdl,
} from "../../src/tearbench";
import type { EvidenceRoute, TearSdlDocumentV1, TearSnapshotV1 } from "../../src/tearbench";
import {
  LEGACY_STATE_FORGE_DOM_SELECTORS,
  SCENARIO_CONSOLE_DOM_SELECTOR_ALIASES,
  SCENARIO_CONSOLE_DOM_SELECTORS,
  ScenarioConsoleCapsuleReader,
  ScenarioConsoleCheckpointBank,
  ScenarioConsoleStateTimeline,
  mapScenarioConsoleCapsuleToReplayEnvelope,
  migrateScenarioConsoleTimeline,
  parseScenarioConsoleSource,
  resolveScenarioConsoleSource,
  selectScenarioConsoleEvidence,
} from "../../src/tearbench/browser/scenario-console";

const document: TearSdlDocumentV1 = {
  format: "tearsdl",
  schemaVersion: 1,
  id: "state-forge.live-sandbox",
  stateClass: "surgical-valid",
  seed: "scenario-console-compat",
  start: { mode: "campaign", difficulty: "normal", weapon: "sword", wave: 2 },
  state: { player: { hp: 80 }, run: { score: 40 } },
  constraints: { legalProgression: true },
  tags: ["state-forge", "developer", "disposable"],
};

function source(): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function snapshot(): TearSnapshotV1 {
  return {
    format: "tear-contract", kind: "snapshot", schemaVersion: 1,
    id: "scenario-console-root", tick: 10, stateClass: "recorded-canonical", seed: "compat",
    hashes: { exact: "exact", semantic: "semantic", visual: "visual", progression: "progression", environment: "environment" },
    provenance: {
      actor: "developer", producer: "scenario-console-compat", executionClass: "engineering",
      observationClass: "structured-state", trainingConsent: "no-training",
      build: { version: "0.1.0", revision: "compat", target: "test", rulesetVersion: "compat", contentHash: "content", configHash: "config" },
    },
    rng: {}, codecs: {}, state: { player: { hp: 80 }, run: { score: 40 } },
  };
}

describe("Scenario Console compatibility boundaries", () => {
  it("exposes canonical selectors while preserving every C23 selector", () => {
    expect(SCENARIO_CONSOLE_DOM_SELECTORS.root).toBe('[data-surface="scenario-console"]');
    expect(SCENARIO_CONSOLE_DOM_SELECTOR_ALIASES.root).toContain(LEGACY_STATE_FORGE_DOM_SELECTORS.root);
    expect(SCENARIO_CONSOLE_DOM_SELECTOR_ALIASES.editor).toContain(LEGACY_STATE_FORGE_DOM_SELECTORS.editor);
  });

  it("reads TearSDL through both names with identical bytes, resolution, and hash", () => {
    const legacy = resolveTearSdl(parseTearSdl(source()));
    const canonical = resolveScenarioConsoleSource(parseScenarioConsoleSource(source()));
    expect(parseScenarioConsoleSource).toBe(parseTearSdl);
    expect(resolveScenarioConsoleSource).toBe(resolveTearSdl);
    expect(canonical).toEqual(legacy);
    expect(stableVerificationHash(canonical.document)).toBe(stableVerificationHash(legacy.document));
  });

  it("round-trips checkpoint and timeline archives through canonical aliases", () => {
    const legacyBank = new TearCheckpointBank();
    legacyBank.addSnapshot(snapshot());
    legacyBank.fork("scenario-console-root", "scenario-console-fork", 11, { player: { hp: 1 } });
    const checkpointArchive = legacyBank.export();
    const canonicalBank = new ScenarioConsoleCheckpointBank();
    canonicalBank.import(checkpointArchive);
    expect(canonicalBank.export()).toEqual(checkpointArchive);
    expect(stableVerificationHash(canonicalBank.export())).toBe(stableVerificationHash(checkpointArchive));

    const legacyTimeline = new TearStateTimeline(60);
    legacyTimeline.checkpoint(snapshot());
    legacyTimeline.delta({ id: "timeline-fork", parentId: "scenario-console-root", tick: 11, statePatch: { player: { hp: 1 } }, actions: [], events: [] });
    const timelineArchive = legacyTimeline.export();
    const canonicalTimeline = new ScenarioConsoleStateTimeline(60);
    canonicalTimeline.import(timelineArchive);
    expect(canonicalTimeline.export()).toEqual(timelineArchive);
    expect(migrateScenarioConsoleTimeline(checkpointArchive, 60)).toEqual(migrateTimelineArchive(checkpointArchive, 60));
  });

  it("reads one capsule and maps one replay identically through legacy and canonical aliases", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostStreamingRecorder({
      sessionId: "scenario-console-capsule", createdAt: "2026-08-01T00:00:00.000Z",
      chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await recorder.start();
    await recorder.append({ kind: "commands", tick: 3, value: { kind: "command", id: 1, tick: 3, command: { type: "dash", x: 1, y: 0 } } });
    await recorder.finalize("2026-08-01T00:01:00.000Z");

    const legacyCapsule = await new GhostCapsuleReader(vault).read("scenario-console-capsule");
    const canonicalCapsule = await new ScenarioConsoleCapsuleReader(vault).read("scenario-console-capsule");
    const legacyReplay = mapGhostCapsuleToReplayEnvelope(legacyCapsule);
    const canonicalReplay = mapScenarioConsoleCapsuleToReplayEnvelope(canonicalCapsule);
    expect(canonicalCapsule).toEqual(legacyCapsule);
    expect(canonicalReplay).toEqual(legacyReplay);
    expect(stableVerificationHash(canonicalReplay)).toBe(stableVerificationHash(legacyReplay));
  });

  it("selects identical evidence from the canonical and legacy release readers", () => {
    const routes: readonly EvidenceRoute[] = [{
      id: "shared-runtime", prefixes: ["src/tearbench/"], scenarios: ["boot-start-run"],
      graveyardCases: ["all-shared-runtime-history"], journeyCheckpoint: "menu-to-menu-smoke",
      baseComparison: "main-base", interactionMatrices: ["browser", "frame-rate"],
    }];
    const changedFiles = ["src/tearbench/browser/scenario-console.ts"];
    const legacy = selectDiffAwareEvidence(changedFiles, routes);
    const canonical = selectScenarioConsoleEvidence(changedFiles, routes);
    expect(selectScenarioConsoleEvidence).toBe(selectDiffAwareEvidence);
    expect(canonical).toEqual(legacy);
    expect(stableVerificationHash(canonical)).toBe(stableVerificationHash(legacy));
  });
});
