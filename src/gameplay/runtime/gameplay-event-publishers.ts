import type { TearGameplayEventPort } from "./gameplay-events";
import type { OutcomeRunState } from "../run/outcome-planner";

export interface TearSpawnFactDetail {
  readonly vn: string;
  readonly b: string;
  readonly vid?: string;
}

/** Shared native-fact boundary for every host that installs spawned enemies. */
export function createTearSpawnFactPublisher<TEnemy extends Readonly<{ x: number; y: number }>>(
  events: TearGameplayEventPort,
  actorId: (enemy: TEnemy) => string,
) {
  return (enemy: TEnemy, actorKind: string, detail: TearSpawnFactDetail): void => {
    events.emit({
      kind: "spawn", actorId: actorId(enemy), actorKind, x: enemy.x, y: enemy.y,
      variantName: detail.vn, bossId: detail.b,
      ...(detail.vid === undefined ? {} : { variantId: detail.vid }),
    });
  };
}

/** Shared native-fact boundary for wave planning and clear progression. */
export function createTearWaveFactPublisher(events: TearGameplayEventPort) {
  return (wave: number, marker: string): void => {
    events.emit({ kind: "wave", wave, event: marker });
  };
}

/** Shared terminal fact mapping; lifecycle ownership supplies the active session ID. */
export function createTearTerminalRunFactPublisher(
  events: TearGameplayEventPort,
  sessionId: () => string | null,
) {
  return (outcome: "defeat" | "victory", run: OutcomeRunState): void => {
    const runId = sessionId();
    if (runId === null) return;
    events.emit({
      kind: "run", transition: outcome === "victory" ? "completed" : "defeated", runId,
      mode: run.mode, difficulty: run.diff, weaponId: run.weaponId,
      wave: run.wave, score: run.score, runTimeSeconds: run.runTime,
    });
  };
}
