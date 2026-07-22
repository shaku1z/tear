import type { HudSnapshot } from "./contracts";

export interface HudPlayerSource {
  readonly hp: number; readonly maxHp: number; readonly oneHit?: boolean;
  readonly dashCharges?: number; readonly maxDashCharges?: number; readonly dashCd: number;
  readonly shield: number; readonly maxShield: number;
}
export interface HudBossSource {
  readonly bossName?: string; readonly epithet?: string; readonly phaseTag?: string; readonly color?: string;
  readonly hp: number; readonly maxHp: number; readonly phaseMarks?: readonly number[];
  readonly _phaseFlashT?: number; readonly guardMeter?: number;
}
export interface HudUpgradeSource { readonly id: string; readonly name: string; readonly unique?: boolean }
export interface HudRunSource {
  readonly mode: string; readonly isBossWave?: boolean; readonly wave: number; readonly score: number; readonly runTime: number;
  readonly mult: number; readonly rank?: string; readonly comboTimer: number;
  readonly spawnQueue: readonly unknown[]; readonly owned: Readonly<Record<string, number>>;
}
export interface HudSnapshotInput {
  readonly player: HudPlayerSource; readonly run: HudRunSource; readonly boss?: HudBossSource;
  readonly bossIntro?: Readonly<{ boss: HudBossSource; delay: number; elapsed: number; duration: number }>;
  readonly upgrades: readonly HudUpgradeSource[]; readonly enemyCount: number;
  readonly previousLagHp: number; readonly previousMultiplier: number; readonly multiplierPop: number;
  readonly nowMilliseconds: number; readonly flashScale: number; readonly deltaSeconds: number;
  readonly stageAccent: string; readonly fallbackAccent: string; readonly bossColor: string;
  readonly dashCooldown: number; readonly dashColor: string; readonly shieldColor: string;
  readonly trickDecay: number; readonly formatTime: (seconds: number) => string;
  readonly trickColor: (multiplier: number) => string; readonly ease: (amount: number) => number;
}
export interface HudSnapshotResult {
  readonly snapshot: HudSnapshot; readonly lagHp: number; readonly multiplier: number;
  readonly multiplierPop: number; readonly bossPhaseFlashTime?: number;
}
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function buildHudSnapshot(input: HudSnapshotInput): HudSnapshotResult {
  const hpFraction = clamp01(input.player.hp / input.player.maxHp);
  const lagHp = hpFraction < input.previousLagHp
    ? input.previousLagHp + (hpFraction - input.previousLagHp) * 0.07 : hpFraction;
  const multiplierPop = Math.max(0, (input.run.mult > input.previousMultiplier ? 1 : input.multiplierPop) - 0.06);
  const boss = input.boss;
  let bossSnapshot: HudSnapshot["boss"];
  let bossPhaseFlashTime: number | undefined;
  if (boss !== undefined) {
    const phaseFlashTime = boss._phaseFlashT ?? 0;
    let introSweep = 1;
    if (input.bossIntro?.boss === boss && input.bossIntro.delay <= 0) {
      introSweep = input.ease(clamp01(input.bossIntro.elapsed / (input.bossIntro.duration * 0.7)));
    }
    bossSnapshot = {
      name: boss.bossName ?? "BOSS", epithet: boss.epithet, phaseTag: boss.phaseTag,
      color: boss.color ?? input.bossColor, hpFraction: clamp01(boss.hp / boss.maxHp),
      phaseMarks: boss.phaseMarks, phaseFlash: phaseFlashTime * input.flashScale,
      guard: boss.guardMeter, introSweep,
    };
    bossPhaseFlashTime = phaseFlashTime > 0 ? Math.max(0, phaseFlashTime - input.deltaSeconds) : phaseFlashTime;
  }
  const snapshot: HudSnapshot = {
    player: {
      hp: input.player.hp, maxHp: input.player.maxHp, hpFraction, lagHpFraction: lagHp,
      lowHpPulse: 0.5 + 0.5 * Math.sin(input.nowMilliseconds / 150), oneHit: input.player.oneHit === true,
      accent: input.stageAccent || input.fallbackAccent,
      dashCharges: input.player.dashCharges ?? (input.player.dashCd <= 0 ? 1 : 0),
      maxDashCharges: Math.max(1, input.player.maxDashCharges ?? 1),
      dashRechargeFraction: 1 - clamp01(input.player.dashCd / input.dashCooldown), dashColor: input.dashColor,
      shield: input.player.shield, maxShield: input.player.maxShield, shieldColor: input.shieldColor,
      abilities: Object.keys(input.run.owned).flatMap((id) => {
        const upgrade = input.upgrades.find((entry) => entry.id === id);
        return upgrade === undefined ? [] : [(upgrade.unique ? "★ " : "") + upgrade.name +
          (upgrade.unique ? "" : " ×" + String(input.run.owned[id] ?? 0))];
      }),
    },
    run: {
      mode: input.run.mode, bossWave: input.run.isBossWave === true, wave: input.run.wave, score: input.run.score,
      timeLabel: input.formatTime(input.run.runTime), remaining: input.enemyCount + input.run.spawnQueue.length,
      multiplier: input.run.mult, rank: input.run.rank, multiplierPop,
      comboFraction: clamp01(input.run.comboTimer / input.trickDecay), trickColor: input.trickColor(input.run.mult),
    },
    boss: bossSnapshot,
  };
  return Object.freeze({ snapshot: Object.freeze(snapshot), lagHp, multiplier: input.run.mult, multiplierPop,
    ...(bossPhaseFlashTime === undefined ? {} : { bossPhaseFlashTime }) });
}
