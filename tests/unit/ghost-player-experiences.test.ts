import { checkGhostCoachSelection, projectGhostCoachHistory, type GhostCoachCandidate, type GhostCoachHistory, type GhostCoachHistorySource } from "../../src/ghost/coach-history";
import { createGhostCoachHistoryController, type GhostCoachHistoryPort } from "../../src/app/ghost-coach-history-controller";
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

// Engineering projection inputs below are explicit admitted-source controls, not
// forged capsules or a substitute for the normal production reader/browser path.
function historyCandidate(id: string, createdAt: string): GhostCoachCandidate {
  return { id, root: `root-${id}`, identity: `manifest-${id}`, compatibility: "same-build-mode-weapon-origin",
    eligible: true, reason: "", createdAt, detail: "engineering source; actor unverified", chunks: 1, decodedBytes: 256, compressedBytes: 128 };
}
function historySource(id: string, createdAt: string, events: readonly TearCausalEventV1[], receipts = [120, 240]): GhostCoachHistorySource {
  return { candidate: historyCandidate(id, createdAt), receipts, events };
}
function identifiedThrow(id: string, tick: number, throwId: number): TearCausalEventV1 {
  return { ...event(id, "blade.thrown", tick), payload: { weaponId: "sword", throwId, x: 100, y: 200 } };
}

describe("native recorded Coach history", () => {
  it("uses a shared (from,to] window, exact native witnesses, chronological distributions and strictly prior practice", () => {
    const target = historySource("target", "2026-10-19T12:00:00+02:00", [identifiedThrow("before", 120, 0),
      identifiedThrow("target-throw", 140, 1), identifiedThrow("duplicate", 141, 1), identifiedThrow("at-end", 240, 2), identifiedThrow("tail", 241, 3)], [0, 120, 240]);
    const baseline = historySource("baseline", "2026-10-19T09:30:00Z", [identifiedThrow("baseline-throw", 150, 7),
      { ...event("identityless", "blade.caught", 170), payload: { effect: "blade-catch", x: 100, y: 200 } },
      { ...event("unclassified-perfect", "projectile.deflected", 180), actorId: "projectile-1", payload: { x: 2, y: 3, vx: 4, vy: 5, owner: "player" } }], [120, 240, 360]);
    const result = projectGhostCoachHistory([target, baseline]);
    expect(result).toMatchObject({ fromTick: 120, toTick: 240, ticks: 120 });
    expect(result.metrics[0]).toMatchObject({ sampleCount: 2, minimum: 1, median: 1.5, maximum: 2,
      history: [{ id: "baseline", count: 1, eventIds: ["baseline-throw"] }, { id: "target", count: 2, eventIds: ["target-throw", "duplicate", "at-end"] }] });
    expect(result.metrics.find((metric) => metric.id === "catches")?.history[0]).toMatchObject({ count: null, knownCount: 0, unclassifiedEventIds: ["identityless"] });
    expect(result.metrics.find((metric) => metric.id === "perfect")?.history[0]).toMatchObject({ count: null, unclassifiedEventIds: ["unclassified-perfect"] });
    expect(result.metrics.find((metric) => metric.id === "deflections")?.history[0]).toMatchObject({ count: 1, eventIds: ["unclassified-perfect"] });
    expect(result.moments).toEqual([
      { id: "throws:target-throw", metric: "throws", tick: 140, eventId: "target-throw", priorTick: 120 },
      { id: "throws:at-end", metric: "throws", tick: 240, eventId: "at-end", priorTick: 120 },
    ]);
    expect(() => projectGhostCoachHistory([target, target])).toThrow(/distinct/);
    expect(() => projectGhostCoachHistory([target, { ...baseline, receipts: [240] }])).toThrow(/two shared/);
    expect(() => { checkGhostCoachSelection([target.candidate, { ...baseline.candidate, compatibility: "other-weapon" }]); }).toThrow(/same build/);
    expect(() => { checkGhostCoachSelection([target.candidate, { ...baseline.candidate, decodedBytes: 129 * 1024 * 1024 }]); }).toThrow(/budget/);
  });

  it("cancels reselection/exit, ignores late results and rechecks all source identities before cited actions", async () => {
    const target = historySource("target", "2026-10-19T10:00:00Z", [identifiedThrow("throw", 140, 1)]);
    const a = historySource("a", "2026-10-19T09:00:00Z", []), b = historySource("b", "2026-10-19T08:00:00Z", []);
    const pending: { resolve: (result: GhostCoachHistory) => void; cancelled: boolean; sources: readonly GhostCoachCandidate[] }[] = [];
    let current = true;
    const port: GhostCoachHistoryPort = { list: () => Promise.resolve([target.candidate, a.candidate, b.candidate]), current: () => Promise.resolve(current),
      analyze: (sources) => {
        let resolve: (result: GhostCoachHistory) => void = () => undefined;
        const result = new Promise<GhostCoachHistory>((done) => { resolve = done; });
        const entry = { resolve, cancelled: false, sources }; pending.push(entry);
        return { result, cancel() { entry.cancelled = true; } };
      } };
    const controller = createGhostCoachHistoryController(port);
    await controller.open(target.candidate);
    expect(controller.snapshot().selected).toEqual([]);
    const first = controller.toggle("a"), second = controller.toggle("b");
    expect(pending[0]?.cancelled).toBe(true);
    pending[1]?.resolve(projectGhostCoachHistory([target, a, b])); await second;
    pending[0]?.resolve(projectGhostCoachHistory([target, a])); await first;
    expect(controller.snapshot().result?.sources.map((source) => source.id)).toEqual(["target", "a", "b"]);
    const moment = controller.snapshot().cited;
    if (moment === undefined) throw new Error("missing actual cited witness");
    const launched: number[] = [];
    await controller.action(moment.id, (found) => { if (found.priorTick !== undefined) launched.push(found.priorTick); });
    expect(launched).toEqual([120]);
    current = false;
    await controller.action(moment.id, () => { launched.push(999); });
    expect(launched).toEqual([120]); expect(controller.snapshot().result).toBeUndefined();
    current = true; const exiting = controller.toggle("b"); controller.close();
    pending.at(-1)?.resolve(projectGhostCoachHistory([target, a])); await exiting;
    expect(controller.snapshot().result).toBeUndefined(); expect(pending.at(-1)?.cancelled).toBe(true);
  });
});
