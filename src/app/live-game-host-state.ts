import type { GameBlade, GameEnemy, GameFloater, GamePlayer, GameProjectile, GameRun,
  GameSlowZone, GameTemporaryWall } from "./game-runtime-state";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";

type ReplayPacket = ReturnType<GameRuntimeDependencies["GHOST"]["stopRec"]>;

export interface BossIntroState {
  boss: GameEnemy;
  t: number;
  dur: number;
  delay: number;
}

export interface BossBeatState {
  text: string;
  color: string;
  t: number;
  dur: number;
}

/** Shared lazy boundary for replaceable game-host state during the strict cutover. */
export interface LiveGameHostState {
  run(): (GameRun & { voidDescent?: unknown }) | null;
  setRun(value: (GameRun & { voidDescent?: unknown }) | null): void;
  player(): GamePlayer | undefined;
  setPlayer(value: GamePlayer | undefined): void;
  blade(): GameBlade | undefined;
  setBlade(value: GameBlade | undefined): void;
  enemies(): GameEnemy[];
  setEnemies(value: GameEnemy[]): void;
  projectiles(): GameProjectile[];
  setProjectiles(value: GameProjectile[]): void;
  floaters(): GameFloater[];
  setFloaters(value: GameFloater[]): void;
  slowZones(): GameSlowZone[];
  setSlowZones(value: GameSlowZone[]): void;
  temporaryWalls(): GameTemporaryWall[];
  setTemporaryWalls(value: GameTemporaryWall[]): void;
  bossIntro(): BossIntroState | null;
  setBossIntro(value: BossIntroState | null): void;
  bossBeat(): BossBeatState | null;
  setBossBeat(value: BossBeatState | null): void;
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
