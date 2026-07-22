export interface HeldBladeSegment { x1: number; y1: number; x2: number; y2: number; pad: number }
export interface PointDistance { px: number; py: number }
export interface BatonSegment {
  a: Readonly<{ x: number; y: number }>; b: Readonly<{ x: number; y: number }>;
  x1: number; y1: number; x2: number; y2: number; radius?: number;
}

export interface HeldBladePlayer {
  x: number; y: number; vy: number; onGround: boolean; hp: number; maxHp: number;
  airTime: number; dashEndT: number; tempoT: number; tempoStk: number;
  rallySource?: object | null; shield: number; maxShield: number;
  voidLane: string | null;
  claimRally(damage: number): number; heal(amount: number): void;
}

export interface HeldBladeWeapon {
  x: number; y: number; tipX: number; tipY: number; tipVX: number; tipVY: number;
  tipSpeed: number; angle: number; throwId: number;
  damageAt(): number; hitQuality(enemy: HeldBladeEnemy): number;
  recordHit(enemy: HeldBladeEnemy): void;
}

export interface HeldWeaponEffect {
  mechanic?: string; repeatScale?: number; hitIframe?: number; seam?: number;
  breakPower?: number; broke?: boolean; force?: number;
}

export interface HeldBladeEnemy {
  dead: boolean; dying: boolean; introT?: number; hitCd: number; x: number; y: number;
  radius: number; color: string; tip?: never; hp: number; maxHp: number; vx: number; vy: number;
  hh: number; hw: number; weight: number; onGround: boolean; anchored: boolean; isBoss?: boolean;
  kind: string; bossId?: string; firstPlayerDamageAt?: number | null; damageTakenMult(): number;
  hit(damage: number, vx: number, vy: number): number; blocks(tipX: number, tipSpeed: number): boolean;
  applySeam(seam: number | undefined, throwId: number): void; detonateBleed(): number;
  bleedStacks: number; stun: number; enraged: boolean; guardSide?: number; cfg: { breakSpeed?: number };
  atk: string; atkT: number; blockStyle?: string; _plateFlashT?: number; _updrafted?: boolean;
  _updraftT?: number; spiked?: boolean; driveT?: number; boundT?: number;
  parryBaton?: ((strong: boolean) => boolean) | undefined; batonStrike?: number;
  batonSegment?: (() => BatonSegment) | undefined; immuneToBlade?: boolean;
  trySeverSiphon?: ((blade: HeldBladeWeapon) => boolean) | undefined;
  applyBreak?: ((power: number) => boolean) | undefined;
  onBladeImpulse?: ((input: HeldBladeImpulse) => boolean | { handled?: boolean } | undefined) | undefined;
}

export interface HeldBladeImpulse {
  damage: number; dealt: number; held: true; player: HeldBladePlayer; blade: HeldBladeWeapon;
  tipSpeed: number; tipVX: number; tipVY: number; isSlam: boolean; isLaunch: boolean;
  spike: boolean; empowered: boolean; empSlam: boolean; heightF: number; strikeF: number;
  strikeType: string;
}

export interface HeldBladeMods {
  berserk?: boolean; airBonus?: number; aerialRave?: number; slipstream?: boolean; tempo?: number;
  tempest?: boolean; bleedDetonate?: boolean; crater?: boolean; lifesteal: number; slamShield?: boolean;
}

export interface HeldBladeRun {
  mult: number; mods: HeldBladeMods; lifestealCd: number;
  weaponStats: { heldHits: number; trueCuts: number; breakTriggers: number };
  _updraftChain?: number; _aldricSlams?: number;
}

export interface HeldBladeTuning {
  width: number; groundY: number;
  blade: {
    minHitSpeed: number; launchPower: number; risingLaunchBonus: number;
    slamMinDownSpeed: number; launchMinUpSpeed: number; risingSpeedRef: number;
    slamPowerSpeed: number; slamEmpowerAt: number; slamMultiplier: number;
    slamPowerBonus: number; risingDmgBonus: number;
  };
  style: { styleDamage: number; styleDamageMax: number; aerialRaveCap: number };
  hitStop: { small: number; big: number; threshold: number };
  juice: { sparkCount: number; shakeSmall: number; shakeBig: number; zoomBig: number };
  colors: { perfect: string; armoredShield: string; slam: string; charger: string };
  spearWallPinDuration: number; lifestealCooldown: number;
}

export interface HeldBladeCollisionEffects {
  burst(x: number, y: number, dx: number, dy: number, count: number, color?: string): void;
  ring(x: number, y: number, radius: number, color?: string): void;
  flash(x: number, y: number, radius: number, color: string): void;
  ribbon(x1: number, y1: number, x2: number, y2: number, color: string): void;
  explode(x: number, y: number, color: string, scale: number): void;
  floater(x: number, y: number, text: string, big: boolean, color?: string): void;
  shake(amount: number): void; zoom(amount: number): void; buzz(milliseconds: number): void;
  sound(name: "deflect" | "hit" | "slam" | "updraft" | "launch", big?: boolean): void;
  style(name: string): void; tutorial(name: "strike" | "airHit"): void;
}

export interface HeldBladeCollisionHooks {
  weaponHit(enemy: HeldBladeEnemy, quality: number, damage: number, isSlam: boolean, isLaunch: boolean, empowered: boolean): HeldWeaponEffect | null | undefined;
  noteFirstDamage(enemy: HeldBladeEnemy, firstDamage: boolean): void;
  logHit(damage: number, quality: number, mechanic?: string): void;
  onKill(enemy: HeldBladeEnemy, cause?: string): void;
  dealArea(x: number, y: number, radius: number, damage: number): void;
  fireHit(enemy: HeldBladeEnemy, x: number, y: number): void;
  fireSwingHit(enemy: HeldBladeEnemy, x: number, y: number, damage: number, quality: number, mechanic?: string): void;
  fireSlam(enemy: HeldBladeEnemy): void;
  achievementsEnabled(): boolean;
  addProfileStat(name: string, value: number): void; maxProfileStat(name: string, value: number): void;
  bumpDaily(name: string, value: number): void; achievementSwing(): void;
  achievementBossHit(enemy: HeldBladeEnemy): void; checkAchievements(): void;
  runDamageMultiplier(): number;
}

export interface HeldBladeCollisionInput {
  player: HeldBladePlayer; blade: HeldBladeWeapon; enemies: HeldBladeEnemy[]; run: HeldBladeRun;
  segment: HeldBladeSegment; tuning: HeldBladeTuning; effects: HeldBladeCollisionEffects;
  hooks: HeldBladeCollisionHooks; currentHitStop: number;
  segmentCircle(segment: HeldBladeSegment, x: number, y: number, radius: number): boolean;
  segmentPointDistance(x1: number, y1: number, x2: number, y2: number, x: number, y: number): PointDistance;
  weaponSegmentContact(segment: BatonSegment, x1: number, y1: number, x2: number, y2: number): boolean;
  distance(x: number, y: number): number;
}
