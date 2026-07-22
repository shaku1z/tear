export type TutorialMark =
  | "airHit" | "dash" | "deflect" | "jump" | "launch" | "moveL" | "moveR"
  | "parry" | "recall" | "slam" | "strike" | "superslam" | "throwHit" | "updraft";

export interface TutorialLesson {
  readonly title: string;
  readonly description: string;
  readonly keys: readonly string[];
  readonly dummyCount?: number;
  readonly ranged?: boolean;
  readonly final?: boolean;
  progress(counters: Readonly<Partial<Record<TutorialMark, number>>>): readonly [number, number];
  complete(counters: Readonly<Partial<Record<TutorialMark, number>>>): boolean;
}

type Frame = readonly [time: number, x: number, y: number];
type Swing = readonly [start: number, end: number, from: number, to: number];

interface GhostScript {
  readonly length: number;
  readonly path: readonly Frame[];
  readonly target?: readonly Frame[];
  readonly swings?: readonly Swing[];
  readonly dashes?: readonly (readonly [number, number])[];
  readonly hits?: readonly number[];
  readonly throwWindow?: readonly [number, number];
  readonly shot?: Readonly<{ start: number; hit: number; end: number }>;
}

export interface TutorialEnemySnapshot {
  readonly id: string;
  readonly kind: string;
  readonly dead: boolean;
  readonly tutorialDummy: boolean;
  readonly hp: number;
  readonly maxHp: number;
}

export interface TutorialUpdateSnapshot {
  readonly dt: number;
  readonly skipPressed: boolean;
  readonly movingLeft: boolean;
  readonly movingRight: boolean;
  readonly player: Readonly<{ onGround: boolean; vy: number; dashTimer: number; x: number; facing: number }>;
  readonly bladeState: string;
  readonly enemies: readonly TutorialEnemySnapshot[];
  readonly viewportWidth: number;
}

export type TutorialIntent =
  | Readonly<{ type: "sound"; cue: "rankup" | "ui" }>
  | Readonly<{ type: "spawn"; kind: "charger" | "ranged"; hpScale: number; role: "dummy" | "shooter"; x?: number }>
  | Readonly<{ type: "stabilize-dummy"; enemyId: string; minimumStun: number; healBelow: number }>
  | Readonly<{ type: "terminate-run"; reason: "quit" }>
  | Readonly<{ type: "navigate"; screen: "menu" }>
  | Readonly<{ type: "release-pointer" }>
  | Readonly<{ type: "profile-stat"; stat: "tutorialDone"; amount: 1 }>
  | Readonly<{ type: "achievement-check" }>;

export interface TutorialGhostSnapshot {
  readonly visible: boolean;
  readonly lesson: string;
  readonly time: number;
  readonly actor: Readonly<{ x: number; y: number; facing: -1 | 1; dashAfterimages: readonly Readonly<{ x: number; y: number; alpha: number }>[] }>;
  readonly target: Readonly<{ visible: boolean; x: number; y: number; hit: boolean }>;
  readonly blade: Readonly<{ x: number; y: number; angle: number; swinging: boolean; thrown: boolean; hit: boolean }>;
  readonly shot: Readonly<{ visible: boolean; x: number; y: number; deflected: boolean }>;
}

const count = (counters: Readonly<Partial<Record<TutorialMark, number>>>, key: TutorialMark) => counters[key] ?? 0;
const bounded = (value: number, target: number) => Math.min(value, target);

const LESSONS: TutorialLesson[] = [
  { title: "MOVE", description: "Run with A and D. Warm up — move both ways.", keys: ["A", "D"], progress: (n) => [(count(n, "moveL") > 25 ? 1 : 0) + (count(n, "moveR") > 25 ? 1 : 0), 2], complete: (n) => count(n, "moveL") > 25 && count(n, "moveR") > 25 },
  { title: "JUMP", description: "W or Space to jump. Hold S on a ledge to drop through it.", keys: ["W", "SPACE"], progress: (n) => [bounded(count(n, "jump"), 2), 2], complete: (n) => count(n, "jump") >= 2 },
  { title: "DASH", description: "Shift to dash — steer it mid-flight with W / A / S / D.", keys: ["SHIFT"], progress: (n) => [bounded(count(n, "dash"), 2), 2], complete: (n) => count(n, "dash") >= 2 },
  { title: "CUT", description: "The blade follows your mouse — SPEED IS DAMAGE. Slash the dummy, fast.", keys: ["MOUSE"], dummyCount: 1, progress: (n) => [bounded(count(n, "strike"), 3), 3], complete: (n) => count(n, "strike") >= 3 },
  { title: "LAUNCH", description: "A fast UPWARD swing pops an enemy into the air.", keys: ["MOUSE ↑"], dummyCount: 1, progress: (n) => [bounded(count(n, "launch"), 1), 1], complete: (n) => count(n, "launch") >= 1 },
  { title: "JUGGLE", description: "Launch it — then cut it again before it lands.", keys: ["MOUSE ↑", "MOUSE"], dummyCount: 1, progress: (n) => [bounded(count(n, "airHit"), 2), 2], complete: (n) => count(n, "airHit") >= 2 },
  { title: "SLAM", description: "While airborne, strike DOWN through an enemy — a slam hits harder.", keys: ["W", "MOUSE ↓"], dummyCount: 1, progress: (n) => [count(n, "slam") + count(n, "superslam") >= 1 ? 1 : 0, 1], complete: (n) => count(n, "slam") >= 1 || count(n, "superslam") >= 1 },
  { title: "POWER SLAM", description: "Dash DOWN to fall fast, then slam mid-fall — a fast descent hits far harder.", keys: ["S + SHIFT", "MOUSE ↓"], dummyCount: 1, progress: (n) => [bounded(count(n, "superslam"), 1), 1], complete: (n) => count(n, "superslam") >= 1 },
  { title: "UPDRAFT", description: "Launch WHILE RISING — jump first, then swing up hard.", keys: ["W", "MOUSE ↑"], dummyCount: 1, progress: (n) => [bounded(count(n, "updraft"), 1), 1], complete: (n) => count(n, "updraft") >= 1 },
  { title: "THROW", description: "Right-click to hurl the blade through an enemy — right-click again to recall it.", keys: ["RMB"], dummyCount: 1, progress: (n) => [(count(n, "throwHit") >= 1 ? 1 : 0) + (count(n, "recall") >= 1 ? 1 : 0), 2], complete: (n) => count(n, "throwHit") >= 1 && count(n, "recall") >= 1 },
  { title: "PARRY", description: "Swing FAST through an incoming shot to send it back. Perfect timing homes it.", keys: ["MOUSE"], ranged: true, progress: (n) => [count(n, "parry") >= 1 ? 2 : bounded(count(n, "deflect"), 2), 2], complete: (n) => count(n, "parry") >= 1 || count(n, "deflect") >= 2 },
  { title: "READY", description: "That's the whole blade. Cut clean. Keep moving. The Tear awaits.", keys: [], final: true, progress: () => [0, 1], complete: () => false },
];
export const TUTORIAL_LESSONS: readonly TutorialLesson[] = Object.freeze(LESSONS);

const GHOST_SCRIPTS: Readonly<Record<string, GhostScript>> = Object.freeze({
  MOVE: { length: 3, path: [[0, 0, 0], [1.4, 170, 0], [2.9, 0, 0]] },
  JUMP: { length: 3, path: [[0, 0, 0], [0.5, 0, 0], [0.85, 0, -130], [1.2, 0, 0], [1.7, 0, 0], [2.05, 0, -130], [2.4, 0, 0]] },
  DASH: { length: 3, path: [[0, 0, 0], [0.5, 0, 0], [0.72, 230, 0], [1.7, 230, 0], [1.92, 0, 0]], dashes: [[0.5, 0.72], [1.7, 1.92]] },
  CUT: { length: 3, path: [[0, 0, 0]], swings: [[0.5, 0.68, -0.9, 0.7], [1.3, 1.48, 0.7, -0.9], [2.1, 2.28, -0.9, 0.7]], hits: [0.6, 1.4, 2.2] },
  LAUNCH: { length: 3.2, path: [[0, 0, 0]], swings: [[0.8, 1, 0.8, -1.9]], hits: [0.92], target: [[0, 0, 0], [0.9, 0, 0], [1.3, 0, -170], [1.8, 0, -50], [2.2, 0, 0]] },
  JUGGLE: { length: 3.4, path: [[0, 0, 0]], swings: [[0.5, 0.7, 0.8, -1.9], [1.25, 1.42, -0.5, -2.1], [1.95, 2.12, -2.1, -0.5]], hits: [0.62, 1.33, 2.03], target: [[0, 0, 0], [0.6, 0, 0], [1, 0, -160], [1.35, 0, -110], [1.7, 0, -170], [2.05, 0, -120], [2.6, 0, 0]] },
  SLAM: { length: 3.2, path: [[0, 0, 0], [0.5, 0, 0], [0.85, 40, -140], [1.15, 80, -30], [1.4, 80, 0], [2.2, 0, 0]], swings: [[0.95, 1.15, -0.6, 2.2]], hits: [1.08], target: [[0, 80, 0]] },
  "POWER SLAM": { length: 3.4, path: [[0, 0, 0], [0.45, 0, 0], [0.75, 30, -170], [0.95, 60, -170], [1.15, 85, -20], [1.35, 85, 0], [2.3, 0, 0]], dashes: [[0.95, 1.15]], swings: [[1.05, 1.25, -0.5, 2.3]], hits: [1.18], target: [[0, 85, 0]] },
  UPDRAFT: { length: 3, path: [[0, 0, 0], [0.45, 0, 0], [0.8, 20, -150], [1.2, 30, -20], [1.45, 30, 0], [2.2, 0, 0]], swings: [[0.62, 0.82, 1, -2]], hits: [0.74], target: [[0, 60, 0], [0.7, 60, 0], [1.1, 60, -190], [1.6, 60, -60], [2, 60, 0]] },
  THROW: { length: 3.4, path: [[0, 0, 0]], throwWindow: [0.6, 1.9], hits: [1.1] },
  PARRY: { length: 3, path: [[0, 0, 0]], swings: [[0.78, 0.94, 0.9, -1.2]], shot: { start: 0.3, hit: 0.86, end: 1.6 } },
});

function interpolate(frames: readonly Frame[], time: number): Readonly<{ x: number; y: number }> {
  const first = frames[0];
  if (!first) return { x: 0, y: 0 };
  if (time <= first[0]) return { x: first[1], y: first[2] };
  for (let index = 1; index < frames.length; index++) {
    const before = frames[index - 1], after = frames[index];
    if (before && after && time < after[0]) {
      let amount = (time - before[0]) / (after[0] - before[0]);
      amount = amount * amount * (3 - 2 * amount);
      return { x: before[1] + (after[1] - before[1]) * amount, y: before[2] + (after[2] - before[2]) * amount };
    }
  }
  const last = frames.at(-1) ?? first;
  return { x: last[1], y: last[2] };
}

export class TutorialController {
  counters: Partial<Record<TutorialMark, number>> = {};
  active = false;
  lessonIndex = 0;
  completionDelay = 0;
  endingTime = 0;
  ghostTime = 0;
  anchorX = 0;
  private previousGrounded = true;
  private previousBladeState = "held";
  private dashLatched = false;

  start(viewportWidth: number): void {
    this.active = true; this.lessonIndex = 0; this.completionDelay = 0; this.endingTime = 0;
    this.ghostTime = 0; this.anchorX = viewportWidth * 0.2; this.previousGrounded = true;
    this.previousBladeState = "held"; this.dashLatched = false;
    this.counters = {};
  }

  stop(): void { this.active = false; }
  mark(mark: TutorialMark): void { if (this.active) this.counters[mark] = count(this.counters, mark) + 1; }
  step(): TutorialLesson {
    const lesson = TUTORIAL_LESSONS[this.lessonIndex] ?? TUTORIAL_LESSONS.at(-1);
    if (!lesson) throw new Error("Tutorial has no lessons");
    return lesson;
  }

  update(snapshot: TutorialUpdateSnapshot): readonly TutorialIntent[] {
    if (!this.active) return [];
    const intents: TutorialIntent[] = [], lesson = this.step(), { dt, player } = snapshot;
    this.ghostTime += dt;
    if (snapshot.skipPressed && !lesson.final && this.completionDelay <= 0) {
      this.completionDelay = 0.4; intents.push({ type: "sound", cue: "ui" });
    }
    if (snapshot.movingLeft) this.counters.moveL = count(this.counters, "moveL") + dt * 60;
    if (snapshot.movingRight) this.counters.moveR = count(this.counters, "moveR") + dt * 60;
    if (this.previousGrounded && !player.onGround && player.vy < -200) this.mark("jump");
    this.previousGrounded = player.onGround;
    if (player.dashTimer > 0 && !this.dashLatched) { this.mark("dash"); this.dashLatched = true; }
    if (player.dashTimer <= 0) this.dashLatched = false;
    if (this.previousBladeState === "returning" && snapshot.bladeState === "held") this.mark("recall");
    this.previousBladeState = snapshot.bladeState;

    const liveDummies = snapshot.enemies.filter((enemy) => enemy.tutorialDummy && !enemy.dead);
    for (const enemy of liveDummies) intents.push({ type: "stabilize-dummy", enemyId: enemy.id, minimumStun: 1, healBelow: enemy.maxHp * 0.5 });
    if ((lesson.dummyCount ?? 0) > liveDummies.length) {
      const x = Math.max(160, Math.min(player.x + (player.facing || 1) * 260, snapshot.viewportWidth - 160));
      intents.push({ type: "spawn", kind: "charger", hpScale: 8, role: "dummy", x });
    }
    if (lesson.ranged && !snapshot.enemies.some((enemy) => enemy.kind === "ranged" && !enemy.dead)) intents.push({ type: "spawn", kind: "ranged", hpScale: 2, role: "shooter" });

    if (this.completionDelay > 0) {
      this.completionDelay -= dt;
      if (this.completionDelay <= 0) {
        this.lessonIndex = Math.min(this.lessonIndex + 1, TUTORIAL_LESSONS.length - 1);
        this.counters.airHit = 0; this.counters.strike = 0; this.ghostTime = 0;
      }
    } else if (lesson.final) {
      this.endingTime += dt;
      if (this.endingTime > 5) {
        this.stop(); intents.push({ type: "terminate-run", reason: "quit" }, { type: "navigate", screen: "menu" },
          { type: "release-pointer" }, { type: "profile-stat", stat: "tutorialDone", amount: 1 }, { type: "achievement-check" });
      }
    } else if (lesson.complete(this.counters)) {
      this.completionDelay = 1.1; intents.push({ type: "sound", cue: "rankup" });
    }
    return intents;
  }

  ghostSnapshot(groundY: number): TutorialGhostSnapshot {
    const lesson = this.step(), script = GHOST_SCRIPTS[lesson.title];
    const hidden: TutorialGhostSnapshot = { visible: false, lesson: lesson.title, time: 0, actor: { x: 0, y: 0, facing: 1, dashAfterimages: [] }, target: { visible: false, x: 0, y: 0, hit: false }, blade: { x: 0, y: 0, angle: 0.25, swinging: false, thrown: false, hit: false }, shot: { visible: false, x: 0, y: 0, deflected: false } };
    if (lesson.final || !script) return hidden;
    const time = this.ghostTime % script.length, position = interpolate(script.path, time);
    const x = this.anchorX + position.x, y = groundY - 25 + position.y;
    const facing: -1 | 1 = script.path.length > 1 && interpolate(script.path, time + 0.05).x < position.x ? -1 : 1;
    const targetFrame = script.target ? interpolate(script.target, time) : { x: 0, y: 0 }, targetX = this.anchorX + 185, targetY = groundY - 22 + targetFrame.y;
    const hit = (script.hits ?? []).some((at) => time >= at && time < at + 0.12);
    let angle = 0.25, swinging = false;
    for (const swing of script.swings ?? []) if (time >= swing[0] && time < swing[1]) { angle = swing[2] + (swing[3] - swing[2]) * ((time - swing[0]) / (swing[1] - swing[0])); swinging = true; }
    const hand = { x, y: y - 4 }, throwWindow = script.throwWindow;
    let bladeX = hand.x + Math.cos(angle) * 58, bladeY = hand.y + Math.sin(angle) * 58, thrown = false;
    if (throwWindow && time >= throwWindow[0] && time < throwWindow[1]) {
      const amount = (time - throwWindow[0]) / (throwWindow[1] - throwWindow[0]);
      const outward = amount < 0.4 ? amount / 0.4 : amount < 0.6 ? 1 : 1 - (amount - 0.6) / 0.4;
      bladeX = hand.x + (targetX - hand.x) * outward; bladeY = hand.y + (targetY - hand.y) * outward; thrown = true;
    }
    const afterimages: { x: number; y: number; alpha: number }[] = [];
    for (const dash of script.dashes ?? []) if (time >= dash[0] && time < dash[1] + 0.15) for (let index = 1; index <= 3; index++) {
      const old = interpolate(script.path, Math.max(0, time - index * 0.05));
      afterimages.push({ x: this.anchorX + old.x, y: groundY - 25 + old.y, alpha: 0.12 * (4 - index) * (1 - Math.max(0, Math.min((time - dash[0]) / (dash[1] - dash[0]), 1)) * 0.5) });
    }
    const shot = script.shot, shotVisible = !!shot && time >= shot.start && time < shot.end;
    const deflected = !!shot && time >= shot.hit;
    const shotX = !shot ? 0 : time < shot.hit ? x + 320 - 260 * ((time - shot.start) / (shot.hit - shot.start)) : x + 60 + 340 * ((time - shot.hit) / (shot.end - shot.hit));
    return { visible: true, lesson: lesson.title, time, actor: { x, y, facing, dashAfterimages: afterimages }, target: { visible: !["MOVE", "JUMP", "DASH", "PARRY"].includes(lesson.title), x: targetX, y: targetY, hit }, blade: { x: bladeX, y: bladeY, angle, swinging, thrown, hit }, shot: { visible: shotVisible, x: shotX, y: hand.y - 6, deflected } };
  }
}
