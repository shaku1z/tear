export interface BossStepPlatform { readonly x: number; readonly y: number; readonly w: number; readonly floor?: boolean; readonly oneway?: boolean }
export interface BossStepPlayer { readonly x: number; readonly y: number; readonly hw: number; readonly hh: number; readonly onGround: boolean }
export interface BossStepEnemy {
  x: number; y: number; hw: number; hh: number; dead?: boolean; isBoss?: boolean; onGround?: boolean; spiked?: boolean;
  witnessEarned?: boolean; campT?: number; campPlat?: BossStepPlatform | null;
  requestVoidCinematic?: boolean; freezeVoid?: boolean; thawVoid?: boolean; spawnAdds?: boolean;
  mode?: string; downText?: string; reviveText?: string; spawnClone?: boolean; facing: number;
  revive?(): void;
}
export interface BossStepVoidState { active: boolean; frozen: boolean; speed: number; speedCap: number }
export interface BossStepRun {
  voidScroll?: BossStepVoidState | null; bossAdds?: BossStepEnemy[]; echoClones?: BossStepEnemy[] | null;
}
export interface BossStepOptions {
  readonly dt: number; readonly player: BossStepPlayer; readonly platforms: readonly BossStepPlatform[];
  readonly enemies: BossStepEnemy[]; readonly run: BossStepRun;
  readonly thawMultiplier: number; readonly maximumScrollSpeed: number;
  unlockWitness(): void; startVoidDescent(boss: BossStepEnemy): void;
  spawnAdds(boss: BossStepEnemy): BossStepEnemy[]; spawnClone(boss: BossStepEnemy): void;
  floater(x: number, y: number, text: string): void; dramaticBeat(): void;
  removeClone(clone: BossStepEnemy): void; spikeImpact(enemy: BossStepEnemy): void;
}

export function stepBossRuntime(options: BossStepOptions): void {
  const boss = options.enemies.find((enemy) => enemy.isBoss);
  if (boss) {
    if (boss.witnessEarned) { boss.witnessEarned = false; options.unlockWitness(); }
    const perch = options.player.onGround ? options.platforms.find((platform) => platform.oneway === true && platform.floor !== true &&
      Math.abs(options.player.y + options.player.hh - platform.y) < 6 && options.player.x + options.player.hw > platform.x &&
      options.player.x - options.player.hw < platform.x + platform.w) : null;
    if (perch && options.player.y < boss.y - boss.hh * 0.4) { boss.campT = (boss.campT ?? 0) + options.dt; boss.campPlat = perch; }
    else { boss.campT = Math.max(0, (boss.campT ?? 0) - options.dt * 1.6); if (boss.campT <= 0) boss.campPlat = null; }
    if (boss.requestVoidCinematic) { boss.requestVoidCinematic = false; options.startVoidDescent(boss); }
    if (boss.freezeVoid && options.run.voidScroll) { boss.freezeVoid = false; options.run.voidScroll.active = false; options.run.voidScroll.frozen = true; }
    if (boss.thawVoid && options.run.voidScroll) {
      boss.thawVoid = false; options.run.voidScroll.frozen = false; options.run.voidScroll.active = true;
      options.run.voidScroll.speedCap = options.maximumScrollSpeed * options.thawMultiplier;
      options.run.voidScroll.speed = Math.min(options.run.voidScroll.speed * options.thawMultiplier, options.run.voidScroll.speedCap);
    }
    if (boss.spawnAdds) {
      boss.spawnAdds = false; options.run.bossAdds = options.spawnAdds(boss);
      options.floater(boss.x, boss.y - 90, boss.downText ?? "NOT YET"); options.dramaticBeat();
    }
    if (boss.mode === "downed" && options.run.bossAdds?.length && options.run.bossAdds.every((add) => add.dead)) {
      boss.revive?.(); options.floater(boss.x, boss.y - 90, boss.reviveText ?? "FRENZY!"); options.dramaticBeat();
    }
    if (boss.spawnClone) { boss.spawnClone = false; options.spawnClone(boss); }
    if (boss.mode === "invert" && options.run.echoClones) {
      for (const clone of options.run.echoClones) if (!clone.dead) { clone.dead = true; options.removeClone(clone); }
      options.run.echoClones = null;
    }
  }
  for (const enemy of options.enemies) if (enemy.spiked && enemy.onGround) {
    enemy.spiked = false; options.spikeImpact(enemy);
  }
}
