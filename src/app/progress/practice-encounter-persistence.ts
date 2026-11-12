import { bossEncounterStat, practiceBossCatalog, practiceBossIdentity, type PracticeBossEntry } from "../../gameplay/training/practice-boss-catalog";
import type { BossPracticeActorEntry } from "../../gameplay/training/boss-phase-practice-runtime";
import type { LegacyProfile } from "../../persistence/legacy-profile";
import type { CompletionStatus } from "../../domain/reward-receipts";
import { encounterStat, practiceEnemyIdentity, practiceEnemyCatalog, type PracticeEnemyEntry } from "../../gameplay/training/practice-enemy-catalog";

export interface PracticeExposureActor {
  readonly kind: string; readonly x: number; readonly y: number; readonly dead: boolean;
  readonly dying?: boolean; readonly tutDummy?: boolean; readonly isBoss?: boolean; readonly spawnT?: number;
  readonly supportType?: string; readonly bossId?: string; readonly isMirrorBoss?: boolean; practicePhaseEntry?(): BossPracticeActorEntry;
}
export interface PracticeExposureContext {
  readonly run: Readonly<{ mode: string; seedRace?: unknown; beatThisRun?: unknown }>;
  readonly actors: readonly PracticeExposureActor[];
  readonly tick: number; readonly playing: boolean; readonly waveActive: boolean; readonly blockingCinema: boolean;
  readonly ghostPractice: boolean; readonly width: number; readonly height: number;
}
export interface PracticeEncounterPersistence {
  trackSpawn(actor: PracticeExposureActor, run: PracticeExposureContext["run"]): void;
  observe(context: PracticeExposureContext): Promise<CompletionStatus> | undefined;
  catalog(): readonly PracticeEnemyEntry[];
  bossCatalog(): readonly PracticeBossEntry[];
}
const ordinary = (mode: string) => ["campaign", "endless", "bossonly", "gauntlet"].includes(mode);

/** Live natural-install provenance is not a receipt: the acknowledged profile owns discovery. */
export function createLivePracticeEncounterPersistence(
  profile: Pick<LegacyProfile, "stat" | "maxStat" | "flushAcknowledged">,
): PracticeEncounterPersistence {
  const phases = new WeakMap<object, Set<number>>();
  const natural = new WeakMap<object, object>(), consumed = new WeakSet();
  const inflight = new Map<string, Promise<CompletionStatus>>(), unconfirmed = new Set<string>();
  const commit = (key: string): Promise<CompletionStatus> => {
    const pending = inflight.get(key); if (pending) return pending;
    profile.maxStat(key, 1); unconfirmed.add(key);
    const operation = Promise.resolve().then(() => profile.flushAcknowledged()).catch((): CompletionStatus => "unknown").then((status) => {
      if (status === "committed") unconfirmed.delete(key);
      return status;
    }).finally(() => { inflight.delete(key); });
    inflight.set(key, operation); return operation;
  };
  return Object.freeze<PracticeEncounterPersistence>({
    trackSpawn(actor, run) { if (run.beatThisRun === undefined && run.seedRace === undefined && ordinary(run.mode) && (practiceEnemyIdentity(actor) !== undefined || practiceBossIdentity(actor) !== undefined) && !actor.tutDummy) natural.set(actor, run); },
    observe(context) {
      if (context.run.beatThisRun !== undefined || context.run.seedRace !== undefined || !ordinary(context.run.mode) || !context.playing || !context.waveActive || context.blockingCinema || context.ghostPractice || context.tick <= 0) return undefined;
      const writes = new Set<Promise<CompletionStatus>>();
      for (const actor of context.actors) {
        if (actor.isBoss) {
          const boss = practiceBossIdentity(actor), entry = actor.practicePhaseEntry?.();
          if (natural.get(actor) !== context.run || !boss || !entry || !entry.ready || actor.dead || actor.dying || actor.tutDummy ||
            (actor.spawnT ?? 0) > 0 || actor.x < 0 || actor.x > context.width || actor.y < 0 || actor.y > context.height) continue;
          const consumedPhases = phases.get(actor) ?? new Set<number>(); phases.set(actor, consumedPhases);
          if (consumedPhases.has(entry.phase)) continue; consumedPhases.add(entry.phase);
          const key = bossEncounterStat(boss, entry.phase);
          if (profile.stat(key) < 1 || unconfirmed.has(key)) writes.add(commit(key));
          continue;
        }
        const id = practiceEnemyIdentity(actor);
        if (natural.get(actor) !== context.run || consumed.has(actor) || id === undefined || actor.dead || actor.dying || actor.tutDummy ||
          (actor.spawnT ?? 0) > 0 || actor.x < 0 || actor.x > context.width || actor.y < 0 || actor.y > context.height) continue;
        consumed.add(actor);
        if (profile.stat(encounterStat(id)) < 1 || unconfirmed.has(encounterStat(id))) writes.add(commit(encounterStat(id)));
      }
      if (writes.size === 0) return undefined;
      return Promise.all(writes).then((statuses) => statuses.find((status) => status !== "committed") ?? "committed");
    },
    bossCatalog: () => practiceBossCatalog((key) => profile.stat(key), unconfirmed),
    catalog: () => practiceEnemyCatalog((key) => profile.stat(key), new Set([...unconfirmed].map((key) => key.replace("encounterEnemy:", "")))),
  });
}
