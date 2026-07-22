export type EntityId = string;
export type SupportType = "priest" | "herald" | "mender" | "anchor";
export type DamageOutcome = "hit" | "absorbed" | "rejected";

export interface CombatActorState {
  readonly id: EntityId;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color?: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly dead: boolean;
  readonly dying?: boolean;
  readonly spawnT: number;
  readonly stun: number;
  readonly isBoss?: boolean;
  readonly isBomber?: boolean;
  readonly supportType?: SupportType;
  readonly range?: number;
  readonly bondedId?: EntityId | null;
  readonly zones?: readonly BossZoneState[];
}

export interface ResolvedCombatActorState extends CombatActorState {
  readonly auraDR: number;
  readonly auraDmg: number;
  readonly auraSpeed: number;
  readonly auraHaste: number;
  readonly tetherDR: number;
  readonly anchored: boolean;
  readonly buffs: readonly SupportType[];
  readonly links: readonly EntityId[];
}

export interface SupportTuning {
  readonly drMult: number;
  readonly dmgBuff: number;
  readonly speedBuff: number;
  readonly hasteBuff: number;
  readonly menderRate: number;
  readonly anchorDR: number;
  readonly anchorRegen: number;
}

export type CombatEntityIntent =
  | Readonly<{ type: "fx-ring"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "fx-burst"; x: number; y: number; dx: number; dy: number; count: number; color: string }>
  | Readonly<{ type: "fx-explode"; x: number; y: number; color: string; scale: number }>
  | Readonly<{ type: "fx-flash"; x: number; y: number; radius: number; color: string }>
  | Readonly<{ type: "floater"; x: number; y: number; text: string; big: boolean; color?: string }>
  | Readonly<{ type: "shake"; amount: number }>
  | Readonly<{ type: "flash"; amount: number }>
  | Readonly<{ type: "sound"; sound: "boom" | "hurt" | "deflect" }>
  | Readonly<{ type: "lose-style" }>
  | Readonly<{ type: "shield-absorbed" }>
  | Readonly<{ type: "add-style"; style: "deflect" }>
  | Readonly<{ type: "dash-dodge"; projectileId: EntityId }>
  | Readonly<{ type: "clear-wall-request"; actorId: EntityId }>
  | Readonly<{ type: "materialize-wall"; actorId: EntityId; wall: TemporaryWallState }>
  | Readonly<{ type: "remove-wall"; wallId: EntityId }>
  | Readonly<{ type: "set-player-slow"; multiplier: number }>
  | Readonly<{ type: "set-player-hazard-cooldown"; seconds: number }>
  | Readonly<{ type: "set-player-root"; seconds: number }>
  | Readonly<{ type: "damage-player"; damage: number; sourceX: number; sourceId: EntityId | null; cause: DamageCause;
      projectileId?: EntityId; acceptedProjectilePatch?: ProjectilePatch; onHit: readonly CombatEntityIntent[];
      afterAttempt?: readonly CombatEntityIntent[]; onAbsorbed: readonly CombatEntityIntent[];
      onRejected: readonly CombatEntityIntent[] }>
  | Readonly<{ type: "damage-enemy"; enemyId: EntityId; damage: number; dx: number; dy: number;
      cause: "reflected"; projectileId: EntityId; perfect: boolean; sourceId: EntityId | null;
      parryStun: number; aegisParry: boolean; achievementTracking: boolean;
      noteFirstPlayerDamage: true; emitReflectedHit: true }>
  | Readonly<{ type: "damage-enemy-aoe"; x: number; y: number; radius: number; damage: number;
      playerOwned: boolean; sourceId: EntityId | null; achievement: BombAchievementSpec | null }>
  | Readonly<{ type: "deflect-projectile"; projectileId: EntityId; dx: number; dy: number; speed: number; perfect: false }>
  | Readonly<{ type: "counter-sweeper"; projectileId: EntityId; method: "phaseStep"; dx: number; dy: number; speed: number }>
  | Readonly<{ type: "shatter-sweeper"; projectileId: EntityId; reason: "ownerReturn" | "playerHit" }>
  | Readonly<{ type: "sweeper-countered-callback"; projectileId: EntityId }>
  | Readonly<{ type: "projectile-patch"; projectileId: EntityId; patch: ProjectilePatch }>
  | Readonly<{ type: "add-slow-zone"; zone: SlowZoneState }>
  | Readonly<{ type: "achievement-max"; stat: string; value: number }>
  | Readonly<{ type: "achievement-check" }>;

export type DamageCause = "boss-zone" | "projectile" | "sweeper" | "bomb" | "bomber-death";

export interface BombAchievementSpec {
  readonly kind: "deflected-bomb" | "bomber-betrayal";
  readonly bomberIds?: readonly EntityId[];
  readonly minimumKills?: number;
}

export interface BossZoneState {
  readonly x: number;
  readonly w?: number;
  readonly fullHeight?: boolean;
  readonly on?: boolean;
  readonly dmg?: number | null;
  readonly tickCd?: number;
}

export interface BossZonePlayerState {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly invulnerable: boolean;
  readonly hazardT: number;
  readonly hazardDmgMult: number;
}

export interface SlowZoneState {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly life: number;
}

export interface TemporaryWallState {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly wall: true;
  readonly life: number;
  readonly maxLife: number;
}

export interface WallRequestState {
  readonly actorId: EntityId;
  readonly x: number;
}

export interface ProjectileState {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly r: number;
  readonly dead: boolean;
  readonly family: string;
  readonly sweeperState?: string | null;
  readonly hasCounteredCallback?: boolean;
  readonly ownerId: EntityId | null;
  readonly sourceEnemyId: EntityId | null;
  readonly deflected: boolean;
  readonly perfect: boolean;
  readonly deflectDmg: number;
  readonly pierce: boolean;
  readonly piercedIds: ReadonlySet<EntityId>;
  readonly unparryable: boolean;
  readonly dmg: number | null;
  readonly root: number;
  readonly curve: boolean;
  readonly curved: boolean;
  readonly curveT: number;
  readonly bomb: boolean;
  readonly mud: boolean;
  readonly mine: boolean;
  readonly armed: boolean;
  readonly armT: number;
  readonly life: number;
}

export interface ProjectilePatch {
  readonly x?: number;
  readonly y?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly dead?: boolean;
  readonly curved?: boolean;
  readonly curveT?: number;
  readonly armed?: boolean;
  readonly armT?: number;
  readonly life?: number;
  readonly piercedIds?: ReadonlySet<EntityId>;
}

export interface ProjectilePlayerState {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly dashTimer: number;
  readonly dashX: number;
  readonly dashY: number;
  readonly facing: number;
}

export interface ProjectileCollisionTuning {
  readonly projectileDamage: number;
  readonly projectileSpeed: number;
  readonly deflectBoost: number;
  readonly deflectDamageMultiplier: number;
  readonly runDamageMultiplier: number;
  readonly phaseStep: boolean;
  readonly parryStun: boolean;
  readonly aegisParry: boolean;
  readonly sparkCount: number;
  readonly deflectedColor: string;
  readonly rootColor: string;
  readonly shakeBig: number;
  readonly shakeSmall: number;
  readonly achievementTracking: boolean;
}

export interface SpecialProjectileTuning {
  readonly groundY: number;
  readonly mineTrigger: number;
  readonly blastRadius: number;
  readonly blastDamage: number;
  readonly sludgeZoneRadius: number;
  readonly sludgeZoneLife: number;
  readonly bomberColor: string;
  readonly perfectColor: string;
  readonly sludgeColor: string;
  readonly shakeBig: number;
  readonly flashParry: number;
}
