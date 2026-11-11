/**
 * Golden authoritative-state hash streams for structural refactors.
 *
 * Each scenario drives the production headless environment (the same
 * composition replay and TearBench use) with a scripted, observation-driven
 * policy and records the canonical state hash every SAMPLE_EVERY ticks. Any
 * refactor that claims "no behaviour change" must leave every stream identical.
 *
 * Regenerate only for an intended gameplay change, and review the fixture diff:
 *   PowerShell: $env:TEAR_HASH_STREAM_WRITE = "1"; pnpm test:determinism; Remove-Item Env:TEAR_HASH_STREAM_WRITE
 *   Bash:       TEAR_HASH_STREAM_WRITE=1 pnpm test:determinism
 */
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import type { GameAction } from "../../src/input/game-action";
import { WEAPON_IDS, type WeaponId } from "../../src/gameplay/weapon-selection";
import { stableVerificationHash } from "../../src/replay/hash";
import type { TearObservationV1, TearScenarioV1 } from "../../src/tearbench/contracts";
import { createProductionHeadlessEnvironment, type ProductionHeadlessEnvironment } from "../../src/tearbench/production-headless-environment";

const FIXTURE_PATH = "tests/fixtures/canonical-hash-stream.json";
const FIXTURE_FORMAT = "tear-canonical-hash-stream.v1";
const WRITE = process.env.TEAR_HASH_STREAM_WRITE === "1";
const SAMPLE_EVERY = 60;
const MINIMUM_TICKS = 1_200;
const SPIN_PER_TICK = 30_000;
const AIM_TURNS = 1_000_000;
const AXIS = 1_000;
const REWARD_SCREENS: Readonly<Record<string, "draft-choice" | "reserve-choice" | "tier-up-choice">> = Object.freeze({
  draft: "draft-choice", reserve: "reserve-choice", tierup: "tier-up-choice",
});

const PLANS = Object.freeze({
  melee: Object.freeze({ mode: "endless", ticks: 1_800, throws: false }),
  throw: Object.freeze({ mode: "endless", ticks: 1_800, throws: true }),
  boss: Object.freeze({ mode: "bossonly", ticks: 2_160, throws: true }),
});
type PlanId = keyof typeof PLANS;

interface StreamSpec {
  readonly id: string; readonly weapon: WeaponId; readonly plan: PlanId;
  readonly seed: string; readonly mode: string; readonly difficulty: "easy"; readonly ticks: number;
}

/** Behaviour each stream actually exercised; asserted for coverage and pinned with the hashes. */
interface StreamFacts {
  readonly heldHitTicks: number; readonly damageTakenTicks: number; readonly dashes: number; readonly jumps: number;
  readonly enemiesDefeated: number; readonly wavesCleared: number; readonly draftsSelected: number;
  readonly bladeThrows: number; readonly bladeCatches: number;
  readonly bossIntros: number; readonly bossKinds: readonly string[]; readonly maxBossPhase: number; readonly terminatedAt: number | null;
}

interface StreamRecord extends StreamSpec {
  readonly facts: StreamFacts; readonly finalHash: string; readonly hashes: readonly string[];
}

interface HashStreamFixture {
  readonly format: typeof FIXTURE_FORMAT; readonly sampleEvery: number; readonly streams: readonly StreamRecord[];
}

const SPECS: readonly StreamSpec[] = WEAPON_IDS.flatMap((weapon) => (Object.keys(PLANS) as PlanId[]).map((plan) => ({
  id: `${weapon}/${plan}`, weapon, plan, seed: `hash-stream:${weapon}:${plan}`,
  mode: PLANS[plan].mode, difficulty: "easy" as const, ticks: PLANS[plan].ticks,
})));

function scenarioContract(spec: StreamSpec): TearScenarioV1 {
  return {
    format: "tear-contract", kind: "scenario", schemaVersion: 1, id: `hash-stream-${spec.weapon}-${spec.plan}`, version: 1,
    description: "Golden authoritative hash stream", stateClass: "recorded-canonical", executionClass: "training",
    seed: spec.seed, start: { mode: spec.mode, difficulty: spec.difficulty, weapon: spec.weapon },
    maxTicks: spec.ticks, assertions: ["runtime.finite-state"], tags: ["determinism", "hash-stream"],
  } as TearScenarioV1;
}

function nearestActor(observation: TearObservationV1) {
  let nearest: TearObservationV1["entities"][number] | undefined;
  for (const entity of observation.entities) {
    if (entity.kind === "projectile") continue;
    if (nearest === undefined || Math.abs(entity.x - observation.player.x) < Math.abs(nearest.x - observation.player.x)) nearest = entity;
  }
  return nearest;
}

/** Keeps a spinning blade at reach, hops and dashes on a fixed cadence, and optionally throws then recalls. */
function combatActions(observation: TearObservationV1, plan: PlanId, tick: number): GameAction[] {
  const target = nearestActor(observation);
  const offset = target === undefined ? 0 : target.x - observation.player.x;
  const toward = offset > 0 ? AXIS : -AXIS, distance = Math.abs(offset);
  const actions: GameAction[] = [
    { type: "move", x: target === undefined ? 0 : distance > 150 ? toward : distance < 80 ? -toward : 0, y: 0 },
    { type: "aim", turn: (tick * SPIN_PER_TICK) % AIM_TURNS, magnitude: AXIS },
  ];
  if (tick % 120 === 0) actions.push({ type: "jump", phase: "pressed" });
  if (tick % 120 === 12) actions.push({ type: "jump", phase: "released" });
  if (tick % 150 === 75 && target !== undefined) actions.push({ type: "dash", x: distance < 120 ? -toward : toward, y: 0 });
  if (PLANS[plan].throws) actions.push(...throwCycle(tick % 200, target !== undefined));
  return actions;
}

/** Throw toward the fight, then recall; each press is released so the next one is a fresh edge. */
function throwCycle(phase: number, engaged: boolean): GameAction[] {
  if (phase === 100 && engaged) return [{ type: "weapon", intent: "throw", phase: "pressed" }];
  if (phase === 104) return [{ type: "weapon", intent: "throw", phase: "released" }];
  if (phase === 140) return [{ type: "weapon", intent: "recall", phase: "pressed" }];
  if (phase === 144) return [{ type: "weapon", intent: "recall", phase: "released" }];
  return [];
}

function rewardActions(environment: ProductionHeadlessEnvironment): GameAction[] | undefined {
  const ui = environment.policyUiObservation(), type = REWARD_SCREENS[ui.screen];
  if (type === undefined) return undefined;
  const choice = ui.choices[0];
  return choice === undefined ? [] : [{ type, choiceId: choice.id }];
}

/** Highest boss phase in the source-owned checkpoint codec; 0 while no checkpointable boss exposes one. */
function bossPhase(environment: ProductionHeadlessEnvironment): number {
  try {
    const bosses = environment.captureCheckpoint().snapshot.state["tear.boss.v1"] as readonly { phaseMarker?: unknown }[] | undefined;
    return bosses?.reduce((max, boss) => typeof boss.phaseMarker === "number" ? Math.max(max, boss.phaseMarker) : max, 0) ?? 0;
  } catch { return 0; }
}

function bossActors(environment: ProductionHeadlessEnvironment): readonly { kind: string }[] {
  if (rewardActions(environment) !== undefined) return [];
  return environment.policyObservation().entities.filter((entity) => entity.kind !== "projectile");
}

class FactCounter {
  heldHitTicks = 0; damageTakenTicks = 0; dashes = 0; jumps = 0;
  enemiesDefeated = 0; wavesCleared = 0; draftsSelected = 0; bladeThrows = 0; bladeCatches = 0;
  bossIntros = 0; maxBossPhase = 0; terminatedAt: number | null = null;
  readonly bossKinds = new Set<string>();
  #previous: TearObservationV1 | undefined;

  observe(observation: TearObservationV1): void {
    const previous = this.#previous;
    this.#previous = observation;
    if (previous === undefined) return;
    if (observation.player.hp < previous.player.hp) this.damageTakenTicks += 1;
    if ((previous.player.dashTimer ?? 0) <= 0 && (observation.player.dashTimer ?? 0) > 0) this.dashes += 1;
    if (previous.blade.state === "held" && observation.entities.some((entity) => {
      const before = previous.entities.find((candidate) => candidate.id === entity.id);
      return before !== undefined && (entity.hpRatio ?? 1) < (before.hpRatio ?? 1);
    })) this.heldHitTicks += 1;
  }

  count(actions: readonly GameAction[], events: readonly { type: string }[]): void {
    this.jumps += actions.filter((action) => action.type === "jump" && action.phase === "pressed").length;
    for (const { type } of events) {
      if (type === "enemy.defeated") this.enemiesDefeated += 1;
      if (type === "wave.cleared") this.wavesCleared += 1;
      if (type === "draft.selected") this.draftsSelected += 1;
      if (type === "blade.thrown") this.bladeThrows += 1;
      if (type === "blade.caught") this.bladeCatches += 1;
      if (type === "boss.intro-started") this.bossIntros += 1;
    }
  }

  bossStep(bosses: readonly { kind: string }[], phase: number): void {
    for (const boss of bosses) this.bossKinds.add(boss.kind);
    this.maxBossPhase = Math.max(this.maxBossPhase, phase);
  }

  facts(): StreamFacts {
    const { heldHitTicks, damageTakenTicks, dashes, jumps, enemiesDefeated, wavesCleared, draftsSelected,
      bladeThrows, bladeCatches, bossIntros, maxBossPhase, terminatedAt } = this;
    return { heldHitTicks, damageTakenTicks, dashes, jumps, enemiesDefeated, wavesCleared, draftsSelected,
      bladeThrows, bladeCatches, bossIntros, bossKinds: [...this.bossKinds].sort(), maxBossPhase, terminatedAt };
  }
}

/** Reward screens take the first offered choice; otherwise the observed fight decides the combat inputs. */
function nextActions(environment: ProductionHeadlessEnvironment, counter: FactCounter, plan: PlanId, tick: number): GameAction[] {
  const reward = rewardActions(environment);
  if (reward !== undefined) return reward;
  const observation = environment.policyObservation();
  counter.observe(observation);
  return combatActions(observation, plan, tick);
}

function recordStream(spec: StreamSpec): StreamRecord {
  const environment = createProductionHeadlessEnvironment(), counter = new FactCounter(), hashes: string[] = [];
  let finalHash = "";
  try {
    environment.reset(scenarioContract(spec));
    for (let tick = 1; tick <= spec.ticks; tick += 1) {
      const actions = nextActions(environment, counter, spec.plan, tick);
      const transition = environment.step(actions);
      counter.count(actions, transition.events ?? []);
      finalHash = stableVerificationHash(transition.observation);
      if (tick % SAMPLE_EVERY === 0) {
        hashes.push(finalHash);
        if (spec.plan === "boss") counter.bossStep(bossActors(environment), bossPhase(environment));
      }
      if (transition.terminated) { counter.terminatedAt = tick; break; }
    }
  } finally { environment.dispose(); }
  return { ...spec, facts: counter.facts(), finalHash, hashes };
}

function readFixture(): HashStreamFixture {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Partial<HashStreamFixture>;
  if (fixture.format !== FIXTURE_FORMAT || fixture.sampleEvery !== SAMPLE_EVERY || !Array.isArray(fixture.streams)) {
    throw new Error(`${FIXTURE_PATH} has an unexpected format`);
  }
  return fixture as HashStreamFixture;
}

/** Names the first sampled tick whose authoritative hash differs, or undefined when the streams match. */
function firstDivergence(expected: StreamRecord, actual: StreamRecord): string | undefined {
  const { id } = actual;
  for (const key of ["seed", "mode", "difficulty", "ticks"] as const) {
    if (expected[key] !== actual[key]) {
      return `${id}: scenario ${key} changed (${String(expected[key])} -> ${String(actual[key])}); regenerate the fixture deliberately`;
    }
  }
  const length = Math.max(expected.hashes.length, actual.hashes.length);
  for (let index = 0; index < length; index += 1) {
    if (expected.hashes[index] !== actual.hashes[index]) {
      const tick = (index + 1) * SAMPLE_EVERY;
      return `${id}: authoritative state hash first diverges at sampled tick ${String(tick)} `
        + `(last matching sample: tick ${String(tick - SAMPLE_EVERY)}); `
        + `expected ${String(expected.hashes[index])}, got ${String(actual.hashes[index])}`;
    }
  }
  return expected.finalHash === actual.finalHash ? undefined : `${id}: final authoritative state hash diverges after the last sample`;
}

const recorded = new Map<string, StreamRecord>();
const fixture = WRITE ? undefined : readFixture();

describe("canonical authoritative hash streams", () => {
  afterAll(() => {
    if (!WRITE) return;
    const value: HashStreamFixture = { format: FIXTURE_FORMAT, sampleEvery: SAMPLE_EVERY, streams: SPECS.map((spec) => {
      const record = recorded.get(spec.id);
      if (record === undefined) throw new Error(`stream ${spec.id} was not recorded`);
      return record;
    }) };
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(value, null, 2)}\n`);
  });

  it.each(SPECS)("$id reproduces its recorded hash stream", (spec) => {
    const actual = recordStream(spec);
    recorded.set(spec.id, actual);
    if (fixture === undefined) return;
    const expected = fixture.streams.find((stream) => stream.id === spec.id);
    if (expected === undefined) throw new Error(`${spec.id}: no recorded stream in ${FIXTURE_PATH}; regenerate deliberately`);
    const divergence = firstDivergence(expected, actual);
    if (divergence !== undefined) throw new Error(divergence);
    expect(actual.facts, `${spec.id} exercised behaviour`).toEqual(expected.facts);
  }, 60_000);

  it("covers every required behaviour for every weapon over full-length runs", () => {
    expect(fixture === undefined || fixture.streams.length === SPECS.length, "fixture lists exactly the specified streams").toBe(true);
    const streams = SPECS.map((spec) => recorded.get(spec.id)).filter((record) => record !== undefined);
    expect(streams).toHaveLength(SPECS.length);
    for (const stream of streams) {
      expect(stream.facts.terminatedAt, `${stream.id} must survive its whole horizon`).toBeNull();
      expect(stream.ticks, stream.id).toBeGreaterThanOrEqual(MINIMUM_TICKS);
    }
    for (const weapon of WEAPON_IDS) {
      const facts = streams.filter((stream) => stream.weapon === weapon).map((stream) => stream.facts);
      const total = (key: keyof StreamFacts) => facts.reduce((sum, entry) => sum + Number(entry[key] ?? 0), 0);
      for (const key of ["jumps", "dashes", "heldHitTicks", "enemiesDefeated", "damageTakenTicks", "bladeThrows",
        "bladeCatches", "wavesCleared", "draftsSelected", "bossIntros"] as const) {
        expect(total(key), `${weapon} ${key}`).toBeGreaterThan(0);
      }
    }
    expect(Math.max(...streams.map((stream) => stream.facts.maxBossPhase)), "a boss reaches a later phase").toBeGreaterThanOrEqual(2);
  });
});
