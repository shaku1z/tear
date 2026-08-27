import { describe, expect, it } from "vitest";

import { GAMEPLAY_EVENT_KIND_IDS, TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { createTearSpawnFactPublisher, createTearTerminalRunFactPublisher, createTearWaveFactPublisher } from
  "../../src/gameplay/runtime/gameplay-event-publishers";
import { createGameplayCausalEvent, nativeCausalEventAvailability, projectGameplayEventForParity } from
  "../../src/tearbench/gameplay-causal-events";
import { validateTearContract } from "../../src/tearbench/validation";
import { publishEnvironmentEvent } from "../../src/gameplay/environment/environment-events";

const run = {
  kind: "run", tick: 7, transition: "completed", runId: "run-a", mode: "campaign", difficulty: "hard",
  weaponId: "hammer", wave: 4, score: 900, runTimeSeconds: 12.5, reason: "victory",
} as const;

describe("native gameplay causal-event adapter", () => {
  it("separates real native events from historical-only ontology claims", () => {
    expect(nativeCausalEventAvailability("enemy.spawned")).toBe("native");
    expect(nativeCausalEventAvailability("boss.intro-started")).toBe("native");
    expect(nativeCausalEventAvailability("agent.objective-changed")).toBe("compatibility-only");
    expect(nativeCausalEventAvailability("challenge.completed")).toBe("compatibility-only");
  });

  it("maps every native gameplay fact through one valid versioned ontology", () => {
    const facts: readonly TearGameplayEvent[] = [
      run,
      { kind: "stage", tick: 7, stage: 3 },
      { kind: "wave", tick: 7, wave: 4, event: "start" },
      { kind: "wave", tick: 7, wave: 4, event: "clear" },
      { kind: "wave", tick: 7, wave: 4, event: "spawn-completed" },
      { kind: "wave", tick: 7, wave: 4, event: "boss" },
      { kind: "spawn", tick: 7, actorId: "enemy:4", actorKind: "warden", x: 11.25, y: 22.5,
        variantName: "frenzied", bossId: "warden" },
      { kind: "death", tick: 7, actorId: "enemy:4", cause: "blade" },
      { kind: "loadout", tick: 7, choiceId: "dash", tier: 1, wave: 4 },
      { kind: "loadout", tick: 7, choiceId: "dash-plus", tier: 2, wave: 4 },
      { kind: "projectile", tick: 7, event: "spawned", projectileId: "projectile:8", x: 10, y: 20, vx: -300, vy: 0, owner: "enemy", sourceEnemyId: "enemy:4" },
      { kind: "projectile", tick: 7, event: "deflected", projectileId: "projectile:8", x: 11, y: 20, vx: 500, vy: 0, owner: "player", sourceEnemyId: "enemy:4", perfect: true },
      { kind: "projectile", tick: 7, event: "owner-changed", projectileId: "projectile:8", x: 11, y: 20, vx: 500, vy: 0, owner: "player", sourceEnemyId: "enemy:4", perfect: true },
      { kind: "projectile", tick: 7, event: "hit", projectileId: "projectile:8", x: 20, y: 20, vx: 500, vy: 0, owner: "player", sourceEnemyId: "enemy:4", targetEnemyId: "enemy:4", perfect: true },
      { kind: "projectile", tick: 7, event: "expired", projectileId: "projectile:8", x: 20, y: 20, vx: 500, vy: 0, owner: "player", sourceEnemyId: "enemy:4", perfect: true },
      { kind: "world", tick: 7, event: "void-rescue", x: 640, y: 420, lane: "lower", hp: 1 },
      { kind: "environment", tick: 7, event: "field-started", objectId: "field:1", category: "field", objectKind: "bloom-well" },
      { kind: "effect", tick: 7, effect: "perfect-parry", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "blade-throw", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "blade-recall", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "dash-start", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "stolenBlade", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "revive", x: 1, y: 2 },
      { kind: "effect", tick: 7, effect: "bossKill", x: 1, y: 2 },
      { kind: "weapon", tick: 7, event: "throw-launch", weaponId: "hammer", throwId: 2, x: 1, y: 2 },
    ];
    const expected = [
      "run.completed", "stage.entered", "wave.started", "wave.cleared", "wave.spawn-completed", "boss.intro-started",
      "enemy.spawned", "enemy.defeated", "draft.selected", "tier.selected", "projectile.spawned", "projectile.deflected", "projectile.owner-changed", "projectile.hit", "projectile.expired", "world.void-rescue", "world.environment-field-started", "combat.perfect-parry",
      "blade.thrown", "blade.recalled", "player.dash-started", "blade.stolen", "player.revived",
      "boss.defeated", "blade.thrown",
    ];

    expect([...new Set(facts.map((fact) => fact.kind))].sort()).toEqual([...GAMEPLAY_EVENT_KIND_IDS].sort());
    const events = facts.map((fact, index) => createGameplayCausalEvent(fact, index, `test:${String(index)}`));
    expect(events.map((event) => event.type)).toEqual(expected);
    expect(events.every((event) => validateTearContract(event).ok)).toBe(true);
    expect(events[6]).toMatchObject({ actorId: "enemy:4", payload: {
      actorKind: "warden", x: 11.25, y: 22.5, variantName: "frenzied", bossId: "warden",
    } });
    expect(events[15]).toMatchObject({ type: "world.void-rescue", phase: "post-simulation-commit",
      payload: { x: 640, y: 420, lane: "lower", hp: 1 } });
    expect(events[0]).toMatchObject({ phase: "post-simulation-commit", payload: {
      runId: "run-a", mode: "campaign", difficulty: "hard", weapon: "hammer", reason: "victory",
    } });
  });

  it("maps every run transition and assigns its semantic phase", () => {
    const transitions = [
      ["started", "run.started", "pre-simulation"],
      ["paused", "run.paused", "post-simulation-commit"],
      ["resumed", "run.resumed", "pre-simulation"],
      ["completed", "run.completed", "post-simulation-commit"],
      ["defeated", "run.defeated", "post-simulation-commit"],
      ["abandoned", "run.abandoned", "post-simulation-commit"],
    ] as const;
    expect(transitions.map(([transition], index) => {
      const event = createGameplayCausalEvent({ ...run, transition }, index, `run:${String(index)}`);
      return [event.type, event.phase];
    })).toEqual(transitions.map(([, type, phase]) => [type, phase]));
  });

  it("omits absent optional fields and freezes both event and payload", () => {
    const event = createGameplayCausalEvent({
      kind: "spawn", tick: 1, actorId: "enemy:1", actorKind: "charger", x: 1, y: 2,
    }, 0, "spawn:0");
    expect(event.payload).toEqual({ actorKind: "charger", x: 1, y: 2 });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it("preserves exact payload values and ordering fields", () => {
    const event = createGameplayCausalEvent(run, 41, "parity:41");
    expect(event).toEqual({
      format: "tear-contract", kind: "event", schemaVersion: 1, id: "parity:41", type: "run.completed",
      tick: 7, phase: "post-simulation-commit", sequence: 41, source: "engine",
      payload: { runId: "run-a", mode: "campaign", difficulty: "hard", weapon: "hammer",
        wave: 4, score: 900, runTimeSeconds: 12.5, reason: "victory" },
    });
  });

  it("projects native parity facts without losing exact payload values", () => {
    const causal = createGameplayCausalEvent(run, 41, "live:7:41");
    const projected = projectGameplayEventForParity(run, 0);
    expect(causal.payload.runId).toBe("run-a");
    expect(projected).toEqual({
      tick: 7, sequence: 0, type: "run.completed", phase: "post-simulation-commit",
      payload: { runId: "run-a", mode: "campaign", difficulty: "hard", weapon: "hammer",
        wave: 4, score: 900, runTimeSeconds: 12.5, reason: "victory" },
    });
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.payload)).toBe(true);
  });

  it("retains same-tick arrival order and exact stable actor identities", () => {
    const facts: readonly TearGameplayEvent[] = [
      { kind: "spawn", tick: 12, actorId: "enemy:7", actorKind: "charger", x: 1.25, y: 2.5 },
      { kind: "death", tick: 12, actorId: "enemy:7", cause: "blade" },
    ];
    expect(facts.map(projectGameplayEventForParity)).toEqual([
      { tick: 12, sequence: 0, type: "enemy.spawned", phase: "wave-draft-and-state-transitions",
        actorId: "enemy:7", payload: { actorKind: "charger", x: 1.25, y: 2.5 } },
      { tick: 12, sequence: 1, type: "enemy.defeated", phase: "deaths-and-rewards",
        actorId: "enemy:7", payload: { cause: "blade" } },
    ]);
  });

  it("rejects invalid ordering and identity instead of silently normalizing them", () => {
    expect(() => createGameplayCausalEvent(run, -1, "bad")).toThrow(/sequence/u);
    expect(() => createGameplayCausalEvent(run, 0, "")).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent(run, 0, " ")).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent(run, 0, "x".repeat(257))).toThrow(/ID/u);
    expect(() => createGameplayCausalEvent({ ...run, tick: -1 }, 0, "bad-tick")).toThrow(/tick/u);
    expect(() => createGameplayCausalEvent({ kind: "wave", tick: 1, wave: 1, event: "unknown" }, 0, "bad-wave"))
      .toThrow(/unrecognized native wave marker/u);
    expect(() => createGameplayCausalEvent({ kind: "effect", tick: 1, effect: "unclassified", x: 0, y: 0 }, 0, "bad-effect"))
      .toThrow(/unrecognized native gameplay effect/u);
    expect(() => createGameplayCausalEvent({ kind: "environment", tick: 1, event: "unclassified", objectId: "field:1", category: "field", objectKind: "bloom-well" } as never, 0, "bad-environment"))
      .toThrow(/unrecognized native environment/u);
  });

  it("publishes exact spawn and wave facts through one shared authoritative clock", () => {
    const facts: TearGameplayEvent[] = [];
    const bus = new TearGameplayEventBus(() => 19);
    bus.subscribe((event) => facts.push(event));
    const enemy = { x: 11.25, y: 22.5 };
    createTearSpawnFactPublisher(bus, () => "enemy:4")(enemy, "charger", { vn: "", b: "" });
    createTearWaveFactPublisher(bus)(3, "clear");
    expect(facts).toEqual([
      { kind: "spawn", tick: 19, actorId: "enemy:4", actorKind: "charger", x: 11.25, y: 22.5,
        variantName: "", bossId: "" },
      { kind: "wave", tick: 19, wave: 3, event: "clear" },
    ]);
  });

  it("publishes exact terminal run facts and no fact without an active session", () => {
    const facts: TearGameplayEvent[] = [];
    const bus = new TearGameplayEventBus(() => 903);
    bus.subscribe((event) => facts.push(event));
    let session: string | null = null;
    const publish = createTearTerminalRunFactPublisher(bus, () => session);
    const state = { mode: "endless", diff: "hard", weaponId: "sword", wave: 1, score: 0,
      runTime: 7.525, wavePeak: 1, waveTime: 2, waveKills: 0, waveLog: [], damagedThisRun: true } as const;
    publish("defeat", state);
    session = "run-1";
    publish("defeat", state);
    publish("victory", state);
    expect(facts.map((fact) => fact.kind === "run" ? fact.transition : fact.kind)).toEqual([
      "defeated", "completed",
    ]);
    expect(facts[0]).toEqual({ kind: "run", tick: 903, transition: "defeated", runId: "run-1",
      mode: "endless", difficulty: "hard", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 7.525 });
  });

  it("publishes environment transitions in stable arrival order and maps every family", () => {
    const facts: TearGameplayEvent[] = [];
    const bus = new TearGameplayEventBus(() => 12);
    bus.subscribe((event) => facts.push(event));
    publishEnvironmentEvent(bus, { event: "field-started", objectId: "field:1", category: "field", objectKind: "bloom-well" });
    publishEnvironmentEvent(bus, { event: "combat-object-link-created", objectId: "link:1", category: "combat-object", objectKind: "root-link" });
    publishEnvironmentEvent(bus, { event: "combat-object-damaged", objectId: "link:1", category: "combat-object", objectKind: "root-link", integrity: 2 });
    publishEnvironmentEvent(bus, { event: "combat-object-destroyed", objectId: "link:1", category: "combat-object", objectKind: "root-link", integrity: 0 });
    expect(facts.map((event) => projectGameplayEventForParity(event, facts.indexOf(event))).map((event) => [event.type, event.phase])).toEqual([
      ["world.environment-field-started", "projectiles-and-hazards"], ["world.environment-combat-object-link-created", "collision-and-damage"], ["world.environment-combat-object-damaged", "collision-and-damage"], ["world.environment-combat-object-destroyed", "deaths-and-rewards"],
    ]);
  });
});
