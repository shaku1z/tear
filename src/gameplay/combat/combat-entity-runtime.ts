import { resolveSupportAuras } from "./support-aura-resolver";
import { resolveWorldHazards, type WorldHazardTuning } from "./world-hazard-resolver";
import { planBomberDeathExplosion, planBossZoneCollision, planProjectileCollisions,
  resolveProjectileCurves, resolveSpecialProjectiles } from "./combat-entity-resolver";
import type { CombatActorState, CombatEntityIntent, ProjectilePatch, ProjectileState,
  SlowZoneState, SupportTuning } from "./combat-entity-contracts";

export interface LiveCombatEntity {
  id?: string; kind?: string; x: number; y: number; radius?: number; color?: string; hp?: number; maxHp?: number;
  dead: boolean; dying?: boolean; spawnT?: number; stun?: number; isBoss?: boolean; isBomber?: boolean;
  supportType?: "priest" | "herald" | "mender" | "anchor"; range?: number; bonded?: LiveCombatEntity | null;
  zones?: CombatActorState["zones"]; links?: LiveCombatEntity[]; buffs?: string[];
  auraDR?: number; auraDmg?: number; auraSpeed?: number; auraHaste?: number; tetherDR?: number; anchored?: boolean;
  wallRequest?: { x: number } | null; firstPlayerDamageAt?: number | null; damageTakenMult?(): number;
  vx: number; vy: number; r?: number; family?: string; sweeperState?: string | null; onCountered?(projectile: LiveCombatEntity): void;
  owner?: unknown; sourceEnemy?: unknown; deflected?: boolean; perfect?: boolean;
  deflectDmg?: number; pierce?: boolean; pierced?: ReadonlySet<unknown> | null; unparryable?: boolean; dmg?: number | null;
  root?: number; curve?: boolean; curved?: boolean; curveT?: number; bomb?: boolean; mud?: boolean; mine?: boolean;
  armed?: boolean; armT?: number; life?: number;
  hit?(damage: number, dx: number, dy: number): number; deflect?(dx: number, dy: number, speed: number, perfect: boolean): void;
  counterSweeper?(method: string, dx: number, dy: number, speed: number): boolean;
  shatterSweeper?(reason: string): void;
}

export interface LiveCombatPlayer {
  x: number; y: number; hw: number; hh: number; rootT: number; hazardT: number; slowMult: number;
  shield: number; maxShield: number; invulnerable?: boolean; hazardDmgMult: number;
  dashTimer: number; dashX: number; dashY: number; facing: number;
  takeDamage(damage: number, sourceX: number, source: LiveCombatEntity | null): string | false;
}

export interface RuntimeSlowZone extends Omit<SlowZoneState, "id"> { id?: string }
export interface RuntimeWall {
  id?: string; x: number; y: number; w: number; h: number; wall: true; life: number; maxLife: number;
}

export interface CombatEntityRuntimeHooks {
  actors(): LiveCombatEntity[]; projectiles(): LiveCombatEntity[]; player(): LiveCombatPlayer;
  slowZones(): RuntimeSlowZone[]; setSlowZones(zones: RuntimeSlowZone[]): void;
  walls(): RuntimeWall[]; setWalls(walls: RuntimeWall[]): void;
  platforms(): unknown[];
  ring(x: number, y: number, radius: number, color: string): void;
  burst(x: number, y: number, dx: number, dy: number, count: number, color: string): void;
  explode(x: number, y: number, color: string, scale: number): void; fxFlash(x: number, y: number, radius: number, color: string): void;
  floater(x: number, y: number, text: string, big: boolean, color?: string): void; shake(amount: number): void; flash(amount: number): void;
  sound(cue: "boom" | "hurt" | "deflect"): void; loseStyle(): void; shieldAbsorbed(): void; addStyle(style: "deflect"): void;
  dashDodge(projectile: LiveCombatEntity | null): void; maxStat(stat: string, value: number): void; checkAchievements(): void;
  noteFirstDamage(enemy: LiveCombatEntity, first: boolean): void; reflectedHit(enemy: LiveCombatEntity,
    projectile: LiveCombatEntity | null, source: LiveCombatEntity | null): void; bossHit(enemy: LiveCombatEntity): void;
  onKill(enemy: LiveCombatEntity, cause: string): void;
  areaDamage(x: number, y: number, radius: number, damage: number, playerOwned: boolean): number;
}

export interface ProjectilePhaseTuning {
  projectileDamage: number; projectileSpeed: number; deflectBoost: number; deflectDamageMultiplier: number;
  runDamageMultiplier: number; phaseStep: boolean; parryStun: boolean; aegisParry: boolean;
  sparkCount: number; deflectedColor: string; rootColor: string; shakeBig: number; shakeSmall: number;
  achievementTracking: boolean; groundY: number; mineTrigger: number; blastRadius: number; blastDamage: number;
  sludgeZoneRadius: number; sludgeZoneLife: number; bomberColor: string; perfectColor: string;
  sludgeColor: string; flashParry: number; enemyShotColor: string;
}
export interface BossZonePhaseTuning { groundY: number; defaultWidth: number; defaultDamage: number; defaultTickCooldown: number }

const patchKeys = ["x", "y", "vx", "vy", "dead", "curved", "curveT", "armed", "armT", "life"] as const;
function legacyZero(value: number | undefined): number {
  return value === undefined || value === 0 || Number.isNaN(value) ? 0 : value;
}
function isDead(entity: LiveCombatEntity): boolean { return entity.dead; }

export class CombatEntityRuntime {
  readonly #hooks: CombatEntityRuntimeHooks;
  readonly #ids = new WeakMap<object, string>();
  #nextEntityId = 1; #nextWallSequence = 1; #nextSlowZoneSequence = 1;

  constructor(hooks: CombatEntityRuntimeHooks) { this.#hooks = hooks; }
  get nextSlowZoneSequence(): number { return this.#nextSlowZoneSequence; }
  set nextSlowZoneSequence(value: number) { this.#nextSlowZoneSequence = value; }

  id(entity: object & { id?: string }, prefix: string): string {
    if (typeof entity.id === "string" && (prefix === "wall" || prefix === "zone")) return entity.id;
    let id = this.#ids.get(entity);
    if (!id) { id = `${prefix}:${String(this.#nextEntityId)}`; this.#nextEntityId += 1; this.#ids.set(entity, id); }
    return id;
  }

  actorSnapshots(objects: Map<string, LiveCombatEntity>): CombatActorState[] {
    return this.#hooks.actors().map((actor) => {
      const id = this.id(actor, "enemy"); objects.set(id, actor);
      if (actor.bonded) objects.set(this.id(actor.bonded, "enemy"), actor.bonded);
      return { id, kind: actor.kind ?? "enemy", x: actor.x, y: actor.y, radius: actor.radius ?? 0, color: actor.color,
        hp: actor.hp ?? 0, maxHp: actor.maxHp ?? 0, dead: actor.dead, dying: !!actor.dying, spawnT: actor.spawnT ?? 0,
        stun: legacyZero(actor.stun), isBoss: !!actor.isBoss, isBomber: !!actor.isBomber,
        supportType: actor.supportType, range: actor.range,
        bondedId: actor.bonded ? this.id(actor.bonded, "enemy") : null, zones: actor.zones } as CombatActorState;
    });
  }

  projectileSnapshots(objects: Map<string, LiveCombatEntity>): ProjectileState[] {
    return this.#hooks.projectiles().map((projectile) => {
      const id = this.id(projectile, "projectile"); objects.set(id, projectile);
      const owner = isCombatEntity(projectile.owner) ? projectile.owner : null;
      const sourceEnemy = isCombatEntity(projectile.sourceEnemy) ? projectile.sourceEnemy : null;
      const ownerId = owner ? this.id(owner, "enemy") : null;
      const sourceEnemyId = sourceEnemy ? this.id(sourceEnemy, "enemy") : null;
      if (ownerId && owner) objects.set(ownerId, owner);
      if (sourceEnemyId && sourceEnemy) objects.set(sourceEnemyId, sourceEnemy);
      return { id, x: projectile.x, y: projectile.y, vx: projectile.vx, vy: projectile.vy, r: projectile.r ?? 0,
        dead: projectile.dead, family: projectile.family, sweeperState: projectile.sweeperState,
        hasCounteredCallback: typeof projectile.onCountered === "function", ownerId, sourceEnemyId,
        deflected: !!projectile.deflected, perfect: !!projectile.perfect, deflectDmg: projectile.deflectDmg ?? 0,
        pierce: !!projectile.pierce, piercedIds: new Set(projectile.pierced
          ? Array.from(projectile.pierced).filter(isObject).map((enemy) => this.id(enemy, "enemy")) : []),
        unparryable: !!projectile.unparryable, dmg: projectile.dmg, root: legacyZero(projectile.root),
        curve: !!projectile.curve, curved: !!projectile.curved, curveT: legacyZero(projectile.curveT),
        bomb: !!projectile.bomb, mud: !!projectile.mud, mine: !!projectile.mine, armed: !!projectile.armed,
        armT: legacyZero(projectile.armT), life: projectile.life ?? 0 } as ProjectileState;
    });
  }

  execute(intents: readonly CombatEntityIntent[], objects: Map<string, LiveCombatEntity>): void {
    for (const intent of intents) this.#executeOne(intent, objects);
  }

  updateSupports(dt: number, tuning: SupportTuning, anchorColor: string): void {
    const objects = new Map<string, LiveCombatEntity>();
    const result = resolveSupportAuras(this.actorSnapshots(objects), dt, tuning, anchorColor);
    for (const state of result.actors) {
      const actor = objects.get(state.id); if (!actor) continue;
      Object.assign(actor, { hp: state.hp, dead: state.dead, auraDR: state.auraDR, auraDmg: state.auraDmg,
        auraSpeed: state.auraSpeed, auraHaste: state.auraHaste, tetherDR: state.tetherDR,
        anchored: state.anchored, buffs: Array.from(state.buffs) });
      if (state.kind === "support") actor.links = state.links.map((id) => objects.get(id)).filter((item): item is LiveCombatEntity => item !== undefined);
      if (state.supportType === "anchor") actor.bonded = state.bondedId ? objects.get(state.bondedId) ?? null : null;
    }
    this.execute(result.intents, objects);
  }

  updateWorldHazards(dt: number, tuning: WorldHazardTuning): void {
    const objects = new Map<string, LiveCombatEntity>(), wallById = new Map<string, RuntimeWall>();
    const actors = this.actorSnapshots(objects);
    const zones = this.#hooks.slowZones().map((zone) => ({ ...zone, id: zone.id ?? this.id(zone, "zone") }));
    const walls = this.#hooks.walls().map((wall) => { const id = wall.id ?? this.id(wall, "wall"); wallById.set(id, wall); return { ...wall, id }; });
    const wallRequests = actors.flatMap((state) => { const actor = objects.get(state.id); return actor?.wallRequest ? [{ actorId: state.id, x: actor.wallRequest.x }] : []; });
    const player = this.#hooks.player();
    const result = resolveWorldHazards({ dt, slowZones: zones, walls, wallRequests, nextWallSequence: this.#nextWallSequence,
      player: { x: player.x, y: player.y, hh: player.hh }, tuning });
    this.#nextWallSequence = result.nextWallSequence;
    this.#hooks.setSlowZones(result.slowZones.map((zone) => ({ ...zone })));
    for (const state of result.walls) { const wall = wallById.get(state.id); if (wall) wall.life = state.life; }
    for (const intent of result.intents) {
      if (intent.type === "remove-wall") {
        const wall = wallById.get(intent.wallId); if (!wall) continue;
        const platforms = this.#hooks.platforms(), index = platforms.indexOf(wall);
        if (index >= 0) platforms.splice(index, 1);
        this.#hooks.setWalls(this.#hooks.walls().filter((candidate) => candidate !== wall));
      } else if (intent.type === "materialize-wall") {
        const wall = { ...intent.wall }; this.#hooks.platforms().push(wall);
        this.#hooks.setWalls([...this.#hooks.walls(), wall]);
      } else this.execute([intent], objects);
    }
  }

  resolveBossZones(tuning: BossZonePhaseTuning): void {
    const objects = new Map<string, LiveCombatEntity>(), player = this.#hooks.player();
    this.execute(planBossZoneCollision(this.actorSnapshots(objects), { x: player.x, y: player.y,
      hw: player.hw, hh: player.hh, invulnerable: !!player.invulnerable, hazardT: player.hazardT,
      hazardDmgMult: player.hazardDmgMult }, tuning), objects);
  }

  resolveProjectilePhases(dt: number, tuning: ProjectilePhaseTuning): void {
    const player = this.#hooks.player();
    {
      const objects = new Map<string, LiveCombatEntity>(), actors = this.actorSnapshots(objects);
      this.execute(planProjectileCollisions({ projectiles: this.projectileSnapshots(objects), actors,
        player: { x: player.x, y: player.y, hw: player.hw, hh: player.hh, dashTimer: player.dashTimer,
          dashX: player.dashX, dashY: player.dashY, facing: player.facing }, tuning }), objects);
    }
    {
      const objects = new Map<string, LiveCombatEntity>();
      this.execute(resolveProjectileCurves({ projectiles: this.projectileSnapshots(objects),
        player: { x: player.x, y: player.y }, dt, defaultSpeed: tuning.projectileSpeed,
        enemyShotColor: tuning.enemyShotColor }), objects);
    }
    {
      const objects = new Map<string, LiveCombatEntity>(), actors = this.actorSnapshots(objects);
      const result = resolveSpecialProjectiles({ projectiles: this.projectileSnapshots(objects), actors,
        player: { x: player.x, y: player.y, hw: player.hw, hh: player.hh }, dt, tuning,
        achievementTracking: tuning.achievementTracking, nextSlowZoneSequence: this.#nextSlowZoneSequence });
      this.#nextSlowZoneSequence = result.nextSlowZoneSequence; this.execute(result.intents, objects);
    }
  }

  resolveBomberDeaths(tuning: ProjectilePhaseTuning): void {
    const player = this.#hooks.player();
    for (const enemy of this.#hooks.actors()) {
      if (!enemy.dead || !enemy.isBomber || Reflect.get(enemy, "blasted") === true) continue;
      Reflect.set(enemy, "blasted", true);
      const objects = new Map<string, LiveCombatEntity>(), actors = this.actorSnapshots(objects), id = this.id(enemy, "enemy");
      const bomber = actors.find((actor) => actor.id === id);
      if (bomber) this.execute(planBomberDeathExplosion(bomber, { x: player.x, y: player.y, hw: player.hw }, tuning,
        tuning.achievementTracking), objects);
    }
  }

  #patch(projectile: LiveCombatEntity | null, patch: ProjectilePatch | undefined, objects: Map<string, LiveCombatEntity>): void {
    if (!projectile || !patch) return;
    for (const key of patchKeys) if (patch[key] !== undefined) Object.assign(projectile, { [key]: patch[key] });
    if (patch.piercedIds) projectile.pierced = new Set(Array.from(patch.piercedIds, (id) => objects.get(id)).filter((item): item is LiveCombatEntity => item !== undefined));
  }

  #executeOne(intent: CombatEntityIntent, objects: Map<string, LiveCombatEntity>): void {
    const h = this.#hooks, projectile = "projectileId" in intent ? objects.get(intent.projectileId) ?? null : null;
    if (intent.type === "fx-ring") h.ring(intent.x, intent.y, intent.radius, intent.color);
    else if (intent.type === "fx-burst") h.burst(intent.x, intent.y, intent.dx, intent.dy, intent.count, intent.color);
    else if (intent.type === "fx-explode") h.explode(intent.x, intent.y, intent.color, intent.scale);
    else if (intent.type === "fx-flash") h.fxFlash(intent.x, intent.y, intent.radius, intent.color);
    else if (intent.type === "floater") h.floater(intent.x, intent.y, intent.text, intent.big, intent.color);
    else if (intent.type === "shake") h.shake(intent.amount); else if (intent.type === "flash") h.flash(intent.amount);
    else if (intent.type === "sound") h.sound(intent.sound); else if (intent.type === "lose-style") h.loseStyle();
    else if (intent.type === "shield-absorbed") h.shieldAbsorbed(); else if (intent.type === "add-style") h.addStyle(intent.style);
    else if (intent.type === "dash-dodge") h.dashDodge(projectile);
    else if (intent.type === "set-player-root") h.player().rootT = intent.seconds;
    else if (intent.type === "set-player-hazard-cooldown") h.player().hazardT = intent.seconds;
    else if (intent.type === "set-player-slow") h.player().slowMult = intent.multiplier;
    else if (intent.type === "projectile-patch") this.#patch(projectile, intent.patch, objects);
    else if (intent.type === "deflect-projectile") projectile?.deflect?.(intent.dx, intent.dy, intent.speed, false);
    else if (intent.type === "counter-sweeper") projectile?.counterSweeper?.(intent.method, intent.dx, intent.dy, intent.speed);
    else if (intent.type === "shatter-sweeper") projectile?.shatterSweeper?.(intent.reason);
    else if (intent.type === "sweeper-countered-callback") projectile?.onCountered?.(projectile);
    else if (intent.type === "add-slow-zone") h.setSlowZones([...h.slowZones(), { ...intent.zone }]);
    else if (intent.type === "clear-wall-request") { const actor = objects.get(intent.actorId); if (actor) actor.wallRequest = null; }
    else if (intent.type === "achievement-max") h.maxStat(intent.stat, intent.value); else if (intent.type === "achievement-check") h.checkAchievements();
    else if (intent.type === "damage-player") this.#damagePlayer(intent, projectile, objects);
    else if (intent.type === "damage-enemy") this.#damageEnemy(intent, projectile, objects);
    else if (intent.type === "damage-enemy-aoe") this.#damageArea(intent, objects);
  }

  #damagePlayer(intent: Extract<CombatEntityIntent, { type: "damage-player" }>, projectile: LiveCombatEntity | null,
    objects: Map<string, LiveCombatEntity>): void {
    const outcome = this.#hooks.player().takeDamage(intent.damage, intent.sourceX, intent.sourceId ? objects.get(intent.sourceId) ?? null : null);
    if (outcome && projectile && intent.acceptedProjectilePatch) this.#patch(projectile, intent.acceptedProjectilePatch, objects);
    if (intent.afterAttempt) this.execute(intent.afterAttempt, objects);
    this.execute(outcome === "hit" ? intent.onHit : outcome === "absorbed" ? intent.onAbsorbed : intent.onRejected, objects);
  }

  #damageEnemy(intent: Extract<CombatEntityIntent, { type: "damage-enemy" }>, projectile: LiveCombatEntity | null,
    objects: Map<string, LiveCombatEntity>): void {
    const enemy = objects.get(intent.enemyId); if (!enemy || enemy.dead || enemy.dying || !enemy.hit) return;
    const first = enemy.firstPlayerDamageAt == null; enemy.hit(intent.damage, intent.dx, intent.dy);
    this.#hooks.noteFirstDamage(enemy, first);
    this.#hooks.reflectedHit(enemy, projectile, intent.sourceId ? objects.get(intent.sourceId) ?? null : null);
    if (intent.achievementTracking) this.#hooks.bossHit(enemy);
    if (intent.parryStun > 0 && !enemy.isBoss) enemy.stun = Math.max(enemy.stun ?? 0, intent.parryStun);
    if (isDead(enemy)) { this.#hooks.onKill(enemy, intent.perfect ? "skill" : ""); if (intent.perfect && intent.aegisParry) { const player = this.#hooks.player(); player.shield = Math.min(player.shield + 1, player.maxShield); } }
  }

  #damageArea(intent: Extract<CombatEntityIntent, { type: "damage-enemy-aoe" }>, objects: Map<string, LiveCombatEntity>): void {
    const kills = this.#hooks.areaDamage(intent.x, intent.y, intent.radius, intent.damage, intent.playerOwned);
    if (intent.achievement?.kind === "deflected-bomb") {
      const minimum = intent.achievement.minimumKills;
      if (kills >= (minimum === undefined || minimum === 0 || Number.isNaN(minimum) ? Infinity : minimum)) this.#hooks.maxStat("bombMultikill", kills);
      if ((intent.achievement.bomberIds ?? []).some((id) => objects.get(id)?.dead)) { this.#hooks.maxStat("bombDeflectKills", 1); this.#hooks.checkAchievements(); }
    } else if (intent.achievement?.kind === "bomber-betrayal" && kills > 0) { this.#hooks.maxStat("bomberBetrayal", kills); this.#hooks.checkAchievements(); }
  }
}

function isObject(value: unknown): value is object & { id?: string } {
  return typeof value === "object" && value !== null;
}

function isCombatEntity(value: unknown): value is LiveCombatEntity {
  return isObject(value) && "x" in value && "y" in value && "vx" in value && "vy" in value && "dead" in value;
}
