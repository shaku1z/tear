import { describe, expect, it } from "vitest";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";
import { createParticleSystem } from "../../src/presentation/particles";
import { createLiveParticlePresentationState } from "../../src/app/world/particle-presentation-state";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionCombatPhases } from "../../src/tearbench/production-combat-phases";
import { createMirrorRenderer } from "../../src/presentation/entities/mirror-renderer";
import { clamp } from "../../src/domain/geometry";
import { createLiveCombatActions } from "../../src/app/combat/combat-actions";
import { STAGES } from "../../src/gameplay/stages";
import { stepEnemyStatuses } from "../../src/gameplay/combat/enemy-step-runtime";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { LiveKillRuntime } from "../../src/gameplay/combat/live-kill-runtime";
import { runLiveCollisionPhase } from "../../src/gameplay/combat/live-collision-phase";
import { runLiveOpeningPhase } from "../../src/gameplay/combat/live-opening-phase";
import { GFX, THEME } from "../../src/config/game-config";

function liveActions(replay: ReturnType<typeof createProductionReplayWorld>) {
  // The real emission callbacks are exercised. Unrelated device and
  // persistence ports remain inert; entity and FX factories are production.
  const noop = () => undefined, functions = new Proxy<Record<string, () => void>>({}, { get: () => noop });
  const context = { releaseCamera: noop, dependencies: { ...replay.dependencies, STAGES, GFX, THEME, profileStatsPersistence: { add: noop, max: noop },
    Backdrop: { bloom: noop, flare: noop }, Input: { buzz: noop }, CG: { happytime: noop } },
    live: { player: () => replay.world.state.player(), blade: () => replay.world.state.blade(), run: () => replay.world.state.run(),
      enemies: () => replay.world.state.enemies(), projectiles: () => replay.world.state.projectiles() },
    ports: { functions, achievement: {}, stage: { platforms: [], index: 0, current: STAGES[0] } } } as unknown as Parameters<typeof createLiveCombatActions>[0];
  return createLiveCombatActions(context);
}
const liveOpening = (replay: ReturnType<typeof createProductionReplayWorld>) => liveActions(replay).opening;

describe("captured cosmetic emission continuity", () => {
  it.each(["perfect", "slam", "ink", "bladeTrail", "reform", "charger", undefined, "#123456"])("resolves live opening color %s before particle emission", (color) => {
    const live = createProductionReplayWorld({ seed: "opening-colors" }), detached = createProductionReplayWorld({ seed: "opening-colors" });
    const reference = liveOpening(live), production = createProductionCombatPhases(detached).opening;
    const priorInk = THEME.ink;
    try {
      // Resolution reads the current policy, including changes after host construction.
      THEME.ink = "#102030";
      for (const replay of [live, detached]) Object.assign(replay.configuration.value.colors, {
        perfect: "#112233", slam: "#223344", bladeTrail: "#334455", charger: "#445566",
      });
      if (color !== undefined) { reference.ring(800, 775, 12, color); production.ring(800, 775, 12, color); }
      reference.burst(800, 775, 1, -1, 3, color); production.burst(800, 775, 1, -1, 3, color);
      expect(live.effects.list).not.toEqual([]);
      expect(detached.effects.list).toEqual(live.effects.list);
      expect(detached.cosmeticEmissionRandom.snapshot()).toEqual(live.cosmeticEmissionRandom.snapshot());
    } finally { THEME.ink = priorInk; }
  });

  it.each(["hard landing", "spike"] as const)("matches live colors through the actual opening %s route", (route) => {
    const live = createProductionReplayWorld({ seed: "opening-route-colors" }), detached = createProductionReplayWorld({ seed: "opening-route-colors" });
    const priorLow = GFX.low, priorInk = THEME.ink;
    GFX.low = false; THEME.ink = "#102030";
    try {
      for (const replay of [live, detached]) {
        const player = replay.world.state.player(); if (player === undefined) throw new Error("player missing");
        Object.assign(player, { x: 800, y: replay.configuration.value.world.groundY - player.hh, vy: 0, onGround: true });
        if (route === "hard landing") Object.assign(replay.transient.opening, { wasOnGround: false, landingVelocity: replay.configuration.value.player.maxFall });
        else {
          const enemy = replay.world.entities.createEnemy("charger", 900, replay.configuration.value.world.groundY - 22, replay.world.state.run() as never);
          Object.assign(enemy, { y: replay.configuration.value.world.groundY - enemy.hh, tutDummy: true, spawnT: 0, spiked: true, onGround: true, vx: 0, vy: 0 }); replay.world.state.setEnemies([enemy]);
        }
      }
      const reference = liveOpening(live), livePhase = createProductionCombatPhases(live), production = createProductionCombatPhases(detached);
      // Shared real opening simulation, with the actual live host's color callbacks as reference.
      runLiveOpeningPhase({ ...livePhase.opening, ring: (...args) => { reference.ring(...args); }, burst: (...args) => { reference.burst(...args); } }, 1 / 120);
      runLiveOpeningPhase(production.opening, 1 / 120);
      const expectedColor = route === "hard landing" ? THEME.ink : live.configuration.value.colors.slam;
      expect(live.effects.list.some((particle) => particle.type === "ring" && particle.col === expectedColor)).toBe(true);
      expect(detached.effects.list).toEqual(live.effects.list);
      expect(detached.cosmeticEmissionRandom.snapshot()).toEqual(live.cosmeticEmissionRandom.snapshot());
    } finally { GFX.low = priorLow; THEME.ink = priorInk; }
  });

  it.each(["culled", "budget"])("preserves mirror draw order before %s admission rejection", (disposition) => {
    const entropy = createCosmeticEmissionRandom(), effects = { highBudget: disposition === "budget" ? 0 : 10, lowBudget: 0, cullMargin: 0 };
    const fx = createParticleSystem({ effects, random: entropy.next, lowGraphics: () => false, reducedMotion: () => false });
    if (disposition === "culled") fx.setViewRect({ left: -1000, top: -1000, right: -900, bottom: -900 });
    createMirrorRenderer({ clock: { sim: 0 }, policy: { world: { groundY: 800 }, colors: { armoredShield: "#fff", charger: "#fff", eye: "#fff", perfect: "#fff", slam: "#fff" } },
      effects: fx, graphics: { low: false }, theme: { ink: "#000" }, clamp, cosmeticRandom: entropy.next }).saberLockSparks(800, 775, "#abc");
    expect(fx.list).toEqual([]); expect(entropy.snapshot().cursor).toBe(14);
    const before = entropy.snapshot(); fx.reset(); expect(entropy.snapshot()).toEqual(before);
  });
  it("restores actual randomized emissions and admission/replacement state", () => {
    const entropy = createCosmeticEmissionRandom(), effects = { highBudget: 3, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({ effects, random: entropy.next, lowGraphics: () => false, reducedMotion: () => false });
    const owner = createLiveParticlePresentationState(fx, () => ({ effects, lowGraphics: false, reducedMotion: false }), entropy);
    fx.spark(800, 775, 1, -1); const saved = owner.capture();
    const emit = () => { fx.shard(800, 775); fx.smoke(800, 775); return fx.burst(800, 775, 1, -1, 3); };
    const receipt = emit(), expected = owner.capture();
    const other = createProductionReplayWorld({ seed: "unrelated-emission-world" }); other.effects.explode(100, 100);
    owner.restore(owner.prepare(saved, 17, 0));
    expect(emit()).toEqual(receipt); expect(owner.capture()).toEqual(expected);
  });

  it("emits actual production mirror-lock sparks instead of the old no-op", () => {
    const replay = createProductionReplayWorld({ seed: "cosmetic-mirror" });
    const { Mirror, MirrorHost } = replay.factories.mirrorTypes;
    const host = new MirrorHost(800, replay.configuration.value.world.groundY - 35, replay.world.state.run());
    host._live = true; Mirror.attach(host, host._mods);
    const player = replay.world.state.player() as never, blade = replay.world.state.blade() as never;
    Mirror._enterLock(800, 775, player); replay.effects.reset();
    const before = replay.cosmeticEmissionRandom.snapshot();
    Mirror._tickLock(1 / 120, player, blade);
    expect(replay.effects.list.map((p) => p.type)).toEqual(["spark", "spark", "spark"]);
    expect(replay.cosmeticEmissionRandom.snapshot().cursor - before.cursor).toBe(14);
    const expected = structuredClone(replay.effects.list), entropy = replay.cosmeticEmissionRandom.snapshot(), lock = Mirror.lock;
    if (lock === null) throw new Error("mirror lock was not retained");
    replay.effects.reset(); replay.cosmeticEmissionRandom.restore(before);
    createMirrorRenderer({ clock: replay.clock, policy: replay.configuration.value, effects: replay.effects, graphics: { low: false },
      theme: { ink: "#000" }, clamp, cosmeticRandom: replay.cosmeticEmissionRandom.next }).saberLockSparks(lock.x, lock.y, Mirror.color);
    expect(replay.effects.list).toEqual(expected); expect(replay.cosmeticEmissionRandom.snapshot()).toEqual(entropy);
  });

  it("uses the live clone-removal ghost geometry in the actual production callback", () => {
    const replay = createProductionReplayWorld({ seed: "cosmetic-clone" });
    const phases = createProductionCombatPhases(replay);
    phases.opening.removeBossClone({ x: 800, y: 775, hw: 19, hh: 27 } as never);
    expect(replay.effects.list).toEqual([{ type: "ghost", x: 800, y: 775, hw: 19, hh: 27,
      col: null, life: 0.22, max: 0.22, priority: "cosmetic" }]);
    const expected = structuredClone(replay.effects.list); replay.effects.reset();
    liveOpening(replay).removeBossClone({ x: 800, y: 775, hw: 19, hh: 27 } as never);
    expect(replay.effects.list).toEqual(expected);
  });

  it("binds actual heavy-bleed status positioning identically through live and production opening ports", () => {
    const live = createProductionReplayWorld({ seed: "bleed-cosmetics" }), detached = createProductionReplayWorld({ seed: "bleed-cosmetics" });
    const run = (replay: typeof live, host: Pick<ReturnType<typeof liveOpening>, "random" | "ember" | "drip">) => {
      const enemy = replay.world.entities.createEnemy("charger", 800, 775, replay.world.state.run() as never);
      Object.assign(enemy, { spawnT: 0, bleedStacks: 3, bleedT: 1, burnT: 0, _stFx: 0 });
      const gameplay = replay.random.streams.snapshot();
      stepEnemyStatuses({ dt: 1 / 120, enemies: [enemy] as never, cinderSlow: false, random: host.random, ember: host.ember, drip: host.drip,
        didDie: () => false, onArmorBypass: () => undefined, onKill: () => undefined });
      expect(replay.random.streams.snapshot()).toEqual(gameplay);
    };
    run(live, liveOpening(live)); run(detached, createProductionCombatPhases(detached).opening);
    expect(live.effects.list.map((p) => p.type)).toEqual(["drip", "drip"]);
    expect(live.cosmeticEmissionRandom.snapshot().cursor).toBe(11);
    expect(detached.effects.list).toEqual(live.effects.list); expect(detached.cosmeticEmissionRandom.snapshot()).toEqual(live.cosmeticEmissionRandom.snapshot());
  });

  it("continues actual Aldric charge admission and ember fields after a production checkpoint", () => {
    const composition = createProductionGhostReplayComposition({ seed: "aldric-cosmetics" }), source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy("aldric", 800, 700, source.replay.world.state.run() as never);
    Object.assign(boss, { bossId: "aldric", spawnT: 0, introT: 0, cinematicRequest: null, state: "charge", vx: 100, seamDropT: 1 });
    source.replay.world.state.setEnemies([boss]);
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "aldric-emission");
    const before = source.replay.cosmeticEmissionRandom.snapshot(), gameplay = source.replay.random.streams.snapshot();
    const step = (replay: typeof source.replay) => {
      const actor = replay.world.state.enemies()[0]; if (actor === undefined) throw new Error("Aldric missing");
      actor.update(1 / 16, replay.stage.platforms, replay.world.state.player(), replay.world.state.projectiles());
    };
    step(source.replay);
    expect(source.replay.effects.list.some((p) => p.type === "ember")).toBe(true);
    expect(source.replay.cosmeticEmissionRandom.snapshot().cursor - before.cursor).toBe(7);
    expect(source.replay.random.streams.snapshot()).toEqual(gameplay);
    const restored = composition.create(checkpoint.snapshot);
    expect(restored.replay.cosmeticEmissionRandom.snapshot()).toEqual(before);
    expect(restored.replay.world.state.enemies()[0]).toMatchObject({ state: "charge", mode: "duel", spawnT: 0, introT: 0, cinematicRequest: null });
    step(restored.replay);
    expect(restored.replay.cosmeticEmissionRandom.snapshot().cursor - before.cursor).toBe(7);
    expect(restored.replay.effects.list).toEqual(source.replay.effects.list);
    expect(restored.replay.cosmeticEmissionRandom.snapshot()).toEqual(source.replay.cosmeticEmissionRandom.snapshot());
  });

  it("emits the hostile-blade collision feedback through the actual collision phase", () => {
    const replay = createProductionReplayWorld({ seed: "collision-emissions" }), phase = createProductionCombatPhases(replay);
    const player = replay.world.state.player(), blade = replay.world.state.blade();
    if (player === undefined || blade === undefined) throw new Error("actor pair missing");
    Object.assign(player, { x: 800, y: 775, hp: 1000, maxHp: 1000, iframe: 0, cinematicGraceT: 0 });
    Object.assign(blade, { hostile: true, state: "flying", stolenBy: null, x: 770, y: 775, tipX: 830, tipY: 775, vx: 100, vy: 0 });
    const prior = GFX.low; GFX.low = false;
    try {
      runLiveCollisionPhase(phase.collision, 1 / 120);
      expect(phase.outward).toContain("fx:burst");
      expect(replay.effects.list.filter((p) => p.type === "spark")).toHaveLength(17);
      expect(replay.cosmeticEmissionRandom.snapshot().cursor).toBe(61);
    } finally { GFX.low = prior; }
  });

  it("matches live opening and collision effect callbacks in order while preserving production traces", () => {
    const live = createProductionReplayWorld({ seed: "callback-emissions" }), detached = createProductionReplayWorld({ seed: "callback-emissions" });
    const reference = liveActions(live), phases = createProductionCombatPhases(detached);
    const emit = (host: Pick<typeof reference, "opening" | "collision">) => {
      host.opening.ghost(800, 775, 10, 20, "slam"); host.opening.ember(800, 775); host.opening.smoke(800, 775); host.opening.drip(800, 775);
      host.collision.effects.burst(800, 775, 1, -1, 3, "#abc"); host.collision.effects.ring(800, 775, 12, "#abc");
      host.collision.effects.flash(800, 775, 12, "#abc"); host.collision.effects.ribbon(800, 775, 810, 780, "#abc");
      host.collision.effects.explode(800, 775, "#abc", 1);
    };
    emit(reference); emit(phases);
    expect(detached.effects.list).toEqual(live.effects.list); expect(detached.cosmeticEmissionRandom.snapshot()).toEqual(live.cosmeticEmissionRandom.snapshot());
    expect(phases.outward).toEqual(["ghost", "ember", "smoke", "drip", "fx:burst", "fx:ring", "fx:flash", "fx:ribbon", "fx:explode"]);
  });

  it.each(["charger", "aldric"])("matches the actual live kill transaction's emissions for %s", (kind) => {
    const live = createProductionReplayWorld({ seed: "kill-emissions" }), detached = createProductionReplayWorld({ seed: "kill-emissions" });
    const run = (replay: typeof live, liveHost: boolean) => {
      const enemy = replay.world.entities.createEnemy(kind, 800, 775, replay.world.state.run() as never);
      Object.assign(enemy, { dead: true, severT: 1, bleedStacks: 3, burnT: 1, ...(kind === "aldric" ? { bossId: "aldric" } : {}) });
      replay.world.state.setEnemies([enemy]);
      Object.assign(replay.world.state.run()?.mods ?? {}, { sever: 3, bleedNova: true, cinderNova: true });
      const phases = createProductionCombatPhases(replay);
      new LiveKillRuntime(liveHost ? liveActions(replay).kill : phases.kill).resolve(enemy);
      return phases;
    };
    run(live, true); const phases = run(detached, false);
    expect(live.effects.list.some((p) => p.type === "shard")).toBe(true);
    expect(phases.outward).toContain("deathEffect"); expect(phases.outward).toContain("killRing");
    if (kind === "aldric") expect(phases.outward).toContain("bossPresentation");
    expect(detached.effects.list).toEqual(live.effects.list);
    expect(detached.cosmeticEmissionRandom.snapshot()).toEqual(live.cosmeticEmissionRandom.snapshot());
  });
});
