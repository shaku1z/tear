import { RunLifecycleController } from "../gameplay/run/lifecycle";
import { createTearWorldState, type TearWorldState } from "../gameplay/runtime/tear-world-context";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { GameBlade, GameEnemy, GameFloater, GamePlayer, GameProjectile, GameRun,
  GameSlowZone, GameTemporaryWall } from "./game-runtime-state";
import type { BossBeatState, BossIntroState, LiveGameHostState } from "./live-game-host-state";
import { createLiveWorldContext, type LiveWorldContext } from "./live-world-context";
import { createLiveWorldEntityFactory, type LiveWorldEntityConstructionPort } from "./live-world-entity-factory";

type WorldRun = GameRun & { voidDescent?: unknown };
type PortableWorldState = TearWorldState<
  WorldRun, GamePlayer, GameBlade, GameEnemy, GameProjectile, GameFloater,
  GameSlowZone, GameTemporaryWall, BossIntroState, BossBeatState
>;
type ReplayPacket = ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>;

/**
 * Write-through hooks for the host's remaining local views of world values.
 * The world owns the values; a host may keep a cached reference for its hot
 * frame paths and is told whenever the world replaces one.
 */
export interface LiveWorldMirrors {
  run?(value: WorldRun): void;
  player?(value: GamePlayer): void;
  blade?(value: GameBlade): void;
  enemies?(value: GameEnemy[]): void;
  projectiles?(value: GameProjectile[]): void;
  floaters?(value: GameFloater[]): void;
  slowZones?(value: GameSlowZone[]): void;
  temporaryWalls?(value: GameTemporaryWall[]): void;
  bossIntro?(value: BossIntroState | null): void;
  bossBeat?(value: BossBeatState | null): void;
}

/** Session values the host owns; they outlive any single world. */
export interface LiveWorldSessionPort {
  selectedWeapon(): string;
  setSelectedWeapon(value: string): void;
  outcome(): RunResultInfo | null;
  setOutcome(value: RunResultInfo | null): void;
  lastRecording(): ReplayPacket;
  setLastRecording(value: ReplayPacket): void;
  lastVaultId(): string | null;
  setLastVaultId(value: string | null): void;
  winSeconds(): number;
  setWinSeconds(value: number): void;
}

export interface LiveWorldCompositionOptions {
  readonly dependencies: GameRuntimeDependencies;
  readonly session: LiveWorldSessionPort;
  readonly restoreConfiguration: () => void;
  readonly mirrors?: LiveWorldMirrors;
}

export interface LiveWorldComposition {
  readonly state: LiveGameHostState;
  readonly context: LiveWorldContext;
  readonly entities: LiveWorldEntityConstructionPort;
  readonly lifecycle: RunLifecycleController;
}

/**
 * Builds one live world: its replaceable state, entity construction adapter,
 * run lifecycle, and world context (services plus transient records).
 *
 * This is deliberately world-only. The combat host, frame coordinator, input,
 * and presentation stay outward in the host that drives the world, so the same
 * composition can build a world the live host does not own.
 */
export function createLiveWorldComposition(options: LiveWorldCompositionOptions): LiveWorldComposition {
  const { session, mirrors = {} } = options;
  const portable: PortableWorldState = createTearWorldState<
    WorldRun, GamePlayer, GameBlade, GameEnemy, GameProjectile, GameFloater,
    GameSlowZone, GameTemporaryWall, BossIntroState, BossBeatState
  >();
  const state: LiveGameHostState = Object.freeze({
    // A null run or undefined actor would be a torn world, not a reset one;
    // the live application replaces them together at run start.
    run: () => portable.run(), setRun: (value) => { if (value !== null) { portable.setRun(value); mirrors.run?.(value); } },
    player: () => portable.player(), setPlayer: (value) => { if (value !== undefined) { portable.setPlayer(value); mirrors.player?.(value); } },
    blade: () => portable.blade(), setBlade: (value) => { if (value !== undefined) { portable.setBlade(value); mirrors.blade?.(value); } },
    enemies: () => portable.enemies(), setEnemies: (value) => { portable.setEnemies(value); mirrors.enemies?.(portable.enemies()); },
    projectiles: () => portable.projectiles(), setProjectiles: (value) => { portable.setProjectiles(value); mirrors.projectiles?.(portable.projectiles()); },
    floaters: () => portable.floaters(), setFloaters: (value) => { portable.setFloaters(value); mirrors.floaters?.(portable.floaters()); },
    slowZones: () => portable.slowZones(), setSlowZones: (value) => { portable.setSlowZones(value); mirrors.slowZones?.(portable.slowZones()); },
    temporaryWalls: () => portable.temporaryWalls(), setTemporaryWalls: (value) => { portable.setTemporaryWalls(value); mirrors.temporaryWalls?.(portable.temporaryWalls()); },
    bossIntro: () => portable.bossIntro(), setBossIntro: (value) => { portable.setBossIntro(value); mirrors.bossIntro?.(value); },
    bossBeat: () => portable.bossBeat(), setBossBeat: (value) => { portable.setBossBeat(value); mirrors.bossBeat?.(value); },
    selectedWeapon: () => session.selectedWeapon(), setSelectedWeapon: (value) => { session.setSelectedWeapon(value); },
    outcome: () => session.outcome(), setOutcome: (value) => { session.setOutcome(value); },
    lastRecording: () => session.lastRecording(), setLastRecording: (value) => { session.setLastRecording(value); },
    lastVaultId: () => session.lastVaultId(), setLastVaultId: (value) => { session.setLastVaultId(value); },
    winSeconds: () => session.winSeconds(), setWinSeconds: (value) => { session.setWinSeconds(value); },
  } satisfies LiveGameHostState);
  const entities = createLiveWorldEntityFactory(options.dependencies);
  const lifecycle = new RunLifecycleController();
  const context = createLiveWorldContext({
    dependencies: options.dependencies, state, entities, lifecycle,
    restoreConfiguration: options.restoreConfiguration,
  });
  return Object.freeze({ state, context, entities, lifecycle });
}
