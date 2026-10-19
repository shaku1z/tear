import { describe, expect, it } from "vitest";
import { createLiveStateForgeAdapter } from "../../src/app/live-state-forge-adapter";
import { createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { captureLiveStateForgeSnapshot, createLiveStateForgeRestoreFactory } from "../../src/tearbench/live-runtime-snapshots";
import { restoreSnapshotIntoLiveWorld } from "../../src/tearbench/live-state-snapshot";
import { createDefaultStateCodecRegistry } from "../../src/tearbench/state-codecs";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import type { RootboundGraftEffects } from "../../src/gameplay/environment/graft-anchor";
import { STAGES, PLAYGROUND_STAGES } from "../../src/gameplay/stages";
import { UPGRADES } from "../../src/gameplay/upgrades";
import { applyWeapon } from "../../src/gameplay/weapons";
import { createLiveHudFeedbackState } from "../../src/app/live-hud-feedback-state";

type Failure = "clear" | "replace" | "late" | "runtime";
interface BossFacts {
  maxHp: number;
  graftDamageTakenMultiplier: number;
  graftCadenceMultiplier: number;
  activeGraftTypes: readonly string[];
  rootCageRequest: unknown;
  applyGraftEffects(effects: RootboundGraftEffects): void;
  completeRootCage(): void;
  startRootCage(centerX: number): boolean;
}

function fixture() {
  const host = createProductionGhostReplayComposition({ seed: "live-adapter-ownership", mode: "endless" }).create(undefined);
  const { replay, combat } = host;
  const state = replay.world.state, environment = replay.world.context.environment;
  const identities = combat.combatEntityRuntime;
  const boss = replay.world.entities.createEnemy("rootbound", 800, 520, state.run() as never);
  state.setEnemies([boss]);
  environment.setStage(STAGES[0]?.id ?? "unknown", "restore");
  const observations: { phase: string; actor: unknown; id: string }[] = [];
  let failure: Failure | undefined;
  let screen = "playing", focus = -1;
  const hud = createLiveHudFeedbackState();
  let runtime: Readonly<Record<string, unknown>> = { sentinel: 1, cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 };
  const observe = (phase: string) => {
    for (const actor of state.enemies()) observations.push({ phase, actor, id: identities.id(actor, "enemy") });
  };
  const fail = (phase: Failure) => { if (failure === phase) { failure = undefined; throw new Error(`injected ${phase}`); } };
  environment.setFeatureActorSource("verdant", "rootbound", () => state.enemies().map((actor) => ({
    id: identities.id(actor, "enemy"), source: actor, state: {},
    applyGraftEffects: (effects: RootboundGraftEffects) => { (actor as unknown as BossFacts).applyGraftEffects(effects); },
    completeRootCage: () => { (actor as unknown as BossFacts).completeRootCage(); },
  })));
  const adapter = createLiveStateForgeAdapter({
    dependencies: { ...replay.dependencies, STAGES, PLAYGROUND_STAGES, UPGRADES, applyWeapon }, entities: replay.world.entities,
    worldServices: replay.world.context.services, state,
    actorId: identities.id.bind(identities), bindActorId: identities.bindId.bind(identities),
    platforms: () => replay.stage.platforms as never, stageIndex: () => replay.stage.index,
    restoreStageIndex: (index) => { replay.stage.index = index; },
    replacePlatforms: (platforms) => { replay.stage.platforms = platforms; },
    slowZones: state.slowZones.bind(state), walls: state.temporaryWalls.bind(state),
    environment: () => environment,
    clearEnvironmentRestore: () => { observe("clear"); environment.clear("restore"); fail("clear"); },
    restoreEnvironment: (snapshot) => { observe("replace"); environment.replace(snapshot); fail("replace"); },
    screen: () => screen, setScreen: (value) => { screen = value; fail("late"); },
    focus: () => focus, setFocus: (value) => { focus = value; },
    tick: () => combat.simulationRuntime.scheduler.tick, setTick: (tick) => { combat.simulationRuntime.reset(tick); },
    clearInputProjection: replay.input.clear.bind(replay.input),
    reward: host.waveReward.reward.snapshot.bind(host.waveReward.reward),
    restoreReward: host.waveReward.reward.restore.bind(host.waveReward.reward),
    captureGhost: () => ({ recording: null }), restoreGhost: () => undefined,
    captureIdentityState: identities.captureIdentityState.bind(identities),
    restoreIdentityState: identities.restoreIdentityState.bind(identities),
    runtimeState: () => runtime, restoreRuntimeState: (value) => { runtime = value; fail("runtime"); }, hudPresentation: hud,
    captureCinema: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1, validateCinema: () => undefined,
  });
  const registry = createDefaultStateCodecRegistry();
  const capture = () => captureLiveStateForgeSnapshot({ id: "live-adapter-boundary", tick: combat.simulationRuntime.scheduler.tick,
    stateClass: "recorded-canonical", seed: "live-adapter-ownership", stateForge: adapter, registry,
    rng: replay.world.context.services.random.snapshot(), observationClass: "structured-state", producer: "unit",
    target: "headless", contentHash: "unit", visualHash: "not-captured" });
  const restore = (snapshot: ReturnType<typeof capture>) => restoreSnapshotIntoLiveWorld(snapshot, registry,
    createLiveStateForgeRestoreFactory(registry), adapter);
  const facts = (damage: number) => {
    const actor = state.enemies()[0] as unknown as BossFacts;
    Object.assign(actor, { phaseMarker: 2, hp: actor.maxHp * 0.5, cinematicRequest: null, cinematicT: 0,
      introT: 0, state: "idle", rootCageRequest: null });
    actor.applyGraftEffects({ incomingDamageMultiplier: damage, cadenceMultiplier: 1.15, activeTypes: ["bastion", "haste"] });
    expect(actor.startRootCage(800)).toBe(true);
  };
  return { replay, state, adapter, capture, restore, facts, observations, hud,
    failNext: (phase: Failure) => { failure = phase; } };
}

describe("live State Forge adapter ownership boundary", () => {
  it("restores JSON-portable staged HUD exactly and retains boss flash only on its actor codec", () => {
    const host = fixture();
    const hud = { version: 1, clockSeconds: 2.3456789, lagHp: 0.87, multiplier: 3, multiplierPop: 0.42 };
    host.hud.restore(hud);
    Object.assign(host.state.enemies()[0] ?? {}, { _phaseFlashT: 0.5 });
    const snapshot = JSON.parse(JSON.stringify(host.capture())) as ReturnType<typeof host.capture>;
    expect(snapshot.state["tear.ui.v1"]).toEqual({ screen: "playing", focusId: "-1", hudPresentation: hud });
    expect(snapshot.state["tear.boss.v1"]).toEqual(expect.arrayContaining([expect.objectContaining({ _phaseFlashT: 0.5 })]));
    host.hud.restore({ ...hud, clockSeconds: 99, lagHp: 0.1 });
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.hud.capture()).toEqual(hud);
    expect(host.capture().state).toEqual(snapshot.state);
  });

  it("resets missing historical HUD rather than inheriting outgoing feedback", () => {
    const host = fixture(), snapshot = structuredClone(host.capture());
    delete (snapshot.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation;
    host.hud.restore({ version: 1, clockSeconds: 9, lagHp: 0.2, multiplier: 5, multiplierPop: 0.8 });
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.hud.capture()).toEqual({ version: 1, clockSeconds: 0, lagHp: 1, multiplier: 1, multiplierPop: 0 });
  });

  it("rejects invalid HUD before live mutation and restores outgoing HUD after a later runtime failure", () => {
    const host = fixture();
    host.hud.restore({ version: 1, clockSeconds: 1, lagHp: 0.8, multiplier: 2, multiplierPop: 0.5 });
    const candidate = structuredClone(host.capture()), invalid = structuredClone(candidate);
    (invalid.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation = { version: 1, clockSeconds: -1 };
    const actor = host.state.enemies()[0];
    expect(host.restore(invalid)).toMatchObject({ ok: false, phase: "decode", rolledBack: false });
    expect(host.observations).toEqual([]);
    expect(host.state.enemies()[0]).toBe(actor);
    expect(host.capture().state).toEqual(candidate.state);
    host.hud.restore({ version: 1, clockSeconds: 5, lagHp: 0.2, multiplier: 3, multiplierPop: 0.7 });
    const outgoing = host.capture();
    host.failNext("runtime");
    expect(host.restore(candidate)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(host.capture().state).toEqual(outgoing.state);
    expect(host.hud.capture()).toEqual((outgoing.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation);
  });

  it("cleans outgoing actors and identities before installing intact candidate Graft and Root Cage state", () => {
    const host = fixture();
    host.facts(0.8);
    host.replay.world.context.services.clock.set(0.173456789);
    const snapshot = host.capture();
    const outgoing = host.state.enemies()[0];
    const id = (snapshot.state["tear.boss.v1"] as { id: string }[])[0]?.id;
    host.replay.world.context.services.clock.set(9.5);
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.observations).toEqual([{ phase: "clear", actor: outgoing, id }, { phase: "replace", actor: outgoing, id }]);
    expect(host.state.enemies()[0]).not.toBe(outgoing);
    expect(host.state.enemies()[0]).toMatchObject({ graftDamageTakenMultiplier: 0.8, graftCadenceMultiplier: 1.15,
      activeGraftTypes: ["bastion", "haste"], rootCageRequest: { sequence: 1, centerX: 800 } });
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.173456789);
    expect(host.capture().state).toEqual(snapshot.state);
  });

  it.each(["clear", "replace", "late"] as const)("rolls back actor facts, environment, identities and exact seconds after a %s failure", (phase) => {
    const host = fixture();
    host.facts(0.8);
    host.replay.world.context.services.clock.set(0.173456789);
    const source = host.capture();
    host.facts(0.7);
    host.replay.world.context.services.clock.set(0.3987654321);
    const before = host.capture();
    host.failNext(phase);
    expect(host.restore(source)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(host.capture().state).toEqual(before.state);
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.3987654321);
  });

  it("rejects invalid recorded seconds before any live mutation", () => {
    const host = fixture();
    host.facts(0.8);
    host.replay.world.context.services.clock.set(0.173456789);
    const before = host.capture(), invalid = structuredClone(before);
    (invalid.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds = -1;
    const actors = host.state.enemies(), run = host.state.run();
    expect(host.restore(invalid)).toMatchObject({ ok: false, phase: "decode", rolledBack: false });
    expect(host.state.enemies()).toBe(actors);
    expect(host.state.run()).toBe(run);
    expect(host.observations).toEqual([]);
    expect(host.capture().state).toEqual(before.state);
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.173456789);
  });

  it("retains the current clock when restoring historical snapshots without seconds", () => {
    const host = fixture();
    host.facts(0.8);
    const snapshot = structuredClone(host.capture());
    delete (snapshot.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds;
    host.replay.world.context.services.clock.set(0.3987654321);
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.3987654321);
  });
});
