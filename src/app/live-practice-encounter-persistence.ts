import type { LegacyProfile } from "../persistence/legacy-profile";
import type { CompletionStatus } from "../domain/reward-receipts";
import { encounterStat, practiceEnemyIdentity, practiceEnemyCatalog, type PracticeEnemyEntry } from "../gameplay/training/practice-enemy-catalog";

export interface PracticeExposureActor {
  readonly kind: string; readonly x: number; readonly y: number; readonly dead: boolean;
  readonly dying?: boolean; readonly tutDummy?: boolean; readonly isBoss?: boolean; readonly spawnT?: number;
  readonly supportType?: string;
}
export interface PracticeExposureContext {
  readonly run: Readonly<{ mode: string }>;
  readonly actors: readonly PracticeExposureActor[];
  readonly tick: number; readonly playing: boolean; readonly waveActive: boolean; readonly blockingCinema: boolean;
  readonly ghostPractice: boolean; readonly width: number; readonly height: number;
}
export interface PracticeEncounterPersistence {
  trackSpawn(actor: PracticeExposureActor, run: PracticeExposureContext["run"]): void;
  observe(context: PracticeExposureContext): Promise<CompletionStatus> | undefined;
  catalog(): readonly PracticeEnemyEntry[];
}
const ordinary = (mode: string) => ["campaign", "endless", "bossonly", "gauntlet"].includes(mode);

/** Live natural-install provenance is not a receipt: the acknowledged profile owns discovery. */
export function createLivePracticeEncounterPersistence(
  profile: Pick<LegacyProfile, "stat" | "maxStat" | "flushAcknowledged">,
): PracticeEncounterPersistence {
  const natural = new WeakMap<object, object>(), consumed = new WeakSet();
  const inflight = new Map<string, Promise<CompletionStatus>>(), unconfirmed = new Set<string>();
  const commit = (id: Parameters<typeof encounterStat>[0]): Promise<CompletionStatus> => {
    const pending = inflight.get(id); if (pending) return pending;
    profile.maxStat(encounterStat(id), 1); unconfirmed.add(id);
    const operation = Promise.resolve().then(() => profile.flushAcknowledged()).catch((): CompletionStatus => "unknown").then((status) => {
      if (status === "committed") unconfirmed.delete(id);
      return status;
    }).finally(() => { inflight.delete(id); });
    inflight.set(id, operation); return operation;
  };
  return Object.freeze<PracticeEncounterPersistence>({
    trackSpawn(actor, run) { if (ordinary(run.mode) && practiceEnemyIdentity(actor) !== undefined && !actor.isBoss && !actor.tutDummy) natural.set(actor, run); },
    observe(context) {
      if (!ordinary(context.run.mode) || !context.playing || !context.waveActive || context.blockingCinema || context.ghostPractice || context.tick <= 0) return undefined;
      const writes = new Set<Promise<CompletionStatus>>();
      for (const actor of context.actors) {
        const id = practiceEnemyIdentity(actor);
        if (natural.get(actor) !== context.run || consumed.has(actor) || id === undefined || actor.dead || actor.dying || actor.tutDummy || actor.isBoss ||
          (actor.spawnT ?? 0) > 0 || actor.x < 0 || actor.x > context.width || actor.y < 0 || actor.y > context.height) continue;
        consumed.add(actor);
        if (profile.stat(encounterStat(id)) < 1 || unconfirmed.has(id)) writes.add(commit(id));
      }
      if (writes.size === 0) return undefined;
      return Promise.all(writes).then((statuses) => statuses.find((status) => status !== "committed") ?? "committed");
    },
    catalog: () => practiceEnemyCatalog((key) => profile.stat(key), unconfirmed),
  });
}
