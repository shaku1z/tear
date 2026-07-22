import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { LiveCollisionPhaseHost, LiveCollisionPhaseState } from "../gameplay/combat/live-collision-phase";
import type { LiveOpeningPhaseHost, LiveOpeningState } from "../gameplay/combat/live-opening-phase";
import type { CombatEntityRuntime, CombatEntityRuntimeHooks, LiveCombatEntity, LiveCombatPlayer } from "../gameplay/combat/combat-entity-runtime";
import type { LiveKillHost } from "../gameplay/combat/live-kill-runtime";
import type { KillEnemy, KillPlayer, KillProjectile, KillRun } from "../gameplay/combat/kill-runtime";
import type { MirrorBladePort, MirrorPlayerPort } from "../gameplay/entities/mirror-contracts";
import type { UpgradeMods } from "../gameplay/upgrades";

type Opening = LiveOpeningPhaseHost;
type Collision = LiveCollisionPhaseHost;
export type CombatPlayer = Opening["player"] & Collision["player"] & LiveCombatPlayer & KillPlayer & MirrorPlayerPort;
export type CombatBlade = Opening["blade"] & Collision["blade"] & MirrorBladePort & {
  tipX: number; tipY: number; throwDmg: number; stolenBy?: unknown; hostile?: boolean;
};
export type CombatRun = Opening["run"] & Collision["run"] & KillRun & { runTime: number; isBossWave?: boolean };
export type CombatEnemy = Opening["enemies"][number] & Collision["state"]["enemies"][number] & {
  color: string; facing: number; speedMult: number; contactDmg: number; canClimb: boolean; climber: boolean;
  climbApt: number; hpDisplay: number;
} & Omit<KillEnemy, "zones"> & { zones?: LiveCombatEntity["zones"] };
export type CombatProjectile = Collision["state"]["projectiles"][number] & KillProjectile;

export interface LiveCombatMutableState<
  Enemy extends CombatEnemy = CombatEnemy,
  Projectile extends CombatProjectile = CombatProjectile,
  Floater extends LiveCollisionPhaseState["floaters"][number] = LiveCollisionPhaseState["floaters"][number],
> {
  player(): CombatPlayer; blade(): CombatBlade; run(): CombatRun;
  enemies(): Enemy[]; setEnemies(value: Enemy[]): void;
  projectiles(): Projectile[]; setProjectiles(value: Projectile[]): void;
  floaters(): Floater[]; setFloaters(value: Floater[]): void;
  slowZones(): ReturnType<CombatEntityRuntimeHooks["slowZones"]>;
  setSlowZones(value: ReturnType<CombatEntityRuntimeHooks["slowZones"]>): void;
  walls(): ReturnType<CombatEntityRuntimeHooks["walls"]>;
  setWalls(value: ReturnType<CombatEntityRuntimeHooks["walls"]>): void;
  openingProtection(): Opening["protection"]; setOpeningProtection(value: Opening["protection"]): void;
  openingState(): LiveOpeningState; setOpeningState(value: LiveOpeningState): void;
  collisionState(): Omit<LiveCollisionPhaseState, "enemies" | "projectiles" | "floaters">;
  setCollisionState(value: Omit<LiveCollisionPhaseState, "enemies" | "projectiles" | "floaters">): void;
}

export interface LiveCombatLocalPorts<Enemy extends CombatEnemy = CombatEnemy> {
  readonly stage: { readonly index: number; bannerSeconds: number; platforms: Opening["platforms"];
    readonly current: { readonly accent?: string; readonly name?: string; readonly chapter?: { readonly bossOutro?: unknown } } };
  readonly story: { protection(): Opening["protection"]; applyProtection(value: Opening["protection"]): void };
  readonly cinema: { readonly active: boolean; readonly blocksCombat: boolean; readonly playerMode: string };
  readonly tutorial: { mark(name: string): void; update(seconds: number): void };
  readonly achievement: {
    dashDodge: CombatEntityRuntimeHooks["dashDodge"]; bossHit(enemy: object, kind: string): void;
    bossKill(enemy: object): void; onKill(enemy: object): void; swung(): void; thrown(): void;
    parry(): void; breakStreak(): void; jumped(): void; revived(): void; tick(seconds: number): void;
  };
  readonly functions: Readonly<{
    addFloater: Collision["addFloater"]; addShake: Collision["addShake"]; addZoom: Collision["addZoom"];
    addFlash: Collision["addFlash"]; addStyle: Collision["addStyle"]; loseStyle: Collision["loseStyle"];
    onShieldAbsorb: Collision["onShieldAbsorb"]; noteFirstDamage: Collision["noteFirstDamage"];
    entityNoteFirstDamage: CombatEntityRuntimeHooks["noteFirstDamage"];
    entityBossHit: CombatEntityRuntimeHooks["bossHit"]; entityResolveKill: CombatEntityRuntimeHooks["onKill"];
    runDamageMultiplier: Collision["runDamageMultiplier"]; updateWeaponAbilities: Opening["updateWeaponAbilities"];
    stepCinematic: Opening["stepCinematic"]; syncVoidSupport: Opening["syncVoidSupport"];
    activateThrowSecondary: Opening["activateThrowSecondary"]; updateWave: Opening["updateWave"];
    updateBossArenaPlatforms: Opening["updateBossArenaPlatforms"]; updateVoidScroll: Opening["updateVoidScroll"];
    startVoidDescent: Opening["startVoidDescent"]; nearestEnemy: Collision["nearestEnemy"];
    openingNearestEnemy: Opening["nearestEnemy"];
    areaDamage: (x: number, y: number, radius: number, damage: number, playerOwned?: boolean) => number;
    lobExplode: Collision["lobExplode"];
    splitProjectile: Collision["splitProjectile"]; triggerSlowMotion: Collision["triggerSlowMotion"];
    logWeapon: Collision["logWeapon"]; emitThrowResolve: Collision["emitThrowResolve"];
    updateTrick: Collision["updateTrick"]; updatePlayground: Collision["updatePlayground"];
    endRun: Collision["endRun"]; checkAchievements: Collision["checkAchievements"];
    addKillScore: LiveKillHost["addKillScore"]; applySever: LiveKillHost["applySever"];
    fire: LiveKillHost["fire"]; makeEvent(x: number, y: number, enemy: object | null,
      cause?: string, detail?: Readonly<Record<string, unknown>>): unknown;
    weaponHook(name: string, detail: Readonly<Record<string, unknown>>): Readonly<{ mechanic?: string }> | null | undefined;
    modHook(name: keyof UpgradeMods): unknown; fireMod(hook: unknown, event: unknown): void;
    logWeaponEvent(name: string, detail: Readonly<Record<string, unknown>>): void;
    weaponWorldImpact(): Readonly<{ mechanic?: string }> | null;
    startTransformation: Opening["startTransformation"]; achievementsEnabled: Collision["achievementsEnabled"];
    consumeThrow: Opening["consumeThrow"];
    weaponSegmentContact: Collision["weaponSegmentContact"];
    createCharger: (x: number, y: number) => Enemy;
    createReflection: (x: number, y: number) => Enemy;
    ghostDeath: Collision["ghostDeath"]; ghostSample: Collision["ghostSample"];
    restorePlatforms: LiveKillHost["restorePlatforms"];
    playSound: (name: string, argument?: unknown) => void;
    addOverrunStack: () => void;
    setBossBanner: (text: string, color: string) => void;
  }>;
}

export interface LiveCombatActionContext<
  Enemy extends CombatEnemy = CombatEnemy,
  Projectile extends CombatProjectile = CombatProjectile,
  Floater extends LiveCollisionPhaseState["floaters"][number] = LiveCollisionPhaseState["floaters"][number],
> {
  readonly dependencies: GameRuntimeDependencies;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly bossRosterSize: number;
  readonly combatRuntime: () => CombatEntityRuntime;
  readonly live: LiveCombatMutableState<Enemy, Projectile, Floater>;
  readonly ports: LiveCombatLocalPorts<Enemy>;
  readonly resolveKill: (enemy: object, cause?: string) => void;
  readonly emitMusicEvent: (type: string, detail: Readonly<Record<string, unknown>>) => void;
  readonly releaseCamera: () => void;
  readonly requestContinue: () => void;
}

export interface LiveCombatActionAdapters {
  readonly entities: CombatEntityRuntimeHooks;
  readonly opening: Omit<Opening, "state">;
  readonly collision: Omit<Collision, "state" | "combat">;
  readonly kill: LiveKillHost;
}
