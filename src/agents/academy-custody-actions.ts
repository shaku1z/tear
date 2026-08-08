import { TearAcademyCandidateCustodyStore, type TearAcademyCandidateCustodyRecordV1 } from "./academy-candidate-custody";

/** Narrow C31 product mutation boundary; it cannot delete source evidence or change any consent scope except model training. */
export class TearAcademyCustodyActionRuntime {
  readonly #custody: TearAcademyCandidateCustodyStore;
  constructor(custody: TearAcademyCandidateCustodyStore) { this.#custody = custody; }

  async withdrawModelTraining(candidateHash: string, actor: string, decidedAt: string): Promise<TearAcademyCandidateCustodyRecordV1> {
    const current = await this.#custody.get(candidateHash);
    if (current === undefined || current.status !== "held" || !current.privacyRetention.authorizedActorIds.includes(actor)
      || current.consent.modelTraining === "no-training") throw new RangeError("Academy model-training withdrawal is not authorized for this held record");
    return this.#custody.revoke({ candidateHash, scope: "model-training", actor, decidedAt,
      reason: "authorized player withdrew model-training consent through Academy",
      consent: Object.freeze({ ...current.consent, revision: `${current.consent.revision}:model-training-withdrawal:${String(current.events.length + 1)}`,
        decidedAt, modelTraining: "no-training" }),
    });
  }
}
