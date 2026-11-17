import { readFileSync } from "node:fs";
import { preflightGhostRecordedCanonicalSnapshot } from "../../src/ghost/capsule-replay-envelope";
import { describe, expect, it, vi } from "vitest";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";
import { createLiveStateCodec } from "../../src/tearbench/state-codecs";
import { CONFIG } from "../../src/config/game-config";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { stableVerificationHash } from "../../src/domain/hash";
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
    id: "player",
    x: 10,
    y: 20,
    vx: 2,
    vy: 0,
    hp: 100,
    maxHp: 100,
  });
  candidate.components.set("tear.blade.v1", {
    id: "blade",
    ownerId: "player",
    weaponId: "sword",
    x: 30,
    y: 20,
    vx: 0,
    vy: 0,
    state: "held",
  });
  candidate.components.set("tear.enemy.v1", [
    { id: "enemy-1", factoryId: "charger", ownerId: "enemy-1", targetId: "player", x: 400, y: 20, hp: 30 },
  ]);
  candidate.components.set("tear.projectile.v1", [
    {
      id: "projectile-1",
      factoryId: "projectile",
      ownerId: "enemy-1",
      targetId: "player",
      x: 300,
      y: 20,
      vx: -3,
      vy: 0,
    },
  ]);
  candidate.components.set("tear.run.v1", {
    mode: "endless",
    difficulty: "hard",
    wave: 4,
    tick: 60,
    elapsedTicks: 60,
    score: 1200,
  });
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

describe("presentation-only UI checkpoints", () => {
  it("retains tutorial help/demo exactly but keeps lesson progress semantic", () => {
    const ui = createLiveStateCodec("tear.ui.v1"),
      world = createLiveStateCodec("tear.world.v1"),
      a = populatedWorld(),
      b = populatedWorld();
    const display = {
      version: 1,
      ghostTime: 1,
      anchorX: 320,
      evidencePulse: false,
      coachIdle: 0,
      coachDemoTime: 4,
      helpVisible: true,
    };
    a.components.set("tear.ui.v1", { screen: "paused", focusId: "0", tutorialPresentation: display });
    b.components.set("tear.ui.v1", {
      screen: "paused",
      focusId: "0",
      tutorialPresentation: { ...display, ghostTime: 2 },
    });
    expect(ui.capture(a)).not.toEqual(ui.capture(b));
    expect(ui.hashProjection(a)).toEqual(ui.hashProjection(b));
    a.components.set("tear.world.v1", { runtime: { tutorialSession: { lessonId: "jump" } } });
    b.components.set("tear.world.v1", { runtime: { tutorialSession: { lessonId: "dash" } } });
    expect(world.hashProjection(a)).not.toEqual(world.hashProjection(b));
  });

  it("retains v2 entropy exactly without widening semantic RNG or hiding existing UI extensions", () => {
    const codec = createLiveStateCodec("tear.ui.v1"),
      a = populatedWorld(),
      b = populatedWorld(),
      entropy = createCosmeticEmissionRandom();
    const common = { screen: "playing", focusId: "-1", extension: 7 };
    const particles = {
      version: 2,
      list: [],
      view: null,
      replacementCursor: 0,
      policy: { effects: { highBudget: 0, lowBudget: 0, cullMargin: 0 }, lowGraphics: false, reducedMotion: false },
    };
    a.components.set("tear.ui.v1", { ...common, particlesPresentation: { ...particles, entropy: entropy.snapshot() } });
    entropy.next();
    b.components.set("tear.ui.v1", { ...common, particlesPresentation: { ...particles, entropy: entropy.snapshot() } });
    expect(codec.capture(a)).not.toEqual(codec.capture(b));
    expect(codec.hashProjection(a)).toEqual(common);
    expect(codec.hashProjection(b)).toEqual(common);
    expect(a.components.get("tear.rng.v1")).toEqual(b.components.get("tear.rng.v1"));
    b.components.set("tear.ui.v1", { ...common, extension: 8 });
    expect(codec.hashProjection(a)).not.toEqual(codec.hashProjection(b));
  });
  it("retains particles exactly while preserving HUD and every existing semantic extension", () => {
    const codec = createLiveStateCodec("tear.ui.v1"),
      a = populatedWorld(),
      b = populatedWorld();
    const legacy = {
      screen: "playing",
      focusId: "-1",
      extensionSentinel: { preserved: 42 },
      hudPresentation: { version: 1, clockSeconds: 3, lagHp: 1, multiplier: 1, multiplierPop: 0 },
    };
    const particles = {
      version: 1,
      list: [],
      view: null,
      replacementCursor: 9,
      policy: { effects: { highBudget: 0, lowBudget: 0, cullMargin: 180 }, lowGraphics: false, reducedMotion: false },
    };
    a.components.set("tear.ui.v1", legacy);
    b.components.set("tear.ui.v1", { ...legacy, particlesPresentation: particles });
    expect(codec.capture(b)).toEqual({ ...legacy, particlesPresentation: particles });
    expect(codec.hashProjection(b)).toEqual({ screen: "playing", focusId: "-1", extensionSentinel: { preserved: 42 } });
    expect(codec.hashProjection(b)).toEqual(codec.hashProjection(a));
    expect(codec.capture(b)).not.toEqual(codec.capture(a));
    b.components.set("tear.ui.v1", {
      ...legacy,
      extensionSentinel: { preserved: 43 },
      particlesPresentation: particles,
    });
    expect(codec.hashProjection(b)).not.toEqual(codec.hashProjection(a));
  });
  it("retains HUD exactly while preserving semantic projection and historical extension fields", () => {
    const codec = createLiveStateCodec("tear.ui.v1"),
      a = populatedWorld(),
      b = populatedWorld();
    const legacy = { screen: "playing", focusId: "-1", extensionSentinel: { preserved: 42 } };
    const hud = { version: 1, clockSeconds: 3.25, lagHp: 0.9, multiplier: 2, multiplierPop: 0.5 };
    a.components.set("tear.ui.v1", legacy);
    b.components.set("tear.ui.v1", { ...legacy, hudPresentation: hud });
    expect(codec.capture(b)).toEqual({ ...legacy, hudPresentation: hud });
    expect(codec.hashProjection(b)).toEqual(codec.hashProjection(a));
    expect(codec.hashProjection(a)).toEqual(legacy);
    expect(codec.migrate(legacy, 1)).toEqual(legacy);
    const aState = captureCodecState(a, createDefaultStateCodecRegistry());
    const bState = captureCodecState(b, createDefaultStateCodecRegistry());
    expect(bState.state).not.toEqual(aState.state);
    expect(stableVerificationHash(bState.state)).not.toBe(stableVerificationHash(aState.state));
    const semantic = (candidate: TearCodecWorld) =>
      Object.fromEntries(
        createDefaultStateCodecRegistry()
          .list()
          .map((entry) => [entry.id, entry.hashProjection(candidate)]),
      );
    expect(stableVerificationHash(semantic(b))).toBe(stableVerificationHash(semantic(a)));
  });
});

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
      exact: "sha256:11111111",
      semantic: "sha256:22222222",
      visual: "sha256:33333333",
      progression: "sha256:44444444",
      environment: "sha256:55555555",
    },
    provenance: {
      actor: "developer",
      producer: "tearbench-state-codecs.test",
      build: {
        version: "0.1.0",
        revision: "test",
        target: "unit",
        rulesetVersion: "test",
        contentHash: "sha256:aaaaaaaa",
        configHash: "sha256:bbbbbbbb",
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
    x: number;
    vx: number;
  };
  const run = structuredClone(candidate.components.get("tear.run.v1")) as {
    elapsedTicks: number;
    score: number;
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
  it("roundtrips a legitimate external capsule assistance binding without changing exact hashes", () => {
    const original = populatedWorld(),
      registry = createDefaultStateCodecRegistry();
    original.components.set("tear.run.v1", {
      ...(original.components.get("tear.run.v1") as Record<string, never>),
      ghostAssistance: assistanceBinding(),
    });
    const snapshot = snapshotFrom(original),
      originalState = JSON.stringify(snapshot.state);
    let restored = world();
    const result = restoreSnapshotTransactionally(snapshot, registry, factory, {
      replace(candidate) {
        restored = candidate;
      },
    });
    expect(result).toMatchObject({ ok: true, exactHash: stableVerificationHash(snapshot.state) });
    expect(captureCodecState(restored, registry).state).toEqual(snapshot.state);
    expect(restored.entityIds.has(assistanceBinding().sourceId)).toBe(false);
    expect([...restored.references.keys()].some((key) => key.endsWith("$.ghostAssistance.sourceId"))).toBe(false);
    expect(JSON.stringify(snapshot.state)).toBe(originalState);
  });

  it.each(["actor", "nested-run", "wrong-owner"])("still rejects a dangling sourceId at %s", (location) => {
    const original = populatedWorld(),
      id = assistanceBinding().sourceId;
    const run = original.components.get("tear.run.v1") as Record<string, never>;
    original.components.set("tear.run.v1", {
      ...run,
      ghostAssistance: assistanceBinding(),
      ...(location === "nested-run" ? { other: { sourceId: id } } : {}),
    });
    if (location === "actor")
      original.components.set("tear.projectile.v1", [
        { id: "projectile-1", factoryId: "projectile", x: 1, y: 2, sourceId: id },
      ]);
    if (location === "wrong-owner")
      original.components.set("tear.player.v1", {
        id: "player",
        x: 1,
        y: 2,
        hp: 100,
        maxHp: 100,
        ghostAssistance: assistanceBinding(),
      });
    const replace = vi.fn();
    const result = restoreSnapshotTransactionally(snapshotFrom(original), createDefaultStateCodecRegistry(), factory, {
      replace,
    });
    expect(result.ok).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    if (!result.ok) expect(result.issues.some((issue) => issue.message.includes(id))).toBe(true);
  });

  it.each([
    { sourceRoot: "not-a-root" },
    { sourceManifestHash: "bad" },
    { competitiveEligible: true },
    { coachEnabled: false },
    { extra: "unexpected" },
    { actor: ["human"] },
    { sourceId: "" },
  ])("rejects malformed assistance atomically: %j", (invalid) => {
    const original = populatedWorld(),
      destination = populatedWorld(),
      originalRefs = [destination.components, destination.references, destination.entityIds];
    const destinationBefore = structuredClone(destination),
      originalState = original.components.get("tear.run.v1") as Record<string, never>;
    // Use an existing actor identity so refusal must come from assistance validation.
    original.components.set("tear.run.v1", {
      ...originalState,
      ghostAssistance: { ...assistanceBinding(), sourceId: "player", ...invalid },
    });
    const replace = vi.fn();
    const result = restoreSnapshotTransactionally(snapshotFrom(original), createDefaultStateCodecRegistry(), factory, {
      replace,
    });
    expect(result.ok).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect([destination.components, destination.references, destination.entityIds]).toEqual(originalRefs);
    [destination.components, destination.references, destination.entityIds].forEach((ref, index) => {
      expect(ref).toBe(originalRefs[index]);
    });
    expect(destination).toEqual(destinationBefore);
    if (!result.ok) expect(result.issues.some((issue) => issue.path === "$.ghostAssistance")).toBe(true);
  });

  it.skipIf(!process.env.TEAR_ASSISTED_CAPSULE_PATH)(
    "accepts optional retained native assisted keyframes without rewriting the input",
    () => {
      const path = process.env.TEAR_ASSISTED_CAPSULE_PATH;
      if (!path) throw new Error("explicit optional input missing");
      const before = readFileSync(path),
        capsule = JSON.parse(before.toString("utf8").replace(/^\uFEFF/u, "")) as {
          tracks: { keyframes: { value: TearSnapshotV1 }[] };
        };
      expect(capsule.tracks.keyframes.length).toBeGreaterThan(0);
      for (const entry of capsule.tracks.keyframes)
        expect(
          preflightGhostRecordedCanonicalSnapshot(entry.value),
          `keyframe ${String(entry.value.tick)}`,
        ).toMatchObject({ ok: true, exactHash: entry.value.hashes.exact });
      expect(readFileSync(path).equals(before)).toBe(true);
    },
  );

  it.each(["tear.world.v1", "tear.run.v1"] as const)(
    "versions %s without inventing historical time or callback order",
    (id) => {
      const codec = createLiveStateCodec(id);
      expect(codec.version).toBe(2);
      const legacy = { clock: 42, mods: { onHit: [null] }, extension: { retained: true } };
      const migrated = codec.migrate(legacy, 1);
      expect(migrated).toEqual(legacy);
      expect(migrated).not.toBe(legacy);
      const current = { simulationSeconds: 0.173456789, mods: { onHit: [{ $upgradeHook: "rupture" }] } };
      expect(codec.migrate(codec.migrate(current, 2), 2)).toEqual(current);
      expect(() => codec.migrate(current, 3)).toThrow(/cannot migrate/);
    },
  );
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
      replace(candidate) {
        restored = candidate;
      },
    });

    expect(result.ok).toBe(true);
    expect(restored.components.get("tear.cinematic.v1")).toEqual(INACTIVE_CINEMATIC_DIRECTOR_STATE_V1);
  });

  it("rejects noncanonical inactive cinematic state during decode", () => {
    const snapshot = structuredClone(snapshotFrom(populatedWorld()));
    const hostile = {
      ...snapshot,
      state: {
        ...snapshot.state,
        "tear.cinematic.v1": {
          ...INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
          elapsedSeconds: 1,
          totalElapsedSeconds: 1,
        },
      },
    } as TearSnapshotV1;

    const result = restoreSnapshotTransactionally(hostile, createDefaultStateCodecRegistry(), factory, {
      replace() {
        throw new Error("invalid snapshot must not commit");
      },
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
      replace(candidate) {
        restored = candidate;
      },
    });
    expect(result.ok).toBe(true);
    expect(
      diffCodecWorlds(original, restored, registry).every((entry) => entry.exactEqual && entry.semanticEqual),
    ).toBe(true);

    for (let tick = 0; tick < 600; tick += 1) {
      const direction = tick % 17 < 8 ? 1 : -1;
      advance(original, direction);
      advance(restored, direction);
      expect(
        diffCodecWorlds(original, restored, registry).every((entry) => entry.exactEqual),
        `tick ${String(tick)}`,
      ).toBe(true);
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
      replace() {
        replacements += 1;
      },
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
      replace() {
        replacements += 1;
      },
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
    const result = restoreSnapshotTransactionally(hostile, registry, factory, {
      replace() {
        /* unreachable */
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((issue) => issue.message.includes("duplicate entity id enemy-1"))).toBe(true);
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
    const result = restoreSnapshotTransactionally(valid, registry, factory, {
      replace() {
        /* expected */
      },
    });
    expect(result.ok).toBe(true);
  });

  it("keeps every boss arena's broken platform ids as aliases while they wait to re-form", () => {
    const registry = createDefaultStateCodecRegistry();
    const snapshot = snapshotFrom(populatedWorld());
    for (const bossId of ["warden", "colossus", "aldric", "rootbound", "white-hart"]) {
      const arena = createBossArena(bossId, 1600, 900, CONFIG.world.groundY, 0.5) ?? [];
      const broken = arena.filter((platform) => platform.floor !== true).map((platform) => structuredClone(platform));
      expect(broken.length, bossId).toBeGreaterThan(0);
      const valid: TearSnapshotV1 = {
        ...structuredClone(snapshot),
        state: {
          ...snapshot.state,
          "tear.run.v1": { ...(snapshot.state["tear.run.v1"] as Record<string, unknown>), _arenaBroken: broken },
        },
      };
      const result = restoreSnapshotTransactionally(valid, registry, factory, {
        replace() {
          /* expected */
        },
      });
      expect(result.ok, `${bossId}: ${result.ok ? "" : JSON.stringify(result.issues)}`).toBe(true);
    }
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
    const capture = vi.fn(() => {
      throw new Error("no active world");
    });
    const commit = vi.fn();
    const result = restoreSnapshotIntoLiveWorld(
      snapshot,
      registry,
      factory,
      {
        capture,
        stage: (candidate) => candidate,
        validate: () => [],
        commit,
      },
      { capturePrevious: false },
    );

    expect(result.ok).toBe(true);
    expect(capture).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledOnce();
  });
});

function assistanceBinding() {
  return {
    format: "tear-ghost-chase",
    version: 1,
    sourceId: "ghost-v3-run-1d4s7zb-84ea8db9-1374-474f-848b-97d7345096a7",
    sourceManifestHash: "a".repeat(16),
    sourceRoot: "b".repeat(16),
    actor: "human",
    coachEnabled: true,
    ghostVisible: true,
    competitiveEligible: false,
  };
}
