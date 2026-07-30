import { describe, expect, it } from "vitest";

import {
  GHOST_CHALLENGE_KINDS,
  GhostCareerArchive,
  calculateRunDna,
  createChallengeAttemptProof,
  createFairLiveGhostOverlay,
  createGhostV3,
  createStudioEdl,
  distillNemesisGrammar,
  renderStudioMediaLocally,
  verifyChallengeAttemptProof,
  type GhostChallengeDefinition,
  type GhostReplayTrident,
} from "../../src/ghost";
import type { TearCausalEventV1 } from "../../src/tearbench";

const trident: GhostReplayTrident = {
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "test" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "test" },
  visual: { kind: "visual", status: "verified", available: true, resumable: false, seekable: true, reason: "test" },
};

function event(id: string, type: TearCausalEventV1["type"], tick: number, source: TearCausalEventV1["source"] = "engine"): TearCausalEventV1 {
  return {
    format: "tear-contract", kind: "event", schemaVersion: 1,
    id, type, tick, phase: "post-simulation-commit", sequence: 1, source, payload: {},
  };
}

function sourceGhost() {
  return createGhostV3({
    id: "player-run",
    rulesetVersion: "rules",
    sourceClassification: "native-v3",
    trident,
    actions: [
      { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1_000, y: 0 } },
      { kind: "command", id: 2, tick: 2, command: { type: "dash", x: 1_000, y: 0 } },
      { kind: "command", id: 3, tick: 3, command: { type: "weapon", intent: "throw", phase: "pressed" } },
      { kind: "command", id: 4, tick: 4, command: { type: "weapon", intent: "recall", phase: "pressed" } },
    ],
    snapshots: [],
    events: [
      event("past", "wave.started", 5),
      event("hidden", "system.exception", 4, "developer"),
      event("future", "boss.attack-started", 15),
    ],
    visual: { samples: [1, 2, 3] },
  });
}

describe("Ghost challenges, Studio, and player experiences", () => {
  it("maintains a deterministic career archive and transparent Run DNA rollup", () => {
    const archive = new GhostCareerArchive();
    archive.add({
      ghostId: "run-a",
      completedAt: "2026-07-22T00:00:00.000Z",
      mode: "campaign",
      difficulty: "normal",
      score: 1200,
      result: "victory",
      dna: calculateRunDna({
        attacks: 40, combatTicks: 100, misses: 4, movingTicks: 80,
        damageTaken: 20, maxHp: 100, distinctManeuvers: 4, availableManeuvers: 8,
      }),
    });
    archive.add({
      ghostId: "run-b",
      completedAt: "2026-07-23T00:00:00.000Z",
      mode: "endless",
      difficulty: "hard",
      score: 1800,
      result: "defeat",
      dna: calculateRunDna({
        attacks: 60, combatTicks: 100, misses: 6, movingTicks: 60,
        damageTaken: 40, maxHp: 100, distinctManeuvers: 6, availableManeuvers: 8,
      }),
    });
    expect(archive.list().map((entry) => entry.ghostId)).toEqual(["run-b", "run-a"]);
    expect(archive.summary()).toMatchObject({
      runs: 2,
      victories: 1,
      bestScore: 1800,
      averageDna: { aggression: 0.5, precision: 0.9 },
    });
    const latest = archive.list()[0];
    if (latest === undefined) throw new Error("career archive unexpectedly empty");
    expect(() => { archive.add(latest); }).toThrow("already exists");
  });

  it("defines every player-facing challenge and proves source, rules, seed, conditions, and attempt lineage", () => {
    expect(GHOST_CHALLENGE_KINDS).toEqual([
      "chase-your-best", "seed-locked-race", "beat-this-run", "boss-memory",
      "daily-echo", "learning-ghost", "nemesis-ghost", "tearbot-reference",
    ]);
    const source = sourceGhost();
    const challenge: GhostChallengeDefinition = {
      id: "beat-player-run",
      kind: "beat-this-run",
      sourceGhostId: source.id,
      sourceRootHash: source.rootHash,
      rulesVersion: "challenge-rules-v1",
      seedPolicy: { kind: "locked", seed: "77" },
      conditions: [
        { metric: "completionTicks", operator: "<=", value: 1_000 },
        { metric: "seed", operator: "==", value: "77" },
      ],
    };
    const proof = createChallengeAttemptProof(challenge, {
      id: "attempt.tearghost", rootHash: "attempt-root",
    }, { completionTicks: 900, seed: "77" });
    expect(proof).toMatchObject({
      completed: true,
      attemptCapsule: { id: "attempt.tearghost", rootHash: "attempt-root" },
      lineage: { parentGhostId: source.id, parentRootHash: source.rootHash, relation: "challenge" },
    });
    expect(verifyChallengeAttemptProof(proof)).toBe(true);
    expect(verifyChallengeAttemptProof({ ...proof, completed: false })).toBe(false);
  });

  it("keeps live overlays noninteractive and prevents future or hidden information", () => {
    const overlay = createFairLiveGhostOverlay(sourceGhost(), 10);
    expect(overlay).toMatchObject({
      tick: 10, interactive: false, revealsFuture: false, revealsHiddenState: false,
    });
    expect(overlay.visibleEvents.map((entry) => entry.id)).toEqual(["past"]);
  });

  it("renders a polished local Studio clip without rewriting its parent timeline", async () => {
    const source = sourceGhost();
    const before = JSON.stringify(source);
    const edl = createStudioEdl({
      id: "highlight",
      sourceGhostId: source.id,
      sourceRootHash: source.rootHash,
      aspectRatio: "9:16",
      title: "Boss Read",
      credits: "Local Player",
      clips: [
        {
          id: "opening", sourceFromTick: 0, sourceToTick: 10, outputOrder: 0,
          speed: 1, camera: "player-follow", caption: "Watch the setup",
        },
        {
          id: "payoff", sourceFromTick: 10, sourceToTick: 20, outputOrder: 1,
          speed: 0.5, camera: "blade-follow", caption: "The punish",
        },
      ],
    });
    const media = await renderStudioMediaLocally(source, edl, {
      render: (input) => Promise.resolve({
        mimeType: "video/webm",
        bytes: new TextEncoder().encode(JSON.stringify({
          source: input.source.id,
          clips: input.edl.clips,
          aspectRatio: input.edl.aspectRatio,
        })),
        thumbnail: "data:image/png;base64,thumbnail",
      }),
    });
    expect(media).toMatchObject({
      fileName: "highlight.webm",
      mimeType: "video/webm",
      generatedLocally: true,
      screenRecordingRequired: false,
      sourceRootHash: source.rootHash,
      edlHash: edl.edlHash,
    });
    expect(media.bytes.byteLength).toBeGreaterThan(0);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("derives transparent Run DNA and a bounded non-privileged Nemesis grammar", () => {
    const metrics = {
      attacks: 50, combatTicks: 100, misses: 5, movingTicks: 80,
      damageTaken: 20, maxHp: 100, distinctManeuvers: 6, availableManeuvers: 9,
    };
    const dna = calculateRunDna(metrics);
    expect(dna).toMatchObject({
      formulaVersion: "run-dna-v1",
      dimensions: { aggression: 0.5, precision: 0.9, mobility: 0.8, defense: 0.8 },
      sourceMetrics: metrics,
    });
    const grammar = distillNemesisGrammar(sourceGhost());
    expect(grammar).toMatchObject({
      sourceGhostId: "player-run",
      privileged: false,
      minimumReactionTicks: 12,
      maximumBranchDepth: 3,
    });
    expect(grammar.allowedMoves).toEqual(["approach", "dash", "recall", "throw"]);
    expect(Object.values(grammar.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });
});
