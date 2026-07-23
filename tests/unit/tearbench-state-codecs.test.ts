import { describe, expect, it } from "vitest";

import {
  CODEC_REGISTRY,
  TEAR_CONTRACT_FORMAT,
  captureCodecState,
  createDefaultStateCodecRegistry,
  diffCodecWorlds,
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
    id: "blade", ownerId: "player", x: 30, y: 20, vx: 0, vy: 0, state: "held",
  });
  candidate.components.set("tear.enemy.v1", [
    { id: "enemy-1", ownerId: "enemy-1", targetId: "player", x: 400, y: 20, hp: 30 },
  ]);
  candidate.components.set("tear.projectile.v1", [
    { id: "projectile-1", ownerId: "enemy-1", targetId: "player", x: 300, y: 20, vx: -3, vy: 0 },
  ]);
  candidate.components.set("tear.run.v1", { wave: 4, elapsedTicks: 60, score: 1200 });
  candidate.components.set("tear.rng.v1", { combat: { algorithm: "mulberry32", state: 42 } });
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
});
