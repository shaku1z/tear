import type {
  GameBlade,
  GameEnemy,
  GameFloater,
  GamePlayer,
  GameProjectile,
  GameRun,
  GameSlowZone,
  GameTemporaryWall,
} from "../../gameplay/runtime/game-runtime-state";
import type { RunResultInfo } from "../../gameplay/run/outcome-planner";
import type { TearWorldState } from "../../gameplay/runtime/tear-world-context";
import type { StageBeat } from "../../gameplay/stage-beat";
import type { KeptReplay } from "../replay/live-replay-production";

export interface BossIntroState {
  boss: GameEnemy;
  t: number;
  dur: number;
  delay: number;
}

export type { StageBeat };

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
  StageBeat
> {
  selectedWeapon(): string;
  setSelectedWeapon(value: string): void;
  outcome(): RunResultInfo | null;
  setOutcome(value: RunResultInfo | null): void;
  lastReplay(): KeptReplay | null;
  setLastReplay(value: KeptReplay | null): void;
  winSeconds(): number;
  setWinSeconds(value: number): void;
}
