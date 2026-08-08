import type { GhostVaultBackend } from "../ghost";
import { inspectTearTemporalDaggerPrograms, type TearTemporalDaggerProgramV1 } from "./temporal-dagger-program";
import { TearTemporalDaggerProgramPlanVault } from "./temporal-dagger-program-runtime";

export type TearTemporalDaggerProgramInspectionState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; programs: readonly TearTemporalDaggerProgramV1[]; plannedProgramIds: readonly string[] }>
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
      const plannedProgramIds = (await new TearTemporalDaggerProgramPlanVault(backend).list()).map((plan) => plan.id);
      this.#state = Object.freeze({ status: "ready", programs, plannedProgramIds: Object.freeze(plannedProgramIds) });
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
