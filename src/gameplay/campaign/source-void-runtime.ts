import type { ArenaPlatform, SourceVoidActor, SourceVoidController, SourceVoidIntent, SourceVoidPlayer, SourceVoidState } from "../training/arena-rules";
import type { VoidLane } from "../voidgen-contracts";

export interface SourceRuntimeOwner extends SourceVoidActor {
  readonly presentationId?: string; readonly bossId?: string;
  breachState?: string; breachContactSpent?: boolean;
  beginVoidRun?(): void; startVoidSiphon?(player: SourceRuntimePlayer): number;
}

export interface SourceRuntimePlayer extends SourceVoidPlayer {
  hp: number; maxDashCharges: number; dashCharges: number;
  hazardT: number; hazardDmgMult: number;
  takeDamage(damage: number, sourceX: number, owner: SourceRuntimeOwner): string;
}

export interface SourceRuntimeProjectile {
  owner?: object | null; dead?: boolean; family?: string; surfacePlatformId?: string | null;
  x: number; y: number; r: number; surfaceLeft?: number | null; surfaceRight?: number | null; surfaceY?: number | null;
}

export interface SourceVoidRuntimeDependencies<TProjectile extends SourceRuntimeProjectile> {
  readonly controller: SourceVoidController;
  readonly player: SourceRuntimePlayer;
  readonly platforms: ArenaPlatform[];
  readonly projectiles: TProjectile[];
  readonly perfectColor: string;
  readonly runTime: number;
  readonly state: SourceVoidState | null;
  replaceProjectiles(projectiles: TProjectile[]): void;
  replacePlatforms(platforms: ArenaPlatform[]): void;
  clearDescent(): void;
  clearBossBeat(): void;
  setWorldZoom(value: number): void;
  spawnWisp(x: number, y: number, lane: VoidLane): void;
  liveWispCount(): number;
  flash(amount: number): void; shake(amount: number): void;
  explode(x: number, y: number, color: string, scale: number): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  ring(x: number, y: number, radius: number, color: string): void;
  shockwave(x: number, y: number, radius: number, color: string, speed: number, width: number): void;
  musicDuck(amount: number, duration: number): void; voidMix(amount: number, duration: number): void;
  sound(cue: "source-dialogue" | "void-ground-tear"): void;
  voidTransfer(): void;
  onDamageResult(result: string): void;
  floater(x: number, y: number, text: string, emphasis: boolean, color: string): void;
}

export interface SourceVoidRuntimeBridge {
  actor(owner: SourceRuntimeOwner): SourceVoidActor;
  execute(intents: readonly SourceVoidIntent[], owner: SourceRuntimeOwner): void;
  supporting(actor: Readonly<{ x: number; y: number; hw: number; hh: number }>): ArenaPlatform | null;
  syncPlayer(): ArenaPlatform | null;
  updateHazards(state: SourceVoidState, dt: number): void;
  update(dt: number): void;
}

export function createSourceVoidRuntimeBridge<TProjectile extends SourceRuntimeProjectile>(
  dependencies: SourceVoidRuntimeDependencies<TProjectile>,
): SourceVoidRuntimeBridge {
  function actor(owner: SourceRuntimeOwner): SourceVoidActor {
    return { id: owner.presentationId ?? owner.bossId ?? "source", x: owner.x, y: owner.y, color: owner.color };
  }

  function execute(intents: readonly SourceVoidIntent[], owner: SourceRuntimeOwner): void {
    for (const intent of intents) {
      if (intent.type === "clear-owner-projectiles") dependencies.replaceProjectiles(dependencies.projectiles.filter((shot) => shot.owner !== owner));
      else if (intent.type === "flash") dependencies.flash(intent.amount);
      else if (intent.type === "shake") dependencies.shake(intent.amount);
      else if (intent.type === "explode") dependencies.explode(intent.x, intent.y, intent.color, intent.scale);
      else if (intent.type === "burst") dependencies.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color);
      else if (intent.type === "ring") dependencies.ring(intent.x, intent.y, intent.radius, intent.color);
      else if (intent.type === "remove-surface-projectiles") {
        for (const shot of dependencies.projectiles) if (shot.surfacePlatformId === intent.platformId) shot.dead = true;
      } else if (intent.type === "shift-surface-projectiles") {
        for (const shot of dependencies.projectiles) {
          if (shot.family !== "groundShock" || !shot.surfacePlatformId) continue;
          const surface = dependencies.platforms.find((platform) => platform.platformId === shot.surfacePlatformId);
          if (!surface) { shot.dead = true; continue; }
          shot.x += intent.amount; shot.surfaceLeft = surface.x; shot.surfaceRight = surface.x + surface.w;
          shot.surfaceY = surface.y; shot.y = surface.y - shot.r;
        }
      } else if (intent.type === "spawn-wisp") dependencies.spawnWisp(intent.x, intent.y, intent.lane);
      else if (intent.type === "source-breach-lock") { dependencies.clearBossBeat(); owner.breachState = "follow"; owner.breachContactSpent = true; }
      else if (intent.type === "begin-void-run") owner.beginVoidRun?.();
      else if (intent.type === "shockwave") dependencies.shockwave(intent.x, intent.y, intent.radius, intent.color, intent.speed, intent.width);
      else if (intent.type === "music-duck") dependencies.musicDuck(intent.amount, intent.duration);
      else if (intent.type === "void-mix") dependencies.voidMix(intent.amount, intent.duration);
      else if (intent.type === "world-zoom") dependencies.setWorldZoom(intent.value);
      else if (intent.type === "clear-void-transition") dependencies.clearDescent();
      else if (intent.type === "sound") dependencies.sound(intent.cue);
      else if (intent.type === "damage-player") dependencies.onDamageResult(dependencies.player.takeDamage(intent.damage, intent.sourceX, owner));
      else {
        const result = dependencies.player.takeDamage(intent.damage, dependencies.player.x, owner);
        if (dependencies.player.hp <= 0) dependencies.player.hp = 1;
        dependencies.player.x = intent.x; dependencies.player.y = intent.y; dependencies.player.vy = intent.verticalSpeed;
        dependencies.player.iframe = Math.max(dependencies.player.iframe, intent.iframe); dependencies.player.voidSlowT = intent.slowDuration;
        dependencies.player.voidTransferT = Math.max(dependencies.player.voidTransferT, intent.transferGrace);
        dependencies.player.dashCharges = dependencies.player.maxDashCharges;
        if (intent.lane) { dependencies.player.voidLane = intent.lane; if (dependencies.state) dependencies.state.playerLane = intent.lane; }
        const fed = owner.startVoidSiphon?.(dependencies.player) ?? 0;
        dependencies.shockwave(dependencies.player.x, dependencies.player.y + 150, 12, dependencies.perfectColor, 210, 5);
        dependencies.burst(dependencies.player.x, dependencies.player.y + 120, 0, -1, 16, dependencies.perfectColor);
        dependencies.floater(dependencies.player.x, dependencies.player.y - 28, `THE VOID BITES  -${String(intent.damage)}`, true, dependencies.perfectColor);
        if (fed > 0) dependencies.floater(owner.x, owner.y - 56, `+${String(Math.round(fed))}  FEED`, true, dependencies.perfectColor);
        dependencies.onDamageResult(result);
      }
    }
  }

  function supporting(target: Readonly<{ x: number; y: number; hw: number; hh: number }>): ArenaPlatform | null {
    return dependencies.state ? dependencies.controller.supportingPlatform(dependencies.state, target) : null;
  }

  function syncPlayer(): ArenaPlatform | null {
    const state = dependencies.state;
    if (!state) { dependencies.player.supportPlatform = null; dependencies.player.voidLane = null; dependencies.player.voidMajorWindow = false; return null; }
    const priorLane = state.playerLane, standing = dependencies.controller.syncPlayer(state, dependencies.player);
    if (standing && priorLane && standing.voidLane !== priorLane) dependencies.voidTransfer();
    return standing;
  }

  function updateHazards(state: SourceVoidState, dt: number): void {
    execute(dependencies.controller.updateHazards(state, dt, dependencies.player, dependencies.runTime), state.owner);
    dependencies.replacePlatforms(state.platforms);
  }

  function update(dt: number): void {
    const state = dependencies.state; if (!state) return;
    execute(dependencies.controller.update(state, dt, dependencies.player, dependencies.liveWispCount()), state.owner);
    dependencies.replacePlatforms(state.platforms); updateHazards(state, dt);
  }

  return { actor, execute, supporting, syncPlayer, updateHazards, update };
}
