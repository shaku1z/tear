import { driveTutorialLesson, type TutorialDriverPort } from "../../src/tearbench/tutorial-course-driver";
import type { TutorialGoldProof } from "../../src/tearbench/tutorial-gold-generation";
import type { GameAction } from "../../src/input/game-action";
import { isPracticeBossActor } from "../../src/app/campaign/boss-phase-practice";
import type { PracticeBossState } from "../../src/gameplay/training/practice-boss-catalog";
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG } from "../../src/config/game-config";
import {
  TutorialController,
  TUTORIAL_LESSON_IDS,
  type TutorialSessionCheckpoint,
} from "../../src/gameplay/training/tutorial-controller";
import { createTutorialArena } from "../../src/gameplay/training/tutorial-arenas";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/tearbench/production-replay-composition";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessCheckpoint,
  type ProductionTutorialHandoffArtifact,
} from "../../src/tearbench/production-headless-environment";
import type { TearScenarioV1, TearSnapshotV1 } from "../../src/tearbench/contracts";
import {
  firstProductionC27AHashDivergence,
  replayProductionC27ATrace,
  type ProductionC27ATrace,
} from "../../src/tearbench/production-c27a-matrix";
import { runLiveCollisionPhase } from "../../src/gameplay/combat/live-collision-phase";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import type { createBlade } from "../../src/gameplay/entities/blade";
import { loadShippingTutorialGold } from "../../src/gameplay/training/tutorial-gold-shipping";

// The shipped corpus is an on-demand asset; training preflight loads it before any lesson.
beforeAll(async () => {
  await loadShippingTutorialGold();
});

const scenario: TearScenarioV1 = {
  format: "tear-contract",
  kind: "scenario",
  schemaVersion: 1,
  id: "retained-tutorial",
  version: 1,
  description: "Constructed retained tutorial boundary continuation",
  seed: "retained-tutorial-seed",
  stateClass: "recorded-canonical",
  executionClass: "engineering",
  start: { mode: "tutorial", difficulty: "normal", weapon: "sword" },
  maxTicks: 1000,
  assertions: ["runtime.finite-state"],
  tags: ["tutorial", "continuation"],
};
const composition = () =>
  createProductionGhostReplayComposition({
    seed: scenario.seed,
    mode: "tutorial",
    weaponId: "sword",
    difficulty: "normal",
  });
type Source = ReturnType<ReturnType<typeof composition>["create"]>;
function boundary(source: Source, change: Partial<TutorialSessionCheckpoint>) {
  const saved = source.replay.tutorial.captureSession();
  if (saved === undefined) throw new Error("source tutorial missing");
  source.replay.tutorial.restoreSession({
    ...saved,
    courseSessionId: "retained-issued-course",
    pendingArena: null,
    ...change,
  });
}
function capture(source: Source) {
  return captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "tutorial-boundary");
}
function restore(source: Source) {
  return composition().create(JSON.parse(JSON.stringify(capture(source).snapshot)) as TearSnapshotV1);
}

describe("adaptive production tutorial coaching", () => {
  const proof = () =>
    JSON.parse(readFileSync("tests/fixtures/tutorial-gold-reference-proof.json", "utf8")) as TutorialGoldProof;
  it("resolves real failed swings into 2/4/6 help and an explicit unearned Lab exit, without walking or idle failures", () => {
    const source = composition().create(undefined),
      tutorial = source.replay.tutorial;
    tutorial.openPractice(1);
    tutorial.selectLesson("slam");
    expect(tutorial.step().d).toBe(tutorial.session().instruction);
    expect(tutorial.session().instruction.length).toBeGreaterThan(0);
    let commandId = 0;
    const step = (...commands: GameAction[]) => {
      const tick = source.simulation.scheduler.tick + 1;
      source.simulation.advanceOne(
        commands.map((command) => ({ kind: "command" as const, id: ++commandId, tick, command })),
      );
    };
    for (let tick = 0; tick < 900; tick++) step();
    step({ type: "move", x: -350, y: 0 });
    for (let tick = 0; tick < 15; tick++) step();
    step({ type: "move", x: 0, y: 0 });
    for (let tick = 0; tick < 120; tick++) step();
    expect(tutorial.session().coach?.adaptive?.failures).toBe(0);
    step({ type: "aim", turn: 375000, magnitude: 1000 });
    step();
    step();
    const beforeInterruption = tutorial.session().coach?.adaptive?.failures;
    source.waveReward.restoreScreen("paused");
    source.advanceApplicationFrame(1 / 120);
    source.waveReward.restoreScreen("settings");
    source.advanceApplicationFrame(1 / 120);
    source.waveReward.restoreScreen("playing");
    for (let tick = 0; tick < 120; tick++) step();
    expect(tutorial.session().coach?.adaptive?.failures).toBe(beforeInterruption);
    const seen = new Set<number>();
    let diagnostic = false;
    for (let attempt = 0; attempt < 16 && !tutorial.session().coach?.adaptive?.assistOffered; attempt++) {
      // Actual left-facing native blade swings, with a real live target on the other side.
      step({ type: "aim", turn: attempt % 2 ? 375000 : 625000, magnitude: 1000 });
      for (let tick = 0; tick < 100; tick++) {
        step();
        const coach = tutorial.session().coach;
        seen.add(coach?.adaptive?.failures ?? 0);
        if (coach?.adaptive?.failures === 2) expect(coach.adaptive.nudge).toMatch(/unknown/);
        if (coach?.adaptive?.failures === 4 && coach.mode === "diagnostic" && coach.visible) diagnostic = true;
      }
    }
    expect([...seen]).toEqual(expect.arrayContaining([2, 4, 6]));
    expect(diagnostic).toBe(true);
    const presentation = tutorial.capturePresentation(),
      saved = tutorial.captureSession();
    const reconstructed = restore(source);
    expect(reconstructed.replay.tutorial.session().coach?.adaptive?.assistOffered).toBe(true);
    expect(reconstructed.replay.tutorial.selectAnnex("sword")).toBe(true);
    expect(reconstructed.replay.tutorial.session().annex?.id).toBe("sword");
    expect(reconstructed.replay.tutorial.session().coach?.adaptive?.assistOffered).toBe(false);
    expect(reconstructed.replay.tutorial.advanceUnfinished(true)).toBe(false);
    tutorial.selectLesson("jump");
    tutorial.selectLesson("slam");
    // Selection/restart does not erase the related-failure ledger, nor count an aborted partial action.
    step();
    expect(tutorial.session().coach?.adaptive?.assistOffered).toBe(true);
    expect(tutorial.advanceUnfinished(true)).toBe(true);
    expect(tutorial.session()).toMatchObject({ phase: "free-practice", courseCompleted: false, practiceOnly: true });
    expect(tutorial.captureSession()?.completed).toEqual(saved?.completed);
    expect(presentation.goldCoach?.failures?.variants.some((entry) => entry.failures >= 6)).toBe(true);
    expect(
      source.replay.tutorialOutward.some(
        (event) => event.startsWith("complete-course:") || event === "achievement-check",
      ),
    ).toBe(false);
    // A real CUT completion still has a 1.1s world simulation delay. Continuing real
    // swings there cannot become failures merely because its objective is capped.
    const cutProof = proof().references.find((entry) => entry.lessonId === "cut" && entry.curriculumVersion === 2);
    if (!cutProof) throw new Error("Actual CUT origin missing");
    const cut = composition().create(cutProof.origin),
      cutOwner = cut.replay.tutorial;
    cut.simulation.input.restore(cutProof.input);
    const commands = new Map(cutProof.actions.map((entry) => [entry.tick, entry.commands]));
    let cutCommandId = 0;
    for (let index = 0; index < cutProof.hashes.length && cutOwner.doneT <= 0; index++) {
      const tick = cut.simulation.scheduler.tick + 1;
      cut.advanceApplicationFrame(1 / 120);
      cut.simulation.advanceOne(
        (commands.get(index + 1) ?? []).map((command) => ({ kind: "command", id: ++cutCommandId, tick, command })),
      );
    }
    expect(cutOwner.n.strike).toBeGreaterThanOrEqual(6);
    expect(cutOwner.doneT).toBeGreaterThan(0);
    const failuresAfterSuccess = cutOwner.session().coach?.adaptive?.failures;
    const blade = cut.replay.world.state.blade();
    if (!blade) throw new Error("Actual CUT blade missing");
    const swingAtSuccess: unknown = Reflect.get(blade, "swingId");
    if (typeof swingAtSuccess !== "number") throw new Error("Native swing identity missing");
    for (let index = 0; index < 110; index++) {
      const tick = cut.simulation.scheduler.tick + 1;
      cut.simulation.advanceOne(
        index % 24 === 0
          ? [
              {
                kind: "command",
                id: ++cutCommandId,
                tick,
                command: { type: "aim", turn: index % 48 ? 375000 : 625000, magnitude: 1000 },
              },
            ]
          : [],
      );
      expect(cutOwner.session().coach?.adaptive?.failures).toBe(failuresAfterSuccess);
    }
    expect(cutOwner.idx).toBe(3);
    expect(Reflect.get(blade, "swingId")).toBeGreaterThan(swingAtSuccess);
    expect(cutOwner.session().coach?.adaptive?.assistOffered).toBe(false);
  });
  it("retains skipped READY as unearned, restores it, then earns the actual Field Test and completes the same issued course once", () => {
    // These are genuine all-prior-lessons-completed bytes produced by the retained full-course driver.
    const opening = proof().references.find(
      (entry) => entry.lessonId === "field-test" && entry.curriculumVersion === 2,
    );
    if (!opening) throw new Error("Actual Field Test origin missing");
    const source = composition().create(opening.origin),
      tutorial = source.replay.tutorial;
    const issued = tutorial.captureSession()?.courseSessionId;
    expect(tutorial.advanceUnfinished()).toBe(true);
    for (let tick = 0; tick < 210; tick++) source.simulation.advanceOne([]);
    expect(tutorial.session()).toMatchObject({
      phase: "free-practice",
      unfinished: true,
      skipped: ["field-test"],
      courseCompleted: false,
    });
    expect(tutorial.captureSession()).toMatchObject({ version: 7, courseSessionId: issued, completionAwarded: false });
    expect(source.replay.tutorialOutward.some((event) => event.startsWith("complete-course:"))).toBe(false);
    const continued = restore(source),
      owner = continued.replay.tutorial;
    expect(owner.session()).toMatchObject({ unfinished: true, skipped: ["field-test"], courseCompleted: false });
    expect(owner.openPractice(0)).toBe(false); // No durable Lab eligibility was minted.
    expect(owner.selectLesson("field-test")).toBe(true);
    const world = continued.replay.world.state;
    const observe = () => {
      const player = world.player(),
        blade = world.blade();
      if (!player || !blade) throw new Error("Actual teaching actors missing");
      return {
        tick: continued.simulation.scheduler.tick,
        player: { x: player.x, y: player.y, grounded: player.onGround },
        blade: { handX: blade.x, handY: blade.y, tipSpeed: blade.tipSpeed, state: blade.state },
        entities: world
          .enemies()
          .filter((actor) => !actor.dead)
          .map((actor) => ({ kind: actor.kind, x: actor.x, y: actor.y, state: actor.atk })),
      };
    };
    const port: TutorialDriverPort = {
      environment: {
        observe,
        step: (actions) => {
          continued.advanceApplicationFrame(1 / 120);
          const result = continued.simulation.advanceOne(actions);
          return { observation: observe(), info: { canonicalStateHash: result.stateHash } };
        },
        canonicalState: () => continued.simulation.lastResult?.state ?? null,
        metrics: () => ({}),
        captureSnapshot: (id) =>
          captureProductionReplayCheckpoint(continued.replay, continued.combat, continued.waveReward, id).snapshot,
        engineEventProjection: () => [],
      },
      tutorial: () => ({
        lessonIndex: owner.idx,
        lesson: owner.step().t,
        description: owner.step().d,
        arena: owner.step().arena,
        counters: owner.n,
        active: owner.active,
      }),
      state: () => ({
        game: "playing",
        mode: "tutorial",
        enemyTrace: world.enemies().map((enemy) => ({ kind: enemy.kind, hitCooldown: enemy.hitCd })),
        projectileTrace: world.projectiles().map((shot) => ({ x: shot.x, y: shot.y, deflected: shot.deflected })),
      }),
    };
    driveTutorialLesson(port, 12, { ...scenario, maxTicks: 16000 });
    expect(owner.idx).toBe(13);
    expect(owner.captureSession()?.completed).toContain("field-test");
    for (let tick = 0; tick < 240; tick++) continued.simulation.advanceOne([]);
    expect(owner.session()).toMatchObject({ phase: "free-practice", courseCompleted: true });
    expect(
      continued.replay.tutorialOutward.filter((event) => event === `complete-course:${issued ?? ""}`),
    ).toHaveLength(1);
    const completed = restore(continued);
    for (let tick = 0; tick < 240; tick++) completed.simulation.advanceOne([]);
    expect(completed.replay.tutorialOutward.some((event) => event.startsWith("complete-course:"))).toBe(false);
  }, 30000);
});

describe("production tutorial reconstructed-byte continuation", () => {
  it("records a genuine baseline MOVE attempt for optional comparison without course effects", () => {
    const source = composition().create(undefined),
      tutorial = source.replay.tutorial;
    expect(tutorial.openPractice(1)).toBe(true);
    expect(tutorial.selectLesson("move")).toBe(true);
    for (let tick = 1; tick <= 400 && !tutorial.session().coach?.canCompare; tick++) {
      const x = tick <= 140 ? -1000 : 1000;
      source.simulation.advanceOne([{ kind: "command", id: tick, tick, command: { type: "move", x, y: 0 } }]);
    }
    expect(tutorial.session().progress).toEqual([2, 2]);
    expect(tutorial.session().coach?.canCompare).toBe(true);
    const before = tutorial.captureSession();
    expect(tutorial.coachAction("rate")).toBe(false);
    expect(tutorial.coachAction("compare")).toBe(true);
    expect(tutorial.captureSession()).toEqual(before);
    const restored = restore(source);
    expect(restored.replay.tutorial.capturePresentation()).toEqual(tutorial.capturePresentation());
    expect(
      restored.replay.tutorialOutward.some(
        (event) => event.startsWith("complete-course:") || event === "achievement-check",
      ),
    ).toBe(false);
    // Both reference replacement and a fresh course must remain valid checkpoint origins
    // after a genuinely earned comparison. Rate is a display preference, best is local.
    expect(tutorial.selectLesson("jump")).toBe(true);
    const selected = restore(source);
    expect(selected.replay.tutorial.capturePresentation().goldCoach).toMatchObject({ mode: "preview", rate: 0.5 });
    expect(selected.replay.tutorial.capturePresentation().goldCoach?.best).toBeUndefined();
    restored.replay.tutorial.start("new-comparison-boundary");
    const freshCourse = restore(restored);
    expect(freshCourse.replay.tutorial.capturePresentation().goldCoach).toMatchObject({ mode: "preview", rate: 0.5 });
    expect(freshCourse.replay.tutorial.capturePresentation().goldCoach?.best).toBeUndefined();
  });
  function bossAttempt(bossId: "source" | "aldric" | "colossus" | "rootbound", phase: 1 | 2 | 3) {
    const source = composition().create(undefined);
    const retained: PracticeBossState = {
      bossId,
      phase,
      knowledge: "encountered-phase",
      defeated: false,
      runtime: {
        version: 1,
        bossId,
        phase,
        seed: "declared-eligibility-fixture",
        generation: 1,
        encounterId: `boss-practice:1:${bossId}:${String(phase)}:declared-eligibility-fixture`,
        lifecycle: "preparing",
        setupStage: "opening",
        enteredPhase: 1,
        entryStage: "opening",
        pendingPhase: null,
      },
    };
    source.replay.tutorial.openPractice(1);
    expect(source.replay.tutorial.selectBoss(`${bossId}:${String(phase)}`, retained)).toBe(true);
    return source;
  }
  function bossStep(source: Source, tick: number) {
    // Explicit caller confirmation at the application clock, then one real 120 Hz combat tick.
    source.advanceApplicationFrame(1 / 120, { key: tick % 120 === 0 });
    return source.simulation.advanceOne([]);
  }
  it("enters Rootbound regrowth through the production Verdant owner and continues its captured grafts", () => {
    const source = bossAttempt("rootbound", 3);
    for (
      let tick = 1;
      tick <= 5000 && source.replay.tutorial.session().bossPractice?.runtime.lifecycle !== "active";
      tick++
    )
      bossStep(source, tick);
    expect(source.replay.tutorial.session().bossPractice?.runtime.lifecycle).toBe("active");
    const restored = restore(source);
    for (let tick = 1; tick <= 120; tick++)
      expect(bossStep(restored, tick).state).toEqual(bossStep(source, tick).state);
    expect(
      restored.replay.tutorialOutward.some(
        (value) => value.startsWith("complete-course:") || value === "achievement-check",
      ),
    ).toBe(false);
  });
  it.each(["source", "aldric"] as const)(
    "continues %s authored entry/cinematic against decoded owners without replaying launch",
    (bossId) => {
      const source = bossAttempt(bossId, bossId === "source" ? 2 : 3);
      for (let tick = 1; tick <= 10000; tick++) {
        bossStep(source, tick);
        const cinema = source.replay.world.context.cinema;
        if (
          cinema.active &&
          cinema.beatId === "reveal" &&
          cinema.progress > 0.15 &&
          (bossId === "source" || cinema.id === "aldric-crownfall")
        )
          break;
        if (tick === 10000) throw new Error(`Actual ${bossId} entry did not reach its reveal`);
      }
      const saved = capture(source),
        restored = composition().create(JSON.parse(JSON.stringify(saved.snapshot)) as TearSnapshotV1);
      expect(restored.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
      expect(restored.replay.world.state.enemies()[0]).not.toBe(source.replay.world.state.enemies()[0]);
      for (let tick = 1; tick <= 900; tick++)
        expect(bossStep(restored, tick).state).toEqual(bossStep(source, tick).state);
      expect(restored.replay.tutorial.session().bossPractice?.runtime.lifecycle).toBe("active");
      expect(
        restored.replay.tutorialOutward.some(
          (value) => value.startsWith("complete-course:") || value === "achievement-check",
        ),
      ).toBe(false);
      const before = restored.replay.tutorial.captureSession(),
        run = restored.replay.world.state.run();
      if (!run) throw new Error("Boss world missing");
      expect(() => {
        restored.replay.tutorial.validateSession(before, "hammer", restored.replay.world.state.enemies(), {
          run: { ...run, weaponId: "hammer" },
          actors: restored.replay.world.state.enemies(),
          cinematicActive: false,
        });
      }).toThrow(/binding mismatch/);
      expect(restored.replay.tutorial.captureSession()).toEqual(before);
      if (bossId === "aldric") {
        restored.replay.world.context.cinema.start({
          id: "unrelated-future-scene",
          beats: [{ id: "wait", duration: 1, completion: "timed" }],
        });
        expect(restored.replay.practiceCinematic.runtime.captureBinding()).toBeNull();
        restored.replay.world.context.cinema.cancel("test-cleanup");
      }
      if (bossId === "source") {
        const activeRestored = restore(source);
        for (let tick = 1; tick <= 120; tick++)
          expect(bossStep(activeRestored, tick).state).toEqual(bossStep(source, tick).state);
        const boss = source.replay.world.state.enemies().find((actor) => actor.bossId === "source"),
          player = source.replay.world.state.player();
        const blade = source.replay.world.state.blade() as unknown as InstanceType<ReturnType<typeof createBlade>>;
        if (!boss || !player || !isPracticeBossActor(boss)) throw new Error("Source owner missing");
        expect(boss.requestPracticePhase(3)).toBe(true);
        for (let tick = 1; tick <= 3000; tick++) {
          bossStep(source, tick);
          if (
            boss.practicePhaseEntry().phase === 3 &&
            boss.practicePhaseEntry().stage === "combat" &&
            !source.replay.world.context.cinema.active
          )
            break;
        }
        for (let hit = 0; hit < 1800 && !boss.dying && !boss.dead; hit++) {
          bossStep(source, hit + 1);
          if (Reflect.get(boss, "depthPlane") === "rear") continue;
          Object.assign(boss, { hitCd: 0, x: player.x + 80, y: player.y - 10 });
          Object.assign(blade, {
            state: "held",
            angle: 0,
            x: boss.x - 70,
            y: boss.y,
            tipX: boss.x + 70,
            tipY: boss.y,
            tipVX: 0,
            tipVY: -2200,
            tipSpeed: 2200,
            vx: 0,
            vy: -2200,
          });
          blade.swingId++;
          runLiveCollisionPhase(source.combat.collision, 1 / 120);
        }
        for (let tick = 1; tick <= 360 && !boss.dead; tick++) bossStep(source, tick);
        expect(boss.dead, JSON.stringify({ hp: boss.hp, entry: boss.practicePhaseEntry() })).toBe(true);
        bossStep(source, 1);
        expect(source.replay.tutorial.session().bossPractice?.defeated).toBe(true);
        const finished = restore(source);
        expect(finished.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
        expect(finished.replay.stage.platforms).toEqual(source.replay.stage.platforms);
      }
    },
  );
  it("captures actual boss defeat/removal as a finished portable attempt and restarts without course effects", () => {
    const source = bossAttempt("colossus", 3);
    for (let tick = 1; tick <= 1000 && source.replay.world.context.cinema.id !== "colossus-breach"; tick++)
      bossStep(source, tick);
    const altered = JSON.parse(JSON.stringify(capture(source).snapshot)) as TearSnapshotV1;
    const runtime = (altered.state["tear.world.v1"] as Record<string, unknown>).runtime as {
      bossCinematicBinding: { context: { cue: { after?: string } } };
    };
    delete runtime.bossCinematicBinding.context.cue.after;
    expect(() => composition().create(altered)).toThrow(/authored boss transition/);
    for (
      let tick = 1;
      tick <= 10000 && source.replay.tutorial.session().bossPractice?.runtime.lifecycle !== "active";
      tick++
    )
      bossStep(source, tick);
    expect(source.replay.tutorial.session().bossPractice?.runtime.lifecycle).toBe("active");
    const boss = source.replay.world.state.enemies().find((actor) => actor.isBoss),
      player = source.replay.world.state.player();
    const blade = source.replay.world.state.blade() as unknown as InstanceType<ReturnType<typeof createBlade>>;
    if (!boss || !player) throw new Error("Real boss missing");
    for (let hit = 0; hit < 150 && !boss.dead; hit++) {
      Object.assign(boss, { hitCd: 0, x: player.x + 80, y: player.y - 10 });
      Object.assign(blade, {
        state: "held",
        angle: 0,
        x: boss.x - 70,
        y: boss.y,
        tipX: boss.x + 70,
        tipY: boss.y,
        tipVX: 0,
        tipVY: -2200,
        tipSpeed: 2200,
        vx: 0,
        vy: -2200,
      });
      blade.swingId++;
      runLiveCollisionPhase(source.combat.collision, 1 / 120);
    }
    for (let tick = 1; tick <= 360 && !boss.dead; tick++) bossStep(source, tick);
    expect({ hp: boss.hp, dead: boss.dead, dying: boss.dying }).toMatchObject({ dead: true });
    bossStep(source, 1);
    expect(source.replay.tutorial.session()).toMatchObject({
      phase: "free-practice",
      bossPractice: { defeated: true },
    });
    const finished = restore(source);
    expect(finished.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
    expect(source.replay.tutorial.restart()).toBe(true);
    expect(finished.replay.tutorial.restart()).toBe(true);
    expect(finished.replay.tutorial.session().bossPractice?.runtime.generation).toBe(
      source.replay.tutorial.session().bossPractice?.runtime.generation,
    );
    expect(finished.replay.tutorial.session().bossPractice).toMatchObject({
      bossId: "colossus",
      phase: 3,
      defeated: false,
    });
    expect(
      finished.replay.tutorialOutward.some(
        (value) => value.startsWith("complete-course:") || value === "achievement-check",
      ),
    ).toBe(false);
  });

  it("continues a real Mender attempt from portable provenance, defeats it through collision and returns without course credit", () => {
    const controller = new TutorialController(CONFIG);
    expect(controller.openPractice(CONFIG.view.w, 1)).toBe(true);
    expect(
      controller.selectEnemy({ id: "mender", title: "MENDER", knowledge: "confirmed-defeated", canPractice: true }),
    ).toBe(true);
    const source = composition().create(undefined);
    source.replay.tutorial.restoreSession(controller.captureSession());
    source.simulation.advanceOne([]);
    source.simulation.advanceOne([]);
    const enemy = source.replay.world.state.enemies()[0],
      player = source.replay.world.state.player();
    if (!enemy || !player) throw new Error("real practice opponent missing");
    expect(enemy).toMatchObject({ kind: "support", supportType: "mender", dead: false });
    expect(enemy.tutDummy).not.toBe(true);
    const restored = restore(source);
    expect(restored.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
    // The destination has no profile/catalog. Captured selection remains playable.
    for (let tick = 0; tick < 20; tick++)
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    expect(restored.replay.tutorial.session().progress).toEqual([0, 1]);
    const blade = source.replay.world.state.blade() as unknown as InstanceType<ReturnType<typeof createBlade>>;
    const initialHp = enemy.hp;
    for (let hit = 0; hit < 30 && !enemy.dead; hit++) {
      Object.assign(enemy, { hitCd: 0, spawnT: 0, x: player.x + 80, y: player.y - 10 });
      Object.assign(blade, {
        state: "held",
        angle: 0,
        x: enemy.x - 70,
        y: enemy.y,
        tipX: enemy.x + 70,
        tipY: enemy.y,
        tipVX: 0,
        tipVY: -2200,
        tipSpeed: 2200,
        vx: 0,
        vy: -2200,
      });
      blade.swingId++;
      runLiveCollisionPhase(source.combat.collision, 1 / 120);
    }
    expect(enemy.hp).toBeLessThan(initialHp);
    expect(enemy.dead).toBe(true);
    source.simulation.advanceOne([]);
    expect(source.replay.tutorial.captureSession()).toMatchObject({
      version: 5,
      enemyPractice: { id: "mender", defeated: true },
    });
    const completed = restore(source);
    for (let tick = 0; tick < 150; tick++)
      expect(completed.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    expect(completed.replay.tutorial.session()).toMatchObject({ phase: "free-practice", practiceOnly: true });
    expect(completed.replay.tutorialOutward.some((intent) => intent.startsWith("complete-course:"))).toBe(false);
    expect(completed.replay.tutorial.restart()).toBe(true);
    completed.simulation.advanceOne([]);
    completed.simulation.advanceOne([]);
    expect(completed.replay.world.state.enemies()[0]).toMatchObject({ kind: "support", supportType: "mender" });
  });
  it.each(WEAPON_IDS)(
    "advances the %s annex through actual baseline weapon effects and continues its v4 bytes",
    (weaponId) => {
      const owner = createProductionGhostReplayComposition({
        seed: `annex-${weaponId}`,
        mode: "tutorial",
        weaponId,
        difficulty: "normal",
      });
      const source = owner.create(undefined),
        tutorial = source.replay.tutorial;
      expect(tutorial.openPractice(1)).toBe(true);
      expect(tutorial.selectAnnex(weaponId)).toBe(true);
      source.simulation.advanceOne([]); // The shared tutorial owner spawns its real baseline target.
      const enemy = source.replay.world.state.enemies()[0],
        player = source.replay.world.state.player();
      const blade = source.replay.world.state.blade() as unknown as InstanceType<ReturnType<typeof createBlade>>;
      if (!enemy || !player) throw new Error("annex production actors missing");
      const collision = () => {
        runLiveCollisionPhase(source.combat.collision, 1 / 120);
      };
      const heldContact = (verticalSpeed: number, airborne = false) => {
        Object.assign(player, { onGround: !airborne, vy: airborne ? 700 : 0 });
        Object.assign(enemy, { hitCd: 0, spawnT: 0, x: player.x + 90, y: player.y - 10 });
        Object.assign(blade, {
          state: "held",
          angle: 0,
          x: enemy.x - 70,
          y: enemy.y,
          tipX: enemy.x + 70,
          tipY: enemy.y,
          tipVX: 0,
          tipVY: verticalSpeed,
          tipSpeed: Math.abs(verticalSpeed),
          vx: 0,
          vy: verticalSpeed,
        });
        blade.swingId++;
        collision();
      };
      const throwContact = () => {
        Object.assign(enemy, { hitCd: 0, spawnT: 0 });
        Object.assign(blade, {
          state: "flying",
          x: enemy.x - 30,
          y: enemy.y,
          tipX: enemy.x,
          tipY: enemy.y,
          vx: 600,
          vy: 0,
          tipVX: 600,
          tipVY: 0,
          tipSpeed: 600,
          throwDmg: 20,
          impactResolved: false,
        });
        blade.throwId++;
        blade.pierced.clear();
        collision();
      };
      if (weaponId === "sword") {
        heldContact(2200);
        expect(tutorial.session().progress[0]).toBe(0); // A generic cut is not a Reversal.
        const reversal = blade.reversals[0];
        if (!reversal) throw new Error("first real cut did not arm Reversal");
        blade.tipX = reversal.x + CONFIG.weapons.sword.reversalExitRadius + 2;
        blade.tipY = reversal.y;
        blade._updateReversalState();
        heldContact(-2200);
        expect(tutorial.session().progress[0]).toBe(1); // Same contact's launch cannot satisfy the next step.
        heldContact(-2200);
      } else if (weaponId === "hammer") {
        heldContact(2200, true);
        expect(tutorial.session().progress[0]).toBe(1);
        for (let attempt = 0; attempt < 8 && tutorial.session().progress[0] < 2; attempt++) heldContact(2200, true);
        expect(source.replay.world.state.run()?.weaponStats.breakTriggers).toBeGreaterThan(0);
      } else if (weaponId === "greatsword") {
        heldContact(2200);
        expect(tutorial.session().progress[0]).toBe(1);
        throwContact();
      } else {
        throwContact();
        expect(tutorial.session().progress[0]).toBe(1);
        expect(blade.hookTarget).toBe(enemy);
        if (weaponId === "chainblade") {
          blade.aimX = CONFIG.weapons.chainblade.minRadius;
          blade.aimY = 0;
          blade._updateHookThrown(1 / 120, player, []);
          expect(blade._releaseHook(player as never)).toBe("recalled");
          expect(Math.hypot(enemy.vx, enemy.vy)).toBeGreaterThan(0);
        } else {
          blade.aimX = 1000;
          blade.aimY = 0;
          expect(blade._fireRazorRound(player as never)).toBe(true);
        }
        source.combat.opening.flushWeaponActions?.(blade.drainWeaponEvents());
        collision();
      }
      expect(tutorial.session().progress).toEqual([2, 2]);
      const saved = capture(source),
        restored = owner.create(JSON.parse(JSON.stringify(saved.snapshot)) as TearSnapshotV1);
      expect(tutorial.captureSession()).toMatchObject({
        version: 4,
        courseSessionId: "",
        completionAwarded: false,
        annex: { id: weaponId, weaponId, progress: 2, pendingEvidence: false },
      });
      expect(restored.replay.tutorial.captureSession()).toEqual(tutorial.captureSession());
      for (let tick = 0; tick < 150; tick++)
        expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
      expect(restored.replay.tutorial.session()).toMatchObject({
        phase: "free-practice",
        practiceOnly: true,
        annex: { id: weaponId, progress: 2 },
      });
      expect(restored.replay.tutorialOutward).toContain("awaiting-next-run");
      expect(restored.replay.tutorialOutward.some((intent) => intent.startsWith("complete-course:"))).toBe(false);
      const incompatible = structuredClone(saved.snapshot);
      const runtime = (incompatible.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<
        string,
        unknown
      >;
      const session = runtime.tutorialSession as Record<string, unknown>;
      session.annex = {
        id: weaponId === "sword" ? "hammer" : "sword",
        weaponId: weaponId === "sword" ? "hammer" : "sword",
        progress: 2,
        pendingEvidence: false,
      };
      expect(() => owner.create(incompatible)).toThrow(/annex weapon/);
    },
  );
  it("continues explicit practice provenance and real movement from bytes without manufacturing a course receipt", () => {
    const source = composition().create(undefined);
    expect(source.replay.tutorial.openPractice(1)).toBe(true);
    expect(source.replay.tutorial.selectLesson("move")).toBe(true);
    const restored = restore(source);
    expect(restored.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
    for (let tick = 1; tick <= 120; tick++) {
      const actions =
        tick === 1
          ? [{ kind: "command" as const, id: 1, tick, command: { type: "move" as const, x: -1000, y: 0 } }]
          : [];
      expect(restored.simulation.advanceOne(actions).state).toEqual(source.simulation.advanceOne(actions).state);
    }
    expect(restored.replay.tutorial.n.moveL).toBeGreaterThan(0);
    expect(restored.replay.tutorial.captureSession()).toMatchObject({
      version: 3,
      completionAwarded: false,
      courseSessionId: "",
      practiceOrigin: { kind: "durable-profile-completion", tutorialDone: 1 },
    });
    expect(restored.replay.tutorialOutward.some((intent) => intent.startsWith("complete-course:"))).toBe(false);
  });
  it("restores the inter-wave breath and the installed mixed encounter through the same production owner", () => {
    const source = composition().create(undefined);
    boundary(source, {
      lessonId: "field-test",
      reached: [...TUTORIAL_LESSON_IDS.slice(0, 13)],
      completed: [...TUTORIAL_LESSON_IDS.slice(0, 12)],
      fieldEncounter: "breath",
      interWaveRemaining: 2 / 120,
    });
    const restored = restore(source);
    expect(restored.replay.world.state.enemies()).toHaveLength(0);
    for (let tick = 0; tick < 4; tick++) {
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    }
    expect(restored.replay.tutorial.captureSession()).toMatchObject({
      version: 2,
      curriculumVersion: 2,
      fieldEncounter: "mixed",
      interWaveRemaining: 0,
    });
    expect(restored.replay.world.state.enemies().map((enemy) => [enemy.kind, enemy.tutDummy === true])).toEqual([
      ["charger", true],
      ["ranged", false],
    ]);
    const mixed = restore(source);
    expect(mixed.replay.world.state.enemies()).toHaveLength(2);
    for (let tick = 0; tick < 180; tick++) {
      expect(mixed.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    }
    expect(mixed.replay.tutorial.n.launch ?? 0).toBe(0);
    expect(mixed.replay.tutorial.doneT).toBe(0);
  });
  it.skipIf(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE === undefined)(
    "matches an explicitly supplied actual live Field Test trace through READY",
    () => {
      const path = process.env.TEAR_TUTORIAL_CONTINUATION_TRACE;
      if (path === undefined) throw new Error("actual live tutorial trace path is required");
      const trace = JSON.parse(readFileSync(path, "utf8")) as ProductionC27ATrace;
      expect(trace.originInput).toBeDefined();
      expect(trace.hashes.length).toBeGreaterThan(0);
      const replay = replayProductionC27ATrace(trace);
      const divergence = firstProductionC27AHashDivergence(trace, replay);
      if (divergence !== null) {
        expect(
          replay.hashes.find((entry) => entry.tick === divergence.tick)?.state,
          `first divergent canonical fields at tick ${String(divergence.tick)}`,
        ).toEqual(trace.hashes.find((entry) => entry.tick === divergence.tick)?.state);
      }
      expect(divergence).toBeNull();
    },
  );
  it("continues lesson delay into the next real arena without reinstalling the retained arena, and excludes display state", () => {
    const source = composition().create(undefined);
    boundary(source, { counters: { moveL: 60, moveR: 60 }, completed: ["move"], completionDelay: 0.02 });
    source.replay.stage.platforms.push({ x: 99, y: 200, w: 123, h: 24, oneway: true });
    const restored = restore(source),
      retained = structuredClone(source.replay.stage.platforms);
    expect(restored.replay.stage.platforms).toEqual(retained);
    expect(restored.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
    const beforeDisplay = stableVerificationHash(source.semanticProjection());
    source.replay.tutorial.showHelp();
    source.replay.tutorial.restorePresentation({
      version: 1,
      ghostTime: 91,
      anchorX: 4,
      evidencePulse: true,
      coachIdle: 3,
      coachDemoTime: 2,
      helpVisible: true,
    });
    expect(stableVerificationHash(source.semanticProjection())).toBe(beforeDisplay);
    for (let tick = 1; tick <= 4; tick += 1) {
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
      if (tick < 3) expect(restored.replay.stage.platforms).toEqual(retained);
    }
    expect(restored.replay.tutorial.session()).toMatchObject({ lessonId: "jump", phase: "course" });
    expect(restored.replay.stage.platforms).toEqual(
      createTutorialArena("vertical-gate", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY),
    );
    expect(restored.replay.world.lifecycle.phase).toBe("training-active");
    const ordinary = createProductionGhostReplayComposition({ seed: "ordinary-unchanged" }).create(undefined);
    const state = ordinary.semanticProjection();
    expect(state).not.toHaveProperty("tutorial");
    expect(
      projectCanonicalGameplayState(
        state.tick,
        state.input,
        ordinary.replay.world.state.run(),
        ordinary.replay.world.state.player() as never,
        ordinary.replay.world.state.blade() as never,
        [],
        ordinary.replay.world.context.environment.snapshot(),
      ),
    ).toEqual(state);
  });

  it("resumes an installed mid-encounter recovery window and receives real collision marks through the live tutorial owner", () => {
    const source = composition().create(undefined);
    boundary(source, {
      version: 1,
      lessonId: "field-test",
      reached: [...TUTORIAL_LESSON_IDS.slice(0, 13)],
      completed: [...TUTORIAL_LESSON_IDS.slice(0, 12)],
      counters: { evade: 1, strike: 0, punish: 0 },
      chargeRecoveryWindow: 0.7,
      chargeCommitAwayX: -1,
      previousPlayerX: source.replay.world.state.player()?.x ?? null,
    });
    source.replay.stage.platforms = createTutorialArena(
      "field-floor",
      CONFIG.view.w,
      CONFIG.view.h,
      CONFIG.world.groundY,
    );
    const enemy = source.waveReward.spawnTutorial("charger", 2);
    const player = source.replay.world.state.player();
    if (player === undefined) throw new Error("fixture player missing");
    // Construct a real coach in the held blade's sweep, with retained recovery evidence.
    Object.assign(enemy, {
      x: player.x + 45,
      y: player.y - 25,
      hp: 1000,
      maxHp: 1000,
      contactDmg: 0,
      atk: "recover",
      stun: 10,
    });
    const restored = restore(source);
    const before = restored.replay.tutorial.captureSession();
    expect(before).toMatchObject({
      courseSessionId: "retained-issued-course",
      chargeRecoveryWindow: 0.7,
      counters: { evade: 1, punish: 0 },
    });
    for (let tick = 1; tick <= 30 && (source.replay.tutorial.n.punish ?? 0) === 0; tick += 1) {
      const actions =
        tick === 1
          ? [
              { kind: "command" as const, id: 1, tick, command: { type: "aim" as const, turn: 0, magnitude: 1000 } },
              {
                kind: "command" as const,
                id: 2,
                tick,
                command: { type: "weapon" as const, intent: "primary" as const, phase: "pressed" as const },
              },
            ]
          : [];
      expect(restored.simulation.advanceOne(actions).state).toEqual(source.simulation.advanceOne(actions).state);
    }
    // Since edaab0fe replay routes weapon logging through the shared native
    // weapon runtime instead of a test-only "logWeapon:*" outward marker, so the
    // held hit is witnessed by its weapon hook and the run's native counter.
    expect(source.combat.outward).toContain("weaponHit");
    const heldHits = (composed: typeof source) =>
      (composed.replay.world.state.run() as { weaponStats: { heldHits: number } } | null)?.weaponStats.heldHits;
    expect(heldHits(source)).toBeGreaterThanOrEqual(1);
    expect(heldHits(restored)).toBe(heldHits(source));
    expect(source.replay.world.state.enemies()[0]?.hp).toBeLessThan(1000);
    expect(restored.replay.tutorial.captureSession()).toMatchObject({
      counters: { strike: 1, punish: 1 },
      completionDelay: 1.1,
    });
    expect(restored.replay.stage.platforms).toEqual(source.replay.stage.platforms);
    const missing = structuredClone(capture(source).snapshot);
    const runtime = (missing.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<string, unknown>;
    delete runtime.tutorialSession;
    expect(() => composition().create(missing)).toThrow(/requires retained tutorial behavior/);
  });

  it("finishes READY once without persistence, then awaits a supplied next episode before initializing paused normal baseline practice", () => {
    const source = composition().create(undefined);
    boundary(source, {
      lessonId: "ready",
      reached: [...TUTORIAL_LESSON_IDS],
      completed: [...TUTORIAL_LESSON_IDS.slice(0, -1)],
      endingTime: 1.59,
    });
    const captured = capture(source),
      environment = createProductionHeadlessEnvironment();
    environment.reset(scenario);
    const initial = environment.captureCheckpoint();
    const value = {
      ...initial,
      snapshot: captured.snapshot,
      input: { ...captured.input, aimMagnitude: captured.input.aimMagnitude ?? 1000 },
      checkpoint: { ...initial.checkpoint, semanticHash: captured.semanticHash },
    };
    const delivery = { nextSequence: value.delivery.nextSequence, pendingEvents: value.delivery.pendingEvents };
    const checkpoint: ProductionHeadlessCheckpoint = {
      ...value,
      delivery: { ...delivery, hash: stableVerificationHash({ ...value, delivery }) },
    };
    environment.restoreCheckpoint(checkpoint);
    environment.step([]);
    const completed = environment.step([]);
    expect(completed.terminated).toBe(true);
    expect(completed.truncated).toBe(false);
    expect(completed.artifact).toMatchObject({ format: "tearbench-production-tutorial-handoff" });
    expect((completed.artifact as ProductionTutorialHandoffArtifact).tutorialHandoff).toEqual({
      status: "awaiting-next-run",
      courseSessionId: "retained-issued-course",
    });
    expect(completed.events?.some((event) => event.type === "run.completed")).toBe(false);
    const saved = environment.captureCheckpoint();
    expect((saved.snapshot.state["tear.world.v1"] as Record<string, unknown>).runtime).toMatchObject({
      lifecycle: { phase: "training-active", outcome: null },
      tutorialSession: {
        phase: "free-practice",
        active: false,
        completionAwarded: true,
        courseSessionId: "retained-issued-course",
      },
    });
    expect(() => environment.step([])).toThrow(/awaiting/);
    expect(() =>
      environment.continueTutorialPractice({
        ...scenario,
        seed: "future-invalid",
        start: { mode: "playground", difficulty: "hard", weapon: "sword" },
      }),
    ).toThrow(/normal/);
    expect(environment.captureCheckpoint()).toEqual(saved);
    const practiceState = environment.continueTutorialPractice({
      ...scenario,
      id: "external-practice",
      seed: "fresh-host-supplied-practice",
      start: { mode: "playground", difficulty: "normal", weapon: "sword" },
    });
    expect(practiceState).not.toHaveProperty("tutorial");
    const practice = environment.captureCheckpoint();
    expect(practice.snapshot.state["tear.run.v1"]).toMatchObject({
      mode: "playground",
      difficulty: "normal",
      wave: 1,
      mods: { owned: {}, tier: {} },
    });
    expect(practice.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "paused" });
    expect((practice.snapshot.state["tear.world.v1"] as Record<string, unknown>).runtime).toMatchObject({
      tutorialSession: {
        courseSessionId: "retained-issued-course",
        phase: "free-practice",
        completionAwarded: true,
      },
    });
    expect(() => environment.step([])).toThrow(/paused/);
    expect(environment.step([{ type: "pause" }]).observation.tick).toBe(1);
    expect(environment.tutorialHandoff()).toBeNull();
    // Detached completion reaches the same source guard and exposes only nonpersistent intent.
    source.simulation.advanceOne([]);
    source.simulation.advanceOne([]);
    source.replay.tutorial.update(1);
    expect(
      source.replay.tutorialOutward.filter((intent) => intent === "complete-course:retained-issued-course"),
    ).toHaveLength(1);
    environment.dispose();
  });
});
