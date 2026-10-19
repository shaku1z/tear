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

type TrainingPlayer = Pick<InstanceType<ReturnType<typeof createPlayer>>, "x" | "y" | "vx" | "vy" | "onGround" | "hp" | "maxHp" | "hh" | "maxDashCharges">;
type TrainingBlade = Pick<InstanceType<ReturnType<typeof createBlade>>, "state" | "x" | "y" | "vx" | "vy" | "flyTime" | "throwOrigin" | "pierced" | "trail" | "curLength" | "threadcutRoute" | "_repeatHits" | "reversals" | "chainPoints" | "chainPrevious" | "slingCollided" | "resetRiftlock">;

/** The same actor reset at a real lesson transition in either host; hydration never calls it. */
export function resetTutorialActors(config: typeof GameConfiguration, width: number, actor: TrainingPlayer, blade: TrainingBlade | undefined): void {
  actor.x = width * 0.20; actor.y = config.world.groundY - actor.hh;
  actor.vx = 0; actor.vy = 0; actor.onGround = true; actor.hp = actor.maxHp;
  Object.assign(actor, { coyote: 0, jumpBuf: 0, dashTimer: 0, dashCd: 0, dashX: 0, dashY: 0,
    dashCharges: actor.maxDashCharges, dashEndT: 0, afterimageT: 0, downBufferT: 0, airTime: 0,
    _wasGround: true, iframe: 0, rootT: 0, hazardT: 0, voidSlowT: 0, voidTransferT: 0,
    voidLane: null, supportPlatform: null, rallyT: 0, rallyPool: 0, rallySource: null, tookHit: false });
  if (blade === undefined) return;
  const handX = actor.x + config.blade.handOffsetX, handY = actor.y + config.blade.handOffsetY;
  blade.state = "held"; blade.x = handX; blade.y = handY; blade.vx = 0; blade.vy = 0;
  blade.flyTime = 0; blade.throwOrigin = null; blade.pierced.clear(); blade.trail.length = 0;
  Object.assign(blade, { angle: -Math.PI / 2, aimX: 0, aimY: -config.blade.aimRadius,
    tipX: handX, tipY: handY - blade.curLength, prevTipX: handX, prevTipY: handY - blade.curLength,
    reticleX: handX, reticleY: handY - config.blade.aimRadius, tipVX: 0, tipVY: 0, tipSpeed: 0,
    glowV: 0, tetherFactor: 1, throwDmg: 0, throwBaseDmg: 0, embeddedNew: false, caughtNew: false,
    throwResolved: false, impactResolved: false, secondaryActive: false, secondaryQueued: false,
    secondaryStartedNew: false, hookTarget: null, threadcutIndex: -1, linkT: 0, linkBrokenNew: false,
    tension: 0, _lastHand: null, hostile: false, stolenBy: null, wheelSpin: 0, looseCannonT: 0,
    slingRadius: 0, slingAngle: 0, slingAngularVelocity: 0, swingActive: false, slingWorldCooldown: 0 });
  blade.threadcutRoute.length = 0; blade._repeatHits.clear(); blade.reversals.length = 0;
  blade.chainPoints.length = 0; blade.chainPrevious.length = 0; blade.slingCollided?.clear();
  for (const key of ["aimOverride", "lmbOverride", "impactVX", "impactVY", "redirectSpent", "releaseVX", "releaseVY", "retraceDone", "retraceReturn"]) Reflect.deleteProperty(blade, key);
  blade.resetRiftlock();
}

export function recoverTutorialBlade(config: typeof GameConfiguration, actor: Pick<TrainingPlayer, "x" | "y">, blade: TrainingBlade | undefined): void {
  if (blade === undefined) return;
  blade.state = "held"; blade.x = actor.x + config.blade.handOffsetX; blade.y = actor.y + config.blade.handOffsetY;
  blade.vx = 0; blade.vy = 0; blade.flyTime = 0; blade.throwOrigin = null; blade.pierced.clear(); blade.trail.length = 0;
}

export interface LiveTutorialEnemy {
  readonly kind: string;
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
  readonly onGround: boolean; readonly vy: number; readonly dashTimer: number;
  readonly dashX?: number; readonly dashY?: number;
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
  readonly enemies: () => TEnemy[];
  readonly playSound: (cue: "rankup" | "ui") => void;
  readonly spawn: (kind: "charger" | "ranged", hpScale: number) => TEnemy;
  readonly installArena: (arena: TutorialArenaId) => void;
  /** Clear task-local enemies/projectiles and return the player/blade to a safe start. */
  readonly resetTrainingSpace: () => void;
  readonly recoverBlade?: () => void;
  /** Starts the separate no-wave practice run after the curriculum completes. */
  readonly beginPractice: () => void;
  readonly terminateRun: (reason: "quit") => void;
  readonly navigate: (screen: "menu") => void;
  readonly releasePointer: () => void;
  readonly addProfileStat: (stat: "tutorialDone", amount: 1) => void;
  readonly completeCourse?: (id: string) => Promise<unknown>;
  readonly checkAchievements: () => void;
  readonly drawGhost: (snapshot: TutorialGhostSnapshot) => void;
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
  session(): TutorialSessionView;
  restart(): boolean;
  selectLesson(id: string): boolean;
  showHelp(): void;
  demonstrate(): boolean;
  captureSession(): ReturnType<TutorialController["captureSession"]> | undefined;
  validateSession(value: unknown): void;
  restoreSession(value: unknown): void;
  capturePresentation(): ReturnType<TutorialController["capturePresentation"]>;
  restorePresentation(value: ReturnType<TutorialController["capturePresentation"]> | undefined): void;
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
  const controller = new TutorialController(port.config);
  const installPendingArena = (): void => {
    const arena = controller.consumePendingArena();
    if (arena !== null) { port.resetTrainingSpace(); port.installArena(arena); }
  };
  const lessonView = (): LiveTutorialLessonView => {
    const lesson = controller.step();
    return {
      t: lesson.title, d: lesson.instruction?.(controller.counters) ?? lesson.description, keys: lesson.keys,
      need: lesson.dummyCount, ranged: lesson.ranged, final: lesson.final,
      arena: lesson.arena ?? "runway", arenaLabel: tutorialArenaDefinition(lesson.arena ?? "runway").label,
      teachingFocus: lesson.teachingFocus ?? "movement",
      prog: () => lesson.progress(controller.counters),
      ok: () => lesson.complete(controller.counters),
    };
  };
  return {
    session: () => controller.session(),
    restart: () => { const changed = controller.restart(); if (changed) installPendingArena(); return changed; },
    selectLesson: (id) => { const changed = controller.selectLesson(id); if (changed) installPendingArena(); return changed; },
    showHelp: () => { controller.showHelp(); }, demonstrate: () => controller.demonstrate(),
    captureSession: () => controller.session().phase === "inactive" ? undefined : controller.captureSession(),
    validateSession: (value) => { parseTutorialSessionCheckpoint(value); },
    restoreSession: (value) => { controller.restoreSession(value); },
    capturePresentation: () => controller.capturePresentation(), restorePresentation: (value) => { controller.restorePresentation(value); },
    get active() { return controller.active; },
    get idx() { return controller.lessonIndex; },
    get doneT() { return controller.completionDelay; },
    get endT() { return controller.endingTime; },
    get n() { return controller.counters; },
    get gT() { return controller.ghostTime; },
    get anchor() { return controller.anchorX; },
    steps: TUTORIAL_LESSONS,
    start(courseSessionId = "unissued") { controller.start(port.viewportWidth, courseSessionId); installPendingArena(); },
    stop() { controller.stop(); },
    mark(kind) { controller.mark(kind); },
    step: lessonView,
    drawGhost() { port.drawGhost(controller.ghostSnapshot(port.groundY())); },
    update(dt) {
      const enemies = port.enemies();
      const intents = controller.update({
        dt, skipPressed: port.skipPressed(), movingLeft: port.movingLeft(), movingRight: port.movingRight(),
        player: port.player(), bladeState: port.bladeState(), bladeTipVY: port.bladeTipVY?.() ?? 0, viewportWidth: port.viewportWidth,
        enemies: enemies.map((enemy, index) => ({
          id: String(index), kind: enemy.kind, dead: enemy.dead === true, tutorialDummy: enemy.tutDummy === true,
          hp: enemy.hp, maxHp: enemy.maxHp, x: enemy.x, y: enemy.y,
          ...(enemy.atk === undefined ? {} : { attack: enemy.atk }),
        })),
      });
      for (const intent of intents) {
        switch (intent.type) {
          case "sound": port.playSound(intent.cue); break;
          case "install-arena": port.installArena(intent.arena); break;
          case "reset-training-space": port.resetTrainingSpace(); break;
          case "recover-blade": port.recoverBlade?.(); break;
          case "begin-practice": port.beginPractice(); break;
          case "spawn": {
            const enemy = port.spawn(intent.kind, intent.hpScale);
            if (intent.role === "dummy") {
              enemy.tutDummy = true; enemy.affixCount = 0; enemy.contactDmg = 0;
              if (intent.x !== undefined) enemy.x = intent.x;
              enemy.y = port.groundY() - enemy.hh;
            }
            if (intent.role === "coach") {
              enemy.tutDummy = false; enemy.affixCount = 0; enemy.contactDmg = 0;
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
              enemy.x = intent.x; enemy.y = port.groundY() - enemy.hh;
              enemy.vx = 0; enemy.vy = 0; enemy.onGround = true; enemy.hitCd = 0;
              enemy.stun = Math.max(enemy.stun, 1); enemy.hp = enemy.maxHp;
            }
            break;
          }
          case "terminate-run": port.terminateRun(intent.reason); break;
          case "navigate": port.navigate(intent.screen); break;
          case "release-pointer": port.releasePointer(); break;
          case "complete-course": void port.completeCourse?.(intent.courseSessionId); break;
          case "achievement-check": port.checkAchievements(); break;
        }
      }
      installPendingArena();
    },
  };
}
