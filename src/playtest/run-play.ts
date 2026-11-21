import { MODE_CATALOG } from "../gameplay/run/mode-catalog";
import type { RunDifficulty } from "../gameplay/run/session";
import type { WeaponId } from "../gameplay/weapon-selection";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION } from "../gameplay/snapshot/snapshot-contract";
import type { TearScenarioV1 } from "../tearbench/contracts";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../tearbench/simulation-profile";
import { agentView } from "./boss-fight";
import { BOSS_PLAYER_IDS, createBossPlayer, type BossPlayer, type BossPlayerId } from "./boss-player";
import { readBoss, readPlayerBox } from "./boss-view";
import { chapterHolds, skipChapter } from "./headless/chapter";
import { createProductionHeadlessEnvironment } from "./headless/production-headless-environment";
import { requireProductionHeadlessScenario } from "./headless/production-headless-scenario";
import { kindOf } from "./wave-play";

export interface RunRequest {
  /** A mode the game plays as a run of waves from wave 1: the Adventure, Endless or the Gauntlet. */
  readonly mode: string;
  readonly difficulty: RunDifficulty;
  readonly weapon: WeaponId;
  readonly seed: string;
  readonly player: BossPlayerId;
  /** The run is stopped and reported as a time limit after this many simulation ticks. */
  readonly maxTicks: number;
}

export type RunEnd = "won" | "player defeated" | "time limit" | "broken";

export interface RunWave {
  readonly wave: number | string;
  /** False for the wave the run ended in, unless the run was won. */
  readonly cleared: boolean;
  /** The game's own time for the wave, from its wave log, in ticks; for a wave not in the log, the ticks played in it. */
  readonly ticks: number;
  /** Health the player lost in the wave, whatever it won back. */
  readonly damageTaken: number;
  readonly hitsTaken: number;
  /** Health at the wave's first tick and at its last. */
  readonly healthAtStart: number;
  readonly healthAtEnd: number;
  readonly kills: number;
}

export interface RunResult extends RunRequest {
  readonly end: RunEnd;
  readonly reason?: string;
  readonly ticks: number;
  /** The wave the run ended in, as the game numbers it. */
  readonly endWave: number;
  readonly waves: readonly RunWave[];
  /** Upgrades the player held at the end, by id. */
  readonly upgrades: Readonly<Record<string, number>>;
  /** What the run brought into play, for the coverage list. */
  readonly appeared: RunAppeared;
}

export interface RunAppeared {
  /** Upgrades the drafts offered, by id. */
  readonly offered: readonly string[];
  /** Enemy kinds that arrived, and the affixes they arrived with. */
  readonly enemies: readonly string[];
  readonly affixes: readonly string[];
  /** Boss phases played, as "<boss> phase <n>". */
  readonly bossPhases: readonly string[];
}

/** The modes a `runs` report plays: every mode the game plays as numbered waves from wave 1. */
export const RUN_MODES: readonly string[] = Object.freeze(
  MODE_CATALOG.filter(({ classification }) => ["campaign", "endless", "gauntlet"].includes(classification)).map(
    ({ id }) => id,
  ),
);

interface RunView {
  readonly wave: number;
  readonly waveLog: readonly Readonly<{ wave: number | string; time: number; kills: number; died?: boolean }>[];
  readonly mods?: Readonly<{ owned?: Readonly<Record<string, number>> }>;
}

interface ArrivedEnemy {
  readonly kind?: string;
  readonly supportType?: string;
  readonly affixes?: readonly string[];
  readonly isBoss?: boolean;
}

interface Tally {
  wave: number;
  ticks: number;
  damageTaken: number;
  hitsTaken: number;
  healthAtStart: number;
  healthAtEnd: number;
}

/** The scenario for a run, admitted by the headless environment's own check, which refuses a wrong id by name. */
export function runScenario(request: RunRequest): TearScenarioV1 {
  if (!BOSS_PLAYER_IDS.includes(request.player))
    throw new RangeError(`no player "${request.player}"; the players are ${BOSS_PLAYER_IDS.join(", ")}`);
  if (!RUN_MODES.includes(request.mode))
    throw new RangeError(`a run is played in ${RUN_MODES.join(", ")}, not "${request.mode}"`);
  return requireProductionHeadlessScenario({
    format: TEAR_CONTRACT_FORMAT,
    kind: "scenario",
    schemaVersion: TEAR_CONTRACT_VERSION,
    id: `playtest-run-${request.mode}-${request.difficulty}-${request.weapon}-${request.seed}`,
    version: 1,
    description: "Playtest run",
    stateClass: "recorded-canonical",
    executionClass: "engineering",
    seed: request.seed,
    start: { mode: request.mode, difficulty: request.difficulty, weapon: request.weapon },
    maxTicks: request.maxTicks,
    assertions: ["runtime.finite-state"],
    tags: ["playtest"],
  });
}

/**
 * Plays one run from wave 1 on the real game, headless, as a player's run goes: the player drafts from what the
 * game offers after each wave and skips each story chapter. Measures it wave by wave.
 */
export function playRun(request: RunRequest, player: BossPlayer = createBossPlayer(request.player)): RunResult {
  const environment = createProductionHeadlessEnvironment();
  try {
    environment.reset(runScenario(request));
    const run = (): RunView => environment.world().run() as unknown as RunView;
    const tallies: Tally[] = [];
    const seen = new Set<unknown>();
    const appeared = { offered: new Set<string>(), enemies: new Set<string>(), affixes: new Set<string>() };
    const bossPhases = new Set<string>();
    let ticks = 0;
    let end: RunEnd | undefined;
    let reason: string | undefined;
    while (end === undefined) {
      // The Adventure opens each stage with a story chapter that holds the run until the player skips it.
      if (chapterHolds(environment) && environment.cinematicActive())
        if (!skipChapter(environment)) {
          end = "broken";
          reason = `the story chapter before wave ${String(run().wave)} did not end`;
          break;
        }
      const view = agentView(environment, request.weapon);
      const health = view.state.player.hp;
      const wave = run().wave;
      if (view.ui.screen === "draft") for (const choice of view.ui.choices) appeared.offered.add(choice.id);
      const boss = readBoss(environment.world());
      if (boss !== null) bossPhases.add(`${boss.id} phase ${String(boss.phase)}`);
      for (const enemy of environment.world().enemies() as readonly ArrivedEnemy[]) {
        if (seen.has(enemy)) continue;
        seen.add(enemy);
        if (enemy.isBoss === true) continue;
        appeared.enemies.add(kindOf(enemy));
        for (const affix of enemy.affixes ?? []) appeared.affixes.add(affix);
      }
      let tally = tallies.at(-1);
      if (tally?.wave !== wave) {
        tally = { wave, ticks: 0, damageTaken: 0, hitsTaken: 0, healthAtStart: health, healthAtEnd: health };
        tallies.push(tally);
      }
      const step = environment.step(player.decide(view, null, readPlayerBox(environment.world())));
      ticks += 1;
      const after = environment.policyObservation().player.hp;
      tally.ticks += 1;
      tally.healthAtEnd = after;
      if (after < health) {
        tally.damageTaken += health - after;
        tally.hitsTaken += 1;
      }
      if (after <= 0) end = "player defeated";
      else if (step.terminated) {
        const screen = environment.policyUiObservation().screen;
        end = screen === "win" ? "won" : "broken";
        if (end === "broken") reason = `the run ended on the ${screen} screen with the player alive`;
      } else if (step.truncated || ticks >= request.maxTicks) end = "time limit";
    }
    const log = run().waveLog;
    return {
      ...request,
      end,
      ...(reason === undefined ? {} : { reason }),
      ticks,
      endWave: run().wave,
      waves: tallies.map((tally, index) => {
        const logged = log.find((entry) => entry.wave === tally.wave);
        return {
          wave: tally.wave,
          cleared: end === "won" || index < tallies.length - 1,
          ticks: logged === undefined ? tally.ticks : Math.round(logged.time * TEAR_SIMULATION_TICKS_PER_SECOND),
          damageTaken: tally.damageTaken,
          hitsTaken: tally.hitsTaken,
          healthAtStart: tally.healthAtStart,
          healthAtEnd: tally.healthAtEnd,
          kills: logged?.kills ?? 0,
        };
      }),
      upgrades: { ...(run().mods?.owned ?? {}) },
      appeared: {
        offered: [...appeared.offered].sort(),
        enemies: [...appeared.enemies].sort(),
        affixes: [...appeared.affixes].sort(),
        bossPhases: [...bossPhases].sort(),
      },
    };
  } finally {
    environment.dispose();
  }
}
