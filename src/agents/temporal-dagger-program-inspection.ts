import type { GhostVaultBackend } from "../ghost";
import { inspectTearTemporalDaggerPrograms, type TearTemporalDaggerProgramV1 } from "./temporal-dagger-program";
import { TearTemporalDaggerProgramPlanVault } from "./temporal-dagger-program-runtime";
import { TearDaggerCorrectionReviewStore, type TearDaggerCorrectionReviewV1 } from "./dagger-correction-review";

export interface TearTemporalDaggerProgramPlanInspectionV1 {
  readonly id: string;
  readonly authorizedReviewers: readonly string[];
}

export interface TearTemporalDaggerProgramReviewInspectionV1 {
  readonly programId: string;
  readonly reviews: readonly TearDaggerCorrectionReviewV1[];
}

export type TearTemporalDaggerProgramInspectionState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; programs: readonly TearTemporalDaggerProgramV1[]; plannedProgramIds: readonly string[];
    plans: readonly TearTemporalDaggerProgramPlanInspectionV1[]; reviews: readonly TearTemporalDaggerProgramReviewInspectionV1[] }>
  | Readonly<{ status: "unavailable"; reason: string }>;

/** Async Vault boundary for the synchronous Academy status renderer. */
export class TearTemporalDaggerProgramInspectionController {
  #state: TearTemporalDaggerProgramInspectionState = Object.freeze({ status: "loading" });
  #loading: Promise<TearTemporalDaggerProgramInspectionState> | undefined;
  readonly #backend: GhostVaultBackend | undefined;

  constructor(backend: GhostVaultBackend | undefined) {
    this.#backend = backend;
    if (backend === undefined) this.#state = Object.freeze({ status: "unavailable", reason: "Academy storage is unavailable in this runtime" });
  }

  snapshot(): TearTemporalDaggerProgramInspectionState { return this.#state; }

  refresh(): Promise<TearTemporalDaggerProgramInspectionState> {
    const backend = this.#backend;
    if (backend === undefined) return Promise.resolve(this.#state);
    this.#state = Object.freeze({ status: "loading" });
    this.#loading ??= inspectTearTemporalDaggerPrograms(backend).then(async (programs) => {
      const plans = await new TearTemporalDaggerProgramPlanVault(backend).list();
      const plannedProgramIds = plans.map((plan) => plan.id);
      const reviews = await Promise.all(programs.filter((program) => program.status === "review-required").map(async (program) => {
        const plan = plans.find((entry) => entry.id === program.id);
        return Object.freeze({ programId: program.id,
          reviews: plan === undefined ? Object.freeze([]) : await new TearDaggerCorrectionReviewStore(backend, plan.authorizedReviewers).list(program.capture.captureHash) });
      }));
      this.#state = Object.freeze({ status: "ready", programs, plannedProgramIds: Object.freeze(plannedProgramIds),
        plans: Object.freeze(plans.map((plan) => Object.freeze({ id: plan.id, authorizedReviewers: Object.freeze([...plan.authorizedReviewers]) }))), reviews: Object.freeze(reviews) });
      this.#loading = undefined;
      return this.#state;
    }).catch((error: unknown) => {
      this.#state = Object.freeze({ status: "unavailable", reason: error instanceof Error ? error.message : "DAgger program storage could not be read" });
      this.#loading = undefined;
      return this.#state;
    });
    return this.#loading;
  }
}
