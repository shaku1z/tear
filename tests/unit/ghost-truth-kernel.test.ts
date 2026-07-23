import { describe, expect, it } from "vitest";

import {
  GhostTimeline,
  createGhostV3,
  migrateLegacyReplayToGhost,
  negotiateRecordingProfile,
  resolveTridentPrecedence,
  verifyGhostRoundTrips,
  type GhostReplayTrident,
} from "../../src/ghost";
import type { TearCausalEventV1 } from "../../src/tearbench";

const trident: GhostReplayTrident = {
  command: {
    kind: "command", status: "verified", available: true, resumable: true, seekable: false,
    reason: "fixed ruleset and environment hashes match",
  },
  state: {
    kind: "state", status: "verified", available: true, resumable: true, seekable: true,
    reason: "validated keyframes",
  },
  visual: {
    kind: "visual", status: "verified", available: true, resumable: false, seekable: true,
    reason: "presentation samples",
  },
};

function event(
  id: string,
  type: TearCausalEventV1["type"],
  tick: number,
  sequence: number,
  parentIds: readonly string[] = [],
): TearCausalEventV1 {
  const payload = type === "run.started"
    ? { mode: "campaign", difficulty: "normal", weapon: "sword" }
    : type === "blade.hit"
      ? { damage: 10, speed: 500 }
      : type === "combat.kill"
        ? { enemyKind: "charger", cause: "blade" }
      : {};
  return {
    format: "tear-contract",
    kind: "event",
    schemaVersion: 1,
    id,
    type,
    tick,
    phase: "post-simulation-commit",
    sequence,
    source: "engine",
    parentIds,
    payload,
  };
}

describe("Ghost 3.0 truth kernel", () => {
  it("orders integer-tick events and answers causal parent/child queries", () => {
    const parent = event("hit-1", "blade.hit", 10, 1);
    const child = event("kill-1", "combat.kill", 10, 2, ["hit-1"]);
    const timeline = new GhostTimeline([child, parent]);
    expect(timeline.entries().map((entry) => entry.event.id)).toEqual(["hit-1", "kill-1"]);
    expect(timeline.childrenOf("hit-1").map((entry) => entry.event.id)).toEqual(["kill-1"]);
    expect(timeline.ancestorsOf("kill-1").map((entry) => entry.event.id)).toEqual(["hit-1"]);
    expect(() => new GhostTimeline([{ ...parent, payload: { damage: "wrong" } }])).toThrow(/blade\.hit\.damage/u);
  });

  it("applies Trident precedence and negotiates track survival without dropping required truth", () => {
    expect(resolveTridentPrecedence(trident, "watch").selected).toBe("visual");
    expect(resolveTridentPrecedence(trident, "seek").selected).toBe("state");
    expect(resolveTridentPrecedence(trident, "resume").selected).toBe("command");
    const negotiated = negotiateRecordingProfile({
      id: "causal-rich",
      tracks: {
        manifest: "required", commands: "required", rng: "required",
        events: "preferred", keyframes: "preferred", presentation: "optional",
      },
    }, {
      supportedTracks: ["manifest", "commands", "rng", "events", "keyframes", "presentation"],
      maxTracks: 5,
    });
    expect(negotiated.viable).toBe(true);
    expect(negotiated.acceptedTracks).toEqual(["manifest", "commands", "rng", "events", "keyframes"]);
    expect(negotiated.droppedTracks).toEqual(["presentation"]);
  });

  it("passes native record, seek, zero-fork, practice, export/import, and migration invariants", () => {
    const events = [event("run-1", "run.started", 0, 1), event("jump-1", "player.jump-started", 4, 1, ["run-1"])];
    const ghost = createGhostV3({
      id: "native-fixture",
      rulesetVersion: "rules-1",
      sourceClassification: "native-v3",
      trident,
      actions: [
        { kind: "command", id: 1, tick: 4, command: { type: "jump", phase: "pressed" } },
      ],
      snapshots: [],
      events,
      visual: { samples: [{ tick: 0, x: 10, y: 20 }] },
    });
    expect(verifyGhostRoundTrips(ghost)).toEqual({
      record: true,
      seek: true,
      zeroModificationFork: true,
      practice: true,
      exportImport: true,
      migration: true,
    });
    expect(Object.keys(ghost.quality)).toEqual([
      "fidelity", "integrity", "compatibility", "completeness", "seekability",
      "resumability", "eligibility", "coachingRichness", "creatorRichness", "privacy",
    ]);
  });

  it("keeps V1/V2 fixtures watchable without inventing verification", () => {
    const legacy = {
      schemaVersion: 1,
      rulesetVersion: "legacy-rules",
      buildVersion: "0.0.1",
      seed: 7,
      actions: [{ tick: 2, action: { type: "jump", phase: "pressed" } }],
      finalTick: 4,
      finalHash: "legacy-hash",
    };
    const ghost = migrateLegacyReplayToGhost(legacy);
    expect(ghost.sourceClassification).toBe("legacy-v1");
    expect(ghost.trident.visual).toMatchObject({ available: true, status: "legacy-visual" });
    expect(ghost.trident.command).toMatchObject({ status: "declared-unverified", resumable: false });
    expect(resolveTridentPrecedence(ghost.trident, "watch").selected).toBe("visual");
    expect(resolveTridentPrecedence(ghost.trident, "verify").selected).toBeUndefined();
    expect(ghost.quality.eligibility.score).toBe(0);
    expect(verifyGhostRoundTrips(ghost).exportImport).toBe(true);
  });
});
