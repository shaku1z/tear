import type { GameBlade, GameEnemy, GamePlayer, GameRun } from "../../gameplay/runtime/game-runtime-state";
import type { WorldRendererRegistry } from "../../presentation/world";
import type { UpgradePresentationSource } from "../../presentation/run-screen-snapshots";
import { buildHudSnapshot } from "../../presentation/world/hud-snapshot";
import {
  buildReticleSnapshot,
  buildStageBannerSnapshot,
  buildWaveBannerSnapshot,
} from "../../presentation/world/overlay-snapshots";
import { buildEnemyStatusSnapshot, type VisualEnemySource } from "../../presentation/world/runtime-snapshots";
import { gauntletTrialCard, gauntletWave } from "../../gameplay/run/gauntlet-trials";
import { bossName } from "../../gameplay/run/content-director";
import type { CONFIG } from "../../config/game-config";

type Config = Pick<typeof CONFIG, "status" | "colors" | "juice" | "blade" | "dash" | "trick">;
type Stage = Readonly<{ accent?: string; blurb?: string; name: string }>;

/** What the indicators read from a world: the live game's, or a replay's re-simulated one. */
export interface WorldIndicatorState {
  readonly run: () => GameRun;
  readonly player: () => GamePlayer | undefined;
  readonly blade: () => GameBlade | undefined;
  readonly enemies: () => readonly GameEnemy[];
  readonly bossIntro: () => { boss: GameEnemy; t: number; dur: number; delay: number } | null;
  /** Seconds left on the wave banner. */
  readonly bannerSeconds: () => number;
  readonly stage: () => Readonly<{ index: number; current: Stage; name: string; bannerSeconds: number }>;
  /** The HUD's eased values from the frame before: the health bar's lag and the multiplier's pop. */
  readonly hud: () => Readonly<{ lagHp: number; multiplier: number; multiplierPop: number }>;
  readonly hudClockSeconds: () => number;
  readonly deltaSeconds: () => number;
}

export interface WorldIndicatorStyle {
  readonly config: Config;
  readonly upgrades: readonly UpgradePresentationSource[];
  readonly flashScale: () => number;
  readonly fallbackAccent: () => string;
  readonly ink: () => string;
  readonly formatTime: (seconds: number) => string;
  readonly trickColor: (multiplier: number) => string;
  readonly ease: (amount: number) => number;
}

export interface WorldIndicators {
  /** Bleed, burn and mark over one enemy, drawn in the world. */
  readonly enemyStatus: (enemy: VisualEnemySource) => void;
  /** Health, dash, shield, multiplier, wave, score and the boss bar, drawn over the screen. */
  readonly hud: () => void;
  readonly waveBanner: () => void;
  readonly stageBanner: () => void;
  /** The blade's aim mark and its slam or updraft power, drawn in the world. */
  readonly reticle: () => void;
}

/**
 * The indicators play shows, built from a world's state and drawn through the world renderers. Live play
 * and the replay screen both draw them here, so a replay shows what the player saw.
 */
export function createWorldIndicators(
  world: WorldRendererRegistry,
  state: WorldIndicatorState,
  style: WorldIndicatorStyle,
): WorldIndicators {
  const { config } = style;
  return Object.freeze({
    enemyStatus(enemy: VisualEnemySource) {
      world.enemyStatus(
        buildEnemyStatusSnapshot(enemy, {
          bleedMaximum: config.status.bleedMax,
          bleedColor: config.colors.charger,
          burnColor: config.colors.slam,
          markColor: config.colors.eye,
        }),
      );
    },
    hud() {
      const run = state.run();
      const enemies = state.enemies();
      const boss = enemies.find((enemy) => enemy.isBoss);
      const previous = state.hud();
      const intro = state.bossIntro();
      const player = state.player();
      if (!player) return;
      const result = buildHudSnapshot({
        player,
        run: { ...run, owned: run.mods.owned },
        ...(boss ? { boss } : {}),
        ...(intro
          ? { bossIntro: { boss: intro.boss, delay: intro.delay, elapsed: intro.t, duration: intro.dur } }
          : {}),
        upgrades: style.upgrades,
        enemyCount: enemies.length,
        previousLagHp: previous.lagHp,
        previousMultiplier: previous.multiplier,
        multiplierPop: previous.multiplierPop,
        nowMilliseconds: state.hudClockSeconds() * 1000,
        flashScale: style.flashScale(),
        deltaSeconds: state.deltaSeconds(),
        stageAccent: state.stage().current.accent ?? "",
        fallbackAccent: style.fallbackAccent(),
        bossColor: config.colors.boss,
        dashCooldown: config.dash.cooldown,
        dashColor: config.colors.perfect,
        shieldColor: config.colors.armoredShield,
        trickDecay: config.trick.decay,
        formatTime: style.formatTime,
        trickColor: style.trickColor,
        ease: style.ease,
      });
      world.hud(result.snapshot);
    },
    waveBanner() {
      const run = state.run();
      world.waveBanner(
        buildWaveBannerSnapshot({
          remainingSeconds: state.bannerSeconds(),
          duration: config.juice.bannerTime,
          mode: run.mode,
          bossWave: !!run.isBossWave,
          wave: run.wave,
          ...(run.mode === "gauntlet" ? { trialCount: run.bossOrder.length } : {}),
          waveTag: run.waveTag,
          horde: !!run.horde,
          hordeColor: config.colors.charger,
          normalColor: config.colors.perfect,
        }),
      );
    },
    stageBanner() {
      const run = state.run(),
        stage = state.stage();
      world.stageBanner(
        buildStageBannerSnapshot({
          elapsed: stage.bannerSeconds,
          mode: run.mode,
          stageIndex: stage.index,
          // An empty name or accent means none, as in play.
          stageName: stage.name === "" ? stage.current.name : stage.name,
          blurb: stage.current.blurb ?? "",
          accent:
            stage.current.accent === undefined || stage.current.accent === "" ? style.ink() : stage.current.accent,
          trial: gauntletTrialBanner(run),
        }),
      );
    },
    reticle() {
      const blade = state.blade();
      if (!blade) return;
      const player = state.player();
      world.reticle(
        buildReticleSnapshot({
          blade,
          airborne: !!player && !player.onGround,
          playerVerticalSpeed: player?.vy ?? 0,
          slamMinDownSpeed: config.blade.slamMinDownSpeed,
          slamPowerSpeed: config.blade.slamPowerSpeed,
          slamEmpowerAt: config.blade.slamEmpowerAt,
          launchMinUpSpeed: config.blade.launchMinUpSpeed,
          risingSpeedReference: config.blade.risingSpeedRef,
          slamColor: config.colors.slam,
          updraftColor: config.colors.perfect,
        }),
      );
    },
  });
}

/** The Gauntlet trial card's label and boss; undefined outside a Gauntlet. */
function gauntletTrialBanner(
  run: Readonly<{ mode: string; wave: number; bossOrder?: readonly string[] }>,
): Readonly<{ label: string; boss: string }> | undefined {
  if (run.mode !== "gauntlet" || run.wave < 1 || run.bossOrder === undefined) return undefined;
  const trial = gauntletWave(run.wave).trial;
  const boss = run.bossOrder[trial];
  return boss === undefined
    ? undefined
    : { label: gauntletTrialCard(trial, run.bossOrder.length), boss: bossName(boss) };
}
