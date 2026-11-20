import { buildWatchChoiceScore } from "../agents/watch-build-choice";
import type { RunDifficulty } from "../gameplay/run/session";
import { stageIdsAvailableOn } from "../gameplay/stages";
import type { WeaponId } from "../gameplay/weapon-selection";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "../gameplay/snapshot/snapshot-contract";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../tearbench/simulation-profile";
import { agentView, UNMARKED_HIT, type AttributedHits } from "./boss-fight";
import { BOSS_PLAYER_IDS, createBossPlayer, type BossPlayer, type BossPlayerId } from "./boss-player";
import { boxOverlaps, readPlayerBox, type PlayerBox } from "./boss-view";
import { chapterHolds, skipChapter } from "./headless/chapter";
import {
  createProductionHeadlessEnvironment,
  type ProductionHeadlessEnvironment,
} from "./headless/production-headless-environment";
import { CAMPAIGN_WAVES_PER_STAGE, requireProductionHeadlessScenario } from "./headless/production-headless-scenario";
import { createRootCounter, type RootCount } from "./wave-roots";

export interface WaveRequest {
  /** An Adventure stage by id; the wave must be one of its ten. */
  readonly stage: string;
  readonly wave: number;
  readonly difficulty: RunDifficulty;
  readonly weapon: WeaponId;
  readonly seed: string;
  readonly player: BossPlayerId;
  /**
   * "drafted": the player arrives with one upgrade for each wave before, picked from the game's own draft by the
   * scoring the game's watch player uses. "none": with no upgrades. Tier-ups and anything bought are in neither.
   */
  readonly build: WaveBuild;
  /** The wave is stopped and reported as a time limit after this many simulation ticks. */
  readonly maxTicks: number;
}

export const WAVE_BUILDS = Object.freeze(["drafted", "none"] as const);
export type WaveBuild = (typeof WAVE_BUILDS)[number];

export type WaveEnd = "cleared" | "player defeated" | "time limit" | "broken";

export interface SpawnedEnemy {
  readonly kind: string;
  /** The affixes it spawned with; an enemy with any is an elite. */
  readonly affixes: readonly string[];
}

export interface WaveResult extends WaveRequest {
  readonly end: WaveEnd;
  readonly reason?: string;
  /** Ticks played from the wave going live to its end, the opening grace included. */
  readonly ticks: number;
  /** The game's own clear time for the wave, from its wave log, in ticks; absent unless the wave was cleared. */
  readonly clearTicks?: number;
  /** Ticks of opening grace the game gave the wave. */
  readonly graceTicks: number;
  /** Upgrades the player arrived with. */
  readonly upgrades: number;
  /** Upgrades the drafts before the wave offered, by id: more than were taken. */
  readonly offered: readonly string[];
  /** Where the player stood when defeated. */
  readonly diedAt?: Readonly<{ tick: number; x: number; y: number }>;
  /** Every enemy of the wave in the order it arrived. */
  readonly spawned: readonly SpawnedEnemy[];
  readonly elites: number;
  readonly kills: number;
  readonly damageTaken: number;
  readonly hitsTaken: number;
  /**
   * Damage to the player by what it is attributed to. The game does not record the source of a hit, so each
   * loss of health goes to a projectile on the player at that tick ("ranged shot"), else to an enemy touching
   * the player (its kind), else to "unmarked".
   */
  readonly hitsBy: Readonly<Record<string, AttributedHits>>;
  readonly roots: RootCount;
}

/** How far outside a shape a hit may land and still be attributed to it. */
const ATTRIBUTION_MARGIN_PIXELS = 12;

interface EnemyActor {
  readonly kind?: string;
  readonly supportType?: string;
  readonly affixes?: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly contactReach?: number;
  readonly dead?: boolean;
  readonly dying?: boolean;
  readonly rootPhase?: string;
}

interface ProjectileActor {
  readonly x: number;
  readonly y: number;
  readonly r?: number;
  readonly radius?: number;
  readonly dead?: boolean;
  readonly owner?: EnemyActor | null;
  readonly sourceEnemy?: EnemyActor | null;
}

interface RunView {
  readonly wave: number;
  readonly waveGrace?: number;
  readonly mods?: Readonly<{ owned?: Readonly<Record<string, number>> }>;
  readonly waveLog: readonly Readonly<{ wave: number | string; time: number; kills: number }>[];
}

export interface WaveWorld {
  enemies(): readonly unknown[];
  projectiles(): readonly unknown[];
  player(): unknown;
  run(): unknown;
}

/** The name the game's enemy lists use: the four support enemies share one kind and differ by `supportType`. */
export const kindOf = (enemy: Readonly<{ kind?: string; supportType?: string }> | null | undefined): string =>
  enemy?.supportType ?? enemy?.kind ?? "unknown";

/** The stage's waves a `waves` report plays: its nine waves before the boss wave. */
export function stageWaves(stage: string): readonly number[] {
  const stages = stageIdsAvailableOn("adventure");
  const index = (stages as readonly string[]).indexOf(stage);
  if (index < 0) throw new RangeError(`no Adventure stage "${stage}"; the stages are ${stages.join(", ")}`);
  return Array.from({ length: CAMPAIGN_WAVES_PER_STAGE - 1 }, (_, wave) => index * CAMPAIGN_WAVES_PER_STAGE + wave + 1);
}

/** The scenario for a wave, admitted by the headless environment's own check, which refuses a wrong id by name. */
export function waveScenario(request: WaveRequest): TearScenarioV1 {
  if (!BOSS_PLAYER_IDS.includes(request.player))
    throw new RangeError(`no player "${request.player}"; the players are ${BOSS_PLAYER_IDS.join(", ")}`);
  if (!WAVE_BUILDS.includes(request.build))
    throw new RangeError(`no build "${request.build}"; the builds are ${WAVE_BUILDS.join(", ")}`);
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `playtest-wave-${request.stage}-${String(request.wave)}-${request.difficulty}-${request.weapon}-${request.seed}`,
    version: 1,
    description: "Playtest wave",
    stateClass: "surgical-valid",
    executionClass: "engineering",
    seed: request.seed,
    start: {
      mode: "campaign",
      difficulty: request.difficulty,
      weapon: request.weapon,
      wave: request.wave,
      stage: request.stage,
    },
    maxTicks: request.maxTicks,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

/** What a loss of health is attributed to, from the projectiles and enemies seen just before the step. */
export function attributeWaveHit(
  player: PlayerBox,
  projectiles: readonly ProjectileActor[],
  enemies: readonly EnemyActor[],
): string {
  const shot = projectiles.find((projectile) => {
    const radius = projectile.r ?? projectile.radius ?? 0;
    return boxOverlaps(player, { x: projectile.x, y: projectile.y, hw: radius, hh: radius }, ATTRIBUTION_MARGIN_PIXELS);
  });
  if (shot !== undefined) return `${kindOf(shot.sourceEnemy ?? shot.owner)} shot`;
  const touching = enemies.find((enemy) =>
    boxOverlaps(player, enemy, ATTRIBUTION_MARGIN_PIXELS + (enemy.contactReach ?? 0)),
  );
  return touching === undefined ? UNMARKED_HIT : kindOf(touching);
}

/** A copy of what attribution reads, taken before the step: the game moves and removes the actors themselves. */
export function copyActors(world: WaveWorld): Readonly<{ projectiles: ProjectileActor[]; enemies: EnemyActor[] }> {
  return {
    projectiles: (world.projectiles() as readonly ProjectileActor[])
      .filter((projectile) => projectile.dead !== true)
      .map(({ x, y, r, radius, owner, sourceEnemy }) => ({
        x,
        y,
        ...(r === undefined ? {} : { r }),
        ...(radius === undefined ? {} : { radius }),
        owner: owner ?? null,
        sourceEnemy: sourceEnemy ?? null,
      })),
    enemies: (world.enemies() as readonly EnemyActor[])
      .filter((enemy) => enemy.dead !== true && enemy.dying !== true)
      .map(({ kind, supportType, x, y, hw, hh, contactReach }) => ({
        ...(kind === undefined ? {} : { kind }),
        ...(supportType === undefined ? {} : { supportType }),
        x,
        y,
        hw,
        hh,
        ...(contactReach === undefined ? {} : { contactReach }),
      })),
  };
}

function start(environment: ProductionHeadlessEnvironment, request: WaveRequest): string | undefined {
  environment.reset(waveScenario(request));
  if (chapterHolds(environment) && !skipChapter(environment)) return "the stage's story chapter did not end";
  const run = environment.world().run() as unknown as RunView;
  return run.wave === request.wave
    ? undefined
    : `asked for wave ${String(request.wave)}, the game started ${String(run.wave)}`;
}

/**
 * Plays one wave of an Adventure stage on the real game, headless, and measures it. The run opens on the wave,
 * so the player has no upgrades from earlier waves.
 */
export function playWave(request: WaveRequest, player: BossPlayer = createBossPlayer(request.player)): WaveResult {
  const offered = new Set<string>();
  const environment = createProductionHeadlessEnvironment(
    request.build === "none"
      ? {}
      : {
          build: (choices) => {
            for (const choice of choices) offered.add(choice.id);
            const scores = choices.map((choice) => buildWatchChoiceScore(choice.id, request.weapon));
            return scores.indexOf(Math.max(...scores));
          },
        },
  );
  try {
    const refused = start(environment, request);
    const world = environment.world() as unknown as WaveWorld;
    const run = (): RunView => world.run() as RunView;
    const upgrades = Object.values(run().mods?.owned ?? {}).reduce((total, count) => total + count, 0);
    const graceTicks = Math.round((run().waveGrace ?? 0) * TEAR_SIMULATION_TICKS_PER_SECOND);
    const seen = new Set<unknown>();
    const spawned: SpawnedEnemy[] = [];
    const hitsBy: Record<string, { hits: number; damage: number }> = {};
    const roots = createRootCounter();
    let ticks = 0;
    let damageTaken = 0;
    let hitsTaken = 0;
    let end: WaveEnd | undefined = refused === undefined ? undefined : "broken";
    let reason = refused;
    let diedAt: WaveResult["diedAt"];
    const note = (): void => {
      for (const enemy of world.enemies() as readonly EnemyActor[]) {
        if (seen.has(enemy)) continue;
        seen.add(enemy);
        spawned.push({ kind: kindOf(enemy), affixes: [...(enemy.affixes ?? [])] });
      }
      roots.read(environment.stageObjects().combatObjects, world.enemies(), ticks);
    };
    while (end === undefined) {
      note();
      const view = agentView(environment, request.weapon);
      const box = readPlayerBox(world);
      const hpBefore = view.state.player.hp;
      const actors = copyActors(world);
      const step = environment.step(player.decide(view, null, box));
      ticks += 1;
      const after = environment.policyObservation().player;
      if (after.hp < hpBefore) {
        const lost = hpBefore - after.hp;
        const source = attributeWaveHit(
          box ?? { x: after.x, y: after.y, hw: 0, hh: 0 },
          actors.projectiles,
          actors.enemies,
        );
        const entry = (hitsBy[source] ??= { hits: 0, damage: 0 });
        entry.hits += 1;
        entry.damage += lost;
        hitsTaken += 1;
        damageTaken += lost;
      }
      // The game writes the wave in its log on a defeat too, so the defeat is read first.
      if (after.hp <= 0) {
        end = "player defeated";
        diedAt = { tick: ticks, x: Math.round(after.x), y: Math.round(after.y) };
      } else if (run().waveLog.some((entry) => entry.wave === request.wave)) end = "cleared";
      else if (step.terminated) {
        end = "broken";
        reason = "the run ended with the wave not cleared and the player alive";
      } else if (step.truncated || ticks >= request.maxTicks) end = "time limit";
    }
    note();
    const alive = (world.enemies() as readonly EnemyActor[]).filter(
      (enemy) => enemy.dead !== true,
    ) as readonly unknown[];
    const logged = run().waveLog.find((entry) => entry.wave === request.wave);
    return {
      ...request,
      end,
      ...(reason === undefined ? {} : { reason }),
      ticks,
      ...(end === "cleared" && logged !== undefined
        ? { clearTicks: Math.round(logged.time * TEAR_SIMULATION_TICKS_PER_SECOND) }
        : {}),
      graceTicks,
      upgrades,
      offered: [...offered].sort(),
      ...(diedAt === undefined ? {} : { diedAt }),
      spawned,
      elites: spawned.filter((enemy) => enemy.affixes.length > 0).length,
      kills: [...seen].filter((enemy) => !alive.includes(enemy)).length,
      damageTaken,
      hitsTaken,
      hitsBy,
      roots: roots.count(),
    };
  } finally {
    environment.dispose();
  }
}
