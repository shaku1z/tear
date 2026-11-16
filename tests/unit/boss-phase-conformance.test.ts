import { GRAFT_ANCHOR_TYPES } from "../../src/gameplay/environment/graft-anchor";
import {
  createBossPhasePracticeRuntime,
  validateBossPhasePracticeState,
  type BossPhasePracticeActor,
  type BossPhasePracticeRequest,
  type BossPhasePracticeWorld,
} from "../../src/gameplay/training/boss-phase-practice-runtime";
import { beginBossEncounter, cleanupBossEncounterActors } from "../../src/gameplay/run/boss-encounter";
import {
  BossArenaRules,
  SourceVoidController,
  createBossArena,
  type ArenaPlatform,
  type SourceVoidState,
} from "../../src/gameplay/training/arena-rules";
import {
  BossRitualController,
  type BossRitualActor,
  type BossRitualCue,
} from "../../src/gameplay/entities/boss-ritual-controller";
import { createLiveCinematicRuntime } from "../../src/gameplay/campaign/live-cinematic-runtime";
import { createSourceVoidRuntimeBridge } from "../../src/gameplay/campaign/source-void-runtime";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { stepBossRuntime } from "../../src/gameplay/combat/boss-step-runtime";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { clamp, lerp } from "../../src/domain/geometry";
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { ArenaZone, EnemyPlatform, EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { BOSS_ROSTER, pickMiniBoss } from "../../src/gameplay/run/content-director";
import { bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { STAGES } from "../../src/gameplay/stages";
import { createEnemyHarness, type BehaviorActor } from "./enemy-test-harness";
import { createMirrorTestHarness } from "./mirror-test-harness";

type BossActor = BehaviorActor &
  BossPhasePracticeActor &
  BossRitualActor & {
    introT: number;
    bossId: string;
    bossName: string;
    presentationId: string;
    phase: number;
    phaseMarker: number;
    phaseTag: string;
    mode: string;
    state: string;
    cinematicRequest: unknown;
    zones: ArenaZone[];
    searchlights: ArenaZone[];
    cages: ArenaZone[];
    trails: ArenaZone[];
    fireZones: ArenaZone[];
    seams: ArenaZone[];
    shielded: boolean;
    spawnClone: boolean;
    freezeVoid: boolean;
    thawVoid: boolean;
    requestVoidCinematic: boolean;
    collapsing: boolean;
    siphon: unknown;
  };

type FactoryBossId = (typeof BOSS_ROSTER)[number]["id"];

function createBoss(id: FactoryBossId): ReturnType<typeof createEnemyHarness> & { boss: BossActor } {
  const harness = createEnemyHarness([0.25, 0.75, 0.4]);
  const constructors = {
    warden: harness.types.Warden,
    colossus: harness.types.Colossus,
    aldric: harness.types.Aldric,
    rootbound: harness.types.Rootbound,
    "white-hart": harness.types.WhiteHart,
    echo: harness.types.Echo,
    source: harness.types.Source,
  } as const;
  const Boss = constructors[id];
  const boss = new Boss(CONFIG.view.w / 2, CONFIG.world.groundY - 180) as unknown as BossActor;
  return { ...harness, boss };
}

function updateBoss(
  boss: BossActor,
  platforms: EnemyPlatform[],
  player: ReturnType<typeof createEnemyHarness>["player"],
  projectiles: EnemyProjectile[],
  dt = 1 / 60,
): void {
  boss.update(dt, platforms, player, projectiles);
}

describe("boss phase conformance", () => {
  it("constructs every canonical boss and keeps the campaign Pantheon ordered before the Source", () => {
    for (const entry of BOSS_ROSTER) {
      if (entry.id === "echo") {
        const { host } = createMirrorTestHarness();
        expect(host.isBoss).toBe(true);
        expect(host.bossName).toBe("THE ECHO");
        continue;
      }
      const { boss } = createBoss(entry.id);
      expect(boss.isBoss, entry.id).toBe(true);
      expect(boss.presentationId, entry.id).toBe(entry.id);
    }
    const campaignOrder = STAGES.map((stage) => stage.boss);
    expect(campaignOrder).toEqual(["warden", "colossus", "aldric", "rootbound", "echo", "source"]);
    expect(campaignOrder.filter((id) => BOSS_ROSTER.some((boss) => boss.id === id))).toEqual(
      BOSS_ROSTER.map((boss) => boss.id),
    );
    expect(campaignOrder.at(-1)).toBe("source");
    for (const draw of [0, 0.249, 0.5, 0.999]) expect(pickMiniBoss({ next: () => draw })).not.toBe("source");
  });

  it("preserves Warden thresholds, lockdown zones, final-phase cleanup and arena fracture", () => {
    const { boss, platforms, player } = createBoss("warden");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * 0.65;
    expect(boss.phase).toBe(2);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.phaseMarker).toBe(2);
    expect(boss.searchlights).toHaveLength(CONFIG.warden.zoneCount);
    expect(boss.cages).toHaveLength(2);
    expect(boss.zones.every((zone) => zone.on)).toBe(true);

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * 0.3;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 3, phaseTag: "NOTHING LEFT", state: "fakedeath" });
    expect(boss.zones).toEqual([]);
    expect(platforms.some((platform) => platform.arenaFractureRequest?.reason === "wardenPhase")).toBe(true);
  });

  it("preserves Colossus breach and deterministic meltdown-panel mutations", () => {
    const { boss, platforms, player } = createBoss("colossus");
    const projectiles: EnemyProjectile[] = [];
    boss.hp = boss.maxHp * 0.6;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phase: 2, phaseMarker: 2, shielded: false, phaseTag: "BREACHED" });

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * 0.25;
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.phaseMarker).toBe(3);
    expect(boss.zones).toHaveLength(CONFIG.colossus.panelCount);
    expect(boss.zones.filter((zone) => zone.arming)).toHaveLength(1);
    boss.cinematicRequest = null;
    updateBoss(boss, platforms, player, projectiles, CONFIG.colossus.panelStep + 0.01);
    expect(boss.zones.filter((zone) => zone.on)).toHaveLength(1);
    expect(boss.zones.filter((zone) => zone.arming)).toHaveLength(1);
  });

  it("preserves Aldric fire, kneel cleanup and witnessed/angered continuation boundary", () => {
    const { boss, platforms, player } = createBoss("aldric");
    const projectiles: EnemyProjectile[] = [];
    const [fireTier, fakeTier] = bossPhaseMarks("aldric");
    boss.hp = boss.maxHp * (fireTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss.mode).toBe("fire");
    expect(boss.fireZones.length).toBeGreaterThan(0);

    boss.hp = boss.maxHp * (fakeTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ mode: "downed", phaseTag: "THE KNEEL" });
    expect(boss.zones).toEqual([]);
    boss.hit(100_000, 1, 0);
    expect(boss.hp).toBe(1);

    const revive = boss as BossActor & { revive(witnessed: boolean): void; witnessEarned: boolean; anger: boolean };
    revive.revive(false);
    expect(revive).toMatchObject({ mode: "frenzy", witnessEarned: false, anger: true });
  });

  it("preserves the live MirrorHost Echo split, final reflection and clone cleanup", () => {
    const { Mirror, ReflectionEnemy, host } = createMirrorTestHarness();
    expect(Mirror.phase).toBe(1);
    host.hp = host.maxHp * 0.6;
    Mirror._updatePhase();
    expect(Mirror).toMatchObject({ phase: 2, _phaseMark: 2, sync: 0.55, color: "#c94bff" });
    expect(host.spawnClone).toBe(true);
    expect(Mirror.blade.lengthBonus).toBe(65);

    const clone = new ReflectionEnemy(1200, 300);
    host.hp = host.maxHp * 0.25;
    Mirror._updatePhase();
    expect(Mirror).toMatchObject({ phase: 3, _phaseMark: 3, sync: 0.75, color: "#e6d3ff" });
    expect(Mirror.blade.lengthBonus).toBe(100);
    clone.update(1 / 60, [], Mirror.actor, []);
    expect(clone.dead).toBe(true);
  });

  it("drives THE MIRROR through the real player integrator at the live 120 Hz cadence", () => {
    const { Mirror, host, platforms, mirrorPlayer } = createMirrorTestHarness([0.2, 0.7, 0.4]);
    const projectiles: EnemyProjectile[] = [];
    const startX = host.x;

    for (let tick = 0; tick < 360; tick += 1) {
      host.update(1 / 120, platforms, mirrorPlayer, projectiles);
    }

    expect(Math.abs(host.x - startX)).toBeGreaterThan(40);
    expect(host.x).toBe(Mirror.actor.x);
    expect(Number.isFinite(host.x) && Number.isFinite(host.y)).toBe(true);
    expect(["approach", "space", "strike", "bait", "punish", "dodge", "echo", "throw"]).toContain(Mirror._state);
  });

  it("preserves Source collapse, frozen kneel, true-form thaw and death cleanup", () => {
    const { boss, platforms, player } = createBoss("source");
    const projectiles: EnemyProjectile[] = [];
    const [voidTier, fakeTier] = bossPhaseMarks("source");
    boss.hp = boss.maxHp * (voidTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 2, mode: "collapse", collapsing: true, requestVoidCinematic: true });

    boss.cinematicRequest = null;
    boss.hp = boss.maxHp * (fakeTier - 0.01);
    updateBoss(boss, platforms, player, projectiles);
    expect(boss).toMatchObject({ phaseMarker: 3, mode: "downed", freezeVoid: true });
    boss.hit(100_000, 1, 0);
    expect(boss.hp).toBe(1);
    const source = boss as BossActor & { revive(): void };
    source.revive();
    expect(source).toMatchObject({ mode: "void", thawVoid: true, phaseTag: "TRUE FORM" });
    source.siphon = { amount: 10 };
    source.hit(100_000, 1, 0);
    expect(source).toMatchObject({ dying: true, freezeVoid: true, siphon: null });
  });

  it("finishes each boss death theater and makes actor-owned hazards collectible", () => {
    for (const entry of BOSS_ROSTER) {
      if (entry.id === "echo") {
        const { host } = createMirrorTestHarness();
        host.hit(100_000, 1, 0);
        expect(host.dying).toBe(true);
        continue;
      }
      const { boss } = createBoss(entry.id);
      boss.phaseMarker = 3;
      boss.mode = entry.id === "source" ? "void" : "frenzy";
      boss.state = "idle";
      boss.hit(100_000, 1, 0);
      expect(boss.dying, entry.id).toBe(true);
      expect(boss.updateDeath(boss.deathDur + 0.01), entry.id).toBe(true);
      expect(boss.dead, entry.id).toBe(true);
      expect(
        [boss].filter((actor) => !actor.dead),
        `${entry.id} cleanup`,
      ).toEqual([]);
    }
  });
});

/** A fixed-step owner fixture: actual boss factories, encounter/arena, ritual timeline,
 * cinematic player transfer, Source stream, Verdant environment and clone owner. */
function practiceWorld() {
  const base = createEnemyHarness();
  let mirror = createMirrorTestHarness();
  let boss: BossActor;
  let player = mirror.mirrorPlayer;
  let platforms: ArenaPlatform[] = [];
  let projectiles: EnemyProjectile[] = [];
  let clones: InstanceType<typeof mirror.ReflectionEnemy>[] = [];
  let stream: SourceVoidState | null = null;
  let tick = 0;
  let created = 0;
  let binding: Pick<BossPhasePracticeWorld, "encounterId" | "generation" | "seed" | "bossId">;
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "phase-practice-control" });
  bindLiveRootboundActors(
    environment,
    () => player,
    () => [boss],
    () => "practice:boss",
    CONFIG,
  );
  const director = new CinematicTimeline.Director(CONFIG);
  const cinema = {
    get active() {
      return director.active;
    },
    get playerMode() {
      return director.playerMode;
    },
    start: (script: Parameters<typeof director.start>[0]) => director.start(script, {}),
  };
  const no = () => undefined;
  const sourceController = new SourceVoidController(
    {
      ...CONFIG.source,
      voidWispCooldown: CONFIG.source.voidWispCd,
      arrivalFxStep: CONFIG.effects.voidArrivalFxStep,
      voidFallDamage: CONFIG.source.voidFallDmg,
      voidSlowDuration: CONFIG.source.voidSlowDur,
    },
    { width: CONFIG.view.w, height: CONFIG.view.h, groundY: CONFIG.world.groundY },
    {
      jumpSpeed: CONFIG.player.jumpSpeed,
      gravity: CONFIG.world.gravity,
      moveSpeed: CONFIG.player.moveSpeed,
      dashSpeed: CONFIG.dash.speed,
      dashDuration: CONFIG.dash.duration,
    },
    {
      dialogueDuck: CONFIG.presentation.dialogueDuck,
      unmakeMix: CONFIG.presentation.voidUnmakeMix,
      releaseMix: CONFIG.presentation.voidReleaseMix,
      revealMix: CONFIG.presentation.voidRevealMix,
    },
  );
  const sourceRuntime = createSourceVoidRuntimeBridge({
    controller: sourceController,
    get player() {
      return player;
    },
    get platforms() {
      return platforms;
    },
    get projectiles() {
      return projectiles;
    },
    perfectColor: CONFIG.colors.perfect,
    get runTime() {
      return tick / 120;
    },
    get state() {
      return stream;
    },
    replaceProjectiles(value) {
      projectiles = value;
    },
    replacePlatforms(value) {
      platforms = value;
    },
    clearDescent: no,
    clearBossBeat: no,
    setWorldZoom: no,
    spawnWisp: no,
    liveWispCount: () => 0,
    flash: no,
    shake: no,
    explode: no,
    burst: no,
    ring: no,
    shockwave: no,
    musicDuck: no,
    voidMix: no,
    sound: no,
    voidTransfer: no,
    onDamageResult: no,
    floater: no,
  });
  const cinematic = createLiveCinematicRuntime({
    cinema,
    sourceController,
    ritualController: new BossRitualController(),
    sourceRuntime,
    player: () => player,
    blade: () => null,
    platforms: () => platforms,
    ritualPlatforms: () => platforms,
    replacePlatforms(value) {
      platforms = value;
    },
    projectiles: () => projectiles,
    replaceProjectiles(value) {
      projectiles = value as EnemyProjectile[];
    },
    sourceSeed: () => binding.seed,
    setDescent: no,
    setStream(value) {
      stream = value;
    },
    hasVoidScroll: () => stream !== null,
    story: { finale: null, lastCinemaPlayerMode: null, markFinaleLanded: no, syncFinale: no },
    policy: () => ({ play: true, brief: true }),
    reducedMotion: () => false,
    gravity: () => CONFIG.world.gravity,
    maxFall: () => 1600,
    descentLiftVelocity: () => -120,
    viewportWidth: CONFIG.view.w,
    groundY: () => CONFIG.world.groundY,
    bomberColor: () => CONFIG.colors.bomber,
    dialogueDuck: () => CONFIG.presentation.dialogueDuck,
    verticalResponse: () => 1,
    time: () => tick / 120,
    lerp,
    clamp,
    clearBossBeat: no,
    setMusicDuck: no,
    playSound: no,
    storeSeen: no,
    landing: no,
    finaleBladeCut: no,
  });
  const arenaRules = new BossArenaRules(CONFIG.bossArena, CONFIG.colors);
  let broken: ArenaPlatform[] = [];
  const services = {
    createEncounter(request: BossPhasePracticeRequest, generation: number, encounterId: string) {
      created += 1;
      tick = 0;
      mirror = createMirrorTestHarness();
      player = mirror.mirrorPlayer;
      binding = { bossId: request.bossId, seed: request.seed, generation, encounterId };
      boss = request.bossId === "echo" ? (mirror.host as unknown as BossActor) : createBoss(request.bossId).boss;
      boss.bossId = request.bossId;
      platforms = base.platforms.map((platform) => ({ ...platform })) as ArenaPlatform[];
      broken = [];
      beginBossEncounter({ runTime: 0 }, boss, 0.1, {
        platforms: () => platforms,
        setPlatforms(value) {
          platforms = value;
        },
        arenaFor: (id) =>
          createBossArena(id, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, CONFIG.bossArena.reformWarn)?.map(
            (platform) => ({ ...platform }),
          ) ?? null,
      });
    },
    observe(): BossPhasePracticeWorld | null {
      return {
        ...binding,
        actor: boss,
        weaponId: "sword",
        difficulty: "normal",
        noProgression: true,
        cinematicActive: director.active,
        arenaReady: platforms.length > 0,
        checkpointReady: true,
        phaseWorldReady:
          binding.bossId !== "source" ||
          boss.practicePhaseEntry().phase === 1 ||
          (stream !== null &&
            (boss.practicePhaseEntry().phase === 2
              ? stream.active && !stream.forming
              : stream.frozen || stream.active)),
      };
    },
    cleanup(reason: "exit" | "reset" | "replacement") {
      cleanupBossEncounterActors([boss], reason === "replacement" ? "reset" : reason);
      director.cancel(reason);
      environment.clear(reason === "exit" ? "abandon" : "retry");
      mirror.Mirror.active = false;
      clones = [];
      projectiles = [];
      stream = null;
    },
  };
  const runtime = createBossPhasePracticeRuntime(services);
  function step() {
    tick += 1;
    const dt = 1 / 120;
    if (director.active) {
      director.update(dt, {});
      cinematic.step(dt);
    } else {
      boss.introT = Math.max(0, boss.introT - dt);
      environment.step(
        tick,
        dt,
        () => {
          boss.update(dt, platforms, player, projectiles);
          for (const clone of clones) clone.update(dt, platforms, player, projectiles);
        },
        new Set(["practice:boss"]),
      );
      if (boss.cinematicRequest !== null)
        cinematic.startBossTransformation(boss, boss.cinematicRequest as BossRitualCue);
      const run = { voidScroll: stream };
      stepBossRuntime({
        dt,
        player,
        platforms,
        enemies: [boss],
        run,
        thawMultiplier: CONFIG.source.thawSpeedMult,
        maximumScrollSpeed: CONFIG.source.scrollSpeedMax,
        unlockWitness: no,
        startVoidDescent: () => cinematic.startVoidDescent(boss),
        spawnAdds: () => [],
        spawnClone() {
          clones.push(new mirror.ReflectionEnemy(boss.x + 120, boss.y));
        },
        floater: no,
        dramaticBeat: no,
        removeClone: no,
        spikeImpact: no,
      });
      arenaRules.update({ platforms, broken }, dt, null, [boss], true);
    }
    const result = runtime.afterWorldStep();
    if (result.status === "refused") throw new Error(`Practice refused ${result.reason} at ${String(tick)}`);
    return result;
  }
  return {
    runtime,
    services,
    step,
    environment,
    get boss() {
      return boss;
    },
    get created() {
      return created;
    },
    get projectiles() {
      return projectiles;
    },
    get platforms() {
      return platforms;
    },
    get stream() {
      return stream;
    },
    get clones() {
      return clones;
    },
    get mirror() {
      return mirror.Mirror;
    },
    get director() {
      return director;
    },
  };
}

describe("authored boss phase practice", () => {
  it.each(BOSS_ROSTER.map(({ id }) => id))(
    "prepares all three %s entries through actual owner transitions and resets cleanly",
    (bossId) => {
      const world = practiceWorld();
      for (const phase of [1, 2, 3] as const) {
        world.runtime.begin({ bossId, phase, seed: "authored-entry-control" });
        for (let tick = 0; tick < 12000 && world.runtime.snapshot()?.lifecycle !== "active"; tick++) world.step();
        expect(world.runtime.snapshot(), `${bossId} phase ${String(phase)}`).toMatchObject({
          lifecycle: "active",
          enteredPhase: phase,
        });
        expect(world.runtime.captureAvailability()).toBe("canonical-checkpoint");
        if (bossId === "warden" && phase === 2) expect(world.boss.cages.length).toBeGreaterThan(0);
        if (bossId === "warden" && phase === 3) expect(world.boss).toMatchObject({ onCeiling: true });
        if (bossId === "colossus" && phase >= 2) {
          expect(world.boss.shielded).toBe(false);
          if (phase === 2) expect(world.projectiles.some((shot) => shot.family === "sweeper")).toBe(true);
        }
        if (bossId === "colossus" && phase === 3) expect(world.boss.zones).toHaveLength(CONFIG.colossus.panelCount);
        if (bossId === "aldric" && phase === 2) expect(world.boss.fireZones.length).toBeGreaterThan(0);
        if (bossId === "aldric" && phase === 3)
          expect(world.boss).toMatchObject({ mode: "downed", witnessEarned: false, crownWorn: false, faked: false });
        if (bossId === "rootbound" && phase === 2)
          expect(world.boss).toMatchObject({ activeGraftTypes: [...GRAFT_ANCHOR_TYPES] });
        if (bossId === "rootbound" && phase === 3) {
          expect(world.boss).toMatchObject({
            finalPhaseTwoGraftTypes: [...GRAFT_ANCHOR_TYPES],
            regrowthState: { phase: "channeling" },
            lastSpringUseCount: 0,
          });
          expect(world.environment.routes().length).toBeGreaterThan(0);
        }
        if (bossId === "echo" && phase === 2) expect(world.clones).toHaveLength(1);
        if (bossId === "echo" && phase === 3) {
          expect(world.clones.every((clone) => clone.dead)).toBe(true);
          expect(world.mirror.blade.lengthBonus).toBe(100);
        }
        if (bossId === "source" && phase >= 2) {
          expect(world.stream?.chunks.length).toBeGreaterThan(0);
          expect(world.platforms.some((platform) => platform.floor)).toBe(false);
          expect(world.stream?.forming).toBe(false);
        }
        if (bossId === "source" && phase === 3) expect(world.stream).toMatchObject({ frozen: true, active: false });
        const before = world.runtime.snapshot();
        world.runtime.restart();
        expect(world.runtime.snapshot()?.generation).toBe((before?.generation ?? 0) + 1);
        expect(world.projectiles).toEqual([]);
        expect(world.clones).toEqual([]);
        expect(world.stream).toBeNull();
        world.runtime.cancel("exit");
        expect(world.runtime.captureAvailability()).toBe("unavailable");
        expect(world.environment.snapshot()).toMatchObject({ fields: [], combatObjects: [], routes: [] });
      }
    },
  );

  it("rehydrates a real pending request without replaying it and rejects an unrequested actor", () => {
    const world = practiceWorld();
    world.runtime.begin({ bossId: "warden", phase: 3, seed: "pending-entry" });
    for (let tick = 0; tick < 120 && world.runtime.snapshot()?.pendingPhase !== 2; tick++) world.step();
    const snapshot = JSON.parse(JSON.stringify(world.runtime.snapshot())) as unknown;
    const candidate = world.services.observe();
    if (candidate === null) throw new Error("Expected pending candidate world");
    const created = world.created;
    world.runtime.restore(snapshot, candidate);
    expect(world.created).toBe(created);
    const hp = world.boss.hp;
    world.boss.hp = world.boss.maxHp;
    expect(() => validateBossPhasePracticeState(snapshot, candidate)).toThrow(/world mismatch/);
    world.boss.hp = hp;
    for (let tick = 0; tick < 12000 && world.runtime.snapshot()?.lifecycle !== "active"; tick++) world.step();
    expect(world.runtime.snapshot()).toMatchObject({ enteredPhase: 3, lifecycle: "active" });
    expect(() => validateBossPhasePracticeState({ ...world.runtime.snapshot(), unknown: true }, candidate)).toThrow();
  });

  it("retains selected entry while allowing normal later phase, ritual and terminal progression", () => {
    const world = practiceWorld();
    world.runtime.begin({ bossId: "colossus", phase: 1, seed: "continued-entry" });
    for (let tick = 0; tick < 120 && world.runtime.snapshot()?.lifecycle !== "active"; tick++) world.step();
    world.boss.hit(world.boss.maxHp * 0.5, 0, 0);
    world.step();
    expect(world.director.active).toBe(true);
    const state = JSON.parse(JSON.stringify(world.runtime.snapshot())) as unknown;
    const candidate = world.services.observe();
    if (candidate === null) throw new Error("Expected progressed world");
    expect(validateBossPhasePracticeState(state, candidate)).toMatchObject({
      phase: 1,
      enteredPhase: 2,
      lifecycle: "active",
    });
    world.runtime.cancel("exit");
    expect(() => validateBossPhasePracticeState(world.runtime.snapshot(), candidate)).toThrow();
  });
});
