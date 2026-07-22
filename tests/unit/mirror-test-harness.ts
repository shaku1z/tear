import { CLOCK, CONFIG } from "../../src/config/game-config";
import { clamp, lerp } from "../../src/domain/geometry";
import type { BladeActionResult, BladePoint } from "../../src/gameplay/entities/blade";
import { createMirrorTypes } from "../../src/gameplay/entities/mirror";
import type { MirrorBladePort, MirrorPlayerPort } from "../../src/gameplay/entities/mirror-contracts";
import type { PlayerInputPort, PlayerPlatformPort } from "../../src/gameplay/entities/player";
import { createEnemyHarness } from "./enemy-test-harness";

class MirrorTestPlayer implements MirrorPlayerPort {
  x: number; y: number; vx = 0; vy = 0; hw = 15; hh = 23;
  hp = 100; maxHp = 100; facing = 1; onGround = true;
  maxDashCharges = 1; dashCharges = 1; dashTimer = 0; iframe = 0; guardT = 0;
  lastTrickT = 0; lastTrickKind = ""; aiInput?: PlayerInputPort;
  constructor(x: number, y: number) { this.x = x; this.y = y; }
  get invulnerable() { return this.iframe > 0; }
  update(dt: number, platforms: readonly PlayerPlatformPort[]): void { void platforms; this.x += this.vx * dt; this.y += this.vy * dt; }
  draw(surface: unknown): void { void surface; }
  takeHit(damage: number, knockbackX: number, knockbackY: number): string {
    this.hp -= damage; this.vx += knockbackX; this.vy += knockbackY; return this.hp <= 0 ? "dead" : "hit";
  }
}

class MirrorTestBlade implements MirrorBladePort {
  x = 0; y = 0; vx = 0; vy = 0; tipX = 0; tipY = 0; tipVX = 0; tipVY = 0; tipSpeed = 0;
  state = "held"; model = "sword"; lmbOverride = false; trailColor = ""; glowColor = "";
  freeRecall = false; hideThrowUI = false; lengthBonus = 0; mirroredWeaponId = ""; throwDmg = 20;
  private readonly aim: BladePoint = { x: 0, y: 0 };
  update(dt: number, player: MirrorPlayerPort, platforms: readonly PlayerPlatformPort[]): void { void dt; void platforms; this.x = player.x; this.y = player.y; }
  draw(surface: unknown, player: MirrorPlayerPort): void { void surface; void player; }
  aimOverridePoint(): BladePoint { return this.aim; }
  throwBlade(): boolean { this.state = "flying"; return true; }
  tryRecall(player: MirrorPlayerPort): BladeActionResult { void player; this.state = "held"; return "recalled"; }
  damageAt(): number { return this.throwDmg; }
}

function noOp(...args: unknown[]): void { void args; }
const FX = { burst: noOp, death: noOp, explode: noOp, flash: noOp, ghost: noOp, ring: noOp };
const SFX = { boom: noOp, crescent: noOp, hurt: noOp, recall: noOp, saberBreak: noOp, saberLock: noOp,
  saberSizzle: noOp, slam: noOp, swing: noOp, throwBlade: noOp, updraft: noOp };

export function createMirrorTestHarness(randomValues: readonly number[] = [0.5]) {
  const enemyHarness = createEnemyHarness(randomValues);
  let randomIndex = 0;
  const types = createMirrorTypes({
    Blade: MirrorTestBlade, CLOCK, CONFIG, Enemy: enemyHarness.types.Enemy,
    FX, GAME_RANDOM: { next: () => randomValues[randomIndex++ % randomValues.length] ?? 0.5 },
    Player: MirrorTestPlayer, Projectile: enemyHarness.Projectile, SFX,
    presentation: {
      drawMirror() { return; }, drawHostFallback() { return; }, drawReflection() { return; }, saberLockSparks() { return; },
    },
    clamp, getWeapon: (id) => ({ id, model: `${id}-model` }), lerp,
    lerpAngle: (from, to, amount) => lerp(from, to, amount),
  });
  const host = new types.MirrorHost(800, CONFIG.world.groundY - CONFIG.echo.h / 2, { weaponId: "sword" });
  host._live = true;
  types.Mirror.attach(host, host._mods);
  return { ...enemyHarness, ...types, host };
}
