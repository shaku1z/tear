import type { CommandEnvelope } from "../domain/envelopes";
import type { GameAction } from "../input/game-action";
import { CONFIG } from "../config/game-config";
import { stableVerificationHash } from "../domain/hash";
import { TearGameplayEventBus, type TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { TUTORIAL_LESSONS } from "../gameplay/training/tutorial-controller";
import { TUTORIAL_LESSON_IDS } from "../gameplay/training/tutorial-lesson-ids";
import {
  TUTORIAL_GOLD_LESSONS,
  bindTutorialGoldCorpus,
  tutorialGoldContactEdges,
  type TutorialGoldBinding,
  type TutorialGoldCorpus,
  type TutorialGoldReference,
  type TutorialGoldFrame,
} from "../gameplay/training/tutorial-gold-reference";
import { projectTutorialGoldFrame, type TutorialGoldFrameSource } from "../gameplay/training/tutorial-gold-frame";
import { replayEngine, type ReplayEngine } from "../ghost/replay-engine";
import { applyWeapon } from "../gameplay/weapons";
import { driveTutorialCourse, type TutorialDriverObservation, type TutorialDriverPort } from "./tutorial-course-driver";
import type { TearSnapshotV1 } from "../gameplay/snapshot/snapshot-contract";
import type { TearScenarioV1 } from "./contracts";
import { scenarioRunSeed } from "../gameplay/run/run-start-choices";

export interface TutorialGoldProofReference {
  readonly lessonId: TutorialGoldReference["lessonId"];
  readonly curriculumVersion: 1 | 2;
  readonly origin: TearSnapshotV1;
  readonly input: ReturnType<
    ReturnType<ReplayEngine["createProductionGhostReplayComposition"]>["create"]
  >["simulation"]["input"]["snapshot"] extends () => infer T
    ? T
    : never;
  readonly actions: readonly Readonly<{ tick: number; commands: readonly GameAction[] }>[];
  readonly hashes: readonly string[];
  readonly finalCounters: Readonly<Record<string, number>>;
}
export interface TutorialGoldProof {
  readonly format: "tear-tutorial-gold-proof.v1";
  readonly compatibility: TutorialGoldCorpus["compatibility"];
  readonly references: readonly TutorialGoldProofReference[];
}
type Source = ReturnType<ReturnType<ReplayEngine["createProductionGhostReplayComposition"]>["create"]>;
function observation(source: Source): TutorialDriverObservation {
  const player = source.replay.world.state.player(),
    blade = source.replay.world.state.blade();
  if (!player || !blade) throw new Error("Gold production actors unavailable");
  return {
    tick: source.simulation.scheduler.tick,
    player: { x: player.x, y: player.y, grounded: player.onGround },
    blade: { handX: blade.x, handY: blade.y, tipSpeed: blade.tipSpeed, state: blade.state },
    entities: source.replay.world.state
      .enemies()
      .filter((actor) => !actor.dead)
      .map((actor) => ({
        kind: actor.kind,
        x: actor.x,
        y: actor.y,
        state: (Reflect.get(actor, "state") as string | undefined) ?? actor.atk,
      })),
  };
}
function tutorialView(source: Source) {
  const session = source.replay.tutorial.session(),
    lesson = source.replay.tutorial.step();
  return {
    lessonIndex: source.replay.tutorial.idx,
    lesson: lesson.t,
    description: session.instruction,
    arena: lesson.arena,
    counters: { ...source.replay.tutorial.n },
    active: source.replay.tutorial.active,
  };
}
function geometry(source: Source): TutorialGoldReference["platforms"] {
  return (
    source.replay.stage.platforms as readonly {
      x: number;
      y: number;
      w: number;
      h: number;
      floor?: boolean;
      oneway?: boolean;
    }[]
  ).map((platform) => ({
    x: platform.x,
    y: platform.y,
    w: platform.w,
    h: platform.h,
    floor: platform.floor === true,
    oneway: platform.oneway === true,
  }));
}
function frame(source: Source, originTick: number, stage: number): TutorialGoldFrame {
  const world = source.replay.world.state,
    session = source.replay.tutorial.captureSession();
  return projectTutorialGoldFrame({
    tick: source.simulation.scheduler.tick - originTick,
    stage,
    encounter: session && session.version !== 1 ? session.fieldEncounter : "charger",
    player: world.player(),
    blade: world.blade(),
    actors: world.enemies(),
    projectiles: world.projectiles(),
    id: (actor, role) => source.combat.combatEntityRuntime.id(actor, role),
  } as TutorialGoldFrameSource);
}
function counters(source: Source): Readonly<Record<string, number>> {
  return { ...source.replay.tutorial.n };
}
function makeSource(seed: string, legacy = false) {
  const events: TearGameplayEvent[] = [],
    bus = new TearGameplayEventBus();
  const source = replayEngine
    .loaded()
    .createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed(seed),
      mode: "tutorial",
      weaponId: "sword",
      difficulty: "normal",
      gameplayEvents: bus,
    })
    .create(undefined);
  bus.subscribe((event) => events.push(event));
  if (legacy) {
    const current = source.replay.tutorial.captureSession();
    if (!current) throw new Error("Fresh legacy course requires initial controller state");
    const {
      curriculumVersion: _version,
      fieldEncounter: _encounter,
      interWaveRemaining: _breath,
      ...initial
    } = current as typeof current & {
      curriculumVersion?: number;
      fieldEncounter?: string;
      interWaveRemaining?: number;
    };
    void _version;
    void _encounter;
    void _breath;
    source.replay.tutorial.restoreSession({ ...initial, version: 1 });
  }
  return { source, events };
}
interface Pending {
  lessonId: TutorialGoldReference["lessonId"];
  arenaId: string;
  originTick: number;
  origin: ReturnType<ReplayEngine["captureProductionReplayCheckpoint"]>;
  frames: TutorialGoldFrame[];
  actions: { tick: number; commands: readonly GameAction[] }[];
  hashes: string[];
  facts: TutorialGoldReference["facts"][number][];
  landmarks: TutorialGoldReference["landmarks"][number][];
  stages: TutorialGoldReference["stages"][number][];
  eventStart: number;
  done: boolean;
}
function course(legacy: boolean) {
  const { source, events } = makeSource(legacy ? "tutorial-gold-legacy-v1" : "tutorial-parity", legacy);
  const references: TutorialGoldReference[] = [],
    proofs: TutorialGoldProofReference[] = [];
  let pending: Pending | undefined,
    acceptedActions = 0;
  const finish = () => {
    if (!pending || pending.done) return;
    const end = frame(source, pending.originTick, pending.stages.length - 1);
    if (pending.frames.at(-1)?.tick !== end.tick) pending.frames.push(end);
    const proof: TutorialGoldProofReference = {
      lessonId: pending.lessonId,
      curriculumVersion: legacy ? 1 : 2,
      origin: pending.origin.snapshot,
      input: pending.origin.input,
      actions: pending.actions,
      hashes: pending.hashes,
      finalCounters: counters(source),
    };
    const content = {
      lessonId: pending.lessonId,
      encounterVersion: legacy ? (1 as const) : (2 as const),
      curriculumVersion: legacy ? (1 as const) : (2 as const),
      arenaId: pending.arenaId,
      arenaHash: stableVerificationHash(pending.stages),
      platforms: pending.stages[0]?.platforms ?? [],
      stages: pending.stages,
      originTick: pending.originTick,
      durationTicks: end.tick,
      initialInput: pending.origin.input,
      frames: pending.frames,
      inputs: pending.actions,
      facts: pending.facts,
      landmarks: pending.landmarks,
      finalCounters: proof.finalCounters,
      proofHash: stableVerificationHash(proof),
    };
    references.push({ ...content, contentHash: stableVerificationHash(content) });
    proofs.push(proof);
    pending.done = true;
  };
  const captureBefore = () => {
    const id = TUTORIAL_GOLD_LESSONS[source.replay.tutorial.idx];
    if (id === undefined || (legacy && id !== "field-test")) return;
    if (pending?.lessonId === id) return;
    finish();
    // The proof must never recursively include the previous shipping corpus's own presentation identity.
    const origin = replayEngine
      .loaded()
      .captureProductionReplayCheckpoint(
        source.replay,
        source.combat,
        source.waveReward,
        `gold-${id}-${legacy ? "v1" : "v2"}`,
        undefined,
        { omitGoldCoach: true },
      );
    pending = {
      lessonId: id,
      arenaId: source.replay.tutorial.step().arena,
      originTick: source.simulation.scheduler.tick,
      origin,
      frames: [],
      actions: [],
      hashes: [],
      facts: [],
      landmarks: [],
      stages: [{ tick: 0, platforms: geometry(source) }],
      eventStart: events.length,
      done: false,
    };
    pending.frames.push(frame(source, pending.originTick, 0));
  };
  const port: TutorialDriverPort = {
    environment: {
      observe: () => observation(source),
      step(actions) {
        if (source.simulation.scheduler.tick >= 16000)
          throw new Error(
            `Gold course exceeded 16000 ticks: ${JSON.stringify(tutorialView(source))} ${JSON.stringify(observation(source))}`,
          );
        captureBefore();
        const before =
          pending && !pending.done ? frame(source, pending.originTick, pending.stages.length - 1) : undefined;
        source.advanceApplicationFrame(1 / 120);
        const transition = source.simulation.advanceOne(actions);
        acceptedActions += actions.length;
        if (pending && !pending.done) {
          const tick = transition.tick - pending.originTick;
          const currentGeometry = geometry(source);
          if (stableVerificationHash(currentGeometry) !== stableVerificationHash(pending.stages.at(-1)?.platforms))
            pending.stages.push({ tick, platforms: currentGeometry });
          const after = frame(source, pending.originTick, pending.stages.length - 1);
          const facts = events.slice(pending.eventStart);
          pending.eventStart = events.length;
          pending.facts.push(
            ...facts.map((event) => ({
              tick,
              fact: JSON.parse(JSON.stringify(event)) as Record<string, string | number | boolean>,
            })),
          );
          if (actions.length) pending.actions.push({ tick, commands: actions.map((action) => action.command) });
          if (before?.body.grounded && !after.body.grounded) pending.landmarks.push({ tick, kind: "takeoff" });
          if (before && !before.body.grounded && after.body.grounded) pending.landmarks.push({ tick, kind: "landing" });
          if (actions.some((action) => action.command.type === "dash")) pending.landmarks.push({ tick, kind: "dash" });
          const targetDamage = before !== undefined && tutorialGoldContactEdges(before, after).length > 0;
          if (
            targetDamage ||
            facts.some(
              (fact) =>
                (fact.kind === "effect" &&
                  ["hit", "launch", "airHit", "slam", "superslam", "updraft", "parry", "deflect", "throwHit"].includes(
                    fact.effect,
                  )) ||
                (fact.kind === "projectile" && ["hit", "deflected"].includes(fact.event)),
            )
          )
            pending.landmarks.push({ tick, kind: "contact" });
          if (before?.encounter !== after.encounter) pending.landmarks.push({ tick, kind: "encounter" });
          const saved = source.replay.tutorial.captureSession();
          const complete = saved?.completed.includes(pending.lessonId) === true;
          if (complete) pending.landmarks.push({ tick, kind: "objective" });
          if (
            tick % 4 === 0 ||
            actions.length ||
            facts.length ||
            before?.encounter !== after.encounter ||
            before.body.grounded !== after.body.grounded ||
            targetDamage ||
            complete
          )
            pending.frames.push(after);
          pending.hashes.push(transition.stateHash);
          if (complete) finish();
        }
        return { observation: observation(source), info: { canonicalStateHash: transition.stateHash } };
      },
      canonicalState: () => source.semanticProjection(),
      metrics: () => ({ acceptedActions, fixedTicks: source.simulation.scheduler.tick }),
      captureSnapshot: (id) =>
        replayEngine
          .loaded()
          .captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, id, undefined, {
            omitGoldCoach: true,
          }).snapshot,
      engineEventProjection: () => [],
    },
    tutorial: () => tutorialView(source),
    state: () => ({
      game: source.waveReward.screen(),
      mode: source.replay.world.state.run()?.mode ?? "tutorial",
      enemyTrace: source.replay.world.state.enemies().map((actor) => ({ kind: actor.kind, hitCooldown: actor.hitCd })),
      projectileTrace: source.replay.world.state
        .projectiles()
        .filter((shot) => !shot.dead)
        .map((shot) => ({ x: shot.x, y: shot.y, deflected: shot.deflected })),
    }),
  };
  const scenario: TearScenarioV1 = {
    format: "tear-contract",
    kind: "scenario",
    schemaVersion: 1,
    id: "tutorial-gold-course",
    version: 1,
    description: "Engineering semantic gold demonstration through actual production world",
    seed: legacy ? "tutorial-gold-legacy-v1" : "tutorial-parity",
    start: { mode: "tutorial", difficulty: "normal", weapon: "sword" },
    maxTicks: 16000,
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    assertions: ["runtime.finite-state"],
    tags: ["tutorial", "gold"],
  };
  const result = driveTutorialCourse(port, {
    scenarioValue: scenario,
    captureContinuation: false,
    legacyFieldTest: legacy,
  });
  finish();
  if (!result.reachedReady || references.length !== (legacy ? 1 : 13))
    throw new Error("Gold driver failed complete required course coverage");
  return { references, proofs };
}
export function generateTutorialGold(): {
  corpus: TutorialGoldCorpus;
  proof: TutorialGoldProof;
  binding: TutorialGoldBinding;
} {
  const current = course(false),
    legacy = course(true);
  const baseline = structuredClone(CONFIG);
  applyWeapon(baseline, "sword");
  const compatibility: TutorialGoldCorpus["compatibility"] = {
    curriculumVersion: 2,
    simulationHz: 120,
    weaponId: "sword",
    difficulty: "normal",
    configurationHash: stableVerificationHash(baseline),
    definitionHash: stableVerificationHash(
      TUTORIAL_LESSONS.map((lesson, index) => ({
        id: TUTORIAL_LESSON_IDS[index],
        title: lesson.title,
        arena: lesson.arena ?? "runway",
        marks: lesson.entryMarks ?? [],
      })),
    ),
  };
  const content = {
    format: "tear-tutorial-gold.v1" as const,
    schemaVersion: 1 as const,
    compatibility,
    references: [...current.references, ...legacy.references],
  };
  const corpus = { ...content, contentHash: stableVerificationHash(content) };
  const proof: TutorialGoldProof = {
    format: "tear-tutorial-gold-proof.v1",
    compatibility,
    references: [...current.proofs, ...legacy.proofs],
  };
  return { corpus, proof, binding: bindTutorialGoldCorpus(corpus) };
}
export function verifyTutorialGoldReference(reference: TutorialGoldReference, proof: TutorialGoldProofReference): void {
  if (
    reference.proofHash !== stableVerificationHash(proof) ||
    stableVerificationHash(reference.initialInput) !== stableVerificationHash(proof.input)
  )
    throw new Error("Gold proof hash mismatch");
  const source = replayEngine
    .loaded()
    .createProductionGhostReplayComposition({
      runSeed: scenarioRunSeed("tutorial-gold-replay"),
      mode: "tutorial",
      weaponId: "sword",
      difficulty: "normal",
    })
    .create(proof.origin);
  source.simulation.input.restore(proof.input);
  if (
    stableVerificationHash(reference.frames[0]) !== stableVerificationHash(frame(source, proof.origin.tick, 0)) ||
    stableVerificationHash(reference.stages[0]?.platforms) !== stableVerificationHash(geometry(source))
  )
    throw new Error("Gold restored origin pose/geometry mismatch");
  const commands = new Map(proof.actions.map((entry) => [entry.tick, entry.commands]));
  let id = 0;
  for (let index = 0; index < proof.hashes.length; index++) {
    const tick = proof.origin.tick + index + 1;
    const actions: CommandEnvelope<GameAction>[] = (commands.get(index + 1) ?? []).map((command) => ({
      kind: "command",
      tick,
      id: ++id,
      command,
    }));
    source.advanceApplicationFrame(1 / 120);
    const result = source.simulation.advanceOne(actions);
    if (result.stateHash !== proof.hashes[index])
      throw new Error(`Gold ${reference.lessonId} diverged at ${String(tick)}`);
    const sample = reference.frames.find((sample) => sample.tick === index + 1);
    if (
      sample &&
      stableVerificationHash(sample) !== stableVerificationHash(frame(source, proof.origin.tick, sample.stage))
    )
      throw new Error(`Gold ${reference.lessonId} sampled pose diverged at ${String(tick)}`);
  }
  const end = source.replay.tutorial.captureSession();
  if (
    !end?.completed.includes(reference.lessonId) ||
    stableVerificationHash(counters(source)) !== stableVerificationHash(proof.finalCounters)
  )
    throw new Error("Gold objective did not complete through real production rules");
}
