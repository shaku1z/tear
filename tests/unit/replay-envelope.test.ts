import { describe, expect, it } from "vitest";
import {
  migrateReplayV1,
  validateReplayEnvelope,
  verifyReplayFinalState,
  type ReplayEnvelopeV1,
  type ReplayEnvelopeV2,
} from "../../src/replay/envelope";
import { stableVerificationHash } from "../../src/replay/hash";

function replayFixture(): ReplayEnvelopeV2 {
  const finalState = { tick: 12, score: 900, player: { health: 3 } };
  return {
    format: "tear-replay",
    schemaVersion: 2,
    rulesetVersion: "rules-2026.07",
    build: { version: "0.2.0", revision: "abc123", target: "standalone" },
    run: { runId: "run-a", seed: "seed-a", ticksPerSecond: 60 },
    actions: [
      { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 8, command: { type: "weapon", intent: "throw", phase: "pressed" } },
    ],
    final: { tick: 12, stateHash: stableVerificationHash(finalState) },
    tearScore: {
      enabled: true,
      engineVersion: "0.1.0-alpha.1",
      scoreVersion: "score-a",
      seed: "music-seed-a",
      eventJournalHash: "journal-a",
    },
  };
}

describe("replay envelope", () => {
  it("validates complete metadata and verifies the final deterministic state", () => {
    const replay = replayFixture();
    const result = validateReplayEnvelope(replay);
    expect(result.ok).toBe(true);
    expect(verifyReplayFinalState(replay, { player: { health: 3 }, score: 900, tick: 12 })).toBe(true);
    expect(verifyReplayFinalState(replay, { player: { health: 2 }, score: 900, tick: 12 })).toBe(false);
  });

  it("rejects regressing ticks and incomplete TearScore provenance", () => {
    const replay = replayFixture();
    const invalid = {
      ...replay,
      actions: [replay.actions[1], replay.actions[0]],
      tearScore: { enabled: true, engineVersion: "0.1" },
    };
    const result = validateReplayEnvelope(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((entry) => entry.path)).toContain("actions");
  });

  it("migrates schema 1 with explicit legacy provenance", () => {
    const legacy: ReplayEnvelopeV1 = {
      schemaVersion: 1,
      rulesetVersion: "legacy-rules",
      buildVersion: "0.1.0",
      seed: 42,
      actions: [{ tick: 2, action: { type: "interact" } }],
      finalTick: 8,
      finalHash: "legacy-state-hash",
    };
    const migrated = migrateReplayV1(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.actions[0]).toMatchObject({ id: 1, tick: 2, command: { type: "interact" } });
    expect(migrated.tearScore).toEqual({ enabled: false, reason: "not-recorded" });
  });
});
