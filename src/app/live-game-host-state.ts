import type { GameBlade, GameEnemy, GameFloater, GamePlayer, GameProjectile, GameRun,
  GameSlowZone, GameTemporaryWall } from "./game-runtime-state";
import type { RunResultInfo } from "../gameplay/run/outcome-planner";
import type { GameRuntimeDependencies } from "./game-runtime-dependencies";
import type { TearWorldState } from "../gameplay/runtime/tear-world-context";

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

/** App-facing extension of the portable replaceable per-world state contract. */
export interface LiveGameHostState extends TearWorldState<
  GameRun & { voidDescent?: unknown },
  GamePlayer,
  GameBlade,
  GameEnemy,
  GameProjectile,
  GameFloater,
  GameSlowZone,
  GameTemporaryWall,
  BossIntroState,
  BossBeatState
> {
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
