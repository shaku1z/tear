import { describe, expect, it, vi } from "vitest";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";

import {
  CODEC_REGISTRY,
  TEAR_CONTRACT_FORMAT,
  captureCodecState,
  createDefaultStateCodecRegistry,
  diffCodecWorlds,
  restoreSnapshotIntoLiveWorld,
  restoreSnapshotTransactionally,
  type TearCodecWorld,
  type TearSnapshotV1,
  type TearWorldFactory,
} from "../../src/tearbench";

function world(): TearCodecWorld {
  return { components: new Map(), references: new Map(), entityIds: new Set(["player", "blade"]) };
}

const factory: TearWorldFactory = {
  createEmpty: world,
  validate(candidate) {
    return CODEC_REGISTRY.ids.every((id) => candidate.components.has(id))
      ? []
      : ["not all required codec components were restored"];
  },
};

function populatedWorld(): TearCodecWorld {
  const candidate = world();
  for (const id of CODEC_REGISTRY.ids) candidate.components.set(id, {});
  candidate.components.set("tear.player.v1", {
    id: "player", x: 10, y: 20, vx: 2, vy: 0, hp: 100, maxHp: 100,
  });
  candidate.components.set("tear.blade.v1", {
    id: "blade", ownerId: "player", weaponId: "sword", x: 30, y: 20, vx: 0, vy: 0, state: "held",
  });
  candidate.components.set("tear.enemy.v1", [
    { id: "enemy-1", factoryId: "charger", ownerId: "enemy-1", targetId: "player", x: 400, y: 20, hp: 30 },
  ]);
  candidate.components.set("tear.projectile.v1", [
    { id: "projectile-1", factoryId: "projectile", ownerId: "enemy-1", targetId: "player", x: 300, y: 20, vx: -3, vy: 0 },
  ]);
  candidate.components.set("tear.run.v1", { mode: "endless", difficulty: "hard", wave: 4, tick: 60, elapsedTicks: 60, score: 1200 });
  candidate.components.set("tear.world.v1", { clock: 60, identityState: {} });
  candidate.components.set("tear.boss.v1", []);
  candidate.components.set("tear.platform.v1", []);
  candidate.components.set("tear.hazard.v1", { slowZones: [], walls: [] });
  candidate.components.set("tear.ui.v1", { screen: "playing", focusId: "-1" });
  candidate.components.set("tear.reward.v1", { selection: null });
  candidate.components.set("tear.configuration.v1", { rulesetVersion: "test", values: {} });
  candidate.components.set("tear.rng.v1", { combat: { algorithm: "mulberry32", state: 42 } });
  candidate.components.set("tear.cinematic.v1", INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 as never);
  return candidate;
}

function snapshotFrom(candidate: TearCodecWorld): TearSnapshotV1 {
  const captured = captureCodecState(candidate, createDefaultStateCodecRegistry());
  return {
    format: TEAR_CONTRACT_FORMAT,
    kind: "snapshot",
    schemaVersion: 1,
    id: "snapshot-1",
    tick: 60,
    stateClass: "recorded-canonical",
    seed: "1001",
    hashes: {
      exact: "sha256:11111111", semantic: "sha256:22222222", visual: "sha256:33333333",
      progression: "sha256:44444444", environment: "sha256:55555555",
    },
    provenance: {
      actor: "developer",
      producer: "tearbench-state-codecs.test",
      build: {
        version: "0.1.0", revision: "test", target: "unit", rulesetVersion: "test",
        contentHash: "sha256:aaaaaaaa", configHash: "sha256:bbbbbbbb",
      },
      executionClass: "engineering",
      observationClass: "structured-state",
      trainingConsent: "no-training",
    },
    rng: { combat: { algorithm: "mulberry32", state: "42" } },
    codecs: captured.codecs,
    state: captured.state,
  };
}

function advance(candidate: TearCodecWorld, direction: -1 | 1): void {
  const player = structuredClone(candidate.components.get("tear.player.v1")) as {
    x: number; vx: number;
  };
  const run = structuredClone(candidate.components.get("tear.run.v1")) as {
    elapsedTicks: number; score: number;
  };
  const rng = structuredClone(candidate.components.get("tear.rng.v1")) as {
    combat: { state: number };
  };
  rng.combat.state = (Math.imul(rng.combat.state, 1_664_525) + 1_013_904_223) >>> 0;
  player.vx = direction * (2 + (rng.combat.state % 3));
  player.x += player.vx;
  run.elapsedTicks += 1;
  run.score += rng.combat.state % 2;
  candidate.components.set("tear.player.v1", player);
  candidate.components.set("tear.run.v1", run);
  candidate.components.set("tear.rng.v1", rng);
}

describe("TearBench shared state codec registry", () => {
  it("migrates pre-cinematic v1 snapshots to the canonical inactive component", () => {
    const registry = createDefaultStateCodecRegistry();
    const base = structuredClone(snapshotFrom(populatedWorld()));
    const codecs: Record<string, number> = { ...base.codecs };
    const state: Record<string, unknown> = { ...base.state };
    delete codecs["tear.cinematic.v1"];
    delete state["tear.cinematic.v1"];
    const snapshot = { ...base, codecs, state } as TearSnapshotV1;
    let restored = world();

    const result = restoreSnapshotTransactionally(snapshot, registry, factory, {
      replace(candidate) { restored = candidate; },
    });

    expect(result.ok).toBe(true);
    expect(restored.components.get("tear.cinematic.v1")).toEqual(INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
  });

  it("rejects noncanonical inactive cinematic state during decode", () => {
    const snapshot = structuredClone(snapshotFrom(populatedWorld()));
    const hostile = { ...snapshot, state: { ...snapshot.state, "tear.cinematic.v1": {
      ...INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
      elapsedSeconds: 1,
      totalElapsedSeconds: 1,
    } } } as TearSnapshotV1;

    const result = restoreSnapshotTransactionally(hostile, createDefaultStateCodecRegistry(), factory, {
      replace() { throw new Error("invalid snapshot must not commit"); },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((entry) => entry.message.includes("canonical idle"))).toBe(true);
  });

  it("captures, restores into a fresh world, and reproduces the next 600 ticks", () => {
    const registry = createDefaultStateCodecRegistry();
    const original = populatedWorld();
    const snapshot = snapshotFrom(original);
    let restored = world();
    const result = restoreSnapshotTransactionally(snapshot, registry, factory, {
      replace(candidate) { restored = candidate; },
    });
    expect(result.ok).toBe(true);
    expect(diffCodecWorlds(original, restored, registry).every((entry) => entry.exactEqual && entry.semanticEqual)).toBe(true);

    for (let tick = 0; tick < 600; tick += 1) {
      const direction = tick % 17 < 8 ? 1 : -1;
      advance(original, direction);
      advance(restored, direction);
      expect(diffCodecWorlds(original, restored, registry).every((entry) => entry.exactEqual), `tick ${String(tick)}`).toBe(true);
    }
  });

  it("never replaces the active world when validation or reference resolution fails", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    const hostile = structuredClone(snapshot);
    const projectiles = hostile.state["tear.projectile.v1"] as { ownerId?: string }[];
    const firstProjectile = projectiles[0];
    if (firstProjectile === undefined) throw new Error("fixture projectile is missing");
    firstProjectile.ownerId = "missing-owner";
    let replacements = 0;
    const result = restoreSnapshotTransactionally(hostile, registry, factory, {
      replace() { replacements += 1; },
    });
    expect(result.ok).toBe(false);
    expect(replacements).toBe(0);
    if (!result.ok) expect(result.issues.some((issue) => issue.message.includes("missing-owner"))).toBe(true);
  });

  it("rejects executable and constructor-selecting payloads as plain-data violations", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    const hostileState = { ...snapshot.state, "tear.player.v1": { constructor: "Player", x: 1 } };
    const hostile = { ...snapshot, state: hostileState } as TearSnapshotV1;
    let replacements = 0;
    const result = restoreSnapshotTransactionally(hostile, registry, factory, {
      replace() { replacements += 1; },
    });
    expect(result.ok).toBe(false);
    expect(replacements).toBe(0);
    if (!result.ok) expect(result.issues.some((issue) => issue.message.includes("dangerous"))).toBe(true);
  });

  it("rejects duplicate stable identities before rebuilding references", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    const hostile: TearSnapshotV1 = {
      ...structuredClone(snapshot),
      state: {
        ...snapshot.state,
        "tear.enemy.v1": [
          { id: "enemy-1", factoryId: "charger", targetId: "player", x: 10, y: 20 },
          { id: "enemy-1", factoryId: "charger", targetId: "player", x: 30, y: 20 },
        ],
      },
    };
    const result = restoreSnapshotTransactionally(hostile, registry, factory, { replace() { /* unreachable */ } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.message.includes("duplicate entity id enemy-1"))).toBe(true);
  });

  it("treats run-owned void graph ids as aliases rather than duplicate entity declarations", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    const valid: TearSnapshotV1 = {
      ...structuredClone(snapshot),
      state: {
        ...snapshot.state,
        "tear.platform.v1": [{ id: "void-platform-1", platformId: "void-platform-1", x: 0, y: 0, w: 20, h: 10 }],
        "tear.run.v1": {
          ...(snapshot.state["tear.run.v1"] as Record<string, unknown>),
          voidScroll: { chunks: [{ id: "void-chunk-1", platforms: [{ id: "void-platform-1" }] }] },
        },
      },
    };
    const result = restoreSnapshotTransactionally(valid, registry, factory, { replace() { /* expected */ } });
    expect(result.ok).toBe(true);
  });

  it("stages constructor/reference rebuilding off-run and rolls back a failed live commit", () => {
    const registry = createDefaultStateCodecRegistry();
    const original = populatedWorld();
    const snapshot = snapshotFrom(original);
    const previous = populatedWorld();
    previous.components.set("tear.run.v1", { wave: 2, elapsedTicks: 20, score: 30 });
    let active = structuredClone(previous.components.get("tear.run.v1"));
    let commits = 0;
    const result = restoreSnapshotIntoLiveWorld(snapshot, registry, factory, {
      capture: () => previous,
      stage(candidate, context) {
        context.requireIdentity("player");
        context.requireIdentity("enemy-1");
        return structuredClone(candidate.components.get("tear.run.v1"));
      },
      validate: () => [],
      commit(candidate) {
        commits += 1;
        active = candidate;
        if (commits === 1) throw new Error("host rejected candidate");
      },
    });
    expect(result).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(commits).toBe(2);
    expect(active).toEqual(previous.components.get("tear.run.v1"));
  });

  it("commits a first live world without attempting to capture a nonexistent predecessor", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    const capture = vi.fn(() => { throw new Error("no active world"); });
    const commit = vi.fn();
    const result = restoreSnapshotIntoLiveWorld(snapshot, registry, factory, {
      capture,
      stage: (candidate) => candidate,
      validate: () => [],
      commit,
    }, { capturePrevious: false });

    expect(result.ok).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
  });
});
