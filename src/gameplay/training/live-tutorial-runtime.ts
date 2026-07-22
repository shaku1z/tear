import {
  TUTORIAL_LESSONS,
  TutorialController,
  type TutorialGhostSnapshot,
  type TutorialLesson,
  type TutorialMark,
} from "./tutorial-controller";

export interface LiveTutorialEnemy {
  readonly kind: string;
  dead?: boolean;
  tutDummy?: boolean;
  hp: number;
  maxHp: number;
  stun: number;
  x: number;
  y: number;
  hh: number;
  affixCount?: number;
  contactDmg: number;
}

export interface LiveTutorialPlayer {
  readonly onGround: boolean;
  readonly vy: number;
  readonly dashTimer: number;
  readonly x: number;
  readonly facing: number;
}

export interface LiveTutorialPort<TEnemy extends LiveTutorialEnemy> {
  readonly viewportWidth: number;
  readonly groundY: () => number;
  readonly skipPressed: () => boolean;
  readonly movingLeft: () => boolean;
  readonly movingRight: () => boolean;
  readonly player: () => LiveTutorialPlayer;
  readonly bladeState: () => string;
  readonly enemies: () => TEnemy[];
  readonly playSound: (cue: "rankup" | "ui") => void;
  readonly spawn: (kind: "charger" | "ranged", hpScale: number) => TEnemy;
  readonly terminateRun: (reason: "quit") => void;
  readonly navigate: (screen: "menu") => void;
  readonly releasePointer: () => void;
  readonly addProfileStat: (stat: "tutorialDone", amount: 1) => void;
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
  readonly prog: () => readonly [number, number];
  readonly ok: () => boolean;
}

export interface LiveTutorialRuntime {
  readonly active: boolean;
  readonly idx: number;
  readonly doneT: number;
  readonly endT: number;
  readonly n: Readonly<Partial<Record<TutorialMark, number>>>;
  readonly gT: number;
  readonly anchor: number;
  readonly steps: readonly TutorialLesson[];
  start(): void;
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
  const controller = new TutorialController();
  const lessonView = (): LiveTutorialLessonView => {
    const lesson = controller.step();
    return {
      t: lesson.title, d: lesson.description, keys: lesson.keys,
      need: lesson.dummyCount, ranged: lesson.ranged, final: lesson.final,
      prog: () => lesson.progress(controller.counters),
      ok: () => lesson.complete(controller.counters),
    };
  };
  return {
    get active() { return controller.active; },
    get idx() { return controller.lessonIndex; },
    get doneT() { return controller.completionDelay; },
    get endT() { return controller.endingTime; },
    get n() { return controller.counters; },
    get gT() { return controller.ghostTime; },
    get anchor() { return controller.anchorX; },
    steps: TUTORIAL_LESSONS,
    start() { controller.start(port.viewportWidth); },
    stop() { controller.stop(); },
    mark(kind) { controller.mark(kind); },
    step: lessonView,
    drawGhost() { port.drawGhost(controller.ghostSnapshot(port.groundY())); },
    update(dt) {
      const enemies = port.enemies();
      const intents = controller.update({
        dt, skipPressed: port.skipPressed(), movingLeft: port.movingLeft(), movingRight: port.movingRight(),
        player: port.player(), bladeState: port.bladeState(), viewportWidth: port.viewportWidth,
        enemies: enemies.map((enemy, index) => ({
          id: String(index), kind: enemy.kind, dead: enemy.dead === true, tutorialDummy: enemy.tutDummy === true,
          hp: enemy.hp, maxHp: enemy.maxHp,
        })),
      });
      for (const intent of intents) {
        switch (intent.type) {
          case "sound": port.playSound(intent.cue); break;
          case "spawn": {
            const enemy = port.spawn(intent.kind, intent.hpScale);
            if (intent.role === "dummy") {
              enemy.tutDummy = true; enemy.affixCount = 0; enemy.contactDmg = 0;
              if (intent.x !== undefined) enemy.x = intent.x;
              enemy.y = port.groundY() - enemy.hh;
            }
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
          case "terminate-run": port.terminateRun(intent.reason); break;
          case "navigate": port.navigate(intent.screen); break;
          case "release-pointer": port.releasePointer(); break;
          case "profile-stat": port.addProfileStat(intent.stat, intent.amount); break;
          case "achievement-check": port.checkAchievements(); break;
        }
      }
    },
  };
}
