import type { StyleIntent, StyleState } from "./style-runtime";
import type { AchievementIntent } from "../progression/achievement-runtime";

export interface MutableStyleRun {
  combo: number; comboTimer: number; lastTrick: string; mult: number; rank: string; wavePeak: number; runTime: number;
}

export function snapshotStyle(run: MutableStyleRun): StyleState {
  return Object.freeze({ combo: run.combo, comboTimer: run.comboTimer, lastTrick: run.lastTrick,
    mult: run.mult, rank: run.rank, wavePeak: run.wavePeak, runTime: run.runTime });
}

export function applyStyleSnapshot(run: MutableStyleRun, state: StyleState): void {
  run.combo = state.combo; run.comboTimer = state.comboTimer; run.lastTrick = state.lastTrick;
  run.mult = state.mult; run.rank = state.rank; run.wavePeak = state.wavePeak;
}

export interface StyleIntentPorts {
  tutorialMark(kind: string): void;
  ghostCapture(kind: string, x: number, y: number, importance: 1 | 2 | 3): void;
  playerTrick(kind: string, at: number): void;
  rankUp(rank: string): void;
  musicRankChanged(rank: string): void;
  haptic(pattern: number | readonly number[]): void;
  profileAdd(stat: string, amount: number): void;
  dailyBump(stat: string, amount: number): void;
  profileMax(stat: string, value: number): void;
  achievementCheck(): void;
}

export function executeStyleIntents(intents: readonly StyleIntent[], ports: StyleIntentPorts): void {
  for (const intent of intents) {
    switch (intent.type) {
      case "tutorial-mark": ports.tutorialMark(intent.kind); break;
      case "ghost-capture": ports.ghostCapture(intent.kind, intent.x, intent.y, intent.importance); break;
      case "player-trick": ports.playerTrick(intent.kind, intent.at); break;
      case "rank-up": ports.rankUp(intent.rank); break;
      case "music-rank-changed": ports.musicRankChanged(intent.rank); break;
      case "haptic": ports.haptic(intent.pattern); break;
      case "profile-add": ports.profileAdd(intent.stat, intent.amount); break;
      case "daily-bump": ports.dailyBump(intent.stat, intent.amount); break;
      case "profile-max": ports.profileMax(intent.stat, intent.value); break;
      case "achievement-check": ports.achievementCheck(); break;
    }
  }
}

export function executeAchievementIntents(
  intents: readonly AchievementIntent[],
  profileMax: (stat: string, value: number) => void,
  achievementCheck: () => void,
): void {
  for (const intent of intents) {
    if (intent.type === "profile-max") profileMax(intent.stat, intent.value);
    else achievementCheck();
  }
}

export interface SplitProjectile {
  x: number; y: number; vx: number; vy: number; deflectDmg: number; bounces: number;
  owner: unknown; sourceEnemy?: unknown; perfect: boolean; pierce?: boolean; pierced?: Set<unknown> | null;
  deflect(x: number, y: number, speed: number, perfect: boolean): void;
}

export function splitParryProjectile<T extends SplitProjectile>(
  parent: T,
  projectileSpeed: number,
  create: (x: number, y: number, vx: number, vy: number) => T,
  add: (projectile: T) => void,
): void {
  const speed = Math.min(Math.hypot(parent.vx, parent.vy) || projectileSpeed, projectileSpeed * 1.3);
  const baseAngle = Math.atan2(parent.vy, parent.vx);
  parent.deflectDmg = Math.max(6, Math.round(parent.deflectDmg * 0.4));
  parent.bounces = 2;
  parent.vx = Math.cos(baseAngle) * speed;
  parent.vy = Math.sin(baseAngle) * speed;
  for (const offset of [-0.34, 0.34]) {
    const angle = baseAngle + offset;
    const shard = create(parent.x, parent.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
    shard.owner = parent.owner;
    shard.sourceEnemy = parent.sourceEnemy ?? parent.owner;
    shard.deflect(Math.cos(angle), Math.sin(angle), speed, parent.perfect);
    shard.vx = Math.cos(angle) * speed; shard.vy = Math.sin(angle) * speed;
    shard.deflectDmg = parent.deflectDmg; shard.bounces = 2;
    if (parent.pierce) { shard.pierce = true; shard.pierced = new Set(); }
    add(shard);
  }
}
