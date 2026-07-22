export interface EnemyStepActor {
  x: number; y: number; vx: number; vy: number; hw: number; hh: number;
  hp: number; maxHp: number; dead: boolean; dying?: boolean; spawnT: number; stun: number; hitCd: number;
  tutDummy?: boolean; cinematicRequest?: unknown; kind?: string; enraged?: boolean; isBoss?: boolean;
  bleedStacks: number; burnT: number; markT: number; slowStatus: number; _stFx: number; color?: string;
  _deathCause?: string; behavior?: string;
  tickTimers(dt: number): void; updateDeath(dt: number): boolean; tickStatus(dt: number): void;
  update(dt: number, platforms: readonly unknown[], player: unknown, projectiles: unknown[]): void;
}

export interface EnemyActorStepOptions {
  readonly dt: number; readonly enemies: EnemyStepActor[]; readonly platforms: readonly unknown[];
  readonly player: unknown; readonly projectiles: unknown[]; readonly freeze: boolean;
  readonly gravity: number; readonly groundY: number; readonly viewportWidth: number;
  onKill(enemy: EnemyStepActor, cause: string): void;
  startTransformation(enemy: EnemyStepActor, request: unknown): boolean;
}

export function stepEnemyActors(options: EnemyActorStepOptions): boolean {
  for (const enemy of options.enemies) {
    if (enemy.dying) {
      enemy.tickTimers(options.dt); if (enemy.updateDeath(options.dt)) options.onKill(enemy, enemy._deathCause ?? ""); continue;
    }
    if (enemy.spawnT > 0) { enemy.spawnT -= options.dt; continue; }
    if (options.freeze) continue;
    if (enemy.tutDummy) {
      enemy.tickTimers(options.dt); enemy.stun = 1;
      enemy.vy = (enemy.vy || 0) + options.gravity * options.dt;
      enemy.x += (enemy.vx || 0) * options.dt; enemy.y += enemy.vy * options.dt;
      enemy.vx = (enemy.vx || 0) * Math.max(0, 1 - 4 * options.dt);
      const floorY = options.groundY - enemy.hh;
      if (enemy.y >= floorY) { enemy.y = floorY; enemy.vy = 0; enemy.vx *= 0.85; }
      enemy.x = Math.max(enemy.hw, Math.min(enemy.x, options.viewportWidth - enemy.hw)); continue;
    }
    if (enemy.stun > 0) { enemy.tickTimers(options.dt); continue; }
    enemy.update(options.dt, options.platforms, options.player, options.projectiles);
    if (enemy.cinematicRequest && options.startTransformation(enemy, enemy.cinematicRequest)) return true;
  }
  return false;
}

export interface EnemyStatusStepOptions {
  readonly dt: number; readonly enemies: EnemyStepActor[]; readonly cinderSlow: boolean;
  readonly random: () => number;
  ember(x: number, y: number): void; drip(x: number, y: number): void;
  didDie(enemy: EnemyStepActor): boolean;
  onArmorBypass(): void; onKill(enemy: EnemyStepActor): void;
}

export function stepEnemyStatuses(options: EnemyStatusStepOptions): void {
  for (const enemy of options.enemies) {
    if (enemy.dead || enemy.dying || enemy.spawnT > 0) continue;
    enemy.slowStatus = options.cinderSlow && enemy.burnT > 0 ? 0.65 : 1;
    if (enemy.bleedStacks <= 0 && enemy.burnT <= 0 && enemy.markT <= 0) continue;
    enemy.tickStatus(options.dt); enemy._stFx -= options.dt;
    if (enemy._stFx <= 0) {
      enemy._stFx = 0.05;
      if (enemy.burnT > 0) { options.ember(enemy.x, enemy.y); options.ember(enemy.x, enemy.y - enemy.hh * 0.4); }
      if (enemy.bleedStacks > 0) {
        options.drip(enemy.x, enemy.y + enemy.hh * 0.35);
        if (enemy.bleedStacks > 2) options.drip(enemy.x + (options.random() - 0.5) * enemy.hw, enemy.y + enemy.hh * 0.2);
      }
    }
    if (options.didDie(enemy)) { if (enemy.kind === "armored" && !enemy.enraged) options.onArmorBypass(); options.onKill(enemy); }
  }
}
