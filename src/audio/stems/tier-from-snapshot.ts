import { isMusicShell, type MusicContextSnapshot } from "../music-contracts";
import type { Tier } from "./types";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const normalized = (value: number, max: number): number => clamp01(value / max);

/**
 * Map a game snapshot to an adaptive tier (0..4), mirroring the TearScore
 * director's intensity model so recorded stem cues escalate the same way the
 * procedural engine does.
 */
export function tierFromSnapshot(snapshot: MusicContextSnapshot): Tier {
  const scene = snapshot.scene;
  // The menu is a showcase, not a lull: play the complete arrangement there.
  if (isMusicShell(scene, snapshot.biomeId)) return 4;
  if (scene === "main-menu") return 0;
  if (scene === "preparation" || scene === "paused" || scene === "draft") {
    return 0;
  }

  const rank = snapshot.comboRankId.toUpperCase();
  if (rank === "TEARING!" || rank === "TEARING") return 4;

  const boss = snapshot.bossActive && (snapshot.bossHealthRatio ?? 1) >= 0;
  if (boss && ((snapshot.bossHealthRatio ?? 1) <= 0.25 || (snapshot.bossPhase ?? 1) >= 3)) {
    return 4;
  }

  const enemyPressure =
    normalized(snapshot.liveEnemies ?? 0, 8) * 0.65 +
    normalized(snapshot.queuedEnemies ?? 0, 8) * 0.35;
  const projectilePressure = normalized(snapshot.projectileCount ?? 0, 12);
  const healthRisk = 1 - clamp01(snapshot.playerHealthRatio);
  const combo =
    ({ NICE: 0.2, STYLISH: 0.4, BRUTAL: 0.6, SAVAGE: 0.8, "TEARING!": 1 } as Record<string, number>)[
      rank
    ] ?? 0;

  const intensity = clamp01(
    enemyPressure * 0.32 +
      projectilePressure * 0.1 +
      combo * 0.23 +
      (snapshot.horde ? 0.16 : 0) +
      (snapshot.miniBoss ? 0.12 : 0) +
      (boss ? 0.28 : 0),
  );
  const danger = clamp01(healthRisk * 0.54 + enemyPressure * 0.18 + projectilePressure * 0.14);
  const tension = clamp01(
    enemyPressure * 0.36 + projectilePressure * 0.24 + healthRisk * 0.18 + (boss ? 0.4 : 0),
  );

  const score = Math.max(intensity, danger * 0.9, tension * 0.75);
  const enter = [0.12, 0.32, 0.58, 0.82] as const;
  let tier = 0;
  for (const [level, threshold] of enter.entries()) {
    if (score >= threshold) tier = level + 1;
  }
  return tier as Tier;
}
