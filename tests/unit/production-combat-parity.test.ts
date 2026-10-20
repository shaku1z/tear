import type { GameAction } from "../../src/input/game-action";
import { describe, expect, it } from "vitest";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { CONFIG } from "../../src/config/game-config";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import type { BatonSegment } from "../../src/gameplay/combat/held-blade-collision-contracts";
import { createBossArena, type ArenaPlatform } from "../../src/gameplay/training/arena-rules";
import { captureProductionReplayCheckpoint, createProductionCombatSimulation,
  createProductionGhostReplayComposition, createProductionReplayWorld } from "../../src/tearbench";
import { createProductionCombatPhases } from "../../src/tearbench/production-combat-phases";
import { environmentHash, environmentSnapshotToObservation } from "../../src/tearbench";
import { RunDnaObserver } from "../../src/gameplay/runtime/run-dna-observer";
import { UPGRADES, applyUpgrade } from "../../src/gameplay/upgrades";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { projectGhostRunDnaTheater } from "../../src/ghost/run-dna-theater";

describe("production TearBench combat parity", () => {
  it("applies native Riftlock recoil after movement and preserves restored chamber state", () => {
    const composition = createProductionGhostReplayComposition({ seed: "riftlock-native-shot-phase", mode: "endless", weaponId: "riftlock" });
    const source = composition.create(undefined), player = source.replay.world.state.player(), blade = source.replay.world.state.blade();
    if (!player || !blade) throw new Error("missing Riftlock actors");
    const beforeX = player.x, sequence = new EnvelopeSequencer();
    source.simulation.advanceOne([
      sequence.command<GameAction>(1, { type: "move", x: 1000, y: 0 }),
      sequence.command<GameAction>(1, { type: "aim", turn: 0, magnitude: 1000 }),
      sequence.command<GameAction>(1, { type: "weapon", intent: "primary", phase: "pressed" }),
    ]);
    // A real shot recoils left, but cannot move the player backwards retroactively.
    expect(player.x).toBeGreaterThan(beforeX);
    expect(player.vx).toBeLessThan(0);
    expect(blade.riftChambers).toBe(source.replay.configuration.value.weapons.riftlock.chambers - 1);
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "riftlock-shot-restoration");
    const restored = createProductionGhostReplayComposition({ seed: checkpoint.snapshot.seed,
      inputSnapshots: new Map([[checkpoint.snapshot.tick, checkpoint.input]]) }).create(checkpoint.snapshot);
    const restoredBlade = restored.replay.world.state.blade();
    if (!restoredBlade) throw new Error("missing restored Riftlock");
    const next = [sequence.command<GameAction>(2, { type: "weapon", intent: "primary", phase: "released" })];
    source.simulation.advanceOne(next); restored.simulation.advanceOne(next);
    expect(restoredBlade.riftChambers).toBe(blade.riftChambers);
    expect(restoredBlade.riftFireCooldown).toBe(blade.riftFireCooldown);
    expect(restoredBlade.riftChamberCooldown).toBe(blade.riftChamberCooldown);
    expect(restored.semanticProjection()).toEqual(source.semanticProjection());
  });
  it("attributes real held contact on the catch tick to the returning throw", () => {
    const replay = createProductionReplayWorld({ seed: "dna-catch", mode: "endless", enemies: [{ id: "charger", x: 1400, y: CONFIG.world.groundY - 20 }] });
    const player = replay.world.state.player(), blade = replay.world.state.blade(), run = replay.world.state.run(), enemy = replay.world.state.enemies()[0];
    if (!player || !blade || !run || !enemy) throw new Error("missing production actors");
    const observer = new RunDnaObserver("catch-run", "catch-session"); observer.bind(player, blade, run);
    const core = createProductionCombatSimulation(replay, { snapshot: (tick) => ({ tick }) });
    const floor = core.opening.platforms.find((platform) => Reflect.get(platform, "floor") === true);
    if (!floor) throw new Error("missing authored production floor");
    player.y = floor.y - player.hh; player.onGround = true;
    const sequence = new EnvelopeSequencer();
    let catchContact = false, catching = false, returningHit = false, catchHpLost = 0;
    const nativeTrace: unknown[] = [];
    const hit = enemy.hit.bind(enemy);
    enemy.hit = (...args: Parameters<typeof hit>) => { const before = { hp: enemy.hp, hitCd: enemy.hitCd, state: blade.state, caught: blade.caughtNew }; const dealt = hit(...args); nativeTrace.push({ contact: before, after: { hp: enemy.hp, hitCd: enemy.hitCd }, dealt }); if (dealt > 0 && blade.state === "returning") returningHit = true; if (dealt > 0 && catching && blade.state === "held" && blade.throwId > 0) { catchContact = true; catchHpLost += Math.max(0, before.hp - enemy.hp); } return dealt; };
    for (let tick = 1; tick <= 30; tick++) {
      observer.beginTick(tick, player, run);
      const handBefore = blade.handPos(player);
      const before = { tick, state: blade.state, homeD: Math.hypot(blade.x - handBefore.x, blade.y - handBefore.y), retraceDone: Reflect.get(blade, "retraceDone"), origin: blade.throwOrigin, gate: Math.max(26, CONFIG.blade.throw.returnSpeed * blade.channel("returnSpeed") / 120), caught: blade.caughtNew, enemy: { hp: enemy.hp, hitCd: enemy.hitCd, dead: enemy.dead, spawn: enemy.spawnT }, segment: [blade.x, blade.y, blade.tipX, blade.tipY], speed: blade.tipSpeed };
      catching = false;
      if (blade.state === "returning" && !enemy.dead) {
        const hand = blade.handPos(player);
        if (Math.hypot(blade.x - hand.x, blade.y - hand.y) <= Math.max(26, CONFIG.blade.throw.returnSpeed * blade.channel("returnSpeed") / 120)) { catching = true; enemy.x = hand.x + Math.cos(blade.angle) * 45; enemy.y = hand.y + Math.sin(blade.angle) * 45; enemy.stun = 10; }
      }
      core.simulationRuntime.advanceOne(tick === 1 ? [sequence.command<GameAction>(tick, { type: "aim", turn: 0, magnitude: 1000 }), sequence.command<GameAction>(tick, { type: "weapon", intent: "throw", phase: "pressed" })]
        : tick === 5 ? [sequence.command<GameAction>(tick, { type: "weapon", intent: "recall", phase: "pressed" })] : []);
      observer.completeTick(tick, player);
      if (before.state === "returning" || blade.state === "held") nativeTrace.push({ before, after: { state: blade.state, caught: blade.caughtNew, tipSpeed: blade.tipSpeed, segment: [blade.x, blade.y, blade.tipX, blade.tipY], enemyHp: enemy.hp, enemyHitCd: enemy.hitCd } });
    }
    const result = observer.capture(30); observer.dispose();
    expect(catchContact, JSON.stringify(nativeTrace)).toBe(true);
    expect(returningHit).toBe(false); expect(catchHpLost).toBeGreaterThan(0);
    expect(result.capture.invalid).toEqual([]);
    expect(result.capture.successful).toBe(1);
  });
  it("records native attack outcomes, movement, HP and upgrade capabilities without changing production continuation", async () => {
    // Engineered combat placement, not a natural-run/pacing claim. Both worlds
    // execute identical real commands and native collision/damage owners.
    const runCase = (observed: boolean) => {
      const replay = createProductionReplayWorld({ seed: "native-dna", mode: "endless", weaponId: "sword", enemies: [
        { id: "charger", x: 1400, y: CONFIG.world.groundY - 20 },
        { id: "charger", x: 1400, y: CONFIG.world.groundY - 20 },
      ] });
      const player = replay.world.state.player(), blade = replay.world.state.blade(), run = replay.world.state.run();
      if (!player || !blade || !run) throw new Error("production world is missing its actors");
      const observer = new RunDnaObserver("native-run", "native-capsule");
      if (observed) observer.bind(player, blade, run);
      const core = createProductionCombatSimulation(replay, { snapshot: (tick) => ({ tick }) });
      const sequence = new EnvelopeSequencer();
      const initialHp = player.maxHp;
      let lost = 0, hits = 0;
      const trace: unknown[] = [];
      const actorState = (enemy: ReturnType<typeof replay.world.state.enemies>[number]) => ({ hp: enemy.hp, dead: enemy.dead, dying: enemy.dying, spawn: enemy.spawnT, hitCd: enemy.hitCd });
      for (const enemy of replay.world.state.enemies()) {
        const hit = enemy.hit.bind(enemy);
        enemy.hit = (...args: Parameters<typeof hit>) => { const before = actorState(enemy); const dealt = hit(...args); if (observed) trace.push({ contact: { before, after: actorState(enemy), dealt } }); return dealt; };
      }
      for (let index = 1; index <= 420; index++) {
        const tick = core.simulationRuntime.scheduler.tick + 1;
        observer.beginTick(tick, player, run);
        if (index === 60) {
          player.iframe = 0; player.cinematicGraceT = 0; const before = player.hp;
          player.takeDamage(20, player.x - 100); lost += before - player.hp; player.heal(8);
          for (const id of ["vitality", "air_dash", "phase_step"]) {
            const upgrade = UPGRADES.find((value) => value.id === id);
            if (!upgrade) throw new Error("missing authored upgrade");
            applyUpgrade(upgrade, { config: replay.configuration.value, player, blade, mods: run.mods });
          }
        }
        // A later accepted throw crosses two genuine enemy hitboxes. The first
        // throw is away from both enemies and completes without contact.
        if (index === 260) for (const enemy of replay.world.state.enemies()) {
          enemy.x = player.x + 90; enemy.y = player.y; enemy.stun = 10; enemy.hitCd = 0;
        }
        const actions = index === 1 || index === 260 ? [sequence.command<GameAction>(tick, { type: "aim", turn: index === 1 ? 500000 : 0, magnitude: 1000 }),
          sequence.command<GameAction>(tick, { type: "weapon", intent: "throw", phase: "pressed" })] : index === 2 || index === 3 ? [sequence.command<GameAction>(tick, { type: "weapon", intent: "throw", phase: "pressed" })]
          : index === 270 ? [sequence.command<GameAction>(tick, { type: "weapon", intent: "recall", phase: "pressed" })] : index === 20 ? [sequence.command<GameAction>(tick, { type: "move", x: 1000, y: 0 })]
            : index === 40 ? [sequence.command<GameAction>(tick, { type: "move", x: 0, y: 0 })] : [];
        const beforeState = blade.state;
        core.simulationRuntime.advanceOne(actions);
        if (observed && (beforeState !== blade.state || index === 270 || index === 420)) trace.push({ index, throwId: blade.throwId, beforeState, state: blade.state, caught: blade.caughtNew, distance: Math.hypot(blade.x - player.x, blade.y - player.y) });
        observer.completeTick(tick, player);
        hits = run.weaponStats.throwHits;
        if (index === 100) {
          // Real scheduler skips: no actions or combat commit during a paused tail.
          core.simulationRuntime.advance(25, () => [], { shouldStep: () => false });
          observer.frameEnded(core.simulationRuntime.scheduler.tick);
        }
      }
      const capture = observer.capture(core.simulationRuntime.scheduler.tick);
      observer.dispose();
      return { capture, lost, hits, initialHp, trace, state: { player: [player.x, player.y, player.hp, player.maxHp], blade: [blade.x, blade.y, blade.state],
        run: [run.weaponStats.throws, run.weaponStats.throwHits, run.score], rng: replay.world.context.services.random.snapshot() } };
    };
    const measured = runCase(true), ordinary = runCase(false);
    expect(measured.state).toEqual(ordinary.state);
    expect(measured.capture.metrics.attacks).toBeGreaterThanOrEqual(2);
    expect(measured.capture.metrics.misses).toBeGreaterThanOrEqual(1);
    expect(measured.hits).toBeGreaterThanOrEqual(2);
    expect(measured.capture.capture.successful, JSON.stringify({ trace: measured.trace, capture: measured.capture })).toBeGreaterThanOrEqual(1);
    expect(measured.capture.metrics.damageTaken).toBeGreaterThanOrEqual(measured.lost);
    expect(measured.capture.metrics.maxHp).toBe(measured.initialHp + 30);
    expect(measured.capture.metrics.movingTicks).toBeGreaterThan(0);
    expect(measured.capture.capture.available).toEqual(expect.arrayContaining(["air-dash", "phase-step"]));
    expect(measured.capture.capture.skippedTicks).toBeGreaterThan(0);
    expect(measured.capture.capture.complete).toBe(true);
    const context = createGhostReplayRunContext({ runId: "native-run", seed: "native-dna", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
      build: { version: "test", revision: "test", target: "test-standalone", rulesetVersion: "test", configHash: "test", contentHash: "test" }, rng: { gameplay: { state: 1 } } });
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostLiveRecorder({ createVault: () => Promise.resolve(vault), now: () => "2026-10-20T00:00:00Z" });
    recorder.start({ sessionId: "native-capsule", createdAt: "2026-10-20T00:00:00Z", provenance: { replayContext: context } });
    for (const [tick, transition] of [[0, "started"], [measured.capture.capture.terminalTick, "abandoned"]] as const) recorder.record("events", tick,
      createLiveGhostCausalEvent({ kind: "run", tick, transition, runId: "native-run", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: tick / 120 }, tick + 1));
    recorder.record("results", measured.capture.capture.endTick, measured.capture);
    expect(await recorder.finish({ abandoned: "engineered unit boundary" })).not.toBeNull();
    const capsule = await new GhostCapsuleReader(vault).read("native-capsule");
    const projection = projectGhostRunDnaTheater(capsule);
    expect(projection.nativePolicy).toBe("native-combat-episodes-v1");
    expect(projection.sourceMetrics).toEqual(measured.capture.metrics);
    expect(projection.dimensions?.defense).toBeDefined();
  });
  it("proves non-empty environment parity through supported detached production composition", () => {
    const create = (seed: string) => {
      const replay = createProductionReplayWorld({ seed });
      const events: TearGameplayEvent[] = [];
      const gameplayEvents = new TearGameplayEventBus(() => 0);
      gameplayEvents.subscribe((event) => { events.push(event); });
      const core = createProductionCombatSimulation<{ tick: number }>(replay, { gameplayEvents, snapshot: (tick) => ({ tick }) });
      const environment = replay.world.context.environment;
      environment.setStage("grounds", "restore");
      environment.addField({ id: "parity-field", kind: "bloom-well", geometry: { x: 10, y: 20, radius: 5 }, state: "scheduled", stateTick: 0, timer: 0, ownerId: null, schedule: { startTick: 1, endTick: 3 }, eligibility: { player: true, enemies: false, bosses: false }, force: null, cleanupReason: null });
      environment.addCombatObject({ id: "parity-object", kind: "root-link", ownerId: null, targetId: "player", geometry: { x: 10, y: 20, w: 8, h: 8 }, integrity: 2, maxIntegrity: 2, counterplayTags: ["cut", "break"], procEligible: false, damageDedupeId: "parity-object-hit", state: "active", stateTick: 0, cleanupReason: null });
      environment.addRoute({ id: "orphan-route", kind: "regrowth-link", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], state: "active", stateTick: 0, ownerId: "missing", cleanupReason: null });
      core.simulationRuntime.reset(0);
      environment.damageCombatObject("parity-object", 2, "parity-attack", 1);
      for (let tick = 0; tick < 3; tick += 1) core.simulationRuntime.advanceOne([]);
      return { environment, events };
    };
    const first = create("production-environment-parity");
    const second = create("production-environment-parity");
    expect(environmentHash(first.environment.snapshot())).toBe(environmentHash(second.environment.snapshot()));
    expect(environmentSnapshotToObservation(first.environment.snapshot())).toEqual(environmentSnapshotToObservation(second.environment.snapshot()));
    expect(first.environment.snapshot().fields[0]?.state).toBe("expired");
    expect(first.environment.snapshot().combatObjects[0]?.state).toBe("destroyed");
    expect(first.environment.snapshot().routes[0]?.state).toBe("expired");
    expect(first.events.map((event) => event.kind === "environment" ? event.event : event.kind)).toEqual([
      "combat-object-damaged", "combat-object-destroyed", "field-started", "object-cleaned", "field-resolved",
    ]);
    expect(first.events).toEqual(second.events);
  });
  it("uses a real boss weapon capsule and source-owned area damage", () => {
    const replay = createProductionReplayWorld({ seed: "parity-sword", weaponId: "sword", enemies: [
      { id: "warden", x: 520, y: CONFIG.world.groundY - 60 },
      { id: "charger", x: CONFIG.view.w / 2, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const warden = replay.world.state.enemies()[0] as never as { batonSegment(): BatonSegment };
    const capsule = warden.batonSegment();
    expect(phases.collision.weaponSegmentContact(capsule, capsule.a.x, capsule.a.y, capsule.b.x, capsule.b.y)).toBe(true);
    const player = replay.world.state.player() as never as { x: number; y: number };
    const enemy = replay.world.state.enemies()[1] as never as { hp: number };
    const before = enemy.hp;
    phases.opening.areaDamage(player.x, player.y, 120, 30);
    expect(enemy.hp).toBeLessThan(before);
  });

  it("propagates authoritative primary input into the real Riftlock event drain", () => {
    const sequence = new EnvelopeSequencer();
    const replay = createProductionReplayWorld({ seed: "parity-riftlock", weaponId: "riftlock" });
    const core = createProductionCombatSimulation<Record<string, unknown>>(replay, { snapshot: (tick) => ({ tick }) });
    core.simulationRuntime.reset(0);
    core.simulationRuntime.advanceOne([
      sequence.command(1, { type: "aim", turn: 0, magnitude: 1 } as const),
      sequence.command(1, { type: "weapon", intent: "primary", phase: "pressed" } as const),
    ]);
    const projectiles = replay.world.state.projectiles() as never as { family?: string; weaponId?: string }[];
    expect(projectiles.some((projectile) => projectile.family === "weaponProjectile" && projectile.weaponId === "riftlock")).toBe(true);
  });

  it.each(WEAPON_IDS)("updates the source-owned %s weapon ability runtime", (weaponId) => {
    const replay = createProductionReplayWorld({ seed: `parity-ability-${weaponId}`, weaponId });
    const phases = createProductionCombatPhases(replay);
    expect(() => { phases.opening.updateWeaponAbilities(1 / 60); }).not.toThrow();
  });

  it("applies support aura, world slow, and boss-zone damage through shared resolvers", () => {
    const replay = createProductionReplayWorld({ seed: "parity-support", enemies: [
      { id: "priest", x: 400, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "charger", x: 440, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
      { id: "warden", x: 760, y: CONFIG.world.groundY - 60 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const ally = replay.world.state.enemies()[1] as never as { auraDmg?: number };
    phases.opening.updateSupports(1 / 60);
    expect(ally.auraDmg).toBeGreaterThan(1);
    const player = replay.world.state.player() as never as { x: number; y: number; slowMult: number; hazardT: number; shield: number };
    replay.world.state.setSlowZones([{ id: "zone:test", x: player.x, y: player.y, r: 200, life: 1 } as never]);
    phases.opening.updateWorldHazards(1 / 60);
    expect(player.slowMult).toBeLessThan(1);
    const warden = replay.world.state.enemies()[2] as never as { x: number; zones: unknown[] };
    warden.zones = [{ x: player.x, w: 200, fullHeight: true, on: true, dmg: 9, tickCd: 0 }];
    player.shield = 0;
    const beforeHp = (player as never as { hp: number }).hp;
    phases.opening.resolveBossZones();
    expect((player as never as { hp: number }).hp).toBeLessThan(beforeHp);
    expect(player.hazardT).toBeGreaterThan(0);
  });

  it("binds the source-owned Hammer Meteor effect to detached world state", () => {
    const replay = createProductionReplayWorld({ seed: "parity-meteor", weaponId: "hammer", enemies: [
      { id: "charger", x: 410, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 },
    ] });
    const phases = createProductionCombatPhases(replay);
    const blade = replay.world.state.blade() as never as { vx: number; vy: number; throwDmg: number };
    blade.vx = 1200; blade.vy = 900; blade.throwDmg = 80;
    const enemy = replay.world.state.enemies()[0] as never as { hp: number; stun: number };
    const beforeHp = enemy.hp;
    phases.collision.lobExplode(410, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    expect(enemy.hp).toBeLessThan(beforeHp);
    expect(enemy.stun).toBeGreaterThan(0);
  });

  it("advances authored boss-arena fracture and supports real boss adds/clones", () => {
    const replay = createProductionReplayWorld({ seed: "parity-boss-arena", enemies: [
      { id: "warden", x: 800, y: CONFIG.world.groundY - 60 },
    ] });
    const authored = createBossArena("warden", CONFIG.view.w, CONFIG.view.h,
      CONFIG.world.groundY, CONFIG.bossArena.reformWarn);
    if (authored === null) throw new Error("the current Warden arena is unavailable");
    const platforms = authored.map((platform) => ({ ...platform }));
    replay.stage.platforms = platforms;
    const platform = platforms.find((candidate) => candidate.arenaPlatId && !candidate.floor);
    if (platform === undefined) throw new Error("the current Warden arena has no elevated platform");
    platform.arenaFractureRequest = { reason: "current-game-parity", color: CONFIG.colors.boss };
    const phases = createProductionCombatPhases(replay);
    phases.opening.updateBossArenaPlatforms(1 / 60);
    expect(platform.arenaState).toBe("warning");
    phases.opening.updateBossArenaPlatforms(CONFIG.bossArena.crackWarn + 0.01);
    expect(platform.arenaState).toBe("broken");
    expect(replay.stage.platforms).not.toContain(platform);
    expect((replay.run as { _arenaBroken?: ArenaPlatform[] })._arenaBroken).toContain(platform);

    const boss = replay.world.state.enemies()[0];
    if (boss === undefined) throw new Error("the current Warden encounter is unavailable");
    expect(phases.opening.spawnBossAdds(boss)).toHaveLength(2);
    const beforeClone = replay.world.state.enemies().length;
    phases.opening.spawnBossClone(boss);
    expect(replay.world.state.enemies()).toHaveLength(beforeClone + 1);
  });

  it("publishes distinct source-owned spawn facts for each real boss add and clone", () => {
    const replay = createProductionReplayWorld({ seed: "parity-boss-support-events", enemies: [
      { id: "warden", x: 800, y: CONFIG.world.groundY - 60 },
    ] });
    const events: TearGameplayEvent[] = [];
    const gameplayEvents = new TearGameplayEventBus(() => 12);
    gameplayEvents.subscribe((event) => { events.push(event); });
    const core = createProductionCombatSimulation(replay, { gameplayEvents, snapshot: (tick) => ({ tick }) });
    const boss = replay.world.state.enemies()[0];
    if (boss === undefined) throw new Error("the source-owned Warden encounter is unavailable");
    const adds = core.opening.spawnBossAdds(boss);
    core.opening.spawnBossClone(boss);
    const clone = replay.world.state.enemies().at(-1);
    if (clone === undefined) throw new Error("the source-owned boss clone was not created");

    expect(events).toHaveLength(3);
    expect(events.map((event) => event.kind === "spawn" ? event.actorKind : event.kind))
      .toEqual(["charger", "charger", "reflection"]);
    const ids = events.map((event) => {
      if (event.kind !== "spawn") throw new Error("boss support emitted an unexpected gameplay event");
      expect(event.bossId).toBe("warden");
      expect(event.tick).toBe(12);
      return event.actorId;
    });
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...adds, clone].map((enemy) => core.combatEntityRuntime.id(enemy as object, "enemy")));
  });

  // Source descent, restored stream continuity and malformed bindings are covered by ghost-finale-companion.test.ts.

});
