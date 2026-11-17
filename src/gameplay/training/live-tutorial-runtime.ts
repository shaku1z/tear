import type { TutorialAttemptFact } from "./tutorial-failure-coach";
import type {
  BossPracticeCandidate,
  BossPracticePort,
  PracticeBossEntry,
  PracticeBossState,
} from "./practice-boss-catalog";
import { TutorialGhostCoach, shippingTutorialGold, type TutorialCoachCheckpoint } from "./tutorial-ghost-coach";
import { stableVerificationHash } from "../../domain/hash";
import type { TutorialGoldFrame } from "./tutorial-gold-reference";
import type { AuthoritativeInputSnapshot } from "../runtime/authoritative-input";
import type { GameAction } from "../../input/game-action";
import {
  TUTORIAL_LESSONS,
  TutorialController,
  type TutorialGhostSnapshot,
  type TutorialLesson,
  type TutorialMark,
  type TutorialSessionView,
  parseTutorialSessionCheckpoint,
} from "./tutorial-controller";
import { tutorialArenaDefinition, type TutorialArenaId } from "./tutorial-arenas";
import type { CONFIG as GameConfiguration } from "../../config/game-config";
import type { createPlayer } from "../entities/player";
import type { createBlade } from "../entities/blade";
import type { EnemyKind } from "../run/content-director";
import { practiceEnemyIdentity, type PracticeEnemyEntry } from "./practice-enemy-catalog";

type TrainingPlayer = Pick<
  InstanceType<ReturnType<typeof createPlayer>>,
  "x" | "y" | "vx" | "vy" | "onGround" | "hp" | "maxHp" | "hh" | "maxDashCharges"
>;
type TrainingBlade = Pick<
  InstanceType<ReturnType<typeof createBlade>>,
  | "state"
  | "x"
  | "y"
  | "vx"
  | "vy"
  | "flyTime"
  | "throwOrigin"
  | "pierced"
  | "trail"
  | "curLength"
  | "threadcutRoute"
  | "_repeatHits"
  | "reversals"
  | "chainPoints"
  | "chainPrevious"
  | "slingCollided"
  | "resetRiftlock"
>;

/** The same actor reset at a real lesson transition in either host; hydration never calls it. */
export function resetTutorialActors(
  config: typeof GameConfiguration,
  width: number,
  actor: TrainingPlayer,
  blade: TrainingBlade | undefined,
): void {
  actor.x = width * 0.2;
  actor.y = config.world.groundY - actor.hh;
  actor.vx = 0;
  actor.vy = 0;
  actor.onGround = true;
  actor.hp = actor.maxHp;
  Object.assign(actor, {
    coyote: 0,
    jumpBuf: 0,
    dashTimer: 0,
    dashCd: 0,
    dashX: 0,
    dashY: 0,
    dashCharges: actor.maxDashCharges,
    dashEndT: 0,
    afterimageT: 0,
    downBufferT: 0,
    airTime: 0,
    _wasGround: true,
    iframe: 0,
    rootT: 0,
    hazardT: 0,
    voidSlowT: 0,
    voidTransferT: 0,
    voidLane: null,
    supportPlatform: null,
    rallyT: 0,
    rallyPool: 0,
    rallySource: null,
    tookHit: false,
  });
  if (blade === undefined) return;
  const handX = actor.x + config.blade.handOffsetX,
    handY = actor.y + config.blade.handOffsetY;
  blade.state = "held";
  blade.x = handX;
  blade.y = handY;
  blade.vx = 0;
  blade.vy = 0;
  blade.flyTime = 0;
  blade.throwOrigin = null;
  blade.pierced.clear();
  blade.trail.length = 0;
  Object.assign(blade, {
    angle: -Math.PI / 2,
    aimX: 0,
    aimY: -config.blade.aimRadius,
    tipX: handX,
    tipY: handY - blade.curLength,
    prevTipX: handX,
    prevTipY: handY - blade.curLength,
    reticleX: handX,
    reticleY: handY - config.blade.aimRadius,
    tipVX: 0,
    tipVY: 0,
    tipSpeed: 0,
    glowV: 0,
    tetherFactor: 1,
    throwDmg: 0,
    throwBaseDmg: 0,
    embeddedNew: false,
    caughtNew: false,
    throwResolved: false,
    impactResolved: false,
    secondaryActive: false,
    secondaryQueued: false,
    secondaryStartedNew: false,
    hookTarget: null,
    threadcutIndex: -1,
    linkT: 0,
    linkBrokenNew: false,
    tension: 0,
    _lastHand: null,
    hostile: false,
    stolenBy: null,
    wheelSpin: 0,
    looseCannonT: 0,
    slingRadius: 0,
    slingAngle: 0,
    slingAngularVelocity: 0,
    swingActive: false,
    slingWorldCooldown: 0,
  });
  blade.threadcutRoute.length = 0;
  blade._repeatHits.clear();
  blade.reversals.length = 0;
  blade.chainPoints.length = 0;
  blade.chainPrevious.length = 0;
  blade.slingCollided?.clear();
  for (const key of [
    "aimOverride",
    "lmbOverride",
    "impactVX",
    "impactVY",
    "redirectSpent",
    "releaseVX",
    "releaseVY",
    "retraceDone",
    "retraceReturn",
  ])
    Reflect.deleteProperty(blade, key);
  blade.resetRiftlock();
}

export function recoverTutorialBlade(
  config: typeof GameConfiguration,
  actor: Pick<TrainingPlayer, "x" | "y">,
  blade: TrainingBlade | undefined,
): void {
  if (blade === undefined) return;
  blade.state = "held";
  blade.x = actor.x + config.blade.handOffsetX;
  blade.y = actor.y + config.blade.handOffsetY;
  blade.vx = 0;
  blade.vy = 0;
  blade.flyTime = 0;
  blade.throwOrigin = null;
  blade.pierced.clear();
  blade.trail.length = 0;
}

export interface LiveTutorialEnemy {
  readonly kind: string;
  readonly supportType?: string;
  dead?: boolean;
  tutDummy?: boolean;
  hp: number;
  maxHp: number;
  stun: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  onGround?: boolean;
  hitCd?: number;
  hh: number;
  affixCount?: number;
  contactDmg: number;
  atk?: string;
}

export interface LiveTutorialPlayer {
  readonly onGround: boolean;
  readonly vy: number;
  readonly dashTimer: number;
  readonly dashX?: number;
  readonly dashY?: number;
  readonly x: number;
  readonly facing: number;
}

export interface LiveTutorialPort<TEnemy extends LiveTutorialEnemy> {
  readonly config: typeof GameConfiguration;
  readonly viewportWidth: number;
  readonly groundY: () => number;
  readonly skipPressed: () => boolean;
  readonly movingLeft: () => boolean;
  readonly movingRight: () => boolean;
  readonly player: () => LiveTutorialPlayer;
  readonly bladeState: () => string;
  readonly bladeTipVY?: () => number;
  readonly weaponId?: () => string;
  readonly bossCatalog?: () => readonly PracticeBossEntry[];
  readonly enemyCatalog?: () => readonly PracticeEnemyEntry[];
  readonly enemies: () => TEnemy[];
  readonly playSound: (cue: "rankup" | "ui") => void;
  readonly spawn: (kind: EnemyKind, hpScale: number) => TEnemy;
  readonly installArena: (arena: TutorialArenaId) => void;
  /** Clear task-local enemies/projectiles and return the player/blade to a safe start. */
  readonly resetTrainingSpace: () => void;
  readonly recoverBlade?: () => void;
  /** Starts the separate no-wave practice run after the curriculum completes. */
  readonly beginPractice: () => void;
  readonly finishBossPractice?: () => void;
  readonly terminateRun: (reason: "quit") => void;
  readonly navigate: (screen: "menu") => void;
  readonly releasePointer: () => void;
  readonly addProfileStat: (stat: "tutorialDone", amount: 1) => void;
  readonly completeCourse?: (id: string) => Promise<unknown>;
  readonly checkAchievements: () => void;
  readonly drawGhost: (snapshot: TutorialGhostSnapshot) => void;
  readonly reducedMotion?: () => boolean;
}

export interface LiveTutorialLessonView {
  readonly t: string;
  readonly d: string;
  readonly keys: readonly string[];
  readonly need: number | undefined;
  readonly ranged: boolean | undefined;
  readonly final: boolean | undefined;
  readonly arena: TutorialArenaId;
  readonly arenaLabel: string;
  readonly teachingFocus: "movement" | "blade" | "momentum" | "counterplay" | "enemy" | "encounter" | "ready";
  readonly prog: () => readonly [number, number];
  readonly ok: () => boolean;
}

export interface LiveTutorialRuntime {
  openPractice(tutorialDone: number): boolean;
  session(): TutorialSessionView;
  /**
   * The field encounter a post-step coach frame is captured for, or undefined when none is observed (inactive with the
   * coach hidden, or an annex, enemy or boss drill). The same gate and value `session()` and `captureSession()` give.
   */
  coachFrameEncounter(): "charger" | "breath" | "mixed" | undefined;
  restart(): boolean;
  selectLesson(id: string): boolean;
  selectAnnex(id: string): boolean;
  selectEnemy(id: string): boolean;
  showCatalog(): void;
  showBosses(): void;
  selectBoss(id: string, retained?: PracticeBossState): boolean;
  bindBossPractice(port: BossPracticePort): void;
  afterWorldStep(frame?: TutorialGoldFrame, input?: AuthoritativeInputSnapshot): void;
  showAnnexes(): void;
  interruptCoaching(): void;
  observeAttemptFact(fact: TutorialAttemptFact): void;
  advanceUnfinished(assisted?: boolean): boolean;
  coachAction(command: "rate" | "compare" | "diagnostic"): boolean;
  captureCoachCommands(commands: readonly GameAction[]): void;
  weaponEffect(weaponId: string, effect: string): void;
  showHelp(): void;
  demonstrate(): boolean;
  captureSession(): ReturnType<TutorialController["captureSession"]> | undefined;
  validateSession(
    value: unknown,
    candidateWeaponId?: string,
    candidateEnemies?: readonly LiveTutorialEnemy[],
    bossCandidate?: BossPracticeCandidate,
  ): void;
  restoreSession(value: unknown): void;
  capturePresentation(): ReturnType<TutorialController["capturePresentation"]> & {
    readonly goldCoach?: TutorialCoachCheckpoint;
  };
  restorePresentation(value: ReturnType<LiveTutorialRuntime["capturePresentation"]> | undefined): void;
  readonly preparingBoss: boolean;
  readonly active: boolean;
  readonly idx: number;
  readonly doneT: number;
  readonly endT: number;
  readonly n: Readonly<Partial<Record<TutorialMark, number>>>;
  readonly gT: number;
  readonly anchor: number;
  readonly steps: readonly TutorialLesson[];
  start(courseSessionId?: string): void;
  stop(): void;
  mark(kind: TutorialMark): void;
  step(): LiveTutorialLessonView;
  drawGhost(): void;
  update(dt: number): void;
}

/** Complete tutorial adapter: state, intent execution and ghost presentation stay behind one boundary. */
export function createLiveTutorialRuntime<TEnemy extends LiveTutorialEnemy>(
  port: LiveTutorialPort<TEnemy>,
): LiveTutorialRuntime {
  let bossPort: BossPracticePort | undefined;
  const controller = new TutorialController(port.config);
  const coach = new TutorialGhostCoach(() => {
    const corpus = shippingTutorialGold();
    return corpus?.compatibility.configurationHash === stableVerificationHash(port.config) ? corpus : undefined;
  }, port.config.blade.minHitSpeed);
  const emptyGhost: TutorialGhostSnapshot = {
    visible: false,
    demonstrating: false,
    lesson: "",
    time: 0,
    actor: { x: 0, y: 0, facing: 1, dashAfterimages: [] },
    target: { visible: false, x: 0, y: 0, hit: false },
    blade: { x: 0, y: 0, angle: 0, swinging: false, thrown: false, hit: false },
    shot: { visible: false, x: 0, y: 0, deflected: false },
  };
  // Runs every authoritative tick, so it reads the narrow selection instead of building the session view and checkpoint.
  const syncCoach = () => {
    const { lessonId, curriculumVersion, phase, drill, encounter } = controller.coachSelection();
    coach.select(lessonId, curriculumVersion, phase !== "inactive" && !drill, encounter);
  };
  const coachView = () => {
    syncCoach();
    const view = coach.view(controller.coachSelection().practiceOnly, port.reducedMotion?.() === true);
    return view.adaptive && controller.step().complete(controller.counters)
      ? { ...view, adaptive: { ...view.adaptive, nudge: undefined, assistOffered: false } }
      : view;
  };
  const installPendingArena = (): void => {
    const arena = controller.consumePendingArena();
    if (arena !== null) {
      port.resetTrainingSpace();
      port.installArena(arena);
    }
  };
  const lessonView = (): LiveTutorialLessonView => {
    const lesson = controller.step(),
      nudge = coachView().adaptive?.nudge;
    return {
      t: lesson.title,
      d: nudge ?? lesson.instruction?.(controller.counters) ?? lesson.description,
      keys: lesson.keys,
      need: lesson.dummyCount,
      ranged: lesson.ranged,
      final: lesson.final,
      arena: lesson.arena ?? "runway",
      arenaLabel: tutorialArenaDefinition(lesson.arena ?? "runway").label,
      teachingFocus: lesson.teachingFocus ?? "movement",
      prog: () => lesson.progress(controller.counters),
      ok: () => lesson.complete(controller.counters),
    };
  };
  return {
    openPractice: (tutorialDone) => {
      const changed = controller.openPractice(port.viewportWidth, tutorialDone);
      if (changed) {
        coach.clear();
        bossPort?.restore(undefined);
      }
      return changed;
    },
    coachFrameEncounter: () => {
      syncCoach();
      const selection = controller.coachSelection();
      if ((!controller.active && !coach.showing) || selection.drill) return undefined;
      return selection.phase === "inactive" ? "charger" : selection.encounter;
    },
    session: () => {
      const session = { ...controller.session(), coach: coachView() };
      return session.practiceOnly
        ? { ...session, enemyCatalog: port.enemyCatalog?.() ?? [], bossCatalog: port.bossCatalog?.() ?? [] }
        : session;
    },
    bindBossPractice: (value) => {
      bossPort = value;
    },
    afterWorldStep: (frame, input) => {
      syncCoach();
      const selection = controller.coachSelection();
      if (frame && input) {
        const lesson = controller.step();
        coach.observe(
          frame,
          input,
          lesson.complete(controller.counters),
          controller.active,
          lesson.progress(controller.counters)[0],
          selection.curriculumVersion !== 1,
        );
      }
      const saved = selection.bossPractice;
      if (!saved || saved.defeated) return;
      const next = bossPort?.afterWorldStep();
      if (next) {
        controller.syncBoss({ ...saved, ...next });
        if (next.defeated) port.finishBossPractice?.();
      }
    },
    selectBoss: (id, retained) => {
      const entry =
        retained && id === `${retained.bossId}:${String(retained.phase)}`
          ? { ...retained, id, title: retained.bossId, canPractice: true }
          : port.bossCatalog?.().find((boss) => boss.id === id);
      if (!entry?.canPractice || !bossPort || !controller.session().practiceOnly) return false;
      port.resetTrainingSpace();
      return controller.selectBoss(entry, bossPort.begin(entry));
    },
    showBosses: () => {
      controller.showBosses();
    },
    restart: () => {
      const selected = controller.session().bossPractice;
      if (selected && bossPort) {
        port.resetTrainingSpace();
        return controller.selectBoss(
          {
            ...selected,
            id: `${selected.bossId}:${String(selected.phase)}`,
            title: selected.bossId,
            canPractice: true,
          },
          bossPort.begin(selected),
        );
      }
      const changed = controller.restart();
      coach.restart();
      if (changed) installPendingArena();
      return changed;
    },
    selectLesson: (id) => {
      const changed = controller.selectLesson(id);
      if (changed) {
        syncCoach();
        coach.restart();
        installPendingArena();
      }
      return changed;
    },
    selectAnnex: (id) => {
      const changed = controller.selectAnnex(id);
      if (changed) installPendingArena();
      return changed;
    },
    selectEnemy: (id) => {
      const entry = port.enemyCatalog?.().find((enemy) => enemy.id === id);
      const changed = entry !== undefined && controller.selectEnemy(entry);
      if (changed) installPendingArena();
      return changed;
    },
    interruptCoaching: () => {
      coach.abortFailures();
    },
    observeAttemptFact: (fact) => {
      coach.observeFact(fact);
    },
    advanceUnfinished: (assisted = false) => {
      if (assisted && !coachView().adaptive?.assistOffered) return false;
      const changed = controller.advanceUnfinished();
      if (changed) {
        syncCoach();
        coach.restart();
        installPendingArena();
        if (!controller.active) {
          port.releasePointer();
          port.beginPractice();
        }
      }
      return changed;
    },
    showCatalog: () => {
      controller.showCatalog();
    },
    showAnnexes: () => {
      controller.showAnnexes();
    },
    weaponEffect: (weaponId, effect) => {
      controller.weaponEffect(weaponId, effect);
    },
    showHelp: () => {
      coach.abortFailures();
      controller.showHelp();
      if (controller.session().helpVisible) {
        syncCoach();
        coach.play("diagnostic");
      }
    },
    demonstrate: () => {
      syncCoach();
      return coach.play("preview");
    },
    coachAction(command) {
      syncCoach();
      if (command === "rate") {
        coach.setRate(coachView().rate === 1 ? 0.5 : 1);
        return false;
      }
      return coach.play(command === "compare" ? "comparison" : "diagnostic");
    },
    captureCoachCommands: (commands) => {
      syncCoach();
      coach.captureCommands(commands);
    },
    captureSession: () => {
      if (controller.session().phase === "inactive") return undefined;
      if (controller.session().bossPractice && !controller.session().bossPractice?.defeated) bossPort?.capture();
      return controller.captureSession();
    },
    validateSession: (value, candidateWeaponId, candidateEnemies, bossCandidate) => {
      const data = parseTutorialSessionCheckpoint(value);
      if (data?.version === 6) {
        if (!bossPort) throw new Error("Boss practice host unavailable");
        bossPort.validate(data.bossPractice, bossCandidate);
      }
      const weaponId = candidateWeaponId ?? port.weaponId?.();
      if (data?.version === 4 && weaponId !== undefined && data.annex.weaponId !== weaponId)
        throw new RangeError("Tutorial annex weapon does not match its world");
      if (data?.version === 5 && weaponId !== undefined && weaponId !== "sword")
        throw new RangeError("Practice enemy requires its baseline Sword world");
      if (data?.version === 5 && candidateEnemies !== undefined) {
        const living = candidateEnemies.filter((enemy) => !enemy.dead);
        const expected = data.enemyPractice.spawned && !data.enemyPractice.defeated ? 1 : 0;
        if (
          living.length !== expected ||
          living.some((enemy) => enemy.tutDummy === true || practiceEnemyIdentity(enemy) !== data.enemyPractice.id)
        )
          throw new RangeError("Practice enemy actors do not match the retained attempt");
      }
    },
    restoreSession: (value) => {
      const data = parseTutorialSessionCheckpoint(value);
      if (data?.version === 4 && port.weaponId !== undefined && data.annex.weaponId !== port.weaponId())
        throw new RangeError("Tutorial annex weapon does not match its world");
      if (data?.version === 5 && port.weaponId !== undefined && port.weaponId() !== "sword")
        throw new RangeError("Practice enemy requires its baseline Sword world");
      coach.clear();
      controller.restoreSession(data);
      bossPort?.restore(data?.version === 6 ? data.bossPractice : undefined);
    },
    capturePresentation: () => {
      syncCoach();
      const goldCoach = coach.capture();
      return { ...controller.capturePresentation(), ...(goldCoach ? { goldCoach } : {}) };
    },
    restorePresentation: (value) => {
      controller.restorePresentation(value);
      syncCoach();
      coach.restore(value?.goldCoach);
    },
    get preparingBoss() {
      const selected = controller.coachSelection().bossPractice;
      return selected !== undefined && !selected.defeated && selected.runtime.enteredPhase < selected.phase;
    },
    get active() {
      return controller.active;
    },
    get idx() {
      return controller.lessonIndex;
    },
    get doneT() {
      return controller.completionDelay;
    },
    get endT() {
      return controller.endingTime;
    },
    get n() {
      return controller.counters;
    },
    get gT() {
      return controller.ghostTime;
    },
    get anchor() {
      return controller.anchorX;
    },
    steps: TUTORIAL_LESSONS,
    start(courseSessionId = "unissued") {
      coach.clear();
      controller.start(port.viewportWidth, courseSessionId);
      installPendingArena();
    },
    stop() {
      if (controller.session().bossPractice) bossPort?.cancel();
      controller.stop();
      coach.clear();
    },
    mark(kind) {
      controller.mark(kind);
    },
    step: lessonView,
    drawGhost() {
      const gold = coach.display(controller.coachSelection().practiceOnly, port.reducedMotion?.() === true);
      if (gold) port.drawGhost({ ...emptyGhost, visible: true, gold });
    },
    update(dt) {
      const enemies = port.enemies();
      const intents = controller.update({
        dt,
        skipPressed: port.skipPressed(),
        movingLeft: port.movingLeft(),
        movingRight: port.movingRight(),
        player: port.player(),
        bladeState: port.bladeState(),
        bladeTipVY: port.bladeTipVY?.() ?? 0,
        viewportWidth: port.viewportWidth,
        enemies: enemies.map((enemy, index) => ({
          id: String(index),
          kind: practiceEnemyIdentity(enemy) ?? enemy.kind,
          dead: enemy.dead === true,
          tutorialDummy: enemy.tutDummy === true,
          hp: enemy.hp,
          maxHp: enemy.maxHp,
          x: enemy.x,
          y: enemy.y,
          ...(enemy.atk === undefined ? {} : { attack: enemy.atk }),
        })),
      });
      for (const intent of intents) {
        switch (intent.type) {
          case "sound":
            port.playSound(intent.cue);
            break;
          case "install-arena":
            port.installArena(intent.arena);
            break;
          case "reset-training-space":
            port.resetTrainingSpace();
            break;
          case "recover-blade":
            port.recoverBlade?.();
            break;
          case "begin-practice":
            port.beginPractice();
            break;
          case "spawn": {
            const enemy = port.spawn(intent.kind, intent.hpScale);
            if (intent.role === "dummy") {
              enemy.tutDummy = true;
              enemy.affixCount = 0;
              enemy.contactDmg = 0;
              if (intent.x !== undefined) enemy.x = intent.x;
              enemy.y = port.groundY() - enemy.hh;
            }
            if (intent.role === "coach") {
              enemy.tutDummy = false;
              enemy.affixCount = 0;
              enemy.contactDmg = 0;
              if (intent.x !== undefined) enemy.x = intent.x;
              enemy.y = port.groundY() - enemy.hh;
            }
            if (intent.role === "shooter") enemy.contactDmg = 0;
            break;
          }
          case "stabilize-dummy": {
            const enemy = enemies[Number(intent.enemyId)];
            if (enemy !== undefined) {
              enemy.stun = Math.max(enemy.stun, intent.minimumStun);
              if (enemy.hp < intent.healBelow) enemy.hp = enemy.maxHp;
            }
            break;
          }
          case "reset-dummy": {
            const enemy = enemies[Number(intent.enemyId)];
            if (enemy !== undefined) {
              enemy.x = intent.x;
              enemy.y = port.groundY() - enemy.hh;
              enemy.vx = 0;
              enemy.vy = 0;
              enemy.onGround = true;
              enemy.hitCd = 0;
              enemy.stun = Math.max(enemy.stun, 1);
              enemy.hp = enemy.maxHp;
            }
            break;
          }
          case "terminate-run":
            port.terminateRun(intent.reason);
            break;
          case "navigate":
            port.navigate(intent.screen);
            break;
          case "release-pointer":
            port.releasePointer();
            break;
          case "complete-course":
            void port.completeCourse?.(intent.courseSessionId);
            break;
          case "achievement-check":
            port.checkAchievements();
            break;
        }
      }
      installPendingArena();
    },
  };
}
