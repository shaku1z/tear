import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveGameHostState } from "./live-game-host-state";
import type { LegacyAppScreen } from "./legacy-state-controller";

interface DebugCinemaSnapshot {
  readonly id: string | undefined;
  readonly beatId: string | undefined;
  readonly active: boolean;
  readonly elapsed: number;
}

interface DebugRewardSnapshot {
  readonly rerolls: number;
  readonly choices: readonly unknown[];
  readonly reserveChoices: readonly unknown[];
  readonly reservedChoice: Readonly<{ id: string }> | null;
}

interface DebugRenameSnapshot { readonly active: boolean; readonly previous: string }

interface DebugSettingsSnapshot {
  readonly cinematics: string;
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly interfaceVolume: number;
  readonly masterMuted: boolean;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  readonly interfaceMuted: boolean;
}

export interface LiveDebugSnapshotOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly state: LiveGameHostState;
  readonly width: number;
  readonly height: number;
  readonly screen: LegacyAppScreen;
  readonly cinema: DebugCinemaSnapshot;
  readonly settings: DebugSettingsSnapshot;
  readonly selected: Readonly<{ mode: string; difficulty: string; weapon: string; boss: string }>;
  readonly chapterBrief: boolean;
  readonly finale: Readonly<{ phase: string; severed: number; landed: boolean; restoring?: unknown }> | null;
  readonly reward: DebugRewardSnapshot | null;
  readonly rename: DebugRenameSnapshot;
  readonly replay: object | null;
  readonly authoritative: Readonly<{ tick: number; stateHash: string }> | null;
}

export function auditLiveEffects(
  dependencies: GameRuntimeDependencies,
  width: number,
  height: number,
): Readonly<{ high: number; low: number; offscreenAdded: number }> {
  const { FX, GFX } = dependencies;
  const priorLow = GFX.low;
  FX.reset(); FX.setViewRect({ left: 0, top: 0, right: width, bottom: height }); GFX.low = false;
  for (let index = 0; index < 1000; index++) FX.spark(width * 0.5, height * 0.5, 1, 0, "#fff");
  const high = FX.list.length;
  FX.reset(); GFX.low = true; FX.setViewRect({ left: 0, top: 0, right: width, bottom: height });
  for (let index = 0; index < 1000; index++) FX.spark(width * 0.5, height * 0.5, 1, 0, "#fff");
  const low = FX.list.length, before = FX.list.length;
  for (let index = 0; index < 50; index++) FX.spark(width * 4, height * 4, 1, 0, "#fff");
  const offscreenAdded = FX.list.length - before;
  FX.reset(); GFX.low = priorLow;
  return Object.freeze({ high, low, offscreenAdded });
}

export function createLiveDebugSnapshot(options: LiveDebugSnapshotOptions): object {
  const { dependencies: d, state } = options;
  const input = document.getElementById("nameInput");
  const nameValue = input instanceof HTMLInputElement ? input.value.trim() : "";
  const renameValid = nameValue.length >= 3 && nameValue.length <= 16 && /^[a-zA-Z0-9 _-]+$/.test(nameValue);
  const run = state.run(), player = state.player(), blade = state.blade(), reward = options.reward, rename = options.rename;
  const simulationTick = Math.round(d.CLOCK.sim * 120);
  return {
    game: options.screen, cinema: options.cinema.id, beat: options.cinema.beatId,
    active: options.cinema.active, cinemaElapsed: options.cinema.elapsed, touch: d.Input.touchActive(),
    pad: typeof d.PAD === "undefined" ? null : { connected: d.PAD.connected, active: d.PAD.active,
      movingRight: d.Input.held.has("KeyD"), aiming: Boolean(d.Input.stickAim) },
    audio: { ready: Boolean(d.SFX.ctx), running: d.SFX.ctx?.state === "running", filter: Boolean(d.SFX.musicFilter),
      duck: d.SFX._musicDuck, voidMix: d.SFX._voidMix },
    mode: run?.mode, difficulty: run?.diff, weapon: run?.weaponId,
    chapterBrief: options.chapterBrief,
    attract: { ready: d.Attract.ready, biome: d.Attract.ready ? d.Attract.stage().name : null },
    setup: options.selected,
    draft: run && reward ? { rerolls: reward.rerolls, choiceCount: reward.choices.length,
      reserveCount: reward.reserveChoices.length, reservedId: reward.reservedChoice?.id } : null,
    replay: options.replay,
    rename: rename.active ? { value: nameValue, length: nameValue.length, valid: renameValid, returnTo: rename.previous } : null,
    reducedMotion: d.A11Y.reducedMotion, highContrast: d.A11Y.highContrast, lowEffects: d.GFX.low,
    settings: options.settings, playerHp: player?.hp, enemyCount: state.enemies().length,
    simulationTick, runTime: run?.runTime, waveTime: run?.waveTime,
    playerTrace: player ? {
      x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp,
      onGround: player.onGround, coyote: player.coyote, jumpBuffer: player.jumpBuf,
      dashTimer: player.dashTimer, dashCooldown: player.dashCd, guardTime: player.guardT,
    } : null,
    bladeTrace: blade ? {
      state: blade.state, x: blade.x, y: blade.y, vx: blade.vx, vy: blade.vy,
      tipX: blade.tipX, tipY: blade.tipY, tipVX: blade.tipVX, tipVY: blade.tipVY,
      aimX: blade.aimX, aimY: blade.aimY, reticleX: blade.reticleX, reticleY: blade.reticleY,
      flyTime: blade.flyTime, tension: blade.tension, secondaryActive: blade.secondaryActive,
    } : null,
    enemyTrace: state.enemies().filter((enemy) => !enemy.dead).slice(0, 24).map((enemy) => ({
      kind: enemy.kind, bossId: enemy.bossId, x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy,
      hp: enemy.hp, stun: enemy.stun, spawnT: enemy.spawnT, introT: enemy.introT ?? 0, aliveT: enemy.aliveT,
      onGround: enemy.onGround, behavior: enemy.behavior, attack: enemy.atk, attackTime: enemy.atkT,
      attackCooldown: enemy.atkCd, attackDirection: enemy.atkDir, chargePower: enemy.chargePower,
      maxHp: enemy.maxHp, hitCooldown: enemy.hitCd, dying: enemy.dying,
      aiState: "state" in enemy ? enemy.state : undefined,
      aimTimer: "aimTimer" in enemy ? enemy.aimTimer : undefined,
      windTime: "windT" in enemy ? enemy.windT : undefined,
      windMax: "windMax" in enemy ? enemy.windMax : undefined,
    })),
    projectileTrace: state.projectiles().filter((projectile) => !projectile.dead).slice(0, 24).map((projectile) => ({
      x: projectile.x, y: projectile.y, vx: projectile.vx, vy: projectile.vy, r: projectile.r,
      life: projectile.life, damage: projectile.dmg, deflectDamage: projectile.deflectDmg, family: projectile.family,
      kind: projectile.kind, deflected: projectile.deflected, perfect: projectile.perfect,
      charged: projectile.charged, dead: projectile.dead,
    })),
    mirrorTrace: d.Mirror.active ? {
      active: d.Mirror.active, attached: d.Mirror.host === state.enemies()[0],
      phase: d.Mirror.phase, sync: d.Mirror.sync, state: d.Mirror._state,
      stateTime: d.Mirror._stateT, decisionTime: d.Mirror._decideT,
      moveCooldown: d.Mirror._moveCd, move: d.Mirror.mv?.id ?? null,
      facing: d.Mirror.facing, readDistance: d.Mirror.read.dist,
      actor: {
        x: d.Mirror.actor.x, y: d.Mirror.actor.y, vx: d.Mirror.actor.vx, vy: d.Mirror.actor.vy,
        onGround: d.Mirror.actor.onGround, dashTimer: d.Mirror.actor.dashTimer,
      },
      blade: {
        state: d.Mirror.blade.state, x: d.Mirror.blade.x, y: d.Mirror.blade.y,
        tipX: d.Mirror.blade.tipX, tipY: d.Mirror.blade.tipY,
        tipVX: d.Mirror.blade.tipVX, tipVY: d.Mirror.blade.tipVY,
      },
    } : null,
    combatTrace: run ? { enemyCount: state.enemies().filter((enemy) => !enemy.dead).length,
      waveKills: run.waveKills, heldHits: run.weaponStats.heldHits,
      perfectParries: run.weaponStats.perfectParries } : null,
    bladeAim: blade ? { x: blade.aimX, y: blade.aimY, reticleX: blade.reticleX, reticleY: blade.reticleY } : null,
    authoritative: options.authoritative,
    finale: options.finale && { phase: options.finale.phase, severed: options.finale.severed,
      landed: options.finale.landed, restoring: Boolean(options.finale.restoring) },
  };
}
