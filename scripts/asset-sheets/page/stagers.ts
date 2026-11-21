/**
 * How each kind of scene is staged. A stager puts the scene in place, scripts the stand-in player and forced
 * hits tick by tick, and names the looks on screen at each tick. All three run identically in both passes of
 * a scene, so the second pass sees exactly what the first one noted.
 *
 * A new kind of thing adds a stager here and its kind to STAGER_KINDS in ../manifest.ts. For example Shards
 * cosmetics would equip an item on the player in `prepare` and reuse the player's script.
 */
import { bossTells } from "../../../src/gameplay/entities/boss-tells";
import { BOSS_DEFINITIONS } from "../../../src/gameplay/run/boss-definitions";
import { beginBossEncounter } from "../../../src/gameplay/run/boss-encounter";
import { planBossPlacement } from "../../../src/gameplay/run/boss-placement";
import { BOSS_ROSTER } from "../../../src/gameplay/run/content-director";
import { stagePlatforms, stageRuntimeIndexForSurface, type StageId } from "../../../src/gameplay/stages";
import { createBossArena } from "../../../src/gameplay/training/arena-rules";
import { applyVariant, findVariant } from "../../../src/gameplay/variants";
import type { SheetScene, StagerKind } from "../manifest";
import {
  enemiesOf,
  playerOf,
  slug,
  TICKS_PER_SECOND,
  VIEW,
  type Actor,
  type Command,
  type ReplayFrameLayer,
  type Session,
} from "./session";

/** One look that is on screen at a tick, and the layers that show it. */
export interface Track {
  readonly category: string;
  readonly asset: string;
  readonly state: string;
  readonly show: readonly ReplayFrameLayer[];
  /** Detail for the index: for example a projectile's family. */
  readonly facts?: Readonly<Record<string, string>>;
}

export interface Stager {
  prepare(session: Session, scene: SheetScene): void;
  /** Ticks run after the scene's watched time, for the hurt and death pictures. */
  readonly afterTicks: number;
  script(session: Session, scene: SheetScene, tick: number, naturalTicks: number): Command[];
  tracks(session: Session, scene: SheetScene, tick: number, naturalTicks: number): Track[];
}

/** Puts the scene's stage in place, through Playground practice, and clears the stage of enemies. */
function placeOnStage(session: Session, scene: SheetScene): void {
  const { replay } = session;
  replay.tutorial.openPractice(1);
  const index = stageRuntimeIndexForSurface(scene.stageId as StageId, "playground");
  if (index < 0) throw new Error(`${scene.id}: stage ${scene.stageId} has no runtime index`);
  replay.stage.index = index;
  replay.stage.platforms = stagePlatforms(index, replay.configuration.value);
  replay.world.context.environment.setStage(scene.stageId, "stage-transition");
  const run = replay.world.state.run();
  if (run !== null) Reflect.set(run, "_biomeIdx", index);
  playerOf(session).x = 480;
  replay.world.state.setEnemies([]);
}

/** Enters a published boss through boss practice at the chosen phase. */
function enterBossPractice(session: Session, scene: SheetScene, bossId: string, phase: 1 | 2 | 3): void {
  session.replay.tutorial.openPractice(1);
  const retained = {
    bossId,
    phase,
    knowledge: "encountered-phase",
    defeated: false,
    runtime: {
      version: 1,
      bossId,
      phase,
      seed: "asset-sheets",
      generation: 1,
      encounterId: `boss-practice:1:${bossId}:${String(phase)}:asset-sheets`,
      lifecycle: "preparing",
      setupStage: "opening",
      enteredPhase: 1,
      entryStage: "opening",
      pendingPhase: null,
    },
  };
  if (!session.replay.tutorial.selectBoss(`${bossId}:${String(phase)}`, retained as never))
    throw new Error(`${scene.id}: the game refused boss practice for ${bossId} phase ${String(phase)}`);
}

/**
 * Boss practice only takes published bosses. An unpublished one is placed on its home stage by the same steps
 * practice uses (the factory, the authored placement, the encounter start and intro) and reaches a later
 * phase by health, as `tests/unit/boss-tell-rules.test.ts` does.
 */
function placeUnpublishedBoss(session: Session, scene: SheetScene, bossId: string, phase: 1 | 2 | 3): void {
  placeOnStage(session, scene);
  const { replay } = session;
  const config = replay.configuration.value;
  const run = replay.world.state.run();
  if (run === null) throw new Error(`${bossId}: the detached world has no run`);
  const placement = planBossPlacement(bossId, config.view.w, config, config.view.w / 2);
  const boss = replay.world.entities.createEnemy(placement.factoryId, placement.x, placement.y, run) as Actor;
  Reflect.set(boss, "bossId", bossId);
  Reflect.set(run, "curBoss", bossId);
  replay.world.state.setEnemies([boss as never]);
  beginBossEncounter(run as never, boss as never, config.bossTheater.introDur, {
    platforms: () => replay.stage.platforms,
    setPlatforms: (value) => {
      replay.stage.platforms = value;
    },
    arenaFor: (id) => {
      const arena = createBossArena(
        id,
        config.view.w,
        config.view.h,
        config.world.groundY,
        config.bossArena.reformWarn,
      );
      return arena === null ? null : [...arena];
    },
  });
  replay.world.state.setBossIntro({ boss: boss as never, t: 0, dur: config.bossTheater.introDur, delay: 0 });
  const marks = BOSS_DEFINITIONS.find((definition) => definition.id === bossId)?.phaseMarks;
  if (marks === undefined) throw new Error(`${bossId}: no boss definition`);
  if (phase > 1) boss.hp = boss.maxHp * ((phase === 2 ? marks[0] : marks[1]) - 0.05);
}

function attackLook(actor: Actor): string {
  // A Rootbinder keeps its plant, link and recover steps in its own state record.
  if (actor.rootbinderState !== undefined) return slug(actor.rootbinderState.state);
  const parts: string[] = [];
  if (actor.isBoss === true && actor.phase !== undefined) parts.push(`phase-${String(actor.phase)}`);
  const attack = typeof actor.atk === "string" && actor.atk !== "unavailable" ? actor.atk : "";
  // A boss whose moves are data sits in "idle" while its attack runner works; the attack is the look.
  if (attack === "" || (actor.state ?? "idle") !== "idle") parts.push(actor.state ?? "idle");
  if (attack !== "") parts.push(attack);
  if (actor.isBoss === true && bossTells(actor as never).some((tell) => tell.stage === "exposed"))
    parts.push("exposed");
  return slug(parts.join("-"));
}

/** How often the stand-in player changes distance, and the near and far distances it keeps. */
const STAND_IN_MOVE_TICKS = 3 * TICKS_PER_SECOND;
const STAND_IN_NEAR = 150;
const STAND_IN_FAR = 700;
const STAGE_EDGE = 80;

/**
 * Enemies and bosses choose moves by the player's distance, so the stand-in takes turns standing near and far
 * from the subject, on its open side. Every range a move asks for then comes up in one scene.
 */
function placeStandIn(player: Actor, subject: Actor, tick: number): void {
  const far = (tick / STAND_IN_MOVE_TICKS) % 2 === 1;
  const side = subject.x < VIEW.w / 2 ? 1 : -1;
  const x = subject.x + side * (far ? STAND_IN_FAR : STAND_IN_NEAR);
  player.x = Math.min(VIEW.w - STAGE_EDGE, Math.max(STAGE_EDGE, x));
  player.vx = 0;
}

/** Enemies and bosses: watched against a stand-in that never dies, then hurt once, and killed when it ends. */
function actorStager(boss: boolean): Stager {
  const subjectOf = (session: Session) =>
    boss ? enemiesOf(session).find((enemy) => enemy.isBoss) : enemiesOf(session)[0];
  const finishes = (scene: SheetScene) =>
    scene.setup.kind === "enemy" || (scene.setup.kind === "boss" && scene.setup.phase === 3);
  return {
    afterTicks: 6 * TICKS_PER_SECOND,
    prepare(session, scene) {
      const setup = scene.setup;
      if (setup.kind === "boss") {
        if (BOSS_ROSTER.some((entry) => entry.id === setup.bossId))
          enterBossPractice(session, scene, setup.bossId, setup.phase);
        else placeUnpublishedBoss(session, scene, setup.bossId, setup.phase);
        return;
      }
      if (setup.kind !== "enemy") return;
      placeOnStage(session, scene);
      const { replay } = session;
      const run = replay.world.state.run();
      const ground = replay.configuration.value.world.groundY;
      const spawn = (id: string, x: number) => replay.world.entities.createEnemy(id, x, ground - 60, run as never);
      const main = spawn(setup.enemyId, 880);
      if (setup.variantId !== undefined) applyVariant(main, findVariant(setup.enemyId, setup.variantId));
      replay.world.state.setEnemies([main, ...setup.allies.map((id, order) => spawn(id, 1040 + order * 110))]);
    },
    script(session, scene, tick, naturalTicks) {
      const player = playerOf(session);
      player.hp = player.maxHp;
      const subject = subjectOf(session);
      if (subject === undefined) return [];
      if (tick <= naturalTicks && tick % STAND_IN_MOVE_TICKS === 0) placeStandIn(player, subject, tick);
      if (tick === naturalTicks + 1) subject.takeHit?.(1, 0, 0);
      if (finishes(scene) && tick > naturalTicks + 90 && subject.dying !== true && subject.dead !== true)
        subject.takeHit?.(subject.maxHp, 0, 0);
      return [];
    },
    tracks(session, scene, tick, naturalTicks) {
      const subject = subjectOf(session);
      if (subject === undefined || (subject.spawnT ?? 0) > 0 || (subject.introT ?? 0) > 0) return [];
      const show: ReplayFrameLayer[] = boss
        ? ["hazards", "environment", "enemies", "projectiles", "effects"]
        : ["environment", "enemies", "effects"];
      let state: string;
      if (subject.dying === true) {
        const total = Math.max(0.001, subject.deathDur ?? 1);
        const quarter = Math.min(3, Math.max(0, Math.floor((1 - (subject.deathT ?? 0) / total) * 4)));
        state = `death-${String(quarter + 1)}-of-4`;
      } else if (subject.dead === true) state = "";
      else if (tick > naturalTicks) state = (subject.flash ?? 0) > 0 ? "hurt" : "";
      else state = attackLook(subject);
      return state === "" ? [] : [{ category: scene.category, asset: scene.asset, state, show }];
    },
  };
}

/** The player's fixed inputs: aim, run, jump, dash, a hit, a full swing, a throw and a recall. */
function playerScript(session: Session, tick: number): Command[] {
  const player = playerOf(session);
  const commands: Command[] = [];
  if (tick === 2) commands.push({ type: "aim", turn: 0, magnitude: 1000 });
  if (tick === 60) commands.push({ type: "move", x: 1000, y: 0 });
  if (tick === 150) commands.push({ type: "move", x: 0, y: 0 });
  if (tick === 190) commands.push({ type: "jump", phase: "pressed" });
  if (tick === 200) commands.push({ type: "jump", phase: "released" });
  if (tick === 330) commands.push({ type: "dash", x: 1000, y: 0 });
  if (tick === 400) player.takeDamage?.(1, player.x + 40);
  // A full swing: the aim turns once around over half a second.
  if (tick >= 470 && tick <= 530)
    commands.push({ type: "aim", turn: Math.round(((tick - 470) / 60) * 1_000_000) % 1_000_000, magnitude: 1000 });
  if (tick === 560) commands.push({ type: "aim", turn: 0, magnitude: 1000 });
  if (tick === 580) commands.push({ type: "weapon", intent: "throw", phase: "pressed" });
  if (tick === 584) commands.push({ type: "weapon", intent: "throw", phase: "released" });
  if (tick === 690) commands.push({ type: "weapon", intent: "recall", phase: "pressed" });
  if (tick === 694) commands.push({ type: "weapon", intent: "recall", phase: "released" });
  return commands;
}

/** The player with its blade (whole) or the blade alone. */
function playerStager(whole: boolean): Stager {
  return {
    afterTicks: 0,
    prepare: placeOnStage,
    script: (session, _scene, tick) => playerScript(session, tick),
    tracks(session, scene, tick) {
      const player = playerOf(session);
      const blade = session.replay.world.state.blade() as unknown as { state: string } | undefined;
      const show: ReplayFrameLayer[] = whole ? ["player", "blade", "effects"] : ["blade", "effects"];
      let state = whole ? "idle" : "held";
      if (tick >= 470 && tick <= 540) state = "swing";
      else if (blade !== undefined && blade.state !== "held") state = whole ? `blade-${blade.state}` : blade.state;
      else if (whole && (player.iframe ?? 0) > 0) state = "hit";
      else if (whole && (player.dashTimer ?? 0) > 0) state = "dash";
      else if (whole && player.onGround === false) state = player.vy < 0 ? "jump-rising" : "jump-falling";
      else if (whole && Math.abs(player.vx) > 40) state = "run";
      return [{ category: scene.category, asset: scene.asset, state, show }];
    },
  };
}

const stageStager: Stager = {
  afterTicks: 0,
  prepare: placeOnStage,
  script: () => [],
  tracks: (_session, scene, tick) =>
    tick >= 5 ? [{ category: scene.category, asset: scene.asset, state: "platforms", show: ["platforms"] }] : [],
};

export const STAGERS: Readonly<Record<StagerKind, Stager>> = {
  player: playerStager(true),
  weapon: playerStager(false),
  enemy: actorStager(false),
  boss: actorStager(true),
  stage: stageStager,
};
