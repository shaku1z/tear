import { addOverrunStack, overrunDamageMultiplier, type OverrunConfig, type OverrunState } from "./overrun";
import { dischargeStormbank, type StormbankConfig, type StormbankState } from "./stormbank";
import { addKillScore, advanceWeaponAbilities, appendWeaponEvent, collapseTargets, invokeWeaponHook,
  nearestLivingTarget, type WeaponRuntimeTarget } from "./weapon-runtime-coordinator";
import type { UpgradeEnemyPort, UpgradeEvent, UpgradeMods, UpgradePlayerPort } from "../upgrades";

export interface LiveWeaponEnemy extends WeaponRuntimeTarget, UpgradeEnemyPort {
  firstPlayerDamageAt?: number | null; hh: number; color: string; stun: number;
  applySever?(tier: number): void;
  hit(damage: number, fromX: number, fromY: number, options?: Readonly<{ playerOwned: boolean }>): void;
}
export interface LiveWeaponPlayer extends UpgradePlayerPort { x: number; y: number }
export interface LiveWeaponBlade {
  x: number; y: number; throwResolved: boolean; throwId: unknown;
  weapon?: Readonly<object & { id?: string }> | null;
}
export interface LiveWeaponEvent<TEnemy extends LiveWeaponEnemy> extends UpgradeEvent, Record<string, unknown> {
  enemy?: TEnemy; cause: string;
  primaryTarget?: TEnemy; damageDealt?: number;
  dischargeStormbank?(mods: UpgradeMods): void;
}
export interface LiveWeaponMods<TEnemy extends LiveWeaponEnemy> extends OverrunState, StormbankState {
  collapse?: boolean; shieldBurst?: boolean;
  onEnemyFirstDamaged: ((event: LiveWeaponEvent<TEnemy>) => void)[];
  onThrowResolve: ((event: LiveWeaponEvent<TEnemy>) => void)[];
  onThrowSecondary: ((event: LiveWeaponEvent<TEnemy>) => void)[];
}
export interface LiveWeaponRun<TEnemy extends LiveWeaponEnemy> {
  mods: LiveWeaponMods<TEnemy>; weaponLog?: unknown[] | null; weaponId: string;
  score: number; wave: number; mult: number; scoreMod?: number; waveKills: number;
}
export interface LiveWeaponRuntimeOptions<TEnemy extends LiveWeaponEnemy> {
  readonly run: () => LiveWeaponRun<TEnemy> | null;
  readonly player: () => LiveWeaponPlayer;
  readonly blade: () => LiveWeaponBlade;
  readonly enemies: () => readonly TEnemy[];
  readonly time: () => number;
  readonly overrun: () => OverrunConfig;
  readonly stormbank: () => StormbankConfig;
  readonly score: () => Readonly<{ perKill: number; multiplier: number }>;
  readonly colors: () => Readonly<{ perfect: string; charger: string; armoredShield: string }>;
  readonly juice: () => Readonly<{ shakeSmall: number }>;
  readonly shakeScale: () => number;
  readonly motionScale: () => number;
  readonly flashScale: () => number;
  readonly parrySlowmo: () => number;
  readonly bigShake: () => number;
  readonly clamp: (value: number, minimum: number, maximum: number) => number;
  readonly distance: (x: number, y: number) => number;
  readonly buzz: (pattern: number) => void;
  readonly rumble: (strength: number, duration: number) => void;
  readonly setShake: (value: number) => void;
  readonly shake: () => number;
  readonly setZoom: (value: number) => void;
  readonly zoom: () => number;
  readonly setFlash: (value: number) => void;
  readonly flash: () => number;
  readonly setSlowmo: (value: number) => void;
  readonly setHitStop: (value: number) => void;
  readonly smallHitStop: () => number;
  readonly addFloater: (x: number, y: number, text: string, big: boolean, color: string) => void;
  readonly explode: (x: number, y: number, color: string, scale: number) => void;
  readonly ring: (x: number, y: number, radius: number, color?: string) => void;
  readonly ribbon: (x1: number, y1: number, x2: number, y2: number, color: string) => void;
  readonly burst: (x: number, y: number, dx: number, dy: number, count: number, color: string) => void;
  readonly death: (x: number, y: number, shards: number, color: string) => void;
  readonly deathShards: () => number;
  readonly parrySound: () => void;
  readonly recallSound: () => void;
  readonly onKill: (enemy: TEnemy, cause: string) => void;
}

export interface LiveWeaponRuntimeApi<TEnemy extends LiveWeaponEnemy> {
  readonly addShake: (value: number) => void; readonly addZoom: (value: number) => void;
  readonly addFlash: (value: number) => void; readonly triggerSlowmo: () => void;
  readonly fire: (listeners: ((event: LiveWeaponEvent<TEnemy>) => void)[], event: LiveWeaponEvent<TEnemy>) => void;
  readonly makeEvent: (x: number, y: number, enemy: TEnemy | null, cause?: string,
    extra?: Readonly<Record<string, unknown>>) => LiveWeaponEvent<TEnemy>;
  readonly nearestEnemy: (x: number, y: number) => TEnemy | null; readonly damageMultiplier: () => number;
  readonly log: (type: string, data?: Readonly<Record<string, unknown>> | null) => void;
  readonly noteFirstDamage: (enemy: TEnemy, wasUnset: boolean) => void;
  readonly applySever: (enemy: TEnemy | null, tier: number) => void;
  readonly addOverrun: (mods: LiveWeaponMods<TEnemy>) => void; readonly updateAbilities: (dt: number) => void;
  readonly dischargeStormbank: (mods: UpgradeMods, event: LiveWeaponEvent<TEnemy>) => void;
  readonly emitThrowResolve: (enemy: TEnemy | null, damage: number) => void;
  readonly collapseAt: (x: number, y: number) => void; readonly activateThrowSecondary: () => void;
  readonly hook: (name: string, context?: Readonly<Record<string, unknown>>) => unknown;
  readonly shieldAbsorb: () => void; readonly dealArea: (x: number, y: number, radius: number, damage: number,
    options?: Readonly<{ playerOwned?: boolean }>) => number; readonly addKillScore: () => void;
}

export function createLiveWeaponRuntime<TEnemy extends LiveWeaponEnemy>(
  options: LiveWeaponRuntimeOptions<TEnemy>,
): LiveWeaponRuntimeApi<TEnemy> {
  const requireRun = (): LiveWeaponRun<TEnemy> => { const run = options.run(); if (!run) throw new Error("weapon runtime requires an active run"); return run; };
  const floater = (x: number, y: number, text: string, big = false, color = "#000"): void => { options.addFloater(x, y, text, big, color); };
  const fire = (listeners: ((event: LiveWeaponEvent<TEnemy>) => void)[], event: LiveWeaponEvent<TEnemy>): void => { for (const listener of listeners) listener(event); };
  const isDead = (enemy: TEnemy): boolean => enemy.dead;
  const event = (x: number, y: number, enemy: TEnemy | null, cause: string,
    extra?: Readonly<Record<string, unknown>>): LiveWeaponEvent<TEnemy> => ({
      player: options.player(), enemies: options.enemies(), x, y, cause, cleanElimination: false,
      fx: { explode: options.explode, ring: (ringX, ringY, radius, color) => { options.ring(ringX, ringY, radius, color); } },
      dealAoE: (...args: Parameters<LiveWeaponRuntimeApi<TEnemy>["dealArea"]>) => { api.dealArea(...args); },
      ...(enemy ? { enemy } : {}), ...(extra ?? {}),
    });
  const api: LiveWeaponRuntimeApi<TEnemy> = {
    addShake(value) { const scaled = value * options.shakeScale(); if (scaled > options.shake()) options.setShake(scaled);
      options.buzz(value >= options.bigShake() ? 26 : 12); options.rumble(options.clamp(value / (options.bigShake() || 20), 0.25, 1), value >= options.bigShake() ? 180 : 90); },
    addZoom(value) { const scaled = value * options.motionScale(); if (1 + scaled > options.zoom()) options.setZoom(1 + scaled); },
    addFlash(value) { const scaled = value * options.flashScale(); if (scaled > options.flash()) options.setFlash(scaled); },
    triggerSlowmo() { options.setSlowmo(options.parrySlowmo()); },
    fire,
    makeEvent: (x, y, enemy, cause = "", extra) => event(x, y, enemy, cause, extra),
    nearestEnemy: (x, y) => nearestLivingTarget(options.enemies(), x, y),
    damageMultiplier: () => { const run = options.run(); return run ? overrunDamageMultiplier(run.mods, options.overrun()) : 1; },
    log(type, data) { const run = options.run(); if (run) appendWeaponEvent(run.weaponLog, options.time(), type, run.weaponId, data); },
    noteFirstDamage(enemy, wasUnset) { if (!wasUnset || enemy.firstPlayerDamageAt == null) return;
      fire(requireRun().mods.onEnemyFirstDamaged, event(enemy.x, enemy.y, enemy, "firstDamage", { type: "enemyFirstDamaged", at: enemy.firstPlayerDamageAt })); },
    applySever(enemy, tier) { if (!enemy || enemy.dead || !enemy.applySever) return; enemy.applySever(tier);
      options.ring(enemy.x, enemy.y, 9, "#b06cff"); floater(enemy.x, enemy.y - enemy.hh - 14, "SEVER", false, "#b06cff"); },
    addOverrun(mods) { const result = addOverrunStack(mods, options.overrun()), player = options.player(); floater(player.x, player.y - 58, result.label, true, options.colors().charger); },
    updateAbilities(dt) { advanceWeaponAbilities(requireRun().mods, options.overrun(), options.stormbank(), dt, options.enemies(), {
      ribbon: (x1, y1, x2, y2) => { options.ribbon(x1, y1, x2, y2, options.colors().perfect); }, killed: (target) => { options.onKill(target, "skill"); }, }); },
    dischargeStormbank(mods, source) { if (!source.primaryTarget) return;
      const result = dischargeStormbank(mods, options.stormbank(), source, source.primaryTarget, source.damageDealt ?? 0, options.enemies()); if (!result) return;
      source.primaryTarget.hit(result.primaryBonus, source.primaryTarget.x - source.x, source.primaryTarget.y - source.y);
      for (const arc of result.arcs) { const target = arc.target; target.hit(arc.damage, target.x - source.x, target.y - source.y);
        if (arc.stun > 0) target.stun = Math.max(target.stun, arc.stun); options.ribbon(source.x, source.y, target.x, target.y, options.colors().perfect);
        if (target.dead) options.onKill(target, "skill"); }
      options.ring(source.x, source.y, 18, options.colors().perfect); floater(source.x, source.y - 32, result.label, true, options.colors().perfect); },
    emitThrowResolve(enemy, damage) { const blade = options.blade(); if (blade.throwResolved) return; blade.throwResolved = true;
      const source = event(blade.x, blade.y, enemy, "throw", { type: "throwResolve", throwId: blade.throwId,
        weaponId: blade.weapon?.id, ...(enemy ? { primaryTarget: enemy } : {}), targetsHit: [enemy], damageDealt: damage });
      source.dischargeStormbank = (mods: UpgradeMods) => { api.dischargeStormbank(mods, source); }; fire(requireRun().mods.onThrowResolve, source); },
    collapseAt(x, y) { const run = requireRun(); if (!run.mods.collapse) return; collapseTargets(options.enemies(), x, y); options.ring(x, y, 14, options.colors().perfect); },
    activateThrowSecondary() { const blade = options.blade(); options.ring(blade.x, blade.y, 8); api.addShake(options.juice().shakeSmall); options.recallSound(); api.collapseAt(blade.x, blade.y);
      const run = requireRun(); fire(run.mods.onThrowSecondary, event(blade.x, blade.y, null, "secondary", { type: "throwSecondary", throwId: blade.throwId, weaponId: run.weaponId })); },
    hook: (name, context) => invokeWeaponHook(options.blade().weapon, name, context),
    shieldAbsorb() { const player = options.player(), colors = options.colors(), run = requireRun(); options.parrySound(); options.ring(player.x, player.y, 14, colors.armoredShield);
      floater(player.x, player.y - 30, "BLOCK", true, colors.armoredShield); api.addShake(options.juice().shakeSmall); options.setHitStop(options.smallHitStop());
      if (run.mods.shieldBurst) { api.dealArea(player.x, player.y, 145, 28); options.ring(player.x, player.y, 18, colors.armoredShield); } },
    dealArea(cx, cy, radius, damage, areaOptions) { const playerOwned = areaOptions?.playerOwned !== false; if (playerOwned) damage *= api.damageMultiplier(); let kills = 0;
      for (const enemy of options.enemies()) { if (enemy.dead || options.distance(enemy.x - cx, enemy.y - cy) > radius + enemy.radius) continue;
        const first = enemy.firstPlayerDamageAt == null; enemy.hit(damage, enemy.x - cx, enemy.y - cy, { playerOwned }); if (playerOwned) api.noteFirstDamage(enemy, first);
        options.burst(enemy.x, enemy.y, enemy.x - cx, enemy.y - cy, 5, enemy.color); floater(enemy.x, enemy.y - 24, String(Math.round(damage)));
        if (isDead(enemy)) { api.addKillScore(); options.death(enemy.x, enemy.y, options.deathShards(), enemy.color); kills += 1; } } return kills; },
    addKillScore() { const score = options.score(); addKillScore(requireRun(), score.perKill, score.multiplier); },
  };
  return Object.freeze(api);
}
