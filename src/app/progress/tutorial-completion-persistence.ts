import type { LegacyProfile } from "../../persistence/legacy-profile";
import type { MetaProgression } from "../../gameplay/progression/meta";
import type { CompletionStatus } from "../../domain/reward-receipts";

export interface TutorialCompletionPersistence {
  issue(): Promise<Readonly<{ id: string; status: CompletionStatus }>>;
  complete(id: string): Promise<CompletionStatus>;
  retry(): Promise<CompletionStatus>;
}

/** The durable owners, rather than the rewound simulation, decide whether an effect is new. */
export function createLiveTutorialCompletionPersistence(
  profile: Pick<LegacyProfile, "issueTutorial" | "completeTutorial" | "flushAcknowledged" | "pendingRewards" | "acknowledgeReward">,
  meta: Pick<MetaProgression, "grantReward" | "flushAcknowledged">,
  achievements: Readonly<{ check(): void }>,
  uuid: () => string = () => crypto.randomUUID(),
): TutorialCompletionPersistence {
  let draining: Promise<CompletionStatus> | undefined; let dirty = false;
  const needsRetry = (): boolean => dirty || profile.pendingRewards().length > 0;
  const retry = (): Promise<CompletionStatus> => {
    if (draining) { dirty = true; return draining; }
    draining = (async (): Promise<CompletionStatus> => {
      try {
        do {
          dirty = false;
          let status = await profile.flushAcknowledged();
          if (status !== "committed") return status;
          // A portal's synchronous legacy load may only see its local mirror.
          // Refresh both durable owners even when the outbox is already empty.
          status = await meta.flushAcknowledged();
          if (status !== "committed") return status;
          // Apprentice may complete a mastery category. Its normal unlock uses
          // the same profile outbox, including after reconstruction from bytes.
          achievements.check();
          status = await profile.flushAcknowledged();
          if (status !== "committed") return status;
          for (const grant of profile.pendingRewards()) {
            const awarded = await meta.grantReward(grant.id, grant.coins);
            if (awarded !== "committed" && awarded !== "already") return awarded;
            status = await profile.acknowledgeReward(grant.id);
            if (status !== "committed") return status;
          }
        } while (needsRetry());
        return "committed";
      } catch { return "unknown"; }
    })().finally(() => { draining = undefined; });
    return draining;
  };
  return Object.freeze({
    async issue(): Promise<Readonly<{ id: string; status: CompletionStatus }>> {
      let id: string;
      try { id = uuid(); } catch { return { id: "unissued", status: "unavailable" }; }
      try { return { id, status: await profile.issueTutorial(id) }; } catch { return { id, status: "unknown" }; }
    },
    async complete(id: string) {
      try {
        const status = await profile.completeTutorial(id);
        if (status !== "committed" && status !== "already") return status;
        const drained = await retry(); return drained === "committed" ? status : drained;
      } catch { return "unknown"; }
    },
    retry,
  });
}
