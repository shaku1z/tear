import { inspectAcademy, type TearAcademyInspectionSnapshotV1, type TearAcademyInspectionStores } from "./academy-inspector";

export type TearAcademyInspectionState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; snapshot: TearAcademyInspectionSnapshotV1 }>
  | Readonly<{ status: "unavailable"; reason: string }>;

/** Async persistence boundary for the synchronous Training Archive screen renderer. */
export class TearAcademyInspectionController {
  #state: TearAcademyInspectionState = Object.freeze({ status: "loading" });
  #loading: Promise<TearAcademyInspectionState> | undefined;
  readonly #stores: TearAcademyInspectionStores | undefined;

  constructor(stores: TearAcademyInspectionStores | undefined) {
    this.#stores = stores;
    if (this.#stores === undefined) this.#state = Object.freeze({ status: "unavailable", reason: "Training Archive storage is unavailable in this runtime" });
  }

  snapshot(): TearAcademyInspectionState { return this.#state; }

  refresh(observedAt: string, actionActor?: string): Promise<TearAcademyInspectionState> {
    if (this.#stores === undefined) return Promise.resolve(this.#state);
    this.#state = Object.freeze({ status: "loading" });
    this.#loading ??= inspectAcademy(this.#stores, observedAt, actionActor).then((snapshot) => {
      this.#state = Object.freeze({ status: "ready", snapshot });
      this.#loading = undefined;
      return this.#state;
    }).catch((error: unknown) => {
      this.#state = Object.freeze({ status: "unavailable", reason: error instanceof Error ? error.message : "Training Archive storage could not be read" });
      this.#loading = undefined;
      return this.#state;
    });
    return this.#loading;
  }
}
